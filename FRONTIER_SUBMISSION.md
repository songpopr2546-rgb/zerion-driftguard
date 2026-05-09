# Frontier Hackathon Submission: DriftGuard

## Project Title

DriftGuard: a policy-bound autonomous onchain rebalancing agent for Zerion CLI

## Project Description

DriftGuard turns the Zerion CLI into an autonomous portfolio rebalancing agent. It monitors a wallet on a chosen chain, compares live Zerion portfolio data against target allocations, chooses one bounded rebalance action, requests an executable Zerion API swap quote, and signs/broadcasts the transaction only when a scoped DriftGuard policy approves it.

The core thesis: autonomous agents should not be god-mode wallets. DriftGuard ships with a custom executable policy that fails closed unless the action is a Zerion API quote from the DriftGuard agent, the chain and token pair are allowed, the per-trade USD cap holds, the daily USD cap holds, and bridges are explicitly enabled.

## Why It Should Win

- **Real onchain execution:** `zerion agent run-driftguard --execute` uses the existing Zerion CLI swap pipeline, which resolves tokens, fetches `/swap/quotes/`, signs the returned transaction, and broadcasts it.
- **Policy-first design:** `create-driftguard-policy` creates native chain/expiry rules plus an executable policy that sees rich signed metadata, not just opaque calldata.
- **Practical use case:** small treasuries, creators, DAOs, and hackathon teams can keep hot-wallet working capital near a target allocation without handing an agent unrestricted spend authority.
- **Demo clarity:** the dry run shows live positions, target drift, the chosen rebalance, and the exact command to execute. The execute run prints the transaction hash.
- **Forkable implementation:** decision logic is isolated in `cli/utils/agent/driftguard.js`, policy logic in `cli/policies/driftguard.mjs`, and commands are registered under `zerion agent`.

## Requirement Checklist

| Requirement | DriftGuard Implementation |
|-------------|---------------------------|
| Fork Zerion CLI | Built directly in this Zerion CLI fork |
| Wallet/execution layer on forked CLI | Uses existing Zerion wallet, agent token, policy, swap signing, and broadcast layers |
| Any interface | CLI autonomous agent: `zerion agent run-driftguard` |
| At least one scoped policy | `zerion agent create-driftguard-policy` creates chain lock, expiry, token allowlist, per-trade cap, daily cap, bridge gate |
| Real onchain transaction | Run `zerion agent run-driftguard ... --execute`; output includes tx hash |
| Swaps route through Zerion API | `run-driftguard` calls `getSwapQuote`, which calls Zerion `/swap/quotes/` |
| Demo/live demo | Use the script below; record terminal + explorer transaction |
| Open source | Publish this fork as a public GitHub repository |

## Demo Script

For a repeatable terminal flow, use `demo/driftguard-demo.sh` after funding the wallet. It prints the exact commands and refuses to execute the real transaction unless `CONFIRM_EXECUTE_REAL_TX=yes` is set.

### 1. Configure API key

```bash
export ZERION_API_KEY="zk_..."
```

### 2. Create or import a wallet

```bash
zerion wallet create --name driftguard-demo
zerion wallet fund --wallet driftguard-demo
```

Fund the Base address with a small amount of ETH for gas and enough target tokens to create visible drift, for example USDC overweight versus ETH.

### 3. Create the DriftGuard policy

```bash
zerion agent create-driftguard-policy \
  --name base-driftguard \
  --chain base \
  --targets USDC=60,ETH=40 \
  --max-trade-usd 5 \
  --daily-limit-usd 15 \
  --expires 7d
```

### 4. Attach the policy to an agent token

```bash
zerion agent create-token \
  --name driftguard-bot \
  --wallet driftguard-demo \
  --policy <policy-id-from-step-3>
```

### 5. Dry run with live data and live Zerion quote

```bash
zerion agent run-driftguard \
  --wallet driftguard-demo \
  --chain base \
  --targets USDC=60,ETH=40 \
  --max-trade-usd 5
```

Show the JSON:

- current target allocation
- detected drift
- selected swap
- Zerion API quote source and estimated output
- `nextCommand` for execution

### 6. Execute a real onchain transaction

```bash
zerion agent run-driftguard \
  --wallet driftguard-demo \
  --chain base \
  --targets USDC=60,ETH=40 \
  --max-trade-usd 5 \
  --execute
```

Show the printed transaction hash on a Base block explorer.

### 7. Show policy denial

Attempt an action outside the DriftGuard envelope:

```bash
zerion send ETH 0.001 --wallet driftguard-demo --chain base --to 0x0000000000000000000000000000000000000001
```

Expected result: `policy_denied` because the DriftGuard policy only allows DriftGuard Zerion API quote actions.

## Suggested Superteam Answers

**Project Title:** DriftGuard: Policy-Bound Autonomous Rebalancing for Zerion CLI

**Project Description:** DriftGuard is an autonomous onchain rebalancing agent built directly into a fork of Zerion CLI. It monitors a wallet's live positions, computes target-allocation drift, fetches executable Zerion API swap quotes, and executes real same-chain swaps only when a custom DriftGuard policy approves the action. The policy prevents god-mode behavior with chain locks, token allowlists, expiry, per-trade USD caps, daily USD caps, and bridge gating.

**Project Website:** optional; use the GitHub README/FRONTIER_SUBMISSION.md if no hosted site is created.

**Demo Video Outline:** 90 seconds: show policy creation, token creation, dry run decision, execute run with tx hash, explorer confirmation, and policy denial for an out-of-scope send.

**Submission Warning:** Do not submit without a real transaction hash. The hackathon explicitly rejects simulations; the dry run is only for explaining the agent decision before the real `--execute` run.

## Demo Video Shot List

1. Open README and say the agent's job: policy-bound autonomous rebalancing.
2. Run `create-driftguard-policy`; point at max trade, daily limit, expiry.
3. Run `create-token`; show policy attachment.
4. Run dry run; highlight live drift and Zerion quote.
5. Run execute; copy tx hash.
6. Open explorer; show success.
7. Try a forbidden send; show `policy_denied`.

## Judge Mapping

**Onchain Functionality:** DriftGuard executes real swaps through the Zerion swap pipeline and returns a transaction hash.

**Policy Design:** Policy is multi-layered: native OWS chain/expiry rules plus local executable checks on agent identity, Zerion API quote source, token pair, chain, per-trade notional, daily notional, drift sanity, and bridge permission.

**Real-World Applicability:** Designed for small treasuries, creators, and teams that want automated portfolio maintenance without exposing a hot wallet to unrestricted actions.

**Code Quality:** Decision engine, command handlers, executable policy, and trading metadata are isolated and unit-tested.

**Demo Quality:** Dry run and execute output are JSON-first, easy to record, and include the exact evidence judges need: decision, quote, policy scope, and tx hash.
