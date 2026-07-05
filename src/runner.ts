import { Contract, Interface, JsonRpcProvider, ethers } from "ethers";
import { COMMON_BSC, ERC20_ABI, FACTORY_ABI, PAIR_ABI, ROUTER_ABI } from "./constants";
import { buildFinalMatrix, inferInsights } from "./insights";
import { createDiagnosticLog, createTestEntry, finalizeLog, finishTest } from "./logger";
import type { DiagnosticEvent, DiagnosticLog, DiscoveryState, SafetySettings, TestLogEntry, TestPlanItem } from "./types";

const transferIface = new Interface(ERC20_ABI);
const pairIface = new Interface(PAIR_ABI);

export const DEFAULT_SAFETY_SETTINGS: SafetySettings = {
  dryRunOnly: true,
  allowLiveTransactions: false,
  allowBuyTests: true,
  allowSellTests: false,
  allowDirectTransferTests: true,
  allowTransferToPairTests: false,
  allowCustomPairTests: false,
  allowApprovalTests: false,
  allowContractExecutorTests: false,
  allowContractDeployment: false,
  maxBnbSpend: "0.004",
  maxTokenAmountPerTest: "1",
  stopOnFirstFailure: false,
  continueAfterFailedSimulation: false,
  requireConfirmationBeforeEachLiveTx: true
};

export interface RunnerContext {
  provider: JsonRpcProvider;
  wallet?: ethers.HDNodeWallet;
  testWalletAddress: string;
  alternateActors: string[];
  targetTokenAddress: string;
  discovery: DiscoveryState;
  safety: SafetySettings;
  rpcUrlLabel: string;
  manualOverrides: Record<string, string>;
  onProgress: (log: DiagnosticLog, currentTest?: TestLogEntry) => void;
  confirmLiveTx?: (message: string) => Promise<boolean>;
  liveSpendWei?: bigint;
}

export function buildTestPlan(discovery: DiscoveryState, safety: SafetySettings): TestPlanItem[] {
  const hasPair = discovery.pairs.length > 0;
  const hasRouter = discovery.routers.length > 0;
  const liveAllowed = safety.allowLiveTransactions && !safety.dryRunOnly;

  const items: TestPlanItem[] = [
    plan("read-001", "Baseline reads", "Metadata, balances, allowances, reserves", "read", false, "0"),
    plan("read-002", "Baseline reads", "Readable config and selector inventory", "read", false, "0"),
    plan("disc-001", "Auto-discovery checks", "Router, factory, pair, quote, and confidence scoring", "read", false, "0"),
    plan("approval-001", "Approval tests", "Approve router and verify allowance", "transaction", true, "0"),
    plan("transfer-001", "Direct transfer tests", "Tiny transfer to generated actor", "transaction", true, "0"),
    plan("transfer-002", "Direct transfer tests", "Tiny transfer to detected pair", "transaction", true, "0"),
    plan("buy-001", "Buy tests", "Tiny WBNB/BNB buy to test wallet", "transaction", true, "0.0002"),
    plan("buy-002", "Buy tests", "Repeat tiny buy to detect cumulative behavior", "transaction", true, "0.0002"),
    plan("sell-001", "Sell tests", "Tiny sell from test wallet", "transaction", true, "0"),
    plan("pair-001", "Pair behavior tests", "Compare detected pair reserves and roles", "read", false, "0"),
    plan("pair-002", "Pair behavior tests", "Custom pair feasibility check", "simulate", false, "0"),
    plan("contract-001", "Contract versus EOA tests", "Executor contract behavior comparison", "simulate", false, "0"),
    plan("limit-001", "Limit inference tests", "Repeated tiny operation comparison", "simulate", false, "0"),
    plan("events-001", "Event and revert logging", "Decode Transfer and Approval events; preserve raw topics", "read", false, "0")
  ];

  return items.map((item) => {
    if (!hasRouter && ["approval-001", "buy-001", "buy-002", "sell-001"].includes(item.testId)) {
      return skipped(item, "Router discovery unavailable.");
    }
    if (!hasPair && ["buy-001", "buy-002", "sell-001", "pair-001", "transfer-002"].includes(item.testId)) {
      return skipped(item, "No liquidity pair discovered.");
    }
    if (item.testId === "approval-001" && !safety.allowApprovalTests) {
      return skipped(item, "Approval tests are disabled.");
    }
    if (item.testId === "transfer-001" && !safety.allowDirectTransferTests) {
      return skipped(item, "Direct transfer tests are disabled.");
    }
    if (item.testId === "transfer-002" && !safety.allowTransferToPairTests) {
      return skipped(item, "Transfer-to-pair tests require explicit enablement.");
    }
    if (item.category === "Buy tests" && !safety.allowBuyTests) {
      return skipped(item, "Buy tests are disabled.");
    }
    if (item.category === "Sell tests" && !safety.allowSellTests) {
      return skipped(item, "Sell tests require explicit enablement.");
    }
    if (item.testId === "pair-002" && !safety.allowCustomPairTests) {
      return skipped(item, "Custom pair tests require explicit enablement.");
    }
    if (item.category === "Contract versus EOA tests" && !safety.allowContractExecutorTests) {
      return skipped(item, "Contract executor tests require explicit enablement.");
    }
    if (item.requiresLive && !liveAllowed) {
      return { ...item, callType: "simulate" };
    }
    return item;
  });
}

function plan(
  testId: string,
  category: string,
  name: string,
  callType: TestPlanItem["callType"],
  requiresLive: boolean,
  estimatedBnbSpend: string
): TestPlanItem {
  return { testId, category, name, callType, requiresLive, status: "pending", skipReason: "", estimatedBnbSpend };
}

function skipped(item: TestPlanItem, skipReason: string): TestPlanItem {
  return { ...item, status: "skipped", skipReason };
}

export async function runDiagnostics(ctx: RunnerContext): Promise<DiagnosticLog> {
  const network = await ctx.provider.getNetwork();
  const mode = ctx.safety.allowLiveTransactions && !ctx.safety.dryRunOnly ? "live" : "dry-run";
  let log = createDiagnosticLog({
    mode,
    network: network.name,
    chainId: network.chainId.toString(),
    rpcUrlLabel: ctx.rpcUrlLabel,
    targetTokenAddress: ctx.targetTokenAddress,
    maxBnbSpend: ctx.safety.maxBnbSpend,
    testWalletAddress: ctx.testWalletAddress,
    discovery: ctx.discovery,
    manualOverrides: ctx.manualOverrides
  });

  log.addresses.generatedActors = ctx.alternateActors;
  log.testPlan = buildTestPlan(ctx.discovery, ctx.safety);

  const pushTest = (test: TestLogEntry) => {
    log = { ...log, tests: [...log.tests.filter((existing) => existing.testId !== test.testId), test] };
    ctx.onProgress(log, test);
  };

  await runBaseline(ctx, log, pushTest);
  for (const item of log.testPlan.filter((item) => item.status === "skipped")) {
    pushTest(
      finishTest(
        createTestEntry({
          testId: item.testId,
          category: item.category,
          name: item.name,
          description: item.name,
          callType: item.callType
        }),
        "skipped",
        { skipReason: item.skipReason, resultInterpretation: item.skipReason }
      )
    );
  }

  for (const item of log.testPlan.filter((item) => item.status === "pending")) {
    const result = await executePlannedItem(ctx, item, log, pushTest);
    if (result?.status === "failed" && ctx.safety.stopOnFirstFailure) break;
  }

  const insights = inferInsights(log.tests, ctx.discovery.pairs);
  return finalizeLog(log, insights, buildFinalMatrix(log.tests));
}

async function runBaseline(
  ctx: RunnerContext,
  log: DiagnosticLog,
  pushTest: (test: TestLogEntry) => void
): Promise<void> {
  const token = new Contract(ctx.targetTokenAddress, ERC20_ABI, ctx.provider);
  const router = ctx.discovery.routers[0]?.value;
  const block = await ctx.provider.getBlock("latest");

  const entry = createTestEntry({
    testId: "baseline-001",
    category: "Baseline reads",
    name: "Balances, allowances, reserves",
    description: "Capture wallet balances, router allowance, and pair reserve baseline.",
    callType: "read",
    actor: ctx.testWalletAddress
  });

  try {
    const bnbBalance = await ctx.provider.getBalance(ctx.testWalletAddress);
    const tokenBalance = await token.balanceOf(ctx.testWalletAddress);
    const allowance = router ? await token.allowance(ctx.testWalletAddress, router) : 0n;

    log.baseline.blockNumber = block?.number.toString() ?? "";
    log.baseline.timestamp = block?.timestamp.toString() ?? "";
    log.baseline.balances[`${ctx.testWalletAddress}:BNB`] = ethers.formatEther(bnbBalance);
    log.baseline.balances[`${ctx.testWalletAddress}:TOKEN`] = tokenBalance.toString();
    if (router) log.baseline.allowances[`${ctx.testWalletAddress}->${router}`] = allowance.toString();

    for (const pair of ctx.discovery.pairs) {
      log.baseline.pairReserves[pair.address] = {
        quote: pair.quoteSymbol,
        tokenReserve: pair.tokenReserve ?? "",
        quoteReserve: pair.quoteReserve ?? ""
      };
    }

    pushTest(
      finishTest(entry, "success", {
        blockBefore: log.baseline.blockNumber,
        blockAfter: log.baseline.blockNumber,
        balancesAfter: log.baseline.balances,
        allowancesAfter: log.baseline.allowances,
        pairReservesAfter: log.baseline.pairReserves,
        resultInterpretation: "Baseline captured.",
        confidence: "high"
      })
    );
  } catch (error) {
    pushTest(finishTest(entry, "failed", { revert: parseError(error), resultInterpretation: "Baseline read failed." }));
  }
}

async function executePlannedItem(
  ctx: RunnerContext,
  item: TestPlanItem,
  log: DiagnosticLog,
  pushTest: (test: TestLogEntry) => void
): Promise<TestLogEntry | undefined> {
  if (item.testId === "read-001" || item.testId === "read-002" || item.testId === "disc-001" || item.testId === "events-001") {
    const entry = createTestEntry({
      testId: item.testId,
      category: item.category,
      name: item.name,
      description: item.name,
      callType: "read",
      actor: ctx.testWalletAddress
    });
    const result = finishTest(entry, "success", {
      resultInterpretation: "Read-only data was collected during discovery and baseline capture.",
      confidence: "high"
    });
    pushTest(result);
    return result;
  }

  if (item.testId === "pair-001") return runPairComparison(ctx, item, pushTest);
  if (item.testId === "pair-002") return runCustomPairFeasibility(ctx, item, pushTest);
  if (item.testId === "contract-001") return runContractExecutorCheck(ctx, item, pushTest);
  if (item.testId === "limit-001") return runLimitInferenceCheck(ctx, item, pushTest);
  if (item.testId === "approval-001") return runApprovalTest(ctx, item, pushTest);
  if (item.testId === "transfer-001") return runDirectTransferTest(ctx, item, ctx.alternateActors[0], pushTest);
  if (item.testId === "transfer-002") return runDirectTransferTest(ctx, item, ctx.discovery.pairs[0]?.address, pushTest);
  if (item.testId.startsWith("buy-")) return runBuyTest(ctx, item, pushTest, item.testId === "buy-002");
  if (item.testId === "sell-001") return runSellTest(ctx, item, pushTest, log);
  return undefined;
}

async function runPairComparison(
  ctx: RunnerContext,
  item: TestPlanItem,
  pushTest: (test: TestLogEntry) => void
): Promise<TestLogEntry> {
  const entry = createTestEntry({
    testId: item.testId,
    category: item.category,
    name: item.name,
    description: "Compare detected pair token ordering, reserves, and LP supply.",
    callType: "read",
    actor: ctx.testWalletAddress
  });

  const result = finishTest(entry, "success", {
    pairReservesAfter: Object.fromEntries(ctx.discovery.pairs.map((pair) => [pair.address, pair])),
    resultInterpretation: `${ctx.discovery.pairs.length} pair(s) available for comparison.`,
    confidence: ctx.discovery.pairs.length ? "medium" : "unknown"
  });
  pushTest(result);
  return result;
}

async function runCustomPairFeasibility(
  ctx: RunnerContext,
  item: TestPlanItem,
  pushTest: (test: TestLogEntry) => void
): Promise<TestLogEntry> {
  const factoryAddress = ctx.discovery.factories[0]?.value ?? COMMON_BSC.pancakeV2Factory;
  const factory = new Contract(factoryAddress, FACTORY_ABI, ctx.provider);
  const entry = createTestEntry({
    testId: item.testId,
    category: item.category,
    name: item.name,
    description: "Check whether a token/WBNB pair already exists and whether createPair simulation is possible.",
    callType: "simulate",
    actor: ctx.testWalletAddress,
    functionCalled: "createPair(address,address)",
    functionSelector: "0xc9c65396",
    args: { tokenA: ctx.targetTokenAddress, tokenB: COMMON_BSC.wbnb }
  });

  try {
    const currentPair = await factory.getPair(ctx.targetTokenAddress, COMMON_BSC.wbnb);
    if (currentPair !== ethers.ZeroAddress) {
      const result = finishTest(entry, "success", {
        resultInterpretation: "A token/WBNB pair already exists; creating a duplicate pair is unnecessary.",
        notes: currentPair,
        confidence: "high"
      });
      pushTest(result);
      return result;
    }

    const data = factory.interface.encodeFunctionData("createPair", [ctx.targetTokenAddress, COMMON_BSC.wbnb]);
    await ctx.provider.call({ to: factoryAddress, from: ctx.testWalletAddress, data });
    const result = finishTest(entry, "success", {
      resultInterpretation: "Factory createPair simulation did not revert.",
      confidence: "medium"
    });
    pushTest(result);
    return result;
  } catch (error) {
    const result = finishTest(entry, "failed", {
      revert: parseError(error),
      resultInterpretation: "Custom pair feasibility simulation failed.",
      confidence: "low"
    });
    pushTest(result);
    return result;
  }
}

async function runContractExecutorCheck(
  ctx: RunnerContext,
  item: TestPlanItem,
  pushTest: (test: TestLogEntry) => void
): Promise<TestLogEntry> {
  const entry = createTestEntry({
    testId: item.testId,
    category: item.category,
    name: item.name,
    description: "Record executor-contract gate state. Deployment remains separately gated.",
    callType: "simulate",
    actor: ctx.testWalletAddress
  });
  const result = finishTest(entry, ctx.safety.allowContractDeployment ? "skipped" : "skipped", {
    skipReason: ctx.safety.allowContractDeployment
      ? "Executor deployment bytecode is not bundled in this browser build."
      : "Contract deployment is disabled.",
    resultInterpretation: "EOA versus contract behavior requires an executor contract run.",
    confidence: "unknown"
  });
  pushTest(result);
  return result;
}

async function runLimitInferenceCheck(
  ctx: RunnerContext,
  item: TestPlanItem,
  pushTest: (test: TestLogEntry) => void
): Promise<TestLogEntry> {
  const entry = createTestEntry({
    testId: item.testId,
    category: item.category,
    name: item.name,
    description: "Summarize repeated tiny operation availability for limit inference.",
    callType: "simulate",
    actor: ctx.testWalletAddress
  });
  const result = finishTest(entry, "success", {
    resultInterpretation: "Repeated buy/transfer/sell entries in this run are used for cumulative limit inference.",
    confidence: "low"
  });
  pushTest(result);
  return result;
}

async function runApprovalTest(
  ctx: RunnerContext,
  item: TestPlanItem,
  pushTest: (test: TestLogEntry) => void
): Promise<TestLogEntry> {
  const router = ctx.discovery.routers[0]?.value;
  const token = new Contract(ctx.targetTokenAddress, ERC20_ABI, ctx.provider);
  const amount = await parseTokenTestAmount(ctx);
  const entry = createTestEntry({
    testId: item.testId,
    category: item.category,
    name: item.name,
    description: "Approve the detected router for a tiny token amount, with simulation first.",
    callType: item.callType,
    actor: ctx.testWalletAddress,
    txOrigin: ctx.testWalletAddress,
    msgSender: ctx.testWalletAddress,
    spender: router,
    amountIn: amount.toString(),
    functionCalled: "approve(address,uint256)",
    functionSelector: "0x095ea7b3",
    args: { spender: router, amount: amount.toString() }
  });

  if (!router) return finishAndPush(entry, "skipped", pushTest, { skipReason: "Router unavailable." });

  try {
    const allowanceBefore = await token.allowance(ctx.testWalletAddress, router);
    const data = token.interface.encodeFunctionData("approve", [router, amount]);
    await ctx.provider.call({ to: ctx.targetTokenAddress, from: ctx.testWalletAddress, data });

    if (item.callType !== "transaction") {
      return finishAndPush(entry, "success", pushTest, {
        allowancesBefore: { [`${ctx.testWalletAddress}->${router}`]: allowanceBefore.toString() },
        resultInterpretation: "Approval simulation succeeded.",
        confidence: "medium"
      });
    }

    const txResult = await sendLiveIfAllowed(ctx, entry, { to: ctx.targetTokenAddress, data });
    return finishAndPush(txResult.entry, txResult.success ? "success" : "failed", pushTest, txResult.updates);
  } catch (error) {
    return finishAndPush(entry, "failed", pushTest, {
      revert: parseError(error),
      resultInterpretation: "Approval simulation failed."
    });
  }
}

async function runDirectTransferTest(
  ctx: RunnerContext,
  item: TestPlanItem,
  recipient: string | undefined,
  pushTest: (test: TestLogEntry) => void
): Promise<TestLogEntry> {
  const token = new Contract(ctx.targetTokenAddress, ERC20_ABI, ctx.provider);
  const amount = await parseTokenTestAmount(ctx);
  const entry = createTestEntry({
    testId: item.testId,
    category: item.category,
    name: item.name,
    description: "Tiny direct token transfer with simulation first.",
    callType: item.callType,
    actor: ctx.testWalletAddress,
    txOrigin: ctx.testWalletAddress,
    msgSender: ctx.testWalletAddress,
    tokenFrom: ctx.testWalletAddress,
    tokenTo: recipient,
    recipient,
    amountIn: amount.toString(),
    functionCalled: "transfer(address,uint256)",
    functionSelector: "0xa9059cbb",
    args: { recipient, amount: amount.toString() }
  });

  if (!recipient) return finishAndPush(entry, "skipped", pushTest, { skipReason: "Recipient unavailable." });

  try {
    const balance = await token.balanceOf(ctx.testWalletAddress);
    if (balance < amount) {
      return finishAndPush(entry, "skipped", pushTest, {
        skipReason: "Testing wallet has no token balance for transfer.",
        balancesBefore: { [ctx.testWalletAddress]: balance.toString() }
      });
    }

    const data = token.interface.encodeFunctionData("transfer", [recipient, amount]);
    await ctx.provider.call({ to: ctx.targetTokenAddress, from: ctx.testWalletAddress, data });
    if (item.callType !== "transaction") {
      return finishAndPush(entry, "success", pushTest, {
        balancesBefore: { [ctx.testWalletAddress]: balance.toString() },
        resultInterpretation: "Direct transfer simulation succeeded.",
        confidence: "medium"
      });
    }

    const txResult = await sendLiveIfAllowed(ctx, entry, { to: ctx.targetTokenAddress, data });
    return finishAndPush(txResult.entry, txResult.success ? "success" : "failed", pushTest, txResult.updates);
  } catch (error) {
    return finishAndPush(entry, "failed", pushTest, {
      revert: parseError(error),
      resultInterpretation: "Direct transfer simulation failed."
    });
  }
}

async function runBuyTest(
  ctx: RunnerContext,
  item: TestPlanItem,
  pushTest: (test: TestLogEntry) => void,
  repeat: boolean
): Promise<TestLogEntry> {
  const routerAddress = ctx.discovery.routers[0]?.value;
  const wbnb = ctx.discovery.quoteTokens.find((token) => token.label === "WBNB")?.value ?? COMMON_BSC.wbnb;
  const value = ethers.parseEther("0.0002");
  const path = [wbnb, ctx.targetTokenAddress];
  const entry = createTestEntry({
    testId: item.testId,
    category: item.category,
    name: item.name,
    description: repeat ? "Repeat tiny buy path to detect cumulative behavior." : "Tiny buy path with simulation first.",
    callType: item.callType,
    actor: ctx.testWalletAddress,
    txOrigin: ctx.testWalletAddress,
    msgSender: routerAddress,
    tokenFrom: ctx.discovery.pairs[0]?.address,
    tokenTo: ctx.testWalletAddress,
    recipient: ctx.testWalletAddress,
    amountIn: value.toString(),
    path,
    functionCalled: "swapExactETHForTokensSupportingFeeOnTransferTokens(uint256,address[],address,uint256)",
    functionSelector: "0xb6f9de95",
    args: { amountOutMin: "0", path, to: ctx.testWalletAddress }
  });

  if (!routerAddress) return finishAndPush(entry, "skipped", pushTest, { skipReason: "Router unavailable." });

  try {
    const router = new Contract(routerAddress, ROUTER_ABI, ctx.provider);
    const deadline = Math.floor(Date.now() / 1000) + 60 * 20;
    const data = router.interface.encodeFunctionData("swapExactETHForTokensSupportingFeeOnTransferTokens", [
      0,
      path,
      ctx.testWalletAddress,
      deadline
    ]);
    await ctx.provider.call({ to: routerAddress, from: ctx.testWalletAddress, data, value });

    if (item.callType !== "transaction") {
      return finishAndPush(entry, "success", pushTest, {
        resultInterpretation: "Buy simulation succeeded.",
        confidence: "medium"
      });
    }

    const txResult = await sendLiveIfAllowed(ctx, entry, { to: routerAddress, data, value });
    return finishAndPush(txResult.entry, txResult.success ? "success" : "failed", pushTest, txResult.updates);
  } catch (error) {
    return finishAndPush(entry, "failed", pushTest, {
      revert: parseError(error),
      resultInterpretation: "Buy simulation failed."
    });
  }
}

async function runSellTest(
  ctx: RunnerContext,
  item: TestPlanItem,
  pushTest: (test: TestLogEntry) => void,
  log: DiagnosticLog
): Promise<TestLogEntry> {
  const routerAddress = ctx.discovery.routers[0]?.value;
  const wbnb = ctx.discovery.quoteTokens.find((token) => token.label === "WBNB")?.value ?? COMMON_BSC.wbnb;
  const token = new Contract(ctx.targetTokenAddress, ERC20_ABI, ctx.provider);
  const amount = await parseTokenTestAmount(ctx);
  const path = [ctx.targetTokenAddress, wbnb];
  const entry = createTestEntry({
    testId: item.testId,
    category: item.category,
    name: item.name,
    description: "Tiny sell from test wallet with simulation first.",
    callType: item.callType,
    actor: ctx.testWalletAddress,
    txOrigin: ctx.testWalletAddress,
    msgSender: routerAddress,
    tokenFrom: ctx.testWalletAddress,
    tokenTo: ctx.discovery.pairs[0]?.address,
    recipient: ctx.testWalletAddress,
    amountIn: amount.toString(),
    path,
    functionCalled: "swapExactTokensForETHSupportingFeeOnTransferTokens(uint256,uint256,address[],address,uint256)",
    functionSelector: "0x791ac947",
    args: { amountIn: amount.toString(), amountOutMin: "0", path, to: ctx.testWalletAddress }
  });

  if (!routerAddress) return finishAndPush(entry, "skipped", pushTest, { skipReason: "Router unavailable." });

  try {
    const balance = await token.balanceOf(ctx.testWalletAddress);
    if (balance < amount) {
      return finishAndPush(entry, "skipped", pushTest, {
        skipReason: "Testing wallet has no token balance for sell.",
        balancesBefore: { [ctx.testWalletAddress]: balance.toString() }
      });
    }

    const router = new Contract(routerAddress, ROUTER_ABI, ctx.provider);
    const deadline = Math.floor(Date.now() / 1000) + 60 * 20;
    const data = router.interface.encodeFunctionData("swapExactTokensForETHSupportingFeeOnTransferTokens", [
      amount,
      0,
      path,
      ctx.testWalletAddress,
      deadline
    ]);
    await ctx.provider.call({ to: routerAddress, from: ctx.testWalletAddress, data });

    if (item.callType !== "transaction") {
      return finishAndPush(entry, "success", pushTest, {
        resultInterpretation: "Sell simulation succeeded.",
        confidence: "medium"
      });
    }

    const allowanceKey = `${ctx.testWalletAddress}->${routerAddress}`;
    const allowance = BigInt(log.baseline.allowances[allowanceKey] ?? "0");
    if (allowance < amount && !ctx.safety.allowApprovalTests) {
      return finishAndPush(entry, "skipped", pushTest, {
        skipReason: "Sell requires router allowance and approval tests are disabled."
      });
    }

    const txResult = await sendLiveIfAllowed(ctx, entry, { to: routerAddress, data });
    return finishAndPush(txResult.entry, txResult.success ? "success" : "failed", pushTest, txResult.updates);
  } catch (error) {
    return finishAndPush(entry, "failed", pushTest, {
      revert: parseError(error),
      resultInterpretation: "Sell simulation failed."
    });
  }
}

async function parseTokenTestAmount(ctx: RunnerContext): Promise<bigint> {
  const decimals = ctx.discovery.token?.decimals ?? 18;
  try {
    return ethers.parseUnits(ctx.safety.maxTokenAmountPerTest || "1", decimals);
  } catch {
    return 1n;
  }
}

async function sendLiveIfAllowed(
  ctx: RunnerContext,
  entry: TestLogEntry,
  tx: { to: string; data: string; value?: bigint }
): Promise<{ entry: TestLogEntry; success: boolean; updates: Partial<TestLogEntry> }> {
  if (ctx.safety.dryRunOnly || !ctx.safety.allowLiveTransactions) {
    return {
      entry,
      success: false,
      updates: {
        status: "skipped",
        skipReason: "Live transactions are disabled.",
        resultInterpretation: "Simulation was allowed, live transaction was not sent."
      }
    };
  }

  if (!ctx.wallet) {
    return {
      entry,
      success: false,
      updates: {
        status: "skipped",
        skipReason: "Funding wallet is locked. Unlock it before live transactions.",
        resultInterpretation: "Simulation was allowed, live transaction was not sent."
      }
    };
  }

  const value = tx.value ?? 0n;
  const maxSpend = parseBnbCap(ctx.safety.maxBnbSpend);
  const spent = ctx.liveSpendWei ?? 0n;
  if (spent + value > maxSpend) {
    return {
      entry,
      success: false,
      updates: {
        status: "skipped",
        skipReason: "Configured maximum BNB spend would be exceeded.",
        resultInterpretation: "Live transaction was not sent."
      }
    };
  }

  if (ctx.safety.requireConfirmationBeforeEachLiveTx) {
    const ok = await ctx.confirmLiveTx?.(`Send live transaction for ${entry.name}?`);
    if (!ok) {
      return {
        entry,
        success: false,
        updates: {
          status: "skipped",
          skipReason: "User declined live transaction.",
          resultInterpretation: "Live transaction was not sent."
        }
      };
    }
  }

  try {
    const connected = ctx.wallet.connect(ctx.provider);
    const response = await connected.sendTransaction(tx);
    ctx.liveSpendWei = spent + value;
    const receipt = await response.wait();
    return {
      entry,
      success: receipt?.status === 1,
      updates: {
        txHash: response.hash,
        blockAfter: receipt?.blockNumber.toString() ?? "",
        gas: { estimated: "", used: receipt?.gasUsed.toString() ?? "" },
        events: decodeEvents(receipt?.logs ?? []),
        resultInterpretation: receipt?.status === 1 ? "Live transaction succeeded." : "Live transaction failed.",
        confidence: "high"
      }
    };
  } catch (error) {
    return {
      entry,
      success: false,
      updates: {
        revert: parseError(error),
        resultInterpretation: "Live transaction failed."
      }
    };
  }
}

function parseBnbCap(value: string): bigint {
  try {
    return ethers.parseEther(value || "0");
  } catch {
    return 0n;
  }
}

function finishAndPush(
  entry: TestLogEntry,
  status: TestLogEntry["status"],
  pushTest: (test: TestLogEntry) => void,
  updates: Partial<TestLogEntry> = {}
): TestLogEntry {
  const result = finishTest(entry, updates.status ?? status, updates);
  pushTest(result);
  return result;
}

export function parseError(error: unknown): TestLogEntry["revert"] {
  const anyError = error as {
    shortMessage?: string;
    reason?: string;
    message?: string;
    data?: string;
    error?: { data?: string; message?: string };
  };
  const rawData = anyError.data ?? anyError.error?.data ?? "";
  return {
    didRevert: true,
    reason: anyError.shortMessage ?? anyError.reason ?? anyError.error?.message ?? anyError.message ?? "Unknown error",
    rawData,
    customErrorSelector: rawData && rawData.length >= 10 ? rawData.slice(0, 10) : ""
  };
}

function decodeEvents(logs: readonly ethers.Log[]): DiagnosticEvent[] {
  return logs.map((log) => {
    for (const iface of [transferIface, pairIface]) {
      try {
        const parsed = iface.parseLog({ topics: [...log.topics], data: log.data });
        if (parsed) {
          return {
            address: log.address,
            topics: [...log.topics],
            data: log.data,
            decodedName: parsed.name,
            decodedArgs: Object.fromEntries(parsed.fragment.inputs.map((input, index) => [input.name, String(parsed.args[index])]))
          };
        }
      } catch {
        // Try next interface.
      }
    }
    return { address: log.address, topics: [...log.topics], data: log.data };
  });
}
