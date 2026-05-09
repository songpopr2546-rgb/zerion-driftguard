/**
 * DriftGuard decision engine.
 *
 * Turns wallet positions into one bounded rebalance action. The command layer
 * handles network I/O and execution; this module stays pure for testability.
 */

const TARGET_RE = /^([A-Za-z0-9._:-]+)\s*=\s*(\d+(?:\.\d+)?)$/;

function fail(code, message, details = {}) {
  const err = new Error(message);
  err.code = code;
  Object.assign(err, details);
  throw err;
}

export function parseTargets(input) {
  if (!input || typeof input !== "string") {
    fail("missing_targets", "Targets required", {
      example: "--targets USDC=60,ETH=40",
    });
  }

  const targets = input.split(",").map((part) => part.trim()).filter(Boolean);
  if (targets.length < 2) {
    fail("invalid_targets", "Provide at least two target assets", {
      example: "--targets USDC=60,ETH=40",
    });
  }

  const parsed = targets.map((part) => {
    const match = part.match(TARGET_RE);
    if (!match) {
      fail("invalid_targets", `Invalid target "${part}"`, {
        example: "--targets USDC=60,ETH=40",
      });
    }
    return {
      symbol: match[1].toUpperCase(),
      percent: Number(match[2]),
    };
  });

  const seen = new Set();
  for (const target of parsed) {
    if (seen.has(target.symbol)) {
      fail("duplicate_target", `Duplicate target asset: ${target.symbol}`);
    }
    seen.add(target.symbol);
    if (!Number.isFinite(target.percent) || target.percent <= 0) {
      fail("invalid_targets", `Target for ${target.symbol} must be greater than 0`);
    }
  }

  const total = parsed.reduce((sum, t) => sum + t.percent, 0);
  if (Math.abs(total - 100) > 0.001) {
    fail("invalid_targets_total", `Targets must sum to 100, got ${total}`);
  }

  return parsed;
}

export function parseSymbolList(input) {
  if (!input) return [];
  return String(input)
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
}

export function parsePositiveNumber(value, name, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) {
    fail("invalid_number", `${name} must be a positive number`, { value });
  }
  return n;
}

export function parseNonNegativeNumber(value, name, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) {
    fail("invalid_number", `${name} must be a non-negative number`, { value });
  }
  return n;
}

export function parseDurationSeconds(value) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "number") return value;
  const input = String(value).trim();
  const match = input.match(/^(\d+(?:\.\d+)?)(s|m|h)$/i);
  if (match) {
    const n = Number(match[1]);
    const unit = match[2].toLowerCase();
    if (unit === "s") return n;
    if (unit === "m") return n * 60;
    if (unit === "h") return n * 3600;
  }
  const numeric = Number(input);
  if (Number.isFinite(numeric) && numeric > 0) return numeric;
  fail("invalid_interval", `Invalid interval "${value}"`, {
    suggestion: "Use seconds or a duration like 30s, 5m, 1h",
  });
}

export function coerceBooleanFlag(value, name, fallback = false) {
  if (value === undefined) return fallback;
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  fail("invalid_flag_value", `--${name} does not take a value (got "${value}")`);
}

export function normalizePositions(apiPositions, chain) {
  return (apiPositions || [])
    .map((p) => {
      const attrs = p.attributes || {};
      const fungible = attrs.fungible_info || {};
      const symbol = fungible.symbol || attrs.symbol;
      const quantity = Number(attrs.quantity?.float ?? attrs.quantity?.numeric ?? 0);
      const value = Number(attrs.value ?? 0);
      return {
        name: fungible.name || attrs.name || symbol || "Unknown",
        symbol: symbol ? String(symbol).toUpperCase() : null,
        chain: p.relationships?.chain?.data?.id || chain || null,
        quantity: Number.isFinite(quantity) ? quantity : 0,
        value: Number.isFinite(value) ? value : 0,
        price: Number.isFinite(value) && Number.isFinite(quantity) && quantity > 0
          ? value / quantity
          : Number(attrs.price ?? 0),
        fungibleId: p.relationships?.fungible?.data?.id || fungible.id || null,
      };
    })
    .filter((p) => p.symbol && p.value > 0 && p.quantity > 0);
}

function formatAmount(value) {
  if (!Number.isFinite(value) || value <= 0) return "0";
  if (value >= 1) return value.toFixed(6).replace(/\.?0+$/, "");
  return value.toPrecision(6).replace(/\.?0+$/, "");
}

export function buildRebalanceDecision({
  positions,
  targets,
  minDriftPct = 4,
  maxTradeUsd = 10,
  minTradeUsd = 1,
}) {
  if (!Array.isArray(targets) || targets.length < 2) {
    fail("invalid_targets", "At least two targets are required");
  }

  const bySymbol = new Map();
  for (const position of positions || []) {
    if (!position.symbol) continue;
    const existing = bySymbol.get(position.symbol);
    if (existing) {
      existing.quantity += position.quantity;
      existing.value += position.value;
      existing.price = existing.quantity > 0 ? existing.value / existing.quantity : existing.price;
    } else {
      bySymbol.set(position.symbol, { ...position });
    }
  }

  const tracked = targets.map((target) => {
    const position = bySymbol.get(target.symbol) || {
      symbol: target.symbol,
      quantity: 0,
      value: 0,
      price: 0,
    };
    return { ...position, targetPercent: target.percent };
  });

  const trackedValue = tracked.reduce((sum, p) => sum + p.value, 0);
  if (trackedValue <= 0) {
    return {
      shouldTrade: false,
      reason: "no_target_value",
      trackedValue,
      positions: tracked,
    };
  }

  const allocations = tracked.map((p) => {
    const actualPercent = (p.value / trackedValue) * 100;
    const driftPct = actualPercent - p.targetPercent;
    const targetValue = trackedValue * (p.targetPercent / 100);
    return {
      symbol: p.symbol,
      quantity: p.quantity,
      value: p.value,
      price: p.price,
      targetPercent: p.targetPercent,
      actualPercent,
      driftPct,
      targetValue,
      usdExcess: Math.max(0, p.value - targetValue),
      usdShortfall: Math.max(0, targetValue - p.value),
    };
  });

  const overweight = allocations
    .filter((a) => a.driftPct > minDriftPct && a.usdExcess > 0 && a.price > 0)
    .sort((a, b) => b.usdExcess - a.usdExcess)[0];
  const underweight = allocations
    .filter((a) => a.driftPct < -minDriftPct && a.usdShortfall > 0)
    .sort((a, b) => b.usdShortfall - a.usdShortfall)[0];

  if (!overweight || !underweight) {
    return {
      shouldTrade: false,
      reason: "within_drift_band",
      trackedValue,
      minDriftPct,
      allocations,
    };
  }

  const tradeUsd = Math.min(overweight.usdExcess, underweight.usdShortfall, maxTradeUsd);
  if (tradeUsd < minTradeUsd) {
    return {
      shouldTrade: false,
      reason: "below_min_trade_usd",
      trackedValue,
      tradeUsd,
      minTradeUsd,
      allocations,
    };
  }

  const rawAmount = tradeUsd / overweight.price;
  const amount = Math.min(rawAmount, overweight.quantity * 0.95);
  const amountUsd = amount * overweight.price;

  return {
    shouldTrade: true,
    reason: "rebalance_required",
    trackedValue,
    minDriftPct,
    from: {
      symbol: overweight.symbol,
      amount: formatAmount(amount),
      amountFloat: amount,
      amountUsd,
      driftPct: overweight.driftPct,
      currentValue: overweight.value,
      targetValue: overweight.targetValue,
    },
    to: {
      symbol: underweight.symbol,
      driftPct: underweight.driftPct,
      currentValue: underweight.value,
      targetValue: underweight.targetValue,
    },
    allocations,
  };
}

export function summarizeDecision(decision) {
  if (!decision.shouldTrade) return decision.reason;
  return `swap ${decision.from.amount} ${decision.from.symbol} to ${decision.to.symbol}`;
}
