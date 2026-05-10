# Superteam Submission Copy

## Project Title

DriftGuard: Policy-Bound Autonomous Rebalancing for Zerion CLI

## Project Description

DriftGuard is an autonomous onchain rebalancing agent built directly into a fork of Zerion CLI. It monitors a wallet's live positions, computes target-allocation drift, fetches executable Zerion API swap quotes, and executes real same-chain swaps only when a custom DriftGuard policy approves the action. The policy prevents god-mode behavior with chain locks, token allowlists, expiry, per-trade USD caps, daily USD caps, bridge gating, and one-time raw transaction preapproval for OWS signer checks.

The recorded demo executed a real BNB Smart Chain rebalance from USDT to BNB through Zerion API quotes under a scoped DriftGuard policy.

## GitHub Repository

https://github.com/songpopr2546-rgb/zerion-driftguard

## Demo Link

https://github.com/songpopr2546-rgb/zerion-driftguard/blob/main/DEMO.md

## Demo / Transaction Evidence

- Swap tx: https://bscscan.com/tx/0x24b0ab36fd205d4e105a1ccb2c75a84538b7bc65e53e9cb3ded967f417112579
- Approval tx: https://bscscan.com/tx/0xfb78a3a18e0eb7639cc2ec43cc000875437f2d04c4e17fa69a619be31e98cd90
- Wallet: `0xdd6feE67db4133FbC8918f874812c9510ce07c15`
- Executed decision: `swap 3.222671 USDT to BNB`
- Post-trade wallet: `6.767329 USDT` and `0.0069230200251423 BNB`
- Policy denial proof: `node cli/zerion.js send BNB 0.0001 --wallet driftguard-demo --chain binance-smart-chain --to 0x0000000000000000000000000000000000000001` returned `policy_denied`.

## Demo Video Outline

1. Show `FRONTIER_SUBMISSION.md` and explain DriftGuard in one sentence.
2. Show the scoped BSC policy: chain lock, token allowlist, max trade, daily cap, expiry.
3. Show dry-run output: live wallet positions, drift, selected trade, Zerion quote.
4. Show execute output with approval tx and swap tx.
5. Open the BscScan swap URL.
6. Show the policy denial command returning `policy_denied`.

## Colosseum Answer

Yes, this project was submitted to the official Frontier Hackathon on Colosseum.
