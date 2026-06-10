# Fun Launch (multi-curve edition)

A pump-style launchpad where every coin launches on **five bonding curves at
once**, powered by a fork of `curve-launchpad` with multi-quote support:

| Curve | Quote token | Target market cap |
| ----- | ----------- | ----------------- |
| SOL   | wSOL        | 100 SOL           |
| USDC  | USDC        | 60,000 USDC       |
| USDT  | USDT        | 60,000 USDT       |
| 6K4x  | `6K4xdfEk5rvySM496rxm4x8AgC9wVt7N4C7mFFpNAj5f` (Token-2022, transfer fee) | 50 |
| 73ed  | `73edX6xoGY4v5y2hzuKdrUbJXLntqgmo74au1Ki1pump` | 12,000,000 |

## How a launch works (one wallet approval)

`Create Coin` builds four transactions, signs them all with a single
`signAllTransactions` prompt, and submits them as a **Jito bundle** (falling
back to sequential sends through your RPC, e.g. Helius):

1. Create the mint (creator is mint authority), Metaplex metadata, mint
   5B tokens (1B per curve) to the creator.
2. Create the SOL + USDC curves (each pulls 1B tokens into curve inventory).
3. Create the USDT + 6K4 curves.
4. Create the 73ed curve, then **revoke mint authority**, plus the Jito tip.

Trade fees are 1%, split **50/50 between the coin creator and the platform**,
paid in the curve's quote token.

## Swap

Every mint gets a minimal swap (on its token page and inline on the home
page) that routes the input through **Jupiter** into whichever curve gives
the best rate (or the reverse on sells), and allows **circular routes**
(coin → quote → coin) across the curves.

## Setup

```bash
pnpm install
cp .env.example .env
```

```env
BLOB_READ_WRITE_TOKEN=...            # Vercel Blob (images, metadata, coin index)
RPC_URL=...                          # server-side sends / fallback (e.g. Helius)
NEXT_PUBLIC_RPC_URL=...              # browser RPC
NEXT_PUBLIC_CURVE_PROGRAM_ID=...     # deployed curve-launchpad fork
NEXT_PUBLIC_PLATFORM_FEE_WALLET=...  # platform half of trade fees
JITO_BLOCK_ENGINE_URL=...            # optional, atomic launch bundles
NEXT_PUBLIC_JUPITER_API=...          # optional, defaults to lite-api.jup.ag
```

Deploy on **Vercel** and attach a **Blob store** (Storage → Blob); Vercel
injects `BLOB_READ_WRITE_TOKEN` automatically.

```bash
pnpm dev    # run locally
pnpm build  # production build
```
