# Meteora Invent — Setup Guide

## Install the Toolkit

```bash
# Clone the official repo
git clone https://github.com/MeteoraAg/meteora-invent
cd meteora-invent

# Install dependencies
pnpm install
```

**Requirements:** Node.js >= 18, pnpm >= 10

## Configure Environment

```bash
cp studio/.env.example studio/.env
```

Edit `studio/.env`:

```env
PAYER_PRIVATE_KEY=<your_wallet_private_key_in_base58>
RPC_URL=<your_rpc_endpoint>
```

**RPC options:**
- Public mainnet: `https://api.mainnet-beta.solana.com`
- Public devnet: `https://api.devnet.solana.com`
- Premium (recommended): [Helius](https://www.helius.dev/), QuickNode, Triton

## Get a Wallet

```bash
# Generate a fresh keypair
pnpm studio generate-keypair

# On devnet — generate + airdrop 5 SOL
pnpm studio generate-keypair --network devnet --airdrop
```

Or import an existing wallet: paste the base58 private key into `PAYER_PRIVATE_KEY`.

## Local Testing (Optional)

```bash
# Start a local validator
pnpm studio start-test-validator

# Airdrop on localnet
pnpm studio airdrop-sol --network localnet --amount 10
```

## Verify Setup

```bash
# Dry-run a DBC config create (no cost, just validates)
# Set "dryRun": true in your config file first
pnpm studio dbc-create-config
```
