---
name: zerion-driftguard
description: "Run DriftGuard, an autonomous Zerion CLI portfolio rebalancer that monitors wallet drift, chooses bounded same-chain swaps from Zerion API quotes, and executes only under a DriftGuard policy with chain, token, per-trade, daily, and expiry limits. Use when the user asks for autonomous rebalancing, policy-bound portfolio management, or a hackathon demo agent."
license: MIT
allowed-tools: Bash
---

# Zerion DriftGuard

DriftGuard is a policy-bound autonomous rebalancing agent built into the Zerion CLI. It reads wallet positions, compares them with target allocations, asks the Zerion API for a same-chain swap quote, and executes the trade only when the attached DriftGuard policy allows it.

## Setup

Create or import a wallet and fund it first. Then create a policy and token manually:

```bash
zerion agent create-driftguard-policy \
  --name base-driftguard \
  --chain base \
  --targets USDC=60,ETH=40 \
  --max-trade-usd 5 \
  --daily-limit-usd 15 \
  --expires 7d

zerion agent create-token \
  --name driftguard-bot \
  --wallet <wallet> \
  --policy <policy-id>
```

## Dry run

Dry run still fetches live wallet positions and a live Zerion swap quote, but does not sign or broadcast:

```bash
zerion agent run-driftguard \
  --wallet <wallet> \
  --chain base \
  --targets USDC=60,ETH=40 \
  --max-trade-usd 5
```

## Execute

Execution signs and broadcasts the selected swap through the existing Zerion CLI swap pipeline:

```bash
zerion agent run-driftguard \
  --wallet <wallet> \
  --chain base \
  --targets USDC=60,ETH=40 \
  --max-trade-usd 5 \
  --execute
```

For autonomous operation, run it on a cadence:

```bash
zerion agent run-driftguard \
  --wallet <wallet> \
  --chain base \
  --targets USDC=60,ETH=40 \
  --max-trade-usd 5 \
  --interval 15m \
  --max-runs 96 \
  --execute
```

## Safety model

The DriftGuard executable policy fails closed unless the transaction metadata says:

- The agent is `driftguard`
- The quote source is `zerion_api`
- The chain is allowed
- Both input and output tokens are allowed
- The USD notional is under `--max-trade-usd`
- The daily spend remains under `--daily-limit-usd`
- Cross-chain bridging is disabled unless the policy was created with `--allow-bridges`

Raw sends and unrelated agent actions are rejected by this policy.
