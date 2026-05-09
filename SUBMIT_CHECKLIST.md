# DriftGuard Final Submit Checklist

Use this before submitting to Superteam Earn and Colosseum. The code is ready; the only non-code requirement that cannot be faked is the real transaction evidence.

## Must-Have Evidence

- Public GitHub repository URL for this fork.
- Colosseum project profile URL.
- Loom/demo video URL.
- Real onchain transaction hash from `zerion agent run-driftguard ... --execute`.
- Explorer URL for the transaction, preferably BaseScan when using Base.
- Screenshot or terminal clip showing `policy_denied` for an out-of-scope action.
- Screenshot or terminal clip showing `agent show-policy <policy-id>`.

## Real Transaction Run

```bash
export ZERION_API_KEY="zk_..."

node cli/zerion.js wallet create --name driftguard-demo
node cli/zerion.js wallet fund --wallet driftguard-demo
```

Fund the Base EVM address with:

- a little ETH for gas
- enough USDC and/or ETH to create visible drift from `USDC=60,ETH=40`

Then:

```bash
node cli/zerion.js agent create-driftguard-policy \
  --name base-driftguard \
  --chain base \
  --targets USDC=60,ETH=40 \
  --max-trade-usd 5 \
  --daily-limit-usd 15 \
  --expires 7d

node cli/zerion.js agent create-token \
  --name driftguard-bot \
  --wallet driftguard-demo \
  --policy <policy-id>

node cli/zerion.js agent run-driftguard \
  --wallet driftguard-demo \
  --chain base \
  --targets USDC=60,ETH=40 \
  --max-trade-usd 5

node cli/zerion.js agent run-driftguard \
  --wallet driftguard-demo \
  --chain base \
  --targets USDC=60,ETH=40 \
  --max-trade-usd 5 \
  --execute
```

Paste the returned transaction hash into the final submission and video description.

## Demo Video Structure

Keep it under 2 minutes.

1. Show the project title and one-line pitch.
2. Show `create-driftguard-policy` output with chain, token, per-trade, daily, and expiry limits.
3. Show `create-token` output with the policy attached.
4. Show dry-run output: current allocation, drift, selected trade, Zerion quote.
5. Run execute and show the transaction hash.
6. Open the explorer URL and show confirmed success.
7. Run the forbidden send and show `policy_denied`.

## Superteam Form

Project Title:

```text
DriftGuard: Policy-Bound Autonomous Rebalancing for Zerion CLI
```

Project Description:

```text
DriftGuard is an autonomous onchain rebalancing agent built directly into a fork of Zerion CLI. It monitors a wallet's live positions, computes target-allocation drift, fetches executable Zerion API swap quotes, and executes real same-chain swaps only when a custom DriftGuard policy approves the action. The policy prevents god-mode behavior with chain locks, token allowlists, expiry, per-trade USD caps, daily USD caps, and bridge gating.
```

Did you submit this project to the official Frontier Hackathon on Colosseum?

```text
Yes
```

Presentation Link:

```text
Use FRONTIER_SUBMISSION.md or a short exported PDF/slide based on it.
```

## Win Conditions

- Do not submit without a real transaction hash.
- Do not submit a demo that only shows dry run.
- Do not hide the policy: show the policy and one denial case.
- Keep the video crisp: autonomous decision, Zerion API route, real tx, bounded authority.
