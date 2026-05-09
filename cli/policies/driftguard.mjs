import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

function deny(reason, details = {}) {
  return { allow: false, reason, ...details };
}

function allow(details = {}) {
  return { allow: true, ...details };
}

function upperList(values) {
  if (!Array.isArray(values)) return [];
  return values.map((v) => String(v).toUpperCase()).filter(Boolean);
}

function getStatePath(config) {
  const dir = process.env.ZERION_DRIFTGUARD_POLICY_STATE_DIR
    || join(homedir(), ".zerion", "policy-state");
  const namespace = String(config.state_namespace || config.policy_id || "driftguard")
    .replace(/[^A-Za-z0-9._-]/g, "_");
  mkdirSync(dir, { recursive: true });
  return join(dir, `${namespace}.json`);
}

function readState(config) {
  try {
    return JSON.parse(readFileSync(getStatePath(config), "utf-8"));
  } catch {
    return { days: {} };
  }
}

function writeState(config, state) {
  writeFileSync(getStatePath(config), JSON.stringify(state, null, 2));
}

function todayKey(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

function txKey(tx) {
  const rawHex = tx.raw_hex || tx.rawHex;
  if (rawHex) {
    const normalizedRawHex = String(rawHex).toLowerCase().replace(/^0x/, "");
    return createHash("sha256")
      .update(`raw:${normalizedRawHex}`)
      .digest("hex");
  }

  return createHash("sha256")
    .update([
      String(tx.to || "").toLowerCase(),
      String(tx.value || "0"),
      String(tx.data || "0x").toLowerCase(),
    ].join("|"))
    .digest("hex");
}

function rememberPreapprovedTx(config, tx, metadata) {
  const state = readState(config);
  const approvals = state.preapproved_transactions || {};
  approvals[txKey(tx)] = {
    action: metadata.action,
    quote_id: metadata.quoteId,
    expires_at: Date.now() + 5 * 60_000,
  };
  state.preapproved_transactions = approvals;
  writeState(config, state);
}

function consumePreapprovedTx(config, tx) {
  const state = readState(config);
  const approvals = state.preapproved_transactions || {};
  const key = txKey(tx);
  const approval = approvals[key];
  if (!approval) return null;
  delete approvals[key];
  state.preapproved_transactions = approvals;
  writeState(config, state);
  if (Number(approval.expires_at || 0) < Date.now()) return null;
  return approval;
}

export function rememberPreapprovedTransaction(ctx) {
  const config = ctx.policy_config || {};
  const metadata = ctx.metadata || {};
  const tx = ctx.transaction || {};
  if (
    metadata.agent !== "driftguard" ||
    metadata.source !== "zerion_api" ||
    !["approve", "swap"].includes(metadata.action || "")
  ) {
    return false;
  }
  rememberPreapprovedTx(config, tx, metadata);
  return true;
}

export function check(ctx) {
  const config = ctx.policy_config || {};
  const metadata = ctx.metadata || {};
  const tx = ctx.transaction || {};

  if (metadata.agent !== "driftguard") {
    const approval = consumePreapprovedTx(config, tx);
    if (approval) {
      return allow({
        reason: "OWS signer matched a preapproved DriftGuard transaction",
        action: approval.action,
        quoteId: approval.quote_id,
      });
    }
    return deny("DriftGuard policy only allows DriftGuard agent trades");
  }

  if (metadata.source !== "zerion_api") {
    return deny("Trade must be sourced from Zerion API quotes");
  }

  const action = metadata.action || "unknown";
  if (!["approve", "swap"].includes(action)) {
    return deny(`Action "${action}" is not allowed by DriftGuard`);
  }

  const allowedChains = upperList(config.allowed_chains);
  const fromChain = String(metadata.fromChain || tx.chain || "").toUpperCase();
  const toChain = String(metadata.toChain || metadata.fromChain || tx.chain || "").toUpperCase();
  if (allowedChains.length > 0) {
    if (!allowedChains.includes(fromChain) || !allowedChains.includes(toChain)) {
      return deny(`Chain ${metadata.fromChain || tx.chain} is outside DriftGuard policy`, {
        allowedChains: config.allowed_chains,
      });
    }
  }

  if (metadata.fromChain && metadata.toChain && metadata.fromChain !== metadata.toChain && !config.allow_bridges) {
    return deny("Cross-chain bridge is disabled by DriftGuard policy");
  }

  const allowedTokens = upperList(config.allowed_tokens);
  const fromSymbol = String(metadata.fromToken?.symbol || "").toUpperCase();
  const toSymbol = String(metadata.toToken?.symbol || "").toUpperCase();
  if (allowedTokens.length > 0) {
    if (!allowedTokens.includes(fromSymbol) || !allowedTokens.includes(toSymbol)) {
      return deny(`Token pair ${fromSymbol}->${toSymbol} is outside DriftGuard policy`, {
        allowedTokens: config.allowed_tokens,
      });
    }
  }

  const amountUsd = Number(metadata.inputAmountUsd || 0);
  if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
    return deny("Missing positive USD notional for DriftGuard trade");
  }

  const maxTradeUsd = Number(config.max_trade_usd || 0);
  if (maxTradeUsd > 0 && amountUsd > maxTradeUsd + 1e-9) {
    return deny(`Trade $${amountUsd.toFixed(2)} exceeds per-trade cap $${maxTradeUsd.toFixed(2)}`);
  }

  const maxDriftPct = Number(config.max_abs_drift_pct || 0);
  if (maxDriftPct > 0) {
    const fromDrift = Math.abs(Number(metadata.decision?.fromDriftPct || 0));
    const toDrift = Math.abs(Number(metadata.decision?.toDriftPct || 0));
    if (fromDrift > maxDriftPct || toDrift > maxDriftPct) {
      return deny("Decision drift is outside configured sanity bound", {
        maxAbsDriftPct: maxDriftPct,
        fromDriftPct: fromDrift,
        toDriftPct: toDrift,
      });
    }
  }

  if (action === "approve") {
    rememberPreapprovedTx(config, tx, metadata);
    return allow({ reason: "Approval is tied to an approved DriftGuard Zerion quote" });
  }

  const dailyLimitUsd = Number(config.daily_limit_usd || 0);
  if (dailyLimitUsd > 0) {
    const state = readState(config);
    const key = todayKey();
    const day = state.days[key] || { spent_usd: 0, tx_count: 0 };
    const nextSpent = Number(day.spent_usd || 0) + amountUsd;
    if (nextSpent > dailyLimitUsd + 1e-9) {
      return deny(`Daily DriftGuard cap exceeded: $${nextSpent.toFixed(2)} > $${dailyLimitUsd.toFixed(2)}`, {
        spentUsd: day.spent_usd,
        attemptedUsd: amountUsd,
        dailyLimitUsd,
      });
    }
    day.spent_usd = nextSpent;
    day.tx_count = Number(day.tx_count || 0) + 1;
    day.updated_at = new Date().toISOString();
    state.days[key] = day;
    writeState(config, state);
  }

  rememberPreapprovedTx(config, tx, metadata);
  return allow({ reason: "DriftGuard policy passed" });
}
