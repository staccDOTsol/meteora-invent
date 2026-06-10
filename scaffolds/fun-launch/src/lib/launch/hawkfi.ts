import BN from 'bn.js';
import DLMM, { deriveCustomizablePermissionlessLbPair } from '@meteora-ag/dlmm';
import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import { COIN_DECIMALS, QuoteToken } from './quotes';

export const DLMM_PROGRAM_ID = new PublicKey('LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo');
export const HAWKFI_API_URL = process.env.NEXT_PUBLIC_HAWKFI_API_URL ?? 'https://api2.hawksight.co';

// Single-sided seed: bin step + base fee for the launch pool, and how many bins
// above the active price the one-sided coin liquidity spreads over. These are
// the knobs HawkFi's HFL automation then keeps rebalanced.
const BIN_STEP = 100; // 1% bins — coarse, robust for wide launch ranges
const BASE_FEE_BPS = 100;
const ACTIVATION_TYPE_TIMESTAMP = 1;
const ONE_SIDED_BIN_WIDTH = 60; // bins of coin liquidity above active price

/**
 * The price (quote per 1 coin) that puts the coin's fully-diluted market cap at
 * `targetMarketCap` quote units, given a 1B supply.
 */
export function priceForTargetMcap(quote: QuoteToken, totalSupply: number): number {
  return quote.targetMarketCap / totalSupply;
}

export type SingleSidedPoolPlan = {
  quote: QuoteToken;
  lbPair: PublicKey;
  /** Active bin id derived from the target-mcap price. */
  activeId: number;
  /** Raw coin amount to mint + seed one-sided into this pool. */
  coinSeedRaw: bigint;
  /** DLMM pool-creation transaction (no-op if the pool already exists). */
  createPoolTx: Transaction | null;
};

/**
 * Plans the single-sided HawkFi DLMM pool for one quote: derives the lbPair,
 * the active bin from the target-mcap price, the coin amount to seed, and the
 * pool-creation tx. Position + one-sided deposit + HFL automation are created
 * separately against the HawkFi hosted API (see requestHawkFiPositionTx).
 */
export async function planSingleSidedPool(args: {
  connection: Connection;
  creator: PublicKey;
  coinMint: PublicKey;
  coinProgram: PublicKey;
  quote: QuoteToken;
  totalSupply: number;
  /** Fraction of supply to seed into this pool (e.g. 0.1 = 10%). */
  seedFraction: number;
}): Promise<SingleSidedPoolPlan> {
  const { connection, creator, coinMint, quote } = args;

  // DLMM tokenX/tokenY ordering is by address; the coin is tokenX here because
  // we always seed the coin side. price = quote per coin.
  const price = priceForTargetMcap(quote, args.totalSupply);
  const pricePerLamport = DLMM.getPricePerLamport(COIN_DECIMALS, quote.decimals, price);
  const activeId = DLMM.getBinIdFromPrice(pricePerLamport, BIN_STEP, true);

  const [lbPair] = deriveCustomizablePermissionlessLbPair(coinMint, quote.mint, DLMM_PROGRAM_ID);

  let createPoolTx: Transaction | null = null;
  const existing = await connection.getAccountInfo(lbPair);
  if (!existing) {
    createPoolTx = await DLMM.createCustomizablePermissionlessLbPair2(
      connection,
      new BN(BIN_STEP),
      coinMint,
      quote.mint,
      new BN(activeId),
      new BN(BASE_FEE_BPS),
      ACTIVATION_TYPE_TIMESTAMP,
      false,
      creator
    );
  }

  const coinSeedRaw = BigInt(
    Math.floor(args.totalSupply * args.seedFraction * 10 ** COIN_DECIMALS)
  );

  return { quote, lbPair, activeId, coinSeedRaw, createPoolTx };
}

/**
 * Asks the HawkFi hosted API (via our server proxy) to build the create-position
 * + single-sided deposit + HFL rebalance-automation transactions for a planned
 * pool. Returns base64 Versioned/legacy txs for the wallet to sign.
 *
 * Single-sided = deposit only the coin (tokenX); quote amount is 0 and the bin
 * range sits entirely above the active bin, which is what HawkFi's automation
 * then rebalances when price runs through it.
 */
export async function requestHawkFiPositionTxs(args: {
  userWallet: string;
  lbPair: string;
  position: string; // fresh Keypair pubkey
  coinSeedRaw: bigint;
  lowerBinId: number;
  withAutomation: boolean;
}): Promise<string[]> {
  const res = await fetch('/api/hawkfi/position', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userWallet: args.userWallet,
      pool: args.lbPair,
      position: args.position,
      totalXAmount: args.coinSeedRaw.toString(),
      totalYAmount: '0',
      lowerBinId: args.lowerBinId,
      upperBinId: args.lowerBinId + ONE_SIDED_BIN_WIDTH,
      withAutomation: args.withAutomation,
    }),
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.error ?? `HawkFi position build failed (${res.status})`);
  }
  const { transactions } = (await res.json()) as { transactions: string[] };
  return transactions;
}

export { ONE_SIDED_BIN_WIDTH };
