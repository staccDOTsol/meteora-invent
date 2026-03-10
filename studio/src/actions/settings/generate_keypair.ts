import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import { config } from 'dotenv';
import fs from 'fs';
import path from 'path';
import { parseCliArguments, getNetworkConfig, displayHelp } from '../../helpers/cli';
import { airdropSol } from '../../helpers/utils';
import { GENERATE_KEYPAIR_COMMAND_OPTIONS } from '../../utils/constants';
import { createCheckedConnection } from '../../helpers/connection';

config();

async function main() {
  try {
    const args = parseCliArguments();

    if (args.help) {
      displayHelp(
        'generate-keypair',
        'Generate a keypair from your PRIVATE_KEY environment variable and save it to keypair.json',
        GENERATE_KEYPAIR_COMMAND_OPTIONS
      );
      return undefined;
    }

    console.log(`\n>> Generating keypair...`);

    const { network, airdrop: shouldAirdrop } = args;

    const privateKeyString = process.env.PRIVATE_KEY;

    if (!privateKeyString) {
      throw new Error('PRIVATE_KEY is not defined in the .env file');
    }

    const secretKey = bs58.decode(privateKeyString);
    const keypair = Keypair.fromSecretKey(secretKey);

    console.log('Public Key:', keypair.publicKey.toString());

    const keypairArray = Array.from(keypair.secretKey);
    const outputPath = path.join(__dirname, '../../../keypair.json');
    fs.writeFileSync(outputPath, JSON.stringify(keypairArray, null, 4));

    console.log(`Keypair saved to: ${outputPath}`);

    if (shouldAirdrop) {
      if (!network) {
        throw new Error('Please provide --network flag (devnet or localnet) when using --airdrop');
      }
      const networkConfig = getNetworkConfig(network);
      console.log(
        `\n>> Attempting to airdrop ${networkConfig.airdropAmount} SOL on ${network.toUpperCase()}...`
      );
      const connection = await createCheckedConnection(networkConfig.rpcUrl, 'confirmed');

      try {
        const signature = await airdropSol(connection, keypair, networkConfig.airdropAmount);
        console.log(
          `- Successfully airdropped ${networkConfig.airdropAmount} SOL on ${network.toUpperCase()}! Transaction Signature: ${signature}`
        );
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
    }

    return keypair;
  } catch (error) {
    console.error('Error generating keypair:', error);
    throw error;
  }
}

main();
