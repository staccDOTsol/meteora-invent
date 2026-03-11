/**
 * RPC Connection helpers with improved error handling.
 *
 * Wraps new Connection() with early health-check so users get a clear
 * message instead of a cryptic network error deep in the SDK.
 */

import { Connection, Commitment } from '@solana/web3.js';

/**
 * Create a Solana Connection and verify it is reachable with a quick
 * getLatestBlockhash() call.  Throws a human-friendly error on failure.
 *
 * @param rpcUrl - The RPC endpoint URL
 * @param commitment - Commitment level (default: 'confirmed')
 * @param skipHealthCheck - Set true to skip the health-check (useful in tests)
 */
export async function createCheckedConnection(
  rpcUrl: string,
  commitment: Commitment = 'confirmed',
  skipHealthCheck = false
): Promise<Connection> {
  if (!rpcUrl || rpcUrl.trim() === '') {
    throw new Error(
      'rpcUrl is empty. Set a valid RPC URL in your config file.\n' +
        '  Examples:\n' +
        '    devnet:  https://api.devnet.solana.com\n' +
        '    mainnet: https://api.mainnet-beta.solana.com\n' +
        '    localnet: http://localhost:8899'
    );
  }

  const connection = new Connection(rpcUrl, commitment);

  if (!skipHealthCheck) {
    try {
      await connection.getLatestBlockhash();
    } catch (err: unknown) {
      const cause = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Failed to connect to RPC endpoint: ${rpcUrl}\n` +
          `Cause: ${cause}\n\n` +
          `Possible fixes:\n` +
          `  1. Check that the URL is correct in your config file (rpcUrl field).\n` +
          `  2. Make sure you have internet access (or the local validator is running).\n` +
          `  3. If using localnet, start it with: pnpm studio start-test-validator\n` +
          `  4. Try a different RPC provider if the public endpoint is rate-limiting you.`
      );
    }
  }

  return connection;
}
