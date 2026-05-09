import * as api from "../../utils/api/client.js";
import { buildRebalanceDecision, coerceBooleanFlag, normalizePositions, parseDurationSeconds, parsePositiveNumber, parseTargets, summarizeDecision } from "../../utils/agent/driftguard.js";
import { getSwapQuote, executeSwap } from "../../utils/trading/swap.js";
import { requireAgentToken, parseSlippage, parseTimeout, handleTradingError } from "../../utils/trading/guards.js";
import { resolveWallet } from "../../utils/wallet/resolve.js";
import { print, printError } from "../../utils/common/output.js";
import { validateTradingChainAsync } from "../../utils/common/validate.js";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function parseMaxRuns(value, hasInterval) {
  if (value === undefined || value === null || value === "") return hasInterval ? Infinity : 1;
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    const err = new Error("--max-runs must be a positive integer");
    err.code = "invalid_number";
    throw err;
  }
  return n;
}

function outputCommand({ chain, targets, walletName, flags }) {
  const parts = [
    "zerion agent run-driftguard",
    `--wallet ${walletName}`,
    `--chain ${chain}`,
    `--targets ${targets.map((t) => `${t.symbol}=${t.percent}`).join(",")}`,
    `--max-trade-usd ${flags.maxTradeUsd}`,
    `--min-drift-pct ${flags.minDriftPct}`,
    "--execute",
  ];
  return parts.join(" ");
}

async function runCycle({ flags, chain, walletName, address, targets, execute }) {
  const response = await api.getPositions(address, {
    chainId: chain,
    positionFilter: "only_simple",
  });
  const positions = normalizePositions(response.data || [], chain);
  const decision = buildRebalanceDecision({
    positions,
    targets,
    minDriftPct: flags.minDriftPct,
    maxTradeUsd: flags.maxTradeUsd,
    minTradeUsd: flags.minTradeUsd,
  });

  const cycle = {
    agent: "driftguard",
    wallet: { name: walletName, address },
    chain,
    targets,
    observedAt: new Date().toISOString(),
    decision,
    summary: summarizeDecision(decision),
  };

  if (!decision.shouldTrade) {
    return { ...cycle, executed: false };
  }

  const quote = await getSwapQuote({
    fromToken: decision.from.symbol,
    toToken: decision.to.symbol,
    amount: decision.from.amount,
    fromChain: chain,
    toChain: chain,
    walletAddress: address,
    outputReceiver: address,
    slippage: flags.slippage,
    strategy: flags.strategy,
  });

  const quoteSummary = {
    id: quote.id,
    input: `${decision.from.amount} ${quote.from.symbol}`,
    output: `~${quote.estimatedOutput} ${quote.to.symbol}`,
    minOutput: quote.outputMin,
    fee: quote.fee,
    source: quote.liquiditySource,
    estimatedTimeSeconds: quote.estimatedSeconds,
    strategy: flags.strategy,
  };

  if (quote.preconditions.enough_balance === false) {
    return {
      ...cycle,
      quote: quoteSummary,
      executed: false,
      blocked: {
        code: "insufficient_funds",
        message: `Insufficient ${quote.from.symbol} balance for DriftGuard rebalance`,
      },
    };
  }

  if (!execute) {
    return {
      ...cycle,
      quote: quoteSummary,
      executed: false,
      nextCommand: outputCommand({ chain, targets, walletName, flags }),
    };
  }

  const passphrase = await requireAgentToken("for DriftGuard autonomous trading", walletName);
  const result = await executeSwap(quote, walletName, passphrase, {
    timeout: flags.timeout,
    policyMetadata: {
      agent: "driftguard",
      decisionId: `${chain}:${Date.now()}`,
      inputAmountUsd: decision.from.amountUsd,
      decision: {
        fromDriftPct: decision.from.driftPct,
        toDriftPct: decision.to.driftPct,
        trackedValue: decision.trackedValue,
      },
      strategy: flags.strategy,
    },
  });

  return {
    ...cycle,
    quote: quoteSummary,
    tx: {
      hash: result.hash,
      status: result.status,
      blockNumber: result.blockNumber,
      gasUsed: result.gasUsed,
      approvalHash: result.approvalHash,
    },
    executed: true,
  };
}

export default async function runDriftguard(args, rawFlags) {
  const chain = rawFlags.chain || "base";

  let targets;
  let minDriftPct;
  let maxTradeUsd;
  let minTradeUsd;
  let intervalSeconds;
  let maxRuns;
  let execute;
  let fast;
  let cheapest;
  try {
    targets = parseTargets(rawFlags.targets);
    minDriftPct = parsePositiveNumber(rawFlags["min-drift-pct"], "--min-drift-pct", 4);
    maxTradeUsd = parsePositiveNumber(rawFlags["max-trade-usd"], "--max-trade-usd", 10);
    minTradeUsd = parsePositiveNumber(rawFlags["min-trade-usd"], "--min-trade-usd", 1);
    intervalSeconds = parseDurationSeconds(rawFlags.interval);
    maxRuns = parseMaxRuns(rawFlags["max-runs"], Boolean(intervalSeconds));
    execute = coerceBooleanFlag(rawFlags.execute, "execute", false);
    fast = coerceBooleanFlag(rawFlags.fast, "fast", false);
    cheapest = coerceBooleanFlag(rawFlags.cheapest, "cheapest", false);
  } catch (err) {
    printError(err.code || "invalid_args", err.message, {
      example: err.example || "zerion agent run-driftguard --wallet bot --chain base --targets USDC=60,ETH=40 --max-trade-usd 5 --execute",
    });
    process.exit(1);
  }

  if (fast && cheapest) {
    printError("conflicting_flags", "Pass either --fast or --cheapest, not both.");
    process.exit(1);
  }
  const strategy = fast ? "fast" : "cheapest";

  const chainCheck = await validateTradingChainAsync(chain, "trade");
  if (chainCheck.error) {
    printError(chainCheck.error.code, chainCheck.error.message, {
      supportedChains: chainCheck.error.supportedChains,
    });
    process.exit(1);
  }

  const slippage = parseSlippage(rawFlags.slippage);
  const timeout = parseTimeout(rawFlags.timeout);
  const { walletName, address } = resolveWallet({ ...rawFlags, chain }, args);

  const flags = {
    minDriftPct,
    maxTradeUsd,
    minTradeUsd,
    slippage,
    timeout,
    strategy,
  };

  let runs = 0;
  while (runs < maxRuns) {
    runs++;
    try {
      const cycle = await runCycle({ flags, chain, walletName, address, targets, execute });
      print({
        ...cycle,
        run: runs,
        mode: execute ? "execute" : "dry-run",
      });
    } catch (err) {
      if (err.code || err.status || /Zerion API/i.test(err.message || "")) {
        handleTradingError(err, "driftguard_error");
        return;
      }
      printError(err.code || "driftguard_error", err.message);
      process.exit(1);
    }

    if (!intervalSeconds || runs >= maxRuns) break;
    await sleep(intervalSeconds * 1000);
  }
}
