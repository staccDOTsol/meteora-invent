/**
 * Output Formatter
 *
 * Provides human-friendly formatted output for pool creation results,
 * making it easier to verify what was created and what to do next.
 */

export interface PoolInfo {
  poolType: 'DBC' | 'DAMM_V1' | 'DAMM_V2' | 'DLMM' | 'ALPHA_VAULT' | 'PRESALE_VAULT';
  configAddress?: string;
  poolAddress?: string;
  baseMint?: string;
  quoteMint?: string;
  creator?: string;
  txHash?: string;
  network?: string;
  dryRun?: boolean;
  /** Optional extra key-value pairs to display */
  extras?: Record<string, string | number | boolean | null | undefined>;
}

/** Simple horizontal rule */
function hr(char = '─', width = 60): string {
  return char.repeat(width);
}

/** Left-pad a label so values align */
function row(label: string, value: string | number | boolean | null | undefined): string {
  const LABEL_WIDTH = 22;
  const lbl = `${label}`.padEnd(LABEL_WIDTH);
  return `  ${lbl} ${value ?? '(not set)'}`;
}

/**
 * Print a success summary after a pool/vault creation action.
 * Works for both dry-run simulations and real on-chain creations.
 */
export function formatPoolCreationSuccess(info: PoolInfo): void {
  const modeTag = info.dryRun ? ' [DRY-RUN SIMULATION]' : '';
  const header = `✅  ${info.poolType} ${info.dryRun ? 'Simulation' : 'Creation'} Successful${modeTag}`;

  console.log('\n' + hr());
  console.log(header);
  console.log(hr());

  if (info.configAddress) console.log(row('Config Address:', info.configAddress));
  if (info.poolAddress) console.log(row('Pool Address:', info.poolAddress));
  if (info.baseMint) console.log(row('Base Mint:', info.baseMint));
  if (info.quoteMint) console.log(row('Quote Mint:', info.quoteMint));
  if (info.creator) console.log(row('Creator:', info.creator));
  if (info.txHash) console.log(row('Transaction Hash:', info.txHash));
  if (info.network) console.log(row('Network:', info.network));

  // Extra fields
  if (info.extras) {
    for (const [key, val] of Object.entries(info.extras)) {
      console.log(row(`${key}:`, val));
    }
  }

  console.log(hr());

  // Next steps
  console.log('\n📋  Next Steps:');

  if (info.dryRun) {
    console.log('  1. Review the simulation output above for any errors.');
    console.log('  2. When ready to go live, set "dryRun": false in your config file.');
    console.log('  3. Re-run the same command to execute on-chain.');
  } else {
    if (info.txHash) {
      const network = info.network?.toLowerCase() ?? '';
      let explorer: string;
      if (network.includes('mainnet')) {
        explorer = `https://explorer.solana.com/tx/${info.txHash}`;
      } else if (network.includes('testnet')) {
        explorer = `https://explorer.solana.com/tx/${info.txHash}?cluster=testnet`;
      } else if (network.includes('localnet') || network.includes('localhost')) {
        explorer = `https://explorer.solana.com/tx/${info.txHash}?cluster=custom&customUrl=http%3A%2F%2Flocalhost%3A8899`;
      } else {
        // default: devnet
        explorer = `https://explorer.solana.com/tx/${info.txHash}?cluster=devnet`;
      }
      console.log(`  1. View transaction: ${explorer}`);
    }
    if (info.poolAddress) {
      console.log(`  2. Save your pool address: ${info.poolAddress}`);
    }
    if (info.configAddress) {
      console.log(`  3. Save your config address: ${info.configAddress}`);
    }
    console.log('  4. Run migration actions when the pool graduation threshold is reached.');
  }

  console.log('');
}

/**
 * Print an error summary with actionable fix instructions.
 */
export function formatError(context: string, err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  console.error('\n' + hr('═'));
  console.error(`❌  Error in ${context}`);
  console.error(hr('═'));
  console.error(message);
  console.error(hr('═') + '\n');
}
