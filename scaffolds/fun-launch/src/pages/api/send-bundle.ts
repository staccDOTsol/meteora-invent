import { NextApiRequest, NextApiResponse } from 'next';
import { Connection } from '@solana/web3.js';

// Sends a set of pre-signed transactions as a single Jito bundle (atomic,
// in-order). Falls back to sequential sends through the configured RPC
// (e.g. Helius) if Jito is unavailable.

const JITO_URL =
  process.env.JITO_BLOCK_ENGINE_URL ?? 'https://mainnet.block-engine.jito.wtf/api/v1/bundles';
const RPC_URL = process.env.RPC_URL as string;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { transactions } = req.body as { transactions: string[] };
  if (!Array.isArray(transactions) || transactions.length === 0 || transactions.length > 5) {
    return res.status(400).json({ error: 'transactions must be an array of 1-5 base64 txs' });
  }

  // 1) try Jito bundle
  try {
    const response = await fetch(JITO_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'sendBundle',
        params: [transactions, { encoding: 'base64' }],
      }),
    });
    const json = await response.json();
    if (response.ok && json.result) {
      return res.status(200).json({ success: true, via: 'jito', bundleId: json.result });
    }
    console.error('Jito sendBundle failed, falling back:', json?.error ?? response.status);
  } catch (e) {
    console.error('Jito unreachable, falling back to RPC:', e);
  }

  // 2) fall back to sequential sends via RPC (Helius etc.)
  if (!RPC_URL) {
    return res.status(500).json({ error: 'Jito failed and RPC_URL is not configured' });
  }
  try {
    const connection = new Connection(RPC_URL, 'confirmed');
    const signatures: string[] = [];
    for (const b64 of transactions) {
      const sig = await connection.sendRawTransaction(Buffer.from(b64, 'base64'), {
        skipPreflight: false,
        maxRetries: 5,
      });
      await connection.confirmTransaction(sig, 'confirmed');
      signatures.push(sig);
    }
    return res.status(200).json({ success: true, via: 'rpc', signatures });
  } catch (error) {
    console.error('Sequential send failed:', error);
    return res
      .status(500)
      .json({ error: error instanceof Error ? error.message : 'Send failed' });
  }
}
