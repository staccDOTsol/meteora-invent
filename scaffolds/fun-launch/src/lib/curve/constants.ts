import { PublicKey } from '@solana/web3.js';

/** Forked curve-launchpad program (multi-quote bonding curves). */
export const CURVE_PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_CURVE_PROGRAM_ID ?? 'G2LGhLggpxLknXSkEhWqmukeS1m6NJXYqhaDHrV6JejZ'
);

/** Platform half of the 50/50 trade fee goes to this wallet. */
export const PLATFORM_FEE_WALLET = new PublicKey(
  process.env.NEXT_PUBLIC_PLATFORM_FEE_WALLET ?? 'G2LGhLggpxLknXSkEhWqmukeS1m6NJXYqhaDHrV6JejZ'
);

export const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
export const TOKEN_2022_PROGRAM_ID = new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');
export const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(
  'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL'
);
export const METADATA_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');
export const WSOL_MINT = new PublicKey('So11111111111111111111111111111111111111112');

// Token-side curve constants. These must match the program's Global defaults
// (initialize.rs): 1B supply @ 6 decimals, all of it sellable on the curve.
export const TOKEN_DECIMALS = 6;
export const TOKEN_SUPPLY_RAW = 1_000_000_000n * 10n ** 6n; // 1e15
export const INITIAL_VIRTUAL_TOKEN_RESERVES = 1_073_000_000_000_000n; // 1.073e15
export const INITIAL_REAL_TOKEN_RESERVES = TOKEN_SUPPLY_RAW;
export const FINAL_VIRTUAL_TOKEN_RESERVES =
  INITIAL_VIRTUAL_TOKEN_RESERVES - INITIAL_REAL_TOKEN_RESERVES; // 7.3e13
export const FEE_BASIS_POINTS = 100n; // 1% total, split 50/50 creator/platform

export type QuoteConfig = {
  /** Display name of the quote token. */
  symbol: string;
  mint: PublicKey;
  /** Owner program of the quote mint (Token or Token-2022). */
  tokenProgram: PublicKey;
  decimals: number;
  /** Target market cap, in human quote units, at which the curve completes. */
  targetMarketCap: number;
  /** True for quotes with a Token-2022 transfer fee (display warning). */
  hasTransferFee?: boolean;
};

/**
 * The five quote currencies every coin launches against.
 * Targets: SOL 100, USDC/USDT 60k each, 6K4 (T22 w/ transfer fee) 50, 73ed 12m.
 */
export const QUOTE_CONFIGS: QuoteConfig[] = [
  {
    symbol: 'SOL',
    mint: WSOL_MINT,
    tokenProgram: TOKEN_PROGRAM_ID,
    decimals: 9,
    targetMarketCap: 100,
  },
  {
    symbol: 'USDC',
    mint: new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'),
    tokenProgram: TOKEN_PROGRAM_ID,
    decimals: 6,
    targetMarketCap: 60_000,
  },
  {
    symbol: 'USDT',
    mint: new PublicKey('Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'),
    tokenProgram: TOKEN_PROGRAM_ID,
    decimals: 6,
    targetMarketCap: 60_000,
  },
  {
    symbol: '6K4x',
    mint: new PublicKey('6K4xdfEk5rvySM496rxm4x8AgC9wVt7N4C7mFFpNAj5f'),
    tokenProgram: TOKEN_2022_PROGRAM_ID,
    // decimals refreshed on-chain at launch time; 9 is the placeholder
    decimals: 9,
    targetMarketCap: 50,
    hasTransferFee: true,
  },
  {
    symbol: '73ed',
    mint: new PublicKey('73edX6xoGY4v5y2hzuKdrUbJXLntqgmo74au1Ki1pump'),
    tokenProgram: TOKEN_PROGRAM_ID,
    decimals: 6,
    targetMarketCap: 12_000_000,
  },
];

/**
 * Initial virtual quote reserves needed so the curve completes (all real
 * tokens sold) exactly at `targetMarketCap`:
 *   mcap_final = supply * vQuote0 * vTok0 / vTokFinal^2
 *   => vQuote0 = target_raw * vTokFinal^2 / (supply * vTok0)
 */
export function virtualQuoteReservesForTarget(targetMarketCapRaw: bigint): bigint {
  return (
    (targetMarketCapRaw * FINAL_VIRTUAL_TOKEN_RESERVES * FINAL_VIRTUAL_TOKEN_RESERVES) /
    (TOKEN_SUPPLY_RAW * INITIAL_VIRTUAL_TOKEN_RESERVES)
  );
}
