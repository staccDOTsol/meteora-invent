import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js';
import {
  AuthorityType,
  createAssociatedTokenAccountInstruction,
  createInitializeMint2Instruction,
  createMintToInstruction,
  createSetAuthorityInstruction,
  MINT_SIZE,
} from '@solana/spl-token';
import {
  METADATA_PROGRAM_ID,
  QUOTE_CONFIGS,
  TOKEN_DECIMALS,
  TOKEN_PROGRAM_ID,
  TOKEN_SUPPLY_RAW,
  virtualQuoteReservesForTarget,
} from './constants';
import { ata, createCurveInstruction, fetchMintMeta } from './client';

const JITO_TIP_ACCOUNT = new PublicKey('96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5');
const JITO_TIP_LAMPORTS = 500_000;

function borshStr(s: string): Buffer {
  const b = Buffer.from(s, 'utf8');
  const len = Buffer.alloc(4);
  len.writeUInt32LE(b.length);
  return Buffer.concat([len, b]);
}

/** Metaplex CreateMetadataAccountV3 (creator is mint + update authority). */
function createMetadataV3Instruction(args: {
  mint: PublicKey;
  creator: PublicKey;
  name: string;
  symbol: string;
  uri: string;
}): TransactionInstruction {
  const [metadata] = PublicKey.findProgramAddressSync(
    [Buffer.from('metadata'), METADATA_PROGRAM_ID.toBuffer(), args.mint.toBuffer()],
    METADATA_PROGRAM_ID
  );
  const data = Buffer.concat([
    Buffer.from([33]), // CreateMetadataAccountV3 discriminator
    borshStr(args.name),
    borshStr(args.symbol),
    borshStr(args.uri),
    Buffer.from([0, 0]), // seller_fee_basis_points: u16 = 0
    Buffer.from([0]), // creators: None
    Buffer.from([0]), // collection: None
    Buffer.from([0]), // uses: None
    Buffer.from([1]), // is_mutable: true
    Buffer.from([0]), // collection_details: None
  ]);
  return new TransactionInstruction({
    programId: METADATA_PROGRAM_ID,
    keys: [
      { pubkey: metadata, isSigner: false, isWritable: true },
      { pubkey: args.mint, isSigner: false, isWritable: false },
      { pubkey: args.creator, isSigner: true, isWritable: false },
      { pubkey: args.creator, isSigner: true, isWritable: true },
      { pubkey: args.creator, isSigner: true, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
    ],
    data,
  });
}

/**
 * Builds the whole launch as a set of transactions meant to be approved with
 * ONE wallet prompt (signAllTransactions) and sent as a Jito bundle (or
 * sequentially via Helius/RPC as fallback):
 *
 *   tx1: create + init mint (creator keeps mint authority), metadata,
 *        creator ATA, mint 5B tokens (1B per curve)
 *   tx2: create SOL + USDC curves
 *   tx3: create USDT + 6K4 (T22 transfer-fee) curves
 *   tx4: create 73ed curve, then REVOKE mint authority, Jito tip
 */
export async function buildLaunchTransactions(args: {
  connection: Connection;
  creator: PublicKey;
  name: string;
  symbol: string;
  uri: string;
}): Promise<{ transactions: Transaction[]; mintKeypair: Keypair }> {
  const { connection, creator, name, symbol, uri } = args;
  const mintKeypair = Keypair.generate();
  const mint = mintKeypair.publicKey;

  // resolve real decimals for quotes we don't hardcode (e.g. the T22 mint)
  const quotes = await Promise.all(
    QUOTE_CONFIGS.map(async (q) => {
      try {
        const meta = await fetchMintMeta(connection, q.mint);
        return { ...q, decimals: meta.decimals, tokenProgram: meta.tokenProgram };
      } catch {
        return q;
      }
    })
  );

  const lamportsForMint = await connection.getMinimumBalanceForRentExemption(MINT_SIZE);
  const creatorAta = ata(mint, creator, TOKEN_PROGRAM_ID);
  const totalSupply = TOKEN_SUPPLY_RAW * BigInt(quotes.length);

  const tx1 = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: creator,
      newAccountPubkey: mint,
      space: MINT_SIZE,
      lamports: lamportsForMint,
      programId: TOKEN_PROGRAM_ID,
    }),
    createInitializeMint2Instruction(mint, TOKEN_DECIMALS, creator, null, TOKEN_PROGRAM_ID),
    createMetadataV3Instruction({ mint, creator, name, symbol, uri }),
    createAssociatedTokenAccountInstruction(creator, creatorAta, creator, mint, TOKEN_PROGRAM_ID),
    createMintToInstruction(mint, creatorAta, creator, totalSupply, [], TOKEN_PROGRAM_ID)
  );

  const createIxs = quotes.map((q) =>
    createCurveInstruction({
      creator,
      mint,
      quoteMint: q.mint,
      quoteTokenProgram: q.tokenProgram,
      virtualQuoteReserves: virtualQuoteReservesForTarget(
        BigInt(Math.round(q.targetMarketCap)) * 10n ** BigInt(q.decimals)
      ),
      targetMarketCap: BigInt(Math.round(q.targetMarketCap)) * 10n ** BigInt(q.decimals),
    })
  );

  const tx2 = new Transaction().add(createIxs[0]!, createIxs[1]!);
  const tx3 = new Transaction().add(createIxs[2]!, createIxs[3]!);
  const tx4 = new Transaction().add(
    createIxs[4]!,
    // all five curves are funded; the creator now gives up mint authority
    createSetAuthorityInstruction(mint, creator, AuthorityType.MintTokens, null, [], TOKEN_PROGRAM_ID),
    SystemProgram.transfer({
      fromPubkey: creator,
      toPubkey: JITO_TIP_ACCOUNT,
      lamports: JITO_TIP_LAMPORTS,
    })
  );

  const { blockhash } = await connection.getLatestBlockhash('confirmed');
  const transactions = [tx1, tx2, tx3, tx4];
  for (const tx of transactions) {
    tx.feePayer = creator;
    tx.recentBlockhash = blockhash;
  }
  // mint keypair must co-sign tx1 (account creation)
  tx1.partialSign(mintKeypair);

  return { transactions, mintKeypair };
}
