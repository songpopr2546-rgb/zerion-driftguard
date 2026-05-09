#!/usr/bin/env bash
set -euo pipefail

# DriftGuard real-transaction demo runner.
# This script is intentionally thin: it runs the exact CLI commands judges
# should see in a Loom/live demo. It never fabricates a simulated tx hash.

: "${ZERION_API_KEY:?Set ZERION_API_KEY=zk_... first}"

WALLET="${DRIFTGUARD_WALLET:-driftguard-demo}"
CHAIN="${DRIFTGUARD_CHAIN:-base}"
TARGETS="${DRIFTGUARD_TARGETS:-USDC=60,ETH=40}"
MAX_TRADE_USD="${DRIFTGUARD_MAX_TRADE_USD:-5}"
DAILY_LIMIT_USD="${DRIFTGUARD_DAILY_LIMIT_USD:-15}"
EXPIRES="${DRIFTGUARD_EXPIRES:-7d}"

echo "== DriftGuard demo =="
echo "Wallet: ${WALLET}"
echo "Chain: ${CHAIN}"
echo "Targets: ${TARGETS}"
echo

echo "== 1. Create policy =="
node cli/zerion.js agent create-driftguard-policy \
  --name "${WALLET}-policy" \
  --chain "${CHAIN}" \
  --targets "${TARGETS}" \
  --max-trade-usd "${MAX_TRADE_USD}" \
  --daily-limit-usd "${DAILY_LIMIT_USD}" \
  --expires "${EXPIRES}"

echo
echo "Copy the policy id from the JSON above, then run:"
echo "node cli/zerion.js agent create-token --name ${WALLET}-bot --wallet ${WALLET} --policy <policy-id>"
echo

echo "== 2. Dry run =="
node cli/zerion.js agent run-driftguard \
  --wallet "${WALLET}" \
  --chain "${CHAIN}" \
  --targets "${TARGETS}" \
  --max-trade-usd "${MAX_TRADE_USD}"

echo
echo "== 3. Real execution =="
if [[ "${CONFIRM_EXECUTE_REAL_TX:-}" != "yes" ]]; then
  echo "Skipping execution. Set CONFIRM_EXECUTE_REAL_TX=yes after creating the token and funding the wallet."
  exit 0
fi

node cli/zerion.js agent run-driftguard \
  --wallet "${WALLET}" \
  --chain "${CHAIN}" \
  --targets "${TARGETS}" \
  --max-trade-usd "${MAX_TRADE_USD}" \
  --execute

echo
echo "== 4. Policy denial proof =="
node cli/zerion.js send ETH 0.001 \
  --wallet "${WALLET}" \
  --chain "${CHAIN}" \
  --to 0x0000000000000000000000000000000000000001 || true
