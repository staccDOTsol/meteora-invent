# Meteora Invent — Full Action Reference

All 27 studio actions documented with parameters, outputs, and usage notes.

## Contents

- [Setup Actions](#setup-actions) — `generate-keypair`, `airdrop-sol`, `start-test-validator`
- [DBC Actions](#dbc-dynamic-bonding-curve-actions) — `dbc-create-config/pool`, `dbc-swap`, `dbc-claim-trading-fee`, `dbc-migrate-to-damm-v1/v2`, `dbc-transfer-pool-creator`
- [DLMM Actions](#dlmm-dynamic-liquidity-market-maker-actions) — `dlmm-create-pool`, `dlmm-seed-liquidity-lfg/single-bin`, `dlmm-set-pool-status`
- [DAMM v2 Actions](#damm-v2-actions) — create balanced/one-sided, add/remove liquidity, claim fee, split/close position, refresh vesting
- [DAMM v1 Actions](#damm-v1-actions) — create pool, lock liquidity, stake2earn farm
- [Alpha Vault Actions](#alpha-vault-actions) — `alpha-vault-create`
- [Presale Vault Actions](#presale-vault-actions) — `presale-vault-create`
- [Quick Reference Table](#quick-reference-table)

---

## Setup Actions

### `generate-keypair`
Generate a new Solana keypair and optionally airdrop SOL on devnet.

```bash
pnpm studio generate-keypair
pnpm studio generate-keypair --network devnet --airdrop
```

**Flags:**
| Flag | Type | Description |
|------|------|-------------|
| `--network` | string | `mainnet-beta` \| `devnet` \| `localnet` |
| `--airdrop` | boolean | Airdrop 5 SOL on devnet after generation |

**Output:** `keypair.json` saved to working directory + public key logged.

---

### `airdrop-sol`
Airdrop SOL to your wallet (devnet only).

```bash
pnpm studio airdrop-sol --network devnet --amount 5
```

**Flags:**
| Flag | Type | Description |
|------|------|-------------|
| `--network` | string | Must be `devnet` or `localnet` |
| `--amount` | number | SOL amount to airdrop (max 5 per request) |

---

### `start-test-validator`
Start a local Solana test validator for localnet testing.

```bash
pnpm studio start-test-validator
```

**Output:** Local validator running at `http://localhost:8899`

---

## DBC (Dynamic Bonding Curve) Actions

### `dbc-create-config`
Create a reusable DBC configuration account for your launch partner.

```bash
pnpm studio dbc-create-config
pnpm studio dbc-create-config --config studio/config/dbc_config.jsonc
```

**Key Config Fields:**
```jsonc
{
  "quoteMint": "So11111111111111111111111111111111111111112", // Quote token (SOL default)
  "feeClaimer": "YOUR_FEE_CLAIMER_PUBKEY",
  "leftoverReceiver": "YOUR_RECEIVER_PUBKEY",
  "migrationFeeOption": 0,      // 0-7: different fee tiers for DAMM migration
  "migrationOption": 0,          // 0=DAMM v1, 1=DAMM v2
  "tokenType": 0,                // 0=SPL, 1=Token 2022
  "partnerLpPercentage": 50,     // Partner LP allocation on migration
  "creatorLpPercentage": 50,     // Creator LP allocation on migration
  "partnerLockedLpPercentage": 0,
  "creatorLockedLpPercentage": 0,
  "collectFeeMode": 0,           // 0=quote only, 1=both tokens
  "migrationQuoteThreshold": "1000000000", // lamports triggering migration
  "sqrtStartPrice": "...",       // Starting sqrt price (u128)
  "curve": [...]                 // Price curve points
}
```

**Output:** Config account pubkey logged. Save for use in pool creation.

---

### `dbc-create-pool`
Launch a token with a Dynamic Bonding Curve. Creates the base mint + pool.

```bash
pnpm studio dbc-create-pool
pnpm studio dbc-create-pool --baseMint <MINT_ADDRESS>   # Use existing mint
pnpm studio dbc-create-pool --config studio/config/dbc_config.jsonc
```

**Flags:**
| Flag | Type | Description |
|------|------|-------------|
| `--baseMint` | pubkey | Use existing SPL token mint |
| `--config` | path | Path to config file |

**What it does:**
1. Creates base token mint (if no `--baseMint`)
2. Creates DBC virtual pool account
3. Seeds initial liquidity from config
4. Sets fee scheduler (if configured)

**Output:** Base mint address + pool address logged.

**⚠️ Required SOL:** ~0.05 SOL for account rent + fees

---

### `dbc-swap`
Buy or sell tokens on the bonding curve.

```bash
pnpm studio dbc-swap --baseMint <MINT_ADDRESS>
```

**Key Config Fields:**
```jsonc
{
  "inAmount": "1000000000",     // Amount in lamports/smallest unit
  "minimumAmountOut": "0",      // Slippage protection
  "swapBaseForQuote": false,    // false=buy base token, true=sell base token
  "referralTokenAccount": null  // Optional referral
}
```

---

### `dbc-claim-trading-fee`
Claim accumulated trading fees from a DBC pool.

```bash
pnpm studio dbc-claim-trading-fee --baseMint <MINT_ADDRESS>
```

**Requirements:**
- Must be called by `feeClaimer` set in the config account
- Fees accumulate automatically with every swap

**Output:** Fee amounts claimed logged.

---

### `dbc-migrate-to-damm-v1`
Migrate completed DBC pool to DAMM v1 AMM.

```bash
pnpm studio dbc-migrate-to-damm-v1 --baseMint <MINT_ADDRESS>
```

**Requirements:**
- Pool `quoteReserve` must exceed `migrationQuoteThreshold`
- Config `migrationOption` must be 0

**What it does:**
1. Closes DBC virtual pool
2. Creates DAMM v1 pool with all liquidity
3. Distributes LP tokens per partner/creator percentages
4. Optionally locks LP tokens per config

---

### `dbc-migrate-to-damm-v2`
Migrate completed DBC pool to DAMM v2 AMM.

```bash
pnpm studio dbc-migrate-to-damm-v2 --baseMint <MINT_ADDRESS>
```

**Requirements:**
- Pool `quoteReserve` must exceed `migrationQuoteThreshold`
- Config `migrationOption` must be 1

**What it does:**
1. Closes DBC virtual pool
2. Creates DAMM v2 pool with all liquidity
3. Creates position NFTs for LP holders
4. Distributes positions per partner/creator percentages
5. Optionally locks positions with vesting schedule

---

### `dbc-transfer-pool-creator`
Transfer creator rights of a DBC pool to a new address.

```bash
pnpm studio dbc-transfer-pool-creator --baseMint <MINT_ADDRESS> --newCreator <PUBKEY>
```

---

## DLMM (Dynamic Liquidity Market Maker) Actions

### `dlmm-create-pool`
Create a concentrated liquidity pool with bin-based architecture.

```bash
pnpm studio dlmm-create-pool --baseMint <MINT_ADDRESS>
pnpm studio dlmm-create-pool --config studio/config/dlmm_config.jsonc
```

**Key Config Fields:**
```jsonc
{
  "quoteMint": "So11111111111111111111111111111111111111112",
  "binStep": 10,               // Price step per bin (in bps, e.g. 10 = 0.1%)
  "baseFactor": 10000,         // Base fee factor
  "feeBps": 100,               // Base fee in bps (100 = 1%)
  "initialPrice": 0.001,       // Starting price in quote token
  "priceRoundingUp": true,
  "activationType": 0,         // 0=slot, 1=timestamp
  "activationPoint": null,     // null=immediate
  "hasAlphaVault": false       // Set true if adding Alpha Vault after
}
```

**Output:** Pool address logged.

---

### `dlmm-seed-liquidity-lfg`
Seed DLMM pool with liquidity using LFG (Let's F***ing Go) curved distribution.

```bash
pnpm studio dlmm-seed-liquidity-lfg --baseMint <MINT_ADDRESS>
```

**Key Config Fields:**
```jsonc
{
  "baseAmount": "1000000000000", // Total base tokens to seed
  "quoteAmount": "10000000000",  // Total quote tokens to seed
  "minPrice": 0.0005,            // Lower price bound
  "maxPrice": 0.002,             // Upper price bound
  "curvature": 0.3,              // Distribution shape (0=flat, 1=steep)
  "seedLiquidityByOperator": false
}
```

**When to use:** Better for launch scenarios where you want a natural price curve.

---

### `dlmm-seed-liquidity-single-bin`
Seed DLMM pool with all liquidity concentrated in a single price bin.

```bash
pnpm studio dlmm-seed-liquidity-single-bin --baseMint <MINT_ADDRESS>
```

**When to use:** When you need exact price control, or for stable pairs.

---

### `dlmm-set-pool-status`
Enable or disable trading on a DLMM pool.

```bash
pnpm studio dlmm-set-pool-status --poolAddress <POOL_ADDRESS>
```

**Key Config Fields:**
```jsonc
{
  "poolStatus": 0   // 0=enabled, 1=disabled
}
```

---

## DAMM v2 Actions

### `damm-v2-create-balanced-pool`
Create a DAMM v2 pool with equal amounts of both tokens.

```bash
pnpm studio damm-v2-create-balanced-pool --baseMint <MINT_ADDRESS>
```

**Key Config Fields:**
```jsonc
{
  "quoteMint": "So11111111111111111111111111111111111111112",
  "baseAmount": "1000000000000",
  "quoteAmount": "10000000000",
  "feeBps": 100,                  // 100 = 1%
  "activationType": 0,            // 0=slot, 1=timestamp
  "activationPoint": null,        // null=immediate
  "hasAlphaVault": false,
  "tokenDecimal": 9,              // Base token decimals
  "customizableFees": {
    "tradeFeeNumerator": 100,
    "protocolTradeFeePct": 20
  }
}
```

---

### `damm-v2-create-one-sided-pool`
Create a DAMM v2 pool using only base tokens (no quote required upfront).

```bash
pnpm studio damm-v2-create-one-sided-pool --baseMint <MINT_ADDRESS>
```

**When to use:** Project provides only base tokens; LPs add quote tokens later.

**Key Config Fields:**
```jsonc
{
  "baseAmount": "1000000000000",  // Only base token needed
  "initialPrice": 0.001,          // Starting price
  "maxPrice": 0.01,               // Upper bound
  "feeBps": 100
}
```

---

### `damm-v2-add-liquidity`
Add liquidity to an existing DAMM v2 pool.

```bash
pnpm studio damm-v2-add-liquidity --poolAddress <POOL_ADDRESS>
```

**Key Config Fields:**
```jsonc
{
  "tokenAAmount": "1000000000",
  "tokenBAmount": "10000000",
  "slippage": 0.5              // Slippage tolerance in %
}
```

---

### `damm-v2-remove-liquidity`
Remove liquidity from a DAMM v2 pool position.

```bash
pnpm studio damm-v2-remove-liquidity --poolAddress <POOL_ADDRESS>
```

**Key Config Fields:**
```jsonc
{
  "lpAmount": "1000000000",    // LP tokens to burn
  "tokenAMin": "0",            // Min tokenA out (slippage)
  "tokenBMin": "0"             // Min tokenB out (slippage)
}
```

---

### `damm-v2-claim-position-fee`
Claim accumulated trading fees from a DAMM v2 position.

```bash
pnpm studio damm-v2-claim-position-fee --poolAddress <POOL_ADDRESS>
```

**Output:** Fee amounts (tokenA + tokenB) logged.

---

### `damm-v2-split-position`
Split an existing DAMM v2 position into two separate positions.

```bash
pnpm studio damm-v2-split-position --poolAddress <POOL_ADDRESS>
```

**Key Config Fields:**
```jsonc
{
  "splitLpAmount": "500000000"  // Amount of LP to split into new position
}
```

---

### `damm-v2-close-position`
Close a DAMM v2 position and withdraw all liquidity.

```bash
pnpm studio damm-v2-close-position --poolAddress <POOL_ADDRESS>
```

---

### `damm-v2-refresh-vesting`
Refresh the vesting schedule for a locked DAMM v2 position.

```bash
pnpm studio damm-v2-refresh-vesting --poolAddress <POOL_ADDRESS>
```

---

## DAMM v1 Actions

### `damm-v1-create-pool`
Create a DAMM v1 constant-product AMM pool.

```bash
pnpm studio damm-v1-create-pool --baseMint <MINT_ADDRESS>
```

**Key Config Fields:**
```jsonc
{
  "quoteMint": "So11111111111111111111111111111111111111112",
  "baseAmount": "1000000000000",
  "quoteAmount": "10000000000",
  "feeBps": 100,
  "activationType": 0,
  "activationPoint": null,
  "hasAlphaVault": false
}
```

---

### `damm-v1-lock-liquidity`
Lock LP tokens from a DAMM v1 pool to prevent withdrawal.

```bash
pnpm studio damm-v1-lock-liquidity --baseMint <MINT_ADDRESS>
```

**Key Config Fields:**
```jsonc
{
  "lockDuration": 7776000   // Lock duration in seconds (e.g., 90 days)
}
```

---

### `damm-v1-create-stake2earn-farm`
Create a Stake2Earn farm on a DAMM v1 pool for LP incentives.

```bash
pnpm studio damm-v1-create-stake2earn-farm --baseMint <MINT_ADDRESS>
```

**Key Config Fields:**
```jsonc
{
  "rewardMint": "REWARD_TOKEN_MINT",
  "rewardAmount": "1000000000000",  // Total rewards
  "rewardDuration": 7776000         // Duration in seconds
}
```

---

### `damm-v1-lock-liquidity-stake2earn`
Lock LP tokens and connect them to a Stake2Earn farm.

```bash
pnpm studio damm-v1-lock-liquidity-stake2earn --baseMint <MINT_ADDRESS>
```

---

## Alpha Vault Actions

### `alpha-vault-create`
Create an Alpha Vault on top of an existing DAMM or DLMM pool.

```bash
pnpm studio alpha-vault-create --baseMint <MINT_ADDRESS>
```

**Key Config Fields:**
```jsonc
{
  "poolType": "dlmm",            // "dlmm" | "damm"
  "vaultMode": "fcfs",           // "fcfs" | "prorata"
  "depositingPoint": null,       // Start time (null=immediate)
  "startVestingPoint": null,     // Vesting start
  "endVestingPoint": null,       // Vesting end
  "maxBuyingCap": "0",           // 0=no cap
  "individualDepositingCap": "0",
  "escrowFee": "0",
  "whitelistMode": 0,            // 0=no whitelist, 1=whitelist required
  "alphaVaultType": 0            // 0=default
}
```

**Modes:**
- `fcfs` — First Come First Served (fastest depositors get allocation)
- `prorata` — All depositors get proportional allocation

---

## Presale Vault Actions

### `presale-vault-create`
Create a generic presale vault for token distribution.

```bash
pnpm studio presale-vault-create --baseMint <MINT_ADDRESS>
```

**Key Config Fields:**
```jsonc
{
  "quoteMint": "EPjFWdd5Au...",   // Payment token (USDC etc.)
  "presaleAmount": "1000000000000",
  "presaleRate": 1000,             // How many base tokens per quote token
  "depositingPoint": 0,            // Start slot/timestamp
  "endDepositingPoint": 1000000,   // End slot/timestamp
  "startVestingPoint": 1000001,
  "endVestingPoint": 2000000,
  "maxBuyingCap": "0",
  "escrowFee": "0",
  "whitelistMode": 0,
  "vaultMode": "prorata"           // "fcfs" | "prorata"
}
```

---

## Quick Reference Table

| Action | Command | Min SOL | Network |
|--------|---------|---------|---------|
| Generate keypair | `generate-keypair` | 0 | Any |
| Airdrop SOL | `airdrop-sol` | 0 | Devnet only |
| DBC: Create config | `dbc-create-config` | 0.01 | Any |
| DBC: Create pool | `dbc-create-pool` | 0.05 | Any |
| DBC: Swap | `dbc-swap` | 0.001 | Any |
| DBC: Claim fee | `dbc-claim-trading-fee` | 0.001 | Any |
| DBC: Migrate v1 | `dbc-migrate-to-damm-v1` | 0.05 | Any |
| DBC: Migrate v2 | `dbc-migrate-to-damm-v2` | 0.05 | Any |
| DLMM: Create pool | `dlmm-create-pool` | 0.05 | Any |
| DLMM: Seed LFG | `dlmm-seed-liquidity-lfg` | 0.01 | Any |
| DLMM: Seed single bin | `dlmm-seed-liquidity-single-bin` | 0.01 | Any |
| DLMM: Set status | `dlmm-set-pool-status` | 0.001 | Any |
| DAMM v2: Balanced pool | `damm-v2-create-balanced-pool` | 0.05 | Any |
| DAMM v2: One-sided pool | `damm-v2-create-one-sided-pool` | 0.05 | Any |
| DAMM v2: Add liquidity | `damm-v2-add-liquidity` | 0.01 | Any |
| DAMM v2: Remove liquidity | `damm-v2-remove-liquidity` | 0.001 | Any |
| DAMM v2: Claim fee | `damm-v2-claim-position-fee` | 0.001 | Any |
| DAMM v2: Split position | `damm-v2-split-position` | 0.01 | Any |
| DAMM v2: Close position | `damm-v2-close-position` | 0.001 | Any |
| DAMM v2: Refresh vesting | `damm-v2-refresh-vesting` | 0.001 | Any |
| DAMM v1: Create pool | `damm-v1-create-pool` | 0.05 | Any |
| DAMM v1: Lock liquidity | `damm-v1-lock-liquidity` | 0.01 | Any |
| DAMM v1: Create farm | `damm-v1-create-stake2earn-farm` | 0.05 | Any |
| DAMM v1: Lock + farm | `damm-v1-lock-liquidity-stake2earn` | 0.01 | Any |
| Alpha Vault: Create | `alpha-vault-create` | 0.05 | Any |
| Presale Vault: Create | `presale-vault-create` | 0.05 | Any |
