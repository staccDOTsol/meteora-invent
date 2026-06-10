import {
  AccountMeta,
  Connection,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from '@solana/web3.js';
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  CURVE_PROGRAM_ID,
  FEE_BASIS_POINTS,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from './constants';

// Anchor discriminators: sha256("global:<ix>")[..8] / sha256("account:<Name>")[..8]
const IX_CREATE = Buffer.from([24, 30, 200, 40, 5, 28, 7, 119]);
const IX_BUY = Buffer.from([102, 6, 61, 18, 1, 218, 235, 234]);
const IX_SELL = Buffer.from([51, 230, 133, 164, 1, 127, 131, 173]);
const ACCT_BONDING_CURVE = Buffer.from([23, 183, 248, 55, 96, 216, 172, 96]);

export function findGlobalPda(): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from('global')], CURVE_PROGRAM_ID)[0];
}

export function findBondingCurvePda(mint: PublicKey, quoteMint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('bonding-curve'), mint.toBuffer(), quoteMint.toBuffer()],
    CURVE_PROGRAM_ID
  )[0];
}

export function findEventAuthorityPda(): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from('__event_authority')], CURVE_PROGRAM_ID)[0];
}

export function ata(
  mint: PublicKey,
  owner: PublicKey,
  tokenProgram: PublicKey = TOKEN_PROGRAM_ID
): PublicKey {
  return PublicKey.findProgramAddressSync(
    [owner.toBuffer(), tokenProgram.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID
  )[0];
}

function u64le(v: bigint): Buffer {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(v);
  return b;
}

export type BondingCurveAccount = {
  address: PublicKey;
  mint: PublicKey;
  quoteMint: PublicKey;
  creator: PublicKey;
  virtualQuoteReserves: bigint;
  virtualTokenReserves: bigint;
  realQuoteReserves: bigint;
  realTokenReserves: bigint;
  tokenTotalSupply: bigint;
  targetMarketCap: bigint;
  complete: boolean;
};

export function decodeBondingCurve(address: PublicKey, data: Buffer): BondingCurveAccount | null {
  if (data.length < 8 + 32 * 3 + 8 * 6 + 1 || !data.subarray(0, 8).equals(ACCT_BONDING_CURVE)) {
    return null;
  }
  let o = 8;
  const pk = () => {
    const k = new PublicKey(data.subarray(o, o + 32));
    o += 32;
    return k;
  };
  const u64 = () => {
    const v = data.readBigUInt64LE(o);
    o += 8;
    return v;
  };
  return {
    address,
    mint: pk(),
    quoteMint: pk(),
    creator: pk(),
    virtualQuoteReserves: u64(),
    virtualTokenReserves: u64(),
    realQuoteReserves: u64(),
    realTokenReserves: u64(),
    tokenTotalSupply: u64(),
    targetMarketCap: u64(),
    complete: data.readUInt8(o) === 1,
  };
}

export async function fetchBondingCurves(
  connection: Connection,
  mint: PublicKey,
  quoteMints: PublicKey[]
): Promise<(BondingCurveAccount | null)[]> {
  const pdas = quoteMints.map((q) => findBondingCurvePda(mint, q));
  const infos = await connection.getMultipleAccountsInfo(pdas);
  return infos.map((info, i) =>
    info ? decodeBondingCurve(pdas[i]!, Buffer.from(info.data)) : null
  );
}

// ---------------------------------------------------------------------------
// Curve math (mirrors programs/curve-launchpad/src/amm/amm.rs)
// ---------------------------------------------------------------------------

/** Exact quote cost (before fees) to buy `tokens` from the curve. */
export function getBuyPrice(curve: BondingCurveAccount, tokens: bigint): bigint {
  if (tokens <= 0n || tokens > curve.virtualTokenReserves) return 0n;
  const k = curve.virtualQuoteReserves * curve.virtualTokenReserves;
  const newVirtualTokens = curve.virtualTokenReserves - tokens;
  const newVirtualQuote = k / newVirtualTokens + 1n;
  return newVirtualQuote - curve.virtualQuoteReserves;
}

/** Tokens received for spending `quoteIn` (before fees), clamped to inventory. */
export function getTokensForQuote(curve: BondingCurveAccount, quoteIn: bigint): bigint {
  if (quoteIn <= 0n) return 0n;
  const k = curve.virtualQuoteReserves * curve.virtualTokenReserves;
  let tokens = curve.virtualTokenReserves - k / (curve.virtualQuoteReserves + quoteIn);
  if (tokens > curve.realTokenReserves) tokens = curve.realTokenReserves;
  // back off until the exact cost fits (integer rounding)
  while (tokens > 0n && getBuyPrice(curve, tokens) > quoteIn) {
    tokens -= 1n;
  }
  return tokens;
}

/** Quote received (before fees) for selling `tokens` into the curve. */
export function getSellPrice(curve: BondingCurveAccount, tokens: bigint): bigint {
  if (tokens <= 0n) return 0n;
  const newVirtualTokens = curve.virtualTokenReserves + tokens;
  const quoteOut = (curve.virtualQuoteReserves * tokens) / newVirtualTokens;
  return quoteOut > curve.realQuoteReserves ? curve.realQuoteReserves : quoteOut;
}

export function applyFee(amount: bigint): bigint {
  return (amount * FEE_BASIS_POINTS) / 10_000n;
}

/** Current market cap of the curve, in raw quote units. */
export function marketCap(curve: BondingCurveAccount): bigint {
  if (curve.virtualTokenReserves === 0n) return 0n;
  return (curve.tokenTotalSupply * curve.virtualQuoteReserves) / curve.virtualTokenReserves;
}

// ---------------------------------------------------------------------------
// Instruction builders. Account order mirrors the Rust Accounts structs;
// #[event_cpi] appends (event_authority, program) at the end.
// ---------------------------------------------------------------------------

function eventCpiMetas(): AccountMeta[] {
  return [
    { pubkey: findEventAuthorityPda(), isSigner: false, isWritable: false },
    { pubkey: CURVE_PROGRAM_ID, isSigner: false, isWritable: false },
  ];
}

export function createCurveInstruction(args: {
  creator: PublicKey;
  mint: PublicKey;
  quoteMint: PublicKey;
  quoteTokenProgram: PublicKey;
  virtualQuoteReserves: bigint;
  targetMarketCap: bigint;
  mintTokenProgram?: PublicKey;
}): TransactionInstruction {
  const tokenProgram = args.mintTokenProgram ?? TOKEN_PROGRAM_ID;
  const bondingCurve = findBondingCurvePda(args.mint, args.quoteMint);
  const keys: AccountMeta[] = [
    { pubkey: args.creator, isSigner: true, isWritable: true },
    { pubkey: args.mint, isSigner: false, isWritable: false },
    { pubkey: args.quoteMint, isSigner: false, isWritable: false },
    { pubkey: bondingCurve, isSigner: false, isWritable: true },
    { pubkey: ata(args.mint, bondingCurve, tokenProgram), isSigner: false, isWritable: true },
    {
      pubkey: ata(args.quoteMint, bondingCurve, args.quoteTokenProgram),
      isSigner: false,
      isWritable: true,
    },
    { pubkey: ata(args.mint, args.creator, tokenProgram), isSigner: false, isWritable: true },
    { pubkey: findGlobalPda(), isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    { pubkey: tokenProgram, isSigner: false, isWritable: false },
    { pubkey: args.quoteTokenProgram, isSigner: false, isWritable: false },
    { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ...eventCpiMetas(),
  ];
  return new TransactionInstruction({
    programId: CURVE_PROGRAM_ID,
    keys,
    data: Buffer.concat([IX_CREATE, u64le(args.virtualQuoteReserves), u64le(args.targetMarketCap)]),
  });
}

type TradeAccounts = {
  user: PublicKey;
  mint: PublicKey;
  quoteMint: PublicKey;
  quoteTokenProgram: PublicKey;
  creator: PublicKey;
  feeRecipient: PublicKey;
  mintTokenProgram?: PublicKey;
};

function tradeMetas(a: TradeAccounts): AccountMeta[] {
  const tokenProgram = a.mintTokenProgram ?? TOKEN_PROGRAM_ID;
  const bondingCurve = findBondingCurvePda(a.mint, a.quoteMint);
  return [
    { pubkey: a.user, isSigner: true, isWritable: true },
    { pubkey: findGlobalPda(), isSigner: false, isWritable: false },
    { pubkey: a.mint, isSigner: false, isWritable: false },
    { pubkey: a.quoteMint, isSigner: false, isWritable: false },
    { pubkey: bondingCurve, isSigner: false, isWritable: true },
    { pubkey: ata(a.mint, bondingCurve, tokenProgram), isSigner: false, isWritable: true },
    {
      pubkey: ata(a.quoteMint, bondingCurve, a.quoteTokenProgram),
      isSigner: false,
      isWritable: true,
    },
    { pubkey: ata(a.mint, a.user, tokenProgram), isSigner: false, isWritable: true },
    { pubkey: ata(a.quoteMint, a.user, a.quoteTokenProgram), isSigner: false, isWritable: true },
    {
      pubkey: ata(a.quoteMint, a.feeRecipient, a.quoteTokenProgram),
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: ata(a.quoteMint, a.creator, a.quoteTokenProgram),
      isSigner: false,
      isWritable: true,
    },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    { pubkey: tokenProgram, isSigner: false, isWritable: false },
    { pubkey: a.quoteTokenProgram, isSigner: false, isWritable: false },
    ...eventCpiMetas(),
  ];
}

export function buyInstruction(
  a: TradeAccounts & { tokenAmount: bigint; maxQuoteCost: bigint }
): TransactionInstruction {
  return new TransactionInstruction({
    programId: CURVE_PROGRAM_ID,
    keys: tradeMetas(a),
    data: Buffer.concat([IX_BUY, u64le(a.tokenAmount), u64le(a.maxQuoteCost)]),
  });
}

export function sellInstruction(
  a: TradeAccounts & { tokenAmount: bigint; minQuoteOutput: bigint }
): TransactionInstruction {
  return new TransactionInstruction({
    programId: CURVE_PROGRAM_ID,
    keys: tradeMetas(a),
    data: Buffer.concat([IX_SELL, u64le(a.tokenAmount), u64le(a.minQuoteOutput)]),
  });
}

/** Owner program + decimals for an arbitrary mint (handles Token-2022). */
export async function fetchMintMeta(
  connection: Connection,
  mint: PublicKey
): Promise<{ decimals: number; tokenProgram: PublicKey }> {
  const info = await connection.getAccountInfo(mint);
  if (!info) throw new Error(`Mint ${mint.toBase58()} not found`);
  const tokenProgram = info.owner.equals(TOKEN_2022_PROGRAM_ID)
    ? TOKEN_2022_PROGRAM_ID
    : TOKEN_PROGRAM_ID;
  return { decimals: info.data[44]!, tokenProgram };
}
