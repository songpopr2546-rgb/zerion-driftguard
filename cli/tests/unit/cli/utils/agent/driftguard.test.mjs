import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildRebalanceDecision,
  parseDurationSeconds,
  parseTargets,
} from "#zerion/utils/agent/driftguard.js";

describe("DriftGuard decision engine", () => {
  it("parses allocation targets and enforces a 100% total", () => {
    assert.deepEqual(parseTargets("USDC=60,eth=40"), [
      { symbol: "USDC", percent: 60 },
      { symbol: "ETH", percent: 40 },
    ]);
    assert.throws(() => parseTargets("USDC=60,ETH=30"), /Targets must sum to 100/);
  });

  it("selects the largest overweight asset and largest underweight asset", () => {
    const decision = buildRebalanceDecision({
      positions: [
        { symbol: "USDC", quantity: 80, value: 80, price: 1 },
        { symbol: "ETH", quantity: 0.01, value: 20, price: 2000 },
      ],
      targets: parseTargets("USDC=50,ETH=50"),
      minDriftPct: 5,
      maxTradeUsd: 10,
      minTradeUsd: 1,
    });

    assert.equal(decision.shouldTrade, true);
    assert.equal(decision.from.symbol, "USDC");
    assert.equal(decision.to.symbol, "ETH");
    assert.equal(decision.from.amount, "10");
    assert.equal(decision.from.amountUsd, 10);
  });

  it("does nothing inside the drift band", () => {
    const decision = buildRebalanceDecision({
      positions: [
        { symbol: "USDC", quantity: 52, value: 52, price: 1 },
        { symbol: "ETH", quantity: 0.024, value: 48, price: 2000 },
      ],
      targets: parseTargets("USDC=50,ETH=50"),
      minDriftPct: 5,
      maxTradeUsd: 10,
      minTradeUsd: 1,
    });

    assert.equal(decision.shouldTrade, false);
    assert.equal(decision.reason, "within_drift_band");
  });

  it("parses compact loop intervals", () => {
    assert.equal(parseDurationSeconds("30s"), 30);
    assert.equal(parseDurationSeconds("5m"), 300);
    assert.equal(parseDurationSeconds("1h"), 3600);
    assert.throws(() => parseDurationSeconds("soon"), /Invalid interval/);
  });
});
