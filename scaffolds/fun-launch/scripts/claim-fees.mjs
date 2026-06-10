// Claims accrued Meteora DBC trading fees for our launches.
//
// - PARTNER role: claims the platform's 50% share across every pool created
//   under our config (DBC_CONFIG_KEY).
// - CREATOR role: claims a coin creator's 50% share for their pool(s).
//
// Usage:
//   DEPLOY_SECRET=<base58 of claimer wallet>  RPC_URL=<helius>
//   ROLE=partner DBC_CONFIG_KEY=<config>            # claim platform fees, all pools
//   ROLE=partner POOL=<poolPubkey>                  # claim platform fees, one pool
//   ROLE=creator POOL=<poolPubkey>                  # claim creator fees, one pool
//   [RECEIVER=<pubkey>]   [SIMULATE=1]
//   node scripts/claim-fees.mjs
//
// Secret is read from env only — never written to disk or committed.

import {
  Connection,
  Keypair,
  PublicKey,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import bs58 from 'bs58';
import BN from 'bn.js';
import { DynamicBondingCurveClient } from '@meteora-ag/dynamic-bonding-curve-sdk';

const secret = process.env.DEPLOY_SECRET;
const rpcUrl = process.env.RPC_URL;
const role = (process.env.ROLE ?? 'partner').toLowerCase();
if (!secret || !rpcUrl) throw new Error('Set DEPLOY_SECRET and RPC_URL');

const claimer = Keypair.fromSecretKey(bs58.decode(secret));
const receiver = process.env.RECEIVER ? new PublicKey(process.env.RECEIVER) : claimer.publicKey;
const simulateOnly = process.env.SIMULATE === '1';
const MAX = new BN('18446744073709551615'); // u64::MAX — claim everything available

const connection = new Connection(rpcUrl, 'confirmed');
const client = new DynamicBondingCurveClient(connection, 'confirmed');

// Resolve the set of pools to claim from.
const pools = [];
if (process.env.POOL) {
  pools.push(new PublicKey(process.env.POOL));
} else if (process.env.DBC_CONFIG_KEY) {
  const accounts = await client.state.getPoolsByConfig(new PublicKey(process.env.DBC_CONFIG_KEY));
  for (const a of accounts) pools.push(a.publicKey);
  console.log(`found ${pools.length} pool(s) under config`);
} else {
  throw new Error('Set POOL or DBC_CONFIG_KEY');
}

async function claimOne(pool) {
  const params = {
    payer: claimer.publicKey,
    pool,
    maxBaseAmount: MAX,
    maxQuoteAmount: MAX,
    receiver,
  };
  const tx =
    role === 'creator'
      ? await client.creator.claimCreatorTradingFee({ ...params, creator: claimer.publicKey })
      : await client.partner.claimPartnerTradingFee({ ...params, feeClaimer: claimer.publicKey });

  const { blockhash } = await connection.getLatestBlockhash('confirmed');
  tx.feePayer = claimer.publicKey;
  tx.recentBlockhash = blockhash;

  if (simulateOnly) {
    tx.sign(claimer);
    const sim = await connection.simulateTransaction(tx);
    console.log(pool.toBase58(), 'sim err:', JSON.stringify(sim.value.err));
    return;
  }
  const sig = await sendAndConfirmTransaction(connection, tx, [claimer], {
    commitment: 'confirmed',
    maxRetries: 5,
  });
  console.log(pool.toBase58(), 'claimed ->', sig);
}

console.log('role     :', role);
console.log('claimer  :', claimer.publicKey.toBase58());
console.log('receiver :', receiver.toBase58());

for (const pool of pools) {
  try {
    await claimOne(pool);
  } catch (e) {
    console.error(pool.toBase58(), 'FAILED:', e.message);
  }
}
