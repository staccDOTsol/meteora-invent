// Deploys ONE reusable Meteora DBC partner config (wSOL quote) that every coin
// launches against via createPool(configKey). One-time setup.
//
// Config: quote = wSOL, 1% trading fee split 50/50 creator/partner, coin is
// Token-2022 with the CREATOR keeping mint+update authority (so we can mint
// extra supply to seed HawkFi DLMM pools, then revoke), curve sized by market
// cap (initial -> migration), migrate to DAMM v2.
//
// Usage:
//   DEPLOY_SECRET=<base58>  RPC_URL=<helius>  [SIMULATE=1]
//   [PARTNER=<pubkey>] [LEFTOVER=<pubkey>]
//   [INITIAL_MCAP_SOL=10] [MIGRATION_MCAP_SOL=100]
//   node scripts/deploy-dbc-config.mjs
//
// Secret is read from env only — never written to disk or committed.

import {
  Connection,
  Keypair,
  PublicKey,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import bs58 from 'bs58';
import {
  buildCurveWithMarketCap,
  DynamicBondingCurveClient,
} from '@meteora-ag/dynamic-bonding-curve-sdk';

const WSOL = new PublicKey('So11111111111111111111111111111111111111112');

const secret = process.env.DEPLOY_SECRET;
const rpcUrl = process.env.RPC_URL;
if (!secret || !rpcUrl) throw new Error('Set DEPLOY_SECRET and RPC_URL');

const simulateOnly = process.env.SIMULATE === '1';
const initialMcap = Number(process.env.INITIAL_MCAP_SOL ?? '10');
const migrationMcap = Number(process.env.MIGRATION_MCAP_SOL ?? '100');

const payer = Keypair.fromSecretKey(bs58.decode(secret));
const partner = process.env.PARTNER ? new PublicKey(process.env.PARTNER) : payer.publicKey;
const leftover = process.env.LEFTOVER ? new PublicKey(process.env.LEFTOVER) : payer.publicKey;

const connection = new Connection(rpcUrl, 'confirmed');

const curveConfig = buildCurveWithMarketCap({
  token: {
    totalTokenSupply: 1_000_000_000,
    tokenBaseDecimal: 6,
    tokenQuoteDecimal: 9,
    tokenType: 1, // Token2022
    tokenUpdateAuthority: 3, // CreatorUpdateAndMintAuthority
    leftover: 0,
  },
  fee: {
    baseFeeParams: {
      baseFeeMode: 0,
      feeSchedulerParam: {
        startingFeeBps: 100,
        endingFeeBps: 100,
        numberOfPeriod: 0,
        totalDuration: 0,
      },
    },
    dynamicFeeEnabled: true,
    collectFeeMode: 0, // QuoteToken
    creatorTradingFeePercentage: 50, // 50/50 creator/partner
    poolCreationFee: 0,
    enableFirstSwapWithMinFee: false,
  },
  migration: {
    migrationOption: 1, // DAMM v2
    migrationFeeOption: 3, // FixedBps200
    migrationFee: { feePercentage: 0, creatorFeePercentage: 0 },
  },
  liquidityDistribution: {
    partnerLiquidityPercentage: 50,
    creatorLiquidityPercentage: 40,
    partnerPermanentLockedLiquidityPercentage: 5,
    creatorPermanentLockedLiquidityPercentage: 5,
  },
  lockedVesting: {
    totalLockedVestingAmount: 0,
    numberOfVestingPeriod: 0,
    cliffUnlockAmount: 0,
    totalVestingDuration: 0,
    cliffDurationFromMigrationTime: 0,
  },
  activationType: 1, // timestamp
  initialMarketCap: initialMcap,
  migrationMarketCap: migrationMcap,
});

const client = new DynamicBondingCurveClient(connection, 'confirmed');
const configKeypair = Keypair.generate();

console.log('payer / partner :', payer.publicKey.toBase58(), '/', partner.toBase58());
console.log('quote           : wSOL');
console.log('mcap curve      :', initialMcap, 'SOL ->', migrationMcap, 'SOL (migrate DAMM v2)');
console.log('config key      :', configKeypair.publicKey.toBase58());

const tx = await client.partner.createConfig({
  config: configKeypair.publicKey,
  quoteMint: WSOL,
  feeClaimer: partner,
  leftoverReceiver: leftover,
  payer: payer.publicKey,
  ...curveConfig,
});

const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
tx.feePayer = payer.publicKey;
tx.recentBlockhash = blockhash;

if (simulateOnly) {
  tx.sign(payer, configKeypair);
  const sim = await connection.simulateTransaction(tx);
  console.log('\n=== SIMULATION ===');
  console.log('err   :', JSON.stringify(sim.value.err));
  console.log('units :', sim.value.unitsConsumed);
  for (const l of sim.value.logs ?? []) console.log(l);
  if (sim.value.err) process.exit(1);
  console.log('\nSimulation OK — re-run without SIMULATE=1 to deploy.');
} else {
  const sig = await sendAndConfirmTransaction(connection, tx, [payer, configKeypair], {
    commitment: 'confirmed',
    maxRetries: 5,
  });
  console.log('\nDEPLOYED. tx:', sig);
  console.log('DBC_CONFIG_KEY=' + configKeypair.publicKey.toBase58());
}
