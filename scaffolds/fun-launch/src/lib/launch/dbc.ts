import { Connection, Keypair, PublicKey, Transaction } from '@solana/web3.js';
import {
  buildCurveWithMarketCap,
  DynamicBondingCurveClient,
} from '@meteora-ag/dynamic-bonding-curve-sdk';
import { COIN_DECIMALS, COIN_TOTAL_SUPPLY } from './quotes';

// DBC enum values (mirrors the SDK's enums; kept inline to avoid importing the
// enum objects into the client bundle).
const TOKEN_TYPE_TOKEN2022 = 1;
const TOKEN_DECIMAL_SIX = 6;
const TOKEN_DECIMAL_NINE = 9;
/** Creator keeps BOTH metadata-update and MINT authority. This is what lets us
 *  mint extra supply after the curve is live to seed the HawkFi DLMM pools,
 *  then revoke at the end. (TokenUpdateAuthorityOption.CreatorUpdateAndMintAuthority) */
const TOKEN_UPDATE_AND_MINT_AUTH_CREATOR = 3;
const BASE_FEE_MODE_SCHEDULER_FLAT = 0;
const COLLECT_FEE_MODE_QUOTE = 0;
const MIGRATION_OPTION_DAMM_V2 = 1;
const MIGRATION_FEE_OPTION_200BPS = 3;
const ACTIVATION_TYPE_TIMESTAMP = 1;

export type DbcLaunchParams = {
  connection: Connection;
  /** Coin creator — keeps mint authority, receives the creator 50% fee share. */
  creator: PublicKey;
  /** Platform/partner wallet — receives the partner 50% fee share + leftovers. */
  partner: PublicKey;
  name: string;
  symbol: string;
  uri: string;
  /** Quote mint the bonding curve trades against (wSOL for the SOL primary). */
  quoteMint: PublicKey;
  quoteDecimals: number;
  /** Target market caps in human quote units. */
  initialMarketCap: number;
  migrationMarketCap: number;
};

export type DbcLaunchBuild = {
  transaction: Transaction;
  configKeypair: Keypair;
  baseMintKeypair: Keypair;
  baseMint: PublicKey;
};

/**
 * Builds the Meteora DBC `createConfigAndPool` transaction: one tx that creates
 * the config (50/50 creator/partner trading fee, curve sized by target market
 * cap) and the bonding pool, minting the launch supply of a fresh Token-2022
 * mint whose mint+update authority stays with the creator.
 *
 * The returned `baseMintKeypair` and `configKeypair` must co-sign the tx along
 * with the creator wallet.
 */
export async function buildDbcLaunch(params: DbcLaunchParams): Promise<DbcLaunchBuild> {
  const client = new DynamicBondingCurveClient(params.connection, 'confirmed');

  const curveConfig = buildCurveWithMarketCap({
    token: {
      totalTokenSupply: COIN_TOTAL_SUPPLY,
      tokenBaseDecimal: COIN_DECIMALS === 6 ? TOKEN_DECIMAL_SIX : TOKEN_DECIMAL_NINE,
      tokenQuoteDecimal: params.quoteDecimals === 6 ? TOKEN_DECIMAL_SIX : TOKEN_DECIMAL_NINE,
      tokenType: TOKEN_TYPE_TOKEN2022,
      tokenUpdateAuthority: TOKEN_UPDATE_AND_MINT_AUTH_CREATOR,
      leftover: 0,
    },
    fee: {
      baseFeeParams: {
        baseFeeMode: BASE_FEE_MODE_SCHEDULER_FLAT,
        feeSchedulerParam: {
          startingFeeBps: 100,
          endingFeeBps: 100,
          numberOfPeriod: 0,
          totalDuration: 0,
        },
      },
      dynamicFeeEnabled: true,
      collectFeeMode: COLLECT_FEE_MODE_QUOTE,
      // 50/50 split: creator gets 50% of trading fees, partner (platform) the rest.
      creatorTradingFeePercentage: 50,
      poolCreationFee: 0,
      enableFirstSwapWithMinFee: false,
    } as never,
    migration: {
      migrationOption: MIGRATION_OPTION_DAMM_V2,
      migrationFeeOption: MIGRATION_FEE_OPTION_200BPS,
      migrationFee: { feePercentage: 0, creatorFeePercentage: 0 },
    } as never,
    liquidityDistribution: {
      partnerLiquidityPercentage: 50,
      creatorLiquidityPercentage: 40,
      partnerPermanentLockedLiquidityPercentage: 5,
      creatorPermanentLockedLiquidityPercentage: 5,
    } as never,
    lockedVesting: {
      totalLockedVestingAmount: 0,
      numberOfVestingPeriod: 0,
      cliffUnlockAmount: 0,
      totalVestingDuration: 0,
      cliffDurationFromMigrationTime: 0,
    } as never,
    activationType: ACTIVATION_TYPE_TIMESTAMP,
    initialMarketCap: params.initialMarketCap,
    migrationMarketCap: params.migrationMarketCap,
  });

  const configKeypair = Keypair.generate();
  const baseMintKeypair = Keypair.generate();

  const transaction = await client.pool.createConfigAndPool({
    config: configKeypair.publicKey,
    quoteMint: params.quoteMint,
    feeClaimer: params.partner,
    leftoverReceiver: params.creator,
    payer: params.creator,
    ...curveConfig,
    preCreatePoolParam: {
      name: params.name,
      symbol: params.symbol,
      uri: params.uri,
      poolCreator: params.creator,
      baseMint: baseMintKeypair.publicKey,
    },
  } as never);

  return {
    transaction,
    configKeypair,
    baseMintKeypair,
    baseMint: baseMintKeypair.publicKey,
  };
}
