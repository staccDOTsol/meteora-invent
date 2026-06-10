import { NextApiRequest, NextApiResponse } from 'next';
import { head, put } from '@vercel/blob';

// Uploads the coin image + metadata JSON to Vercel Blob and registers the
// coin in a simple blob-backed index used by the home page listing.

type UploadRequest = {
  tokenLogo: string; // data URL
  tokenName: string;
  tokenSymbol: string;
  description?: string;
  mint: string;
  userWallet: string;
};

export type CoinIndexEntry = {
  mint: string;
  name: string;
  symbol: string;
  image: string;
  metadataUri: string;
  creator: string;
  createdAt: number;
};

const INDEX_PATH = 'coins/index.json';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '8mb',
    },
  },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return res.status(500).json({ error: 'BLOB_READ_WRITE_TOKEN is not configured' });
  }

  try {
    const { tokenLogo, tokenName, tokenSymbol, description, mint, userWallet } =
      req.body as UploadRequest;

    if (!tokenLogo || !tokenName || !tokenSymbol || !mint || !userWallet) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const matches = tokenLogo.match(/^data:([A-Za-z-+/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      return res.status(400).json({ error: 'Invalid image data' });
    }
    const [, contentType, base64Data] = matches;
    const imageBuffer = Buffer.from(base64Data!, 'base64');

    const imageBlob = await put(
      `coins/${mint}.${contentType!.split('/')[1] ?? 'png'}`,
      imageBuffer,
      {
        access: 'public',
        contentType: contentType!,
        addRandomSuffix: false,
        allowOverwrite: true,
      }
    );

    const metadata = {
      name: tokenName,
      symbol: tokenSymbol,
      description: description ?? '',
      image: imageBlob.url,
    };

    const metadataBlob = await put(`coins/${mint}.json`, JSON.stringify(metadata), {
      access: 'public',
      contentType: 'application/json',
      addRandomSuffix: false,
      allowOverwrite: true,
    });

    await appendToIndex({
      mint,
      name: tokenName,
      symbol: tokenSymbol,
      image: imageBlob.url,
      metadataUri: metadataBlob.url,
      creator: userWallet,
      createdAt: Date.now(),
    });

    res.status(200).json({
      success: true,
      imageUrl: imageBlob.url,
      metadataUrl: metadataBlob.url,
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
}

async function appendToIndex(entry: CoinIndexEntry) {
  let entries: CoinIndexEntry[] = [];
  try {
    const existing = await head(INDEX_PATH);
    const data = await fetch(existing.url, { cache: 'no-store' });
    if (data.ok) {
      entries = (await data.json()) as CoinIndexEntry[];
    }
  } catch {
    // first coin: index does not exist yet
  }
  entries = [entry, ...entries.filter((e) => e.mint !== entry.mint)];
  await put(INDEX_PATH, JSON.stringify(entries), {
    access: 'public',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}
