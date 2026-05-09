import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { check, rememberPreapprovedTransaction } from "#zerion/policies/driftguard.mjs";

let stateDir;

function ctx(overrides = {}) {
  return {
    transaction: { to: "0xRouter", value: "0", data: "0x", chain: "base" },
    metadata: {
      agent: "driftguard",
      source: "zerion_api",
      action: "swap",
      fromChain: "base",
      toChain: "base",
      fromToken: { symbol: "USDC" },
      toToken: { symbol: "ETH" },
      inputAmountUsd: 5,
      decision: { fromDriftPct: 20, toDriftPct: -20 },
      ...overrides.metadata,
    },
    policy_config: {
      state_namespace: "unit-test",
      allowed_chains: ["base"],
      allowed_tokens: ["USDC", "ETH"],
      max_trade_usd: 10,
      daily_limit_usd: 12,
      max_abs_drift_pct: 80,
      allow_bridges: false,
      ...overrides.policy_config,
    },
  };
}

beforeEach(() => {
  stateDir = mkdtempSync(join(tmpdir(), "driftguard-policy-"));
  process.env.ZERION_DRIFTGUARD_POLICY_STATE_DIR = stateDir;
});

afterEach(() => {
  delete process.env.ZERION_DRIFTGUARD_POLICY_STATE_DIR;
  rmSync(stateDir, { recursive: true, force: true });
});

describe("DriftGuard executable policy", () => {
  it("allows a bounded Zerion API swap and records daily spend", () => {
    const first = check(ctx());
    assert.equal(first.allow, true);

    const second = check(ctx({ metadata: { inputAmountUsd: 8 } }));
    assert.equal(second.allow, false);
    assert.match(second.reason, /Daily DriftGuard cap exceeded/);
  });

  it("rejects non-DriftGuard send actions", () => {
    const result = check(ctx({
      metadata: {
        agent: "someone-else",
        source: "zerion_cli",
        action: "send",
      },
    }));

    assert.equal(result.allow, false);
    assert.match(result.reason, /only allows DriftGuard/);
  });

  it("rejects token and chain escapes", () => {
    assert.equal(check(ctx({ metadata: { fromToken: { symbol: "WBTC" } } })).allow, false);
    assert.equal(check(ctx({ metadata: { fromChain: "arbitrum" } })).allow, false);
  });

  it("allows quote approvals without counting daily spend", () => {
    const approval = check(ctx({ metadata: { action: "approve" } }));
    assert.equal(approval.allow, true);

    const swap = check(ctx({ metadata: { inputAmountUsd: 10 } }));
    assert.equal(swap.allow, true);
  });

  it("allows the signer to consume a metadata-less preapproved transaction once", () => {
    const tx = { to: "0xRouter", value: "0", data: "0x1234", chain: "base" };
    const precheck = check(ctx({ transaction: tx }));
    assert.equal(precheck.allow, true);

    const signerCheck = check(ctx({
      transaction: tx,
      metadata: { agent: undefined, source: undefined, action: undefined },
    }));
    assert.equal(signerCheck.allow, true);
    assert.match(signerCheck.reason, /preapproved DriftGuard/);

    const replay = check(ctx({
      transaction: tx,
      metadata: { agent: undefined, source: undefined, action: undefined },
    }));
    assert.equal(replay.allow, false);
  });

  it("matches OWS raw transaction preapprovals", () => {
    const rawTx = { raw_hex: "0xabc123", chain: "eip155:56" };
    const stored = rememberPreapprovedTransaction(ctx({ transaction: rawTx }));
    assert.equal(stored, true);

    const signerCheck = check(ctx({
      transaction: { raw_hex: "abc123", chain: "eip155:56" },
      metadata: { agent: undefined, source: undefined, action: undefined },
    }));
    assert.equal(signerCheck.allow, true);
  });
});
