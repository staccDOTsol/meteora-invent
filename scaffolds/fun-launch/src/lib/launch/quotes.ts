import { PublicKey } from '@solana/web3.js';

export const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
export const TOKEN_2022_PROGRAM_ID = new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');
export const WSOL_MINT = new PublicKey('So11111111111111111111111111111111111111112');

/**
 * A quote token the coin gets a single-sided HawkFi DLMM pool against.
 *
 * Values below were verified live on mainnet via Helius (getAccountInfo,
 * jsonParsed) — decimals, owning token program, and Token-2022 transfer fees
 * are taken from chain, not assumed.
 */
export type QuoteToken = {
  symbol: string;
  mint: PublicKey;
  tokenProgram: PublicKey;
  decimals: number;
  /** Target market cap for the coin on this quote, in human quote units. */
  targetMarketCap: number;
  /** Token-2022 transfer fee in basis points, if any (0 for SPL). */
  transferFeeBps: number;
};

export const QUOTES: QuoteToken[] = [
  {
    symbol: 'SOL',
    mint: WSOL_MINT,
    tokenProgram: TOKEN_PROGRAM_ID,
    decimals: 9,
    targetMarketCap: 100,
    transferFeeBps: 0,
  },
  {
    symbol: 'USDC',
    mint: new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'),
    tokenProgram: TOKEN_PROGRAM_ID,
    decimals: 6,
    targetMarketCap: 60_000,
    transferFeeBps: 0,
  },
  {
    symbol: 'USDT',
    mint: new PublicKey('Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'),
    tokenProgram: TOKEN_PROGRAM_ID,
    decimals: 6,
    targetMarketCap: 60_000,
    transferFeeBps: 0,
  },
  {
    // Token-2022 with a 6.9% transfer fee (verified on-chain). Every seed and
    // trade on this pool loses 6.9% per transfer — deliberate, per spec.
    symbol: '6K4',
    mint: new PublicKey('6K4xdfEk5rvySM496rxm4x8AgC9wVt7N4C7mFFpNAj5f'),
    tokenProgram: TOKEN_2022_PROGRAM_ID,
    decimals: 9,
    targetMarketCap: 50,
    transferFeeBps: 690,
  },
  {
    // Token-2022 (verified — not SPL), 6 decimals.
    symbol: '73ed',
    mint: new PublicKey('73edX6xoGY4v5y2hzuKdrUbJXLntqgmo74au1Ki1pump'),
    tokenProgram: TOKEN_2022_PROGRAM_ID,
    decimals: 6,
    targetMarketCap: 12_000_000,
    transferFeeBps: 0,
  },
];

/** The coin we launch: Token-2022, 6 decimals, 1B supply (matches DBC default). */
export const COIN_DECIMALS = 6;
export const COIN_TOTAL_SUPPLY = 1_000_000_000;

/** DBC primary quote — the bonding curve trades against this. */
export const PRIMARY_QUOTE_SYMBOL = 'SOL';
