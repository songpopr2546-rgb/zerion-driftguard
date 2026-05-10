# DriftGuard Live Demo and Evidence

This page is the fastest way for Frontier / Superteam judges to verify that DriftGuard is a real autonomous onchain agent, not a dry-run mock.

## One-Line Demo

DriftGuard monitored a BNB Smart Chain wallet, detected that USDT was overweight versus the `USDT=60,BNB=40` target allocation, fetched an executable Zerion API swap quote, passed a scoped DriftGuard policy check, and executed a real USDT -> BNB rebalance.

## Real Onchain Evidence

- Swap tx: https://bscscan.com/tx/0x24b0ab36fd205d4e105a1ccb2c75a84538b7bc65e53e9cb3ded967f417112579
- Approval tx: https://bscscan.com/tx/0xfb78a3a18e0eb7639cc2ec43cc000875437f2d04c4e17fa69a619be31e98cd90
- Demo wallet: `0xdd6feE67db4133FbC8918f874812c9510ce07c15`
- Agent policy: `policy-bsc-driftguard-usdt-demo-decc2f72`
- Agent token: `driftguard-bsc-usdt-bot`
- Decision executed: `swap 3.222671 USDT to BNB`
- Post-trade position snapshot: `6.767329 USDT` and `0.0069230200251423 BNB`

## What the Agent Did

1. Read wallet positions for the configured chain.
2. Compared current portfolio weights against target weights.
3. Selected one bounded rebalance action only when drift exceeded threshold.
4. Requested a same-chain executable quote through Zerion API.
5. Submitted the quote metadata to the DriftGuard executable policy.
6. Signed and broadcasted the transaction only after policy approval.
7. Rejected an out-of-scope transfer attempt with `policy_denied`.

## Policy Envelope

The DriftGuard policy fails closed unless all of these are true:

- the action is created by the DriftGuard agent runner
- the quote source is Zerion API
- the chain is `binance-smart-chain`
- the token pair is inside the configured target set
- the trade stays under the per-trade USD cap
- the day stays under the daily USD cap
- the policy is not expired
- bridge execution is disabled unless explicitly allowed

## Reproduce the Demo Flow

```bash
export ZERION_API_KEY="zk_..."

node cli/zerion.js agent create-driftguard-policy \
  --name bsc-driftguard \
  --chain binance-smart-chain \
  --targets USDT=60,BNB=40 \
  --max-trade-usd 5 \
  --daily-limit-usd 15 \
  --expires 7d

node cli/zerion.js agent create-token \
  --name driftguard-bot \
  --wallet driftguard-demo \
  --policy <policy-id>

node cli/zerion.js agent run-driftguard \
  --wallet driftguard-demo \
  --chain binance-smart-chain \
  --targets USDT=60,BNB=40 \
  --max-trade-usd 5

node cli/zerion.js agent run-driftguard \
  --wallet driftguard-demo \
  --chain binance-smart-chain \
  --targets USDT=60,BNB=40 \
  --max-trade-usd 5 \
  --execute
```

## Policy Denial Proof

This out-of-policy raw transfer was denied:

```bash
node cli/zerion.js send BNB 0.0001 \
  --wallet driftguard-demo \
  --chain binance-smart-chain \
  --to 0x0000000000000000000000000000000000000001
```

Expected result:

```text
policy_denied
```

## Judge Checklist

- Onchain functionality: real BSC swap tx is linked above.
- Zerion API usage: `run-driftguard` calls the Zerion swap quote path before signing.
- Policy design: chain lock, token allowlist, per-trade cap, daily cap, expiry, bridge gate, and executable metadata checks.
- Practicality: built for small treasuries, creators, and teams that need bounded wallet automation.
- Code quality: agent decision engine, policy, trading metadata, and command surfaces are separated and tested.
