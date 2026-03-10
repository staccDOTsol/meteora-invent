import { Keypair } from '@solana/web3.js';
import { config } from 'dotenv';
import fs from 'fs';
import path from 'path';
import { getNetworkConfig, parseCliArguments, displayHelp } from '../../helpers/cli';
import { airdropSol } from '../../helpers/utils';
import { AIRDROP_SOL_COMMAND_OPTIONS } from '../../utils/constants';
import { createCheckedConnection } from '../../helpers/connection';

config();

async function main() {
  try {
    const args = parseCliArguments();

    if (args.help) {
      displayHelp(
        'airdrop-sol',
        'Airdrop SOL to your generated keypair on devnet or localnet',
        AIRDROP_SOL_COMMAND_OPTIONS
      );
      return undefined;
    }

    const { network } = args;
    if (!network) {
      throw new Error('Please provide --network flag (devnet or localnet)');
    }

    const networkConfig = getNetworkConfig(network);
    console.log(`\n>> Using network: ${network.toUpperCase()}`);
    console.log(`>> RPC URL: ${networkConfig.rpcUrl}`);

    const keypairPath = path.join(__dirname, '../../../keypair.json');

    if (!fs.existsSync(keypairPath)) {
      throw new Error(
        `Keypair file not found at ${keypairPath}.\nPlease run: pnpm studio generate-keypair`
      );
    }

    const keypairData = fs.readFileSync(keypairPath, 'utf8');
    const secretKeyArray = JSON.parse(keypairData);
    const keypair = Keypair.fromSecretKey(new Uint8Array(secretKeyArray));

    console.log(`>> Public Key: ${keypair.publicKey.toString()}`);

    console.log(
      `\n>> Attempting to airdrop ${networkConfig.airdropAmount} SOL on ${network.toUpperCase()}...`
    );
    const connection = await createCheckedConnection(networkConfig.rpcUrl, 'confirmed');

    try {
      const signature = await airdropSol(connection, keypair, networkConfig.airdropAmount);
      console.log(
        `- Successfully airdropped ${networkConfig.airdropAmount} SOL on ${network.toUpperCase()}! Transaction Signature: ${signature}`
      );

      const balance = await connection.getBalance(keypair.publicKey);
      console.log(`Current balance: ${(balance / 1e9).toFixed(4)} SOL`);
    } catch (airdropError) {
      console.warn(`Airdrop failed: ${airdropError}`);
      if (network === 'localnet') {
        console.log(
          '\n>> Make sure you have a local Solana validator running with: npm run start-test-validator'
        );
      } else {
        console.log('\n>> This might be due to claiming rate limit. Try again later.');
      }
    }

    return keypair;
  } catch (error) {
    console.error('Error airdropping SOL:', error);
    throw error;
  }
}

main();
