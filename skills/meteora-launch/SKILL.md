---
name: meteora-launch
description: "Launch tokens and manage liquidity on Meteora (Solana DeFi). Use for: creating token bonding curves (DBC), setting up AMM pools (DAMM v1/v2), concentrated liquidity pools (DLMM), alpha vaults, presale vaults, adding/removing liquidity, claiming fees, and token migrations. Triggers on: Meteora protocol operations, Solana token launches, DeFi pool creation, liquidity management, bonding curve setup, and any meteora-invent CLI usage."
metadata: {"openclaw": {"emoji": "🌊", "homepage": "https://github.com/MeteoraAg/meteora-invent"}}
---

# Meteora Launch

Automate token launches and liquidity operations on Meteora using the [meteora-invent](https://github.com/MeteoraAg/meteora-invent) CLI toolkit.

> **Already inside meteora-invent?** Run `pnpm install` and configure `studio/.env`. New? See `references/setup.md`.

## Quick Start

```bash
# 1. Set up environment
cd <your-meteora-invent-dir>
cp studio/.env.example studio/.env
# Edit .env: PAYER_PRIVATE_KEY + RPC_URL

# 2. Install deps
pnpm install

# 3. Generate keypair (devnet includes 5 SOL airdrop)
pnpm studio generate-keypair --network devnet --airdrop
```

## Protocol Selection

| Goal | Protocol | Command prefix |
|---|---|---|
| New token launch | **DBC** | `dbc-*` |
| Standard AMM + yield | **DAMM v1** | `damm-v1-*` |
| Advanced AMM | **DAMM v2** | `damm-v2-*` |
| Concentrated liquidity | **DLMM** | `dlmm-*` |
| Yield strategies | **Alpha Vault** | `alpha-vault-*` |
| Token presale | **Presale Vault** | `presale-vault-*` |

## Core Workflows

### Full Token Launch (DBC → DAMM v2)

```bash
# 1. Create config account
pnpm studio dbc-create-config

# 2. Launch bonding curve + mint
pnpm studio dbc-create-pool

# 3. Users trade until quoteReserve > migrationQuoteThreshold

# 4. Migrate to AMM
pnpm studio dbc-migrate-to-damm-v2 --baseMint <MINT>
```

### DLMM + Alpha Vault

```bash
pnpm studio dlmm-create-pool --baseMint <MINT>
pnpm studio dlmm-seed-liquidity-lfg --baseMint <MINT>
pnpm studio alpha-vault-create --baseMint <MINT>
```

### DAMM v2 Pool

```bash
pnpm studio damm-v2-create-balanced-pool --baseMint <MINT>
pnpm studio damm-v2-add-liquidity --poolAddress <POOL>
pnpm studio damm-v2-claim-position-fee --poolAddress <POOL>
```

## Universal Config Fields

All protocols share these base fields in `studio/config/*.jsonc`:

```jsonc
{
  "rpcUrl": "https://api.mainnet-beta.solana.com",  // or devnet
  "dryRun": false,        // true = simulate only (always test first)
  "keypairFilePath": "./keypair.json",
  "computeUnitPriceMicroLamports": 100000,
  "quoteMint": "So11111111111111111111111111111111111111112"  // SOL
}
```

## Safety

- **Always devnet first:** set `"rpcUrl": "https://api.devnet.solana.com"`
- **Always dry-run first:** set `"dryRun": true` before executing
- Verify all addresses on [explorer.solana.com](https://explorer.solana.com)
- Minimum SOL: ~0.05 for pool creation, ~0.1 recommended

## Troubleshooting

| Error | Fix |
|---|---|
| `Configuration validation failed` | Check JSONC syntax, verify all required fields |
| `Insufficient SOL balance` | Add SOL or use devnet airdrop |
| `Transaction simulation failed` | Check RPC, verify mint exists on network |
| `RPC connection failed` | Test endpoint, try premium provider (Helius, QuickNode) |

## References

- **`references/actions.md`** — All 27 actions with full flags, config fields, and outputs
- **`references/LLM.txt`** — Comprehensive automation guide, all parameters, validation checklists
- **`references/example_dbc_config.jsonc`** — Ready-to-use DBC config template
- **`references/setup.md`** — Toolkit installation and environment setup

## Verification

- Solana Explorer: `https://explorer.solana.com/`
- Meteora App: `https://app.meteora.ag/`
- DexScreener: `https://dexscreener.com/solana/`
