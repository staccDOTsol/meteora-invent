import { PublicKey } from '@solana/web3.js';
import { Wallet } from '@coral-xyz/anchor';
import { LBCLMM_PROGRAM_IDS, deriveCustomizablePermissionlessLbPair } from '@meteora-ag/dlmm';
import {
  deriveCustomizablePermissionlessConstantProductPoolAddress,
  createProgram,
} from '@meteora-ag/dynamic-amm-sdk/dist/cjs/src/amm/utils';
import { deriveCustomizablePoolAddress } from '@meteora-ag/cp-amm-sdk';
import { AlphaVaultConfig, PoolTypeConfig } from '../../utils/types';
import { getAlphaVaultConfig, parseCliArguments, safeParseKeypairFromFile } from '../../helpers';
import { DEFAULT_COMMITMENT_LEVEL } from '../../utils/constants';
import { createAlphaVault } from '../../lib/alpha_vault';
import { createCheckedConnection } from '../../helpers/connection';

async function main() {
  const config = await getAlphaVaultConfig();

  console.log(`> Using keypair file path ${config.keypairFilePath}`);
  const keypair = await safeParseKeypairFromFile(config.keypairFilePath);

  console.log('\n> Initializing configuration...');
  console.log(`- Using RPC URL ${config.rpcUrl}`);
  console.log(`- Dry run = ${config.dryRun}`);
  console.log(`- Using payer ${keypair.publicKey} to execute commands`);

  const connection = await createCheckedConnection(config.rpcUrl, DEFAULT_COMMITMENT_LEVEL);

  const wallet = new Wallet(keypair);

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

  if (!config.alphaVault) {
    throw new Error('Missing alpha vault in configuration');
  }
  const poolType = config.alphaVault.poolType;

  let poolKey: PublicKey;
  if (poolType == PoolTypeConfig.DammV1) {
    poolKey = deriveCustomizablePermissionlessConstantProductPoolAddress(
      new PublicKey(baseMint),
      quoteMint,
      createProgram(connection as any).ammProgram.programId
    );
  } else if (poolType == PoolTypeConfig.Dlmm) {
    [poolKey] = deriveCustomizablePermissionlessLbPair(
      new PublicKey(baseMint),
      quoteMint,
      new PublicKey(LBCLMM_PROGRAM_IDS['mainnet-beta'])
    );
  } else if (poolType == PoolTypeConfig.DammV2) {
    poolKey = deriveCustomizablePoolAddress(new PublicKey(baseMint), quoteMint);
  } else {
    throw new Error(`Invalid pool type ${poolType}`);
  }

  console.log(`\n> Pool address: ${poolKey}, pool type ${poolType}`);

  const alphaVaultConfig: AlphaVaultConfig = {
    ...config,
    quoteMint: quoteMint.toString(),
  };

  await createAlphaVault(connection, wallet, alphaVaultConfig, poolKey, new PublicKey(baseMint));
}

main();
