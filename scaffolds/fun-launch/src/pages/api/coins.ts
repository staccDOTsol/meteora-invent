import { NextApiRequest, NextApiResponse } from 'next';
import { head } from '@vercel/blob';
import type { CoinIndexEntry } from './upload';

// Lists coins launched through this site (blob-backed index).
export default async function handler(_req: NextApiRequest, res: NextApiResponse) {
  try {
    const existing = await head('coins/index.json');
    const data = await fetch(existing.url, { cache: 'no-store' });
    const entries = (await data.json()) as CoinIndexEntry[];
    res.setHeader('Cache-Control', 's-maxage=10, stale-while-revalidate=30');
    return res.status(200).json({ coins: entries });
  } catch {
    return res.status(200).json({ coins: [] });
  }
}
