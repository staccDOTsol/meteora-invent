import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import CurveSwap from '@/components/Swap/CurveSwap';
import { CreatePoolButton } from '@/components/CreatePoolButton';

type Coin = {
  mint: string;
  name: string;
  symbol: string;
  image: string;
  creator: string;
  createdAt: number;
};

/**
 * Coins launched through this site's multi-curve program, with an inline
 * swap per mint.
 */
export function LaunchedCoins() {
  const { data } = useQuery<{ coins: Coin[] }>({
    queryKey: ['launched-coins'],
    queryFn: async () => {
      const res = await fetch('/api/coins');
      if (!res.ok) return { coins: [] };
      return res.json();
    },
    refetchInterval: 30_000,
  });

  const coins = data?.coins ?? [];

  return (
    <div className="w-full mb-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xl font-bold">Multi-Curve Launches</h2>
        <CreatePoolButton />
      </div>

      {coins.length === 0 ? (
        <div className="rounded-lg border border-neutral-800 p-6 text-center text-neutral-400 text-sm">
          No coins launched yet. Be the first —{' '}
          <Link href="/create-pool" className="text-emerald-400 underline">
            create a coin
          </Link>
          .
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {coins.map((coin) => (
            <CoinRow key={coin.mint} coin={coin} />
          ))}
        </div>
      )}
    </div>
  );
}

function CoinRow({ coin }: { coin: Coin }) {
  const [showSwap, setShowSwap] = useState(false);
  return (
    <div className="rounded-lg border border-neutral-800 p-3 flex flex-col gap-2">
      <div className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={coin.image} alt={coin.symbol} className="w-10 h-10 rounded-full object-cover" />
        <div className="flex-1 min-w-0">
          <Link href={`/token/${coin.mint}`} className="font-semibold hover:underline">
            {coin.name} <span className="text-neutral-400">({coin.symbol})</span>
          </Link>
          <p className="text-xs text-neutral-500 truncate">{coin.mint}</p>
        </div>
        <button
          className="text-xs bg-white/10 hover:bg-white/20 rounded px-3 py-2 cursor-pointer"
          onClick={() => setShowSwap((s) => !s)}
        >
          {showSwap ? 'Hide' : 'Swap'}
        </button>
      </div>
      {showSwap && <CurveSwap baseMint={coin.mint} />}
    </div>
  );
}

export default LaunchedCoins;
