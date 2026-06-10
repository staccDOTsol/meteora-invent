import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  VersionedTransaction,
} from '@solana/web3.js';
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createCloseAccountInstruction,
  createSyncNativeInstruction,
} from '@solana/spl-token';
import { useWallet } from '@jup-ag/wallet-adapter';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  PLATFORM_FEE_WALLET,
  QUOTE_CONFIGS,
  TOKEN_DECIMALS,
  TOKEN_PROGRAM_ID,
  WSOL_MINT,
} from '@/lib/curve/constants';
import {
  applyFee,
  ata,
  BondingCurveAccount,
  buyInstruction,
  fetchBondingCurves,
  getSellPrice,
  getTokensForQuote,
  sellInstruction,
} from '@/lib/curve/client';

const JUPITER_API = process.env.NEXT_PUBLIC_JUPITER_API ?? 'https://lite-api.jup.ag/swap/v1';
const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL ?? 'https://api.mainnet-beta.solana.com';
const SLIPPAGE_BPS = 200n;

type RouteLeg = { label: string };
type RouteResult = {
  curve: BondingCurveAccount;
  quoteSymbol: string;
  /** raw amount of output produced by this route */
  out: bigint;
  legs: RouteLeg[];
  /** Jupiter quoteResponse for the external leg, if any */
  jupQuote?: any;
  isBuy: boolean;
};

async function jupQuote(inputMint: string, outputMint: string, amount: bigint) {
  const url = `${JUPITER_API}/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=${SLIPPAGE_BPS}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const q = await res.json();
  if (!q?.outAmount) return null;
  return q;
}

async function jupSwapTx(quoteResponse: any, user: PublicKey): Promise<VersionedTransaction> {
  const res = await fetch(`${JUPITER_API}/swap`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      quoteResponse,
      userPublicKey: user.toBase58(),
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
    }),
  });
  if (!res.ok) throw new Error('Jupiter swap build failed');
  const { swapTransaction } = await res.json();
  return VersionedTransaction.deserialize(Buffer.from(swapTransaction, 'base64'));
}

/**
 * Minimal per-mint swap. Routes the input through Jupiter into whichever of
 * the coin's bonding curves (SOL/USDC/USDT/6K4/73ed) gives the best rate —
 * or the reverse on sells. Circular routes (input == output) are allowed.
 */
export function CurveSwap({ baseMint }: { baseMint: string }) {
  const { publicKey, signAllTransactions } = useWallet();
  const connection = useMemo(() => new Connection(RPC_URL, 'confirmed'), []);
  const base = useMemo(() => new PublicKey(baseMint), [baseMint]);

  const tokenOptions = useMemo(
    () => [
      { symbol: 'SOL', mint: WSOL_MINT.toBase58(), decimals: 9 },
      ...QUOTE_CONFIGS.filter((q) => !q.mint.equals(WSOL_MINT)).map((q) => ({
        symbol: q.symbol,
        mint: q.mint.toBase58(),
        decimals: q.decimals,
      })),
      { symbol: 'THIS COIN', mint: baseMint, decimals: TOKEN_DECIMALS },
    ],
    [baseMint]
  );

  const [inputMint, setInputMint] = useState(tokenOptions[0]!.mint);
  const [outputMint, setOutputMint] = useState(baseMint);
  const [amount, setAmount] = useState('');
  const [curves, setCurves] = useState<BondingCurveAccount[]>([]);
  const [routes, setRoutes] = useState<RouteResult[]>([]);
  const [quoting, setQuoting] = useState(false);
  const [swapping, setSwapping] = useState(false);

  const decimalsOf = useCallback(
    (mint: string) => tokenOptions.find((t) => t.mint === mint)?.decimals ?? 6,
    [tokenOptions]
  );

  useEffect(() => {
    fetchBondingCurves(
      connection,
      base,
      QUOTE_CONFIGS.map((q) => q.mint)
    )
      .then((res) => setCurves(res.filter((c): c is BondingCurveAccount => !!c && !c.complete)))
      .catch(() => setCurves([]));
  }, [connection, base]);

  const isBuy = outputMint === baseMint && inputMint !== baseMint;
  const isSell = inputMint === baseMint && outputMint !== baseMint;
  const isCircular = inputMint === baseMint && outputMint === baseMint;

  const getQuotes = useCallback(async () => {
    if (!amount || Number(amount) <= 0 || curves.length === 0) return;
    setQuoting(true);
    setRoutes([]);
    try {
      const rawIn = BigInt(Math.round(Number(amount) * 10 ** decimalsOf(inputMint)));
      const results: RouteResult[] = [];

      for (const curve of curves) {
        const cfg = QUOTE_CONFIGS.find((q) => q.mint.equals(curve.quoteMint));
        if (!cfg) continue;
        const quoteMintStr = curve.quoteMint.toBase58();

        if (isBuy || isCircular) {
          // input -> quote (jup or identity) -> coin (curve buy)
          let quoteAmount: bigint;
          let legs: RouteLeg[] = [];
          let jq: any;
          if (isCircular) {
            // coin -> quote on this curve, then quote -> coin again (arb route)
            const gross = getSellPrice(curve, rawIn);
            quoteAmount = gross - applyFee(gross);
            legs.push({ label: `sell → ${cfg.symbol}` });
          } else if (inputMint === quoteMintStr) {
            quoteAmount = rawIn;
          } else {
            jq = await jupQuote(inputMint, quoteMintStr, rawIn);
            if (!jq) continue;
            quoteAmount = BigInt(jq.outAmount);
            legs.push({ label: `Jupiter → ${cfg.symbol}` });
          }
          // gross up: curve charges fee on top of spend
          const spendable = (quoteAmount * 10_000n) / (10_000n + 100n);
          const tokensOut = getTokensForQuote(curve, spendable);
          if (tokensOut <= 0n) continue;
          legs.push({ label: `${cfg.symbol} curve buy` });
          results.push({ curve, quoteSymbol: cfg.symbol, out: tokensOut, legs, jupQuote: jq, isBuy: true });
        } else {
          // coin (curve sell) -> quote -> output (jup or identity)
          const gross = getSellPrice(curve, rawIn);
          const net = gross - applyFee(gross);
          if (net <= 0n) continue;
          const legs: RouteLeg[] = [{ label: `${cfg.symbol} curve sell` }];
          if (outputMint === quoteMintStr) {
            results.push({ curve, quoteSymbol: cfg.symbol, out: net, legs, isBuy: false });
          } else {
            const slipped = (net * (10_000n - SLIPPAGE_BPS)) / 10_000n;
            const jq = await jupQuote(quoteMintStr, outputMint, slipped);
            if (!jq) continue;
            legs.push({ label: `Jupiter → out` });
            results.push({
              curve,
              quoteSymbol: cfg.symbol,
              out: BigInt(jq.outAmount),
              legs,
              jupQuote: jq,
              isBuy: false,
            });
          }
        }
      }

      results.sort((a, b) => (b.out > a.out ? 1 : -1));
      setRoutes(results);
      if (results.length === 0) toast.error('No route found');
    } catch (e) {
      console.error(e);
      toast.error('Quote failed');
    } finally {
      setQuoting(false);
    }
  }, [amount, curves, decimalsOf, inputMint, outputMint, isBuy, isCircular]);

  const execute = useCallback(
    async (route: RouteResult) => {
      if (!publicKey || !signAllTransactions) {
        toast.error('Connect wallet');
        return;
      }
      setSwapping(true);
      try {
        const cfg = QUOTE_CONFIGS.find((q) => q.mint.equals(route.curve.quoteMint))!;
        const rawIn = BigInt(Math.round(Number(amount) * 10 ** decimalsOf(inputMint)));
        const isNativeQuote = route.curve.quoteMint.equals(WSOL_MINT);
        const txs: (Transaction | VersionedTransaction)[] = [];
        const curveTx = new Transaction();

        // make sure every ATA the program needs exists (idempotent)
        const ensureAtas = () => {
          curveTx.add(
            createAssociatedTokenAccountIdempotentInstruction(
              publicKey,
              ata(base, publicKey, TOKEN_PROGRAM_ID),
              publicKey,
              base,
              TOKEN_PROGRAM_ID
            ),
            createAssociatedTokenAccountIdempotentInstruction(
              publicKey,
              ata(route.curve.quoteMint, publicKey, cfg.tokenProgram),
              publicKey,
              route.curve.quoteMint,
              cfg.tokenProgram
            ),
            createAssociatedTokenAccountIdempotentInstruction(
              publicKey,
              ata(route.curve.quoteMint, PLATFORM_FEE_WALLET, cfg.tokenProgram),
              PLATFORM_FEE_WALLET,
              route.curve.quoteMint,
              cfg.tokenProgram
            ),
            createAssociatedTokenAccountIdempotentInstruction(
              publicKey,
              ata(route.curve.quoteMint, route.curve.creator, cfg.tokenProgram),
              route.curve.creator,
              route.curve.quoteMint,
              cfg.tokenProgram
            )
          );
        };

        const tradeAccounts = {
          user: publicKey,
          mint: base,
          quoteMint: route.curve.quoteMint,
          quoteTokenProgram: cfg.tokenProgram,
          creator: route.curve.creator,
          feeRecipient: PLATFORM_FEE_WALLET,
        };

        if (route.isBuy && !isCircular) {
          let quoteAmount: bigint;
          if (route.jupQuote) {
            txs.push(await jupSwapTx(route.jupQuote, publicKey));
            quoteAmount = BigInt(route.jupQuote.outAmount);
          } else {
            quoteAmount = rawIn;
          }
          ensureAtas();
          if (isNativeQuote) {
            const wsolAta = ata(WSOL_MINT, publicKey, TOKEN_PROGRAM_ID);
            curveTx.add(
              SystemProgram.transfer({
                fromPubkey: publicKey,
                toPubkey: wsolAta,
                lamports: Number(quoteAmount),
              }),
              createSyncNativeInstruction(wsolAta)
            );
          }
          const tokensOut = (route.out * (10_000n - SLIPPAGE_BPS)) / 10_000n;
          curveTx.add(
            buyInstruction({ ...tradeAccounts, tokenAmount: tokensOut, maxQuoteCost: quoteAmount })
          );
          if (isNativeQuote) {
            curveTx.add(
              createCloseAccountInstruction(
                ata(WSOL_MINT, publicKey, TOKEN_PROGRAM_ID),
                publicKey,
                publicKey
              )
            );
          }
          txs.push(curveTx);
        } else if (!route.isBuy) {
          // sell: coin -> quote, then optional jup leg quote -> output
          ensureAtas();
          const gross = getSellPrice(route.curve, rawIn);
          const net = gross - applyFee(gross);
          const minOut = (net * (10_000n - SLIPPAGE_BPS)) / 10_000n;
          curveTx.add(
            sellInstruction({ ...tradeAccounts, tokenAmount: rawIn, minQuoteOutput: minOut })
          );
          if (isNativeQuote && outputMint === WSOL_MINT.toBase58()) {
            curveTx.add(
              createCloseAccountInstruction(
                ata(WSOL_MINT, publicKey, TOKEN_PROGRAM_ID),
                publicKey,
                publicKey
              )
            );
          }
          txs.push(curveTx);
          if (route.jupQuote) {
            txs.push(await jupSwapTx(route.jupQuote, publicKey));
          }
        } else {
          // circular: sell on this curve, buy back on the same curve
          ensureAtas();
          const gross = getSellPrice(route.curve, rawIn);
          const net = gross - applyFee(gross);
          curveTx.add(
            sellInstruction({
              ...tradeAccounts,
              tokenAmount: rawIn,
              minQuoteOutput: (net * (10_000n - SLIPPAGE_BPS)) / 10_000n,
            }),
            buyInstruction({
              ...tradeAccounts,
              tokenAmount: (route.out * (10_000n - SLIPPAGE_BPS)) / 10_000n,
              maxQuoteCost: net,
            })
          );
          txs.push(curveTx);
        }

        const { blockhash } = await connection.getLatestBlockhash('confirmed');
        for (const tx of txs) {
          if (tx instanceof Transaction) {
            tx.feePayer = publicKey;
            tx.recentBlockhash = blockhash;
          }
        }

        const signed = await signAllTransactions(txs);
        for (const tx of signed) {
          const sig = await connection.sendRawTransaction(
            tx instanceof Transaction ? tx.serialize() : Buffer.from(tx.serialize()),
            { skipPreflight: false }
          );
          await connection.confirmTransaction(sig, 'confirmed');
        }
        toast.success('Swap complete');
        // refresh curve state
        const refreshed = await fetchBondingCurves(
          connection,
          base,
          QUOTE_CONFIGS.map((q) => q.mint)
        );
        setCurves(refreshed.filter((c): c is BondingCurveAccount => !!c && !c.complete));
        setRoutes([]);
      } catch (e: any) {
        console.error(e);
        toast.error(e?.message ?? 'Swap failed');
      } finally {
        setSwapping(false);
      }
    },
    [publicKey, signAllTransactions, amount, decimalsOf, inputMint, outputMint, isCircular, base, connection]
  );

  const fmt = (raw: bigint, decimals: number) =>
    (Number(raw) / 10 ** decimals).toLocaleString(undefined, { maximumFractionDigits: 6 });

  if (curves.length === 0) {
    return (
      <div className="rounded-lg border border-neutral-700 p-4 text-sm text-neutral-400">
        No active bonding curves for this coin.
      </div>
    );
  }

  const outDecimals = isBuy || isCircular ? TOKEN_DECIMALS : decimalsOf(outputMint);

  return (
    <div className="rounded-lg border border-neutral-700 p-4 flex flex-col gap-3">
      <span className="font-semibold text-sm">Multi-Curve Swap</span>

      <div className="flex gap-2 items-center">
        <select
          className="bg-neutral-900 border border-neutral-700 rounded p-2 text-sm flex-1"
          value={inputMint}
          onChange={(e) => setInputMint(e.target.value)}
        >
          {tokenOptions.map((t) => (
            <option key={`in-${t.mint}`} value={t.mint}>
              {t.symbol}
            </option>
          ))}
        </select>
        <span className="text-neutral-500">→</span>
        <select
          className="bg-neutral-900 border border-neutral-700 rounded p-2 text-sm flex-1"
          value={outputMint}
          onChange={(e) => setOutputMint(e.target.value)}
        >
          {tokenOptions.map((t) => (
            <option key={`out-${t.mint}`} value={t.mint}>
              {t.symbol}
            </option>
          ))}
        </select>
      </div>

      <input
        type="number"
        min="0"
        placeholder="Amount in"
        className="bg-neutral-900 border border-neutral-700 rounded p-2 text-sm"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
      />

      {!isBuy && !isSell && !isCircular && (
        <p className="text-xs text-amber-400">
          One side must be this coin — routes go through its curves.
        </p>
      )}

      <Button onClick={getQuotes} disabled={quoting || (!isBuy && !isSell && !isCircular)}>
        {quoting ? 'Quoting…' : 'Get best route'}
      </Button>

      {routes.length > 0 && (
        <div className="flex flex-col gap-2">
          {routes.map((r, i) => (
            <div
              key={`${r.curve.address.toBase58()}-${i}`}
              className={`rounded border p-2 text-xs flex items-center justify-between gap-2 ${
                i === 0 ? 'border-emerald-500' : 'border-neutral-700'
              }`}
            >
              <div className="flex flex-col">
                <span>
                  {i === 0 && <span className="text-emerald-400 mr-1">BEST</span>}
                  via {r.legs.map((l) => l.label).join(' → ')}
                </span>
                <span className="text-neutral-400">out ≈ {fmt(r.out, outDecimals)}</span>
              </div>
              <Button disabled={swapping} onClick={() => execute(r)}>
                {swapping ? '…' : 'Swap'}
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default CurveSwap;
