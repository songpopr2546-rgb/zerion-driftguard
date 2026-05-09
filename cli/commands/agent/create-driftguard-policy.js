import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { print, printError } from "../../utils/common/output.js";
import { createPolicy, toCaip2, allChainNames } from "../../utils/wallet/keystore.js";
import { shortenScriptPaths } from "../../utils/common/format.js";
import {
  parseNonNegativeNumber,
  parsePositiveNumber,
  parseSymbolList,
  parseTargets,
} from "../../utils/agent/driftguard.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const POLICIES_DIR = join(__dirname, "..", "..", "policies");

function parseExpires(input) {
  if (!input) return null;
  const match = String(input).match(/^(\d+)([hd])$/i);
  if (match) {
    const n = parseInt(match[1], 10);
    const unit = match[2].toLowerCase();
    return new Date(Date.now() + (unit === "h" ? n * 3600_000 : n * 86400_000)).toISOString();
  }
  const d = new Date(input);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function coerceBoolFlag(value, name, fallback = false) {
  if (value === undefined) return fallback;
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  printError("invalid_flag_value", `--${name} does not take a value (got "${value}")`);
  process.exit(1);
}

export default async function createDriftguardPolicy(args, flags) {
  const name = flags.name || args[0];
  if (!name) {
    printError("missing_args", "Policy name required", {
      example: "zerion agent create-driftguard-policy --name base-driftguard --chain base --targets USDC=60,ETH=40",
    });
    process.exit(1);
  }

  const chain = flags.chain || "base";
  const valid = allChainNames();
  if (!valid.includes(chain)) {
    printError("invalid_chain", `Unknown chain: ${chain}`, {
      suggestion: `Valid chains: ${valid.join(", ")}`,
    });
    process.exit(1);
  }

  let targets;
  try {
    targets = parseTargets(flags.targets);
  } catch (err) {
    printError(err.code || "invalid_targets", err.message, {
      example: err.example || "--targets USDC=60,ETH=40",
    });
    process.exit(1);
  }

  let maxTradeUsd;
  let dailyLimitUsd;
  let maxAbsDriftPct;
  try {
    maxTradeUsd = parsePositiveNumber(flags["max-trade-usd"], "--max-trade-usd", 10);
    dailyLimitUsd = parsePositiveNumber(flags["daily-limit-usd"], "--daily-limit-usd", 25);
    maxAbsDriftPct = parseNonNegativeNumber(flags["max-abs-drift-pct"], "--max-abs-drift-pct", 80);
  } catch (err) {
    printError(err.code || "invalid_number", err.message, { value: err.value });
    process.exit(1);
  }

  let expiresAt = null;
  if (flags.expires) {
    expiresAt = parseExpires(flags.expires);
    if (!expiresAt) {
      printError("invalid_expires", `Cannot parse expiry: "${flags.expires}"`, {
        suggestion: "Use relative (24h, 7d, 30d) or absolute (2026-06-01) format",
      });
      process.exit(1);
    }
  }

  const id = `policy-${name}-${randomUUID().slice(0, 8)}`;
  const rules = [
    { type: "allowed_chains", chain_ids: [toCaip2(chain)] },
  ];
  if (expiresAt) rules.push({ type: "expires_at", timestamp: expiresAt });

  const targetSymbols = targets.map((t) => t.symbol);
  const allowedTokens = parseSymbolList(flags["allowed-tokens"]);
  const config = {
    scripts: [join(POLICIES_DIR, "driftguard.mjs")],
    policy_id: id,
    state_namespace: id,
    allowed_chains: [chain],
    allowed_tokens: allowedTokens.length ? allowedTokens : targetSymbols,
    targets,
    max_trade_usd: maxTradeUsd,
    daily_limit_usd: dailyLimitUsd,
    max_abs_drift_pct: maxAbsDriftPct,
    allow_bridges: coerceBoolFlag(flags["allow-bridges"], "allow-bridges", false),
  };

  try {
    const policy = createPolicy(id, name, rules, join(POLICIES_DIR, "run-policies.mjs"), config);
    print({
      policy: {
        id: policy.id,
        name: policy.name,
        rules: policy.rules,
        executable: true,
        config: { ...config, scripts: shortenScriptPaths(config.scripts) },
      },
      created: true,
      usage: `Attach to a token: zerion agent create-token --name <bot> --wallet <wallet> --policy ${policy.id}`,
    });
  } catch (err) {
    printError("ows_error", `Failed to create DriftGuard policy: ${err.message}`);
    process.exit(1);
  }
}
