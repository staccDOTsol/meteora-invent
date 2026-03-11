import { PublicKey } from '@solana/web3.js';
import { getDammV1Config, parseCliArguments, safeParseKeypairFromFile } from '../../helpers';
import { DEFAULT_COMMITMENT_LEVEL } from '../../utils/constants';
import { lockLiquidityStake2Earn } from '../../lib/damm_v1/stake2earn';
import { createCheckedConnection } from '../../helpers/connection';

async function main() {
  const config = await getDammV1Config();

  console.log(`> Using keypair file path ${config.keypairFilePath}`);
  const keypair = await safeParseKeypairFromFile(config.keypairFilePath);

  console.log('\n> Initializing configuration...');
  console.log(`- Using RPC URL ${config.rpcUrl}`);
  console.log(`- Dry run = ${config.dryRun}`);
  console.log(`- Using payer ${keypair.publicKey} to execute commands`);

  const connection = await createCheckedConnection(config.rpcUrl, DEFAULT_COMMITMENT_LEVEL);

  const { baseMint } = parseCliArguments();
  if (!baseMint) {
    throw new Error('Please provide --baseMint flag to do this action');
  }

  if (!config.quoteMint) {
    throw new Error('Missing quoteMint in configuration');
  }
  const quoteMint = new PublicKey(config.quoteMint);

  console.log(`- Using base token mint ${baseMint.toString()}`);
  console.log(`- Using quote token mint ${quoteMint.toString()}`);

  if (!config.dammV1LockLiquidity) {
    throw new Error('Missing lockLiquidity configuration');
  }

  await lockLiquidityStake2Earn(
    connection,
    keypair,
    new PublicKey(baseMint),
    quoteMint,
    config.dammV1LockLiquidity.allocations,
    config.dryRun,
    config.computeUnitPriceMicroLamports ?? 0
  );
}

main();
