export type Confidence = "unknown" | "low" | "medium" | "high";
export type TestStatus = "pending" | "running" | "success" | "failed" | "skipped";
export type CallType = "read" | "simulate" | "transaction";
export type RunMode = "dry-run" | "fork" | "live";

export interface SafetySettings {
  dryRunOnly: boolean;
  allowLiveTransactions: boolean;
  allowBuyTests: boolean;
  allowSellTests: boolean;
  allowDirectTransferTests: boolean;
  allowTransferToPairTests: boolean;
  allowCustomPairTests: boolean;
  allowApprovalTests: boolean;
  allowContractExecutorTests: boolean;
  allowContractDeployment: boolean;
  maxBnbSpend: string;
  maxTokenAmountPerTest: string;
  stopOnFirstFailure: boolean;
  continueAfterFailedSimulation: boolean;
  requireConfirmationBeforeEachLiveTx: boolean;
}

export interface DiscoveryItem<T = unknown> {
  label: string;
  value: T;
  confidence: Confidence;
  source: string;
  error?: string;
}

export interface TokenDiscovery {
  address: string;
  name?: string;
  symbol?: string;
  decimals?: number;
  totalSupply?: string;
  owner?: string;
  codeSize?: number;
  contractStatus: "unknown" | "not-contract" | "contract";
}

export interface PairDiscovery {
  address: string;
  quoteToken: string;
  quoteSymbol: string;
  token0?: string;
  token1?: string;
  reserve0?: string;
  reserve1?: string;
  tokenReserve?: string;
  quoteReserve?: string;
  lpTotalSupply?: string;
  confidence: Confidence;
  source: string;
}

export interface SelectorDiscovery {
  selector: string;
  guessedSignature: string;
  classification: string;
  presentInBytecode: boolean;
}

export interface ReadableConfigEntry {
  name: string;
  signature: string;
  value: string;
  confidence: Confidence;
}

export interface DiscoveryState {
  token?: TokenDiscovery;
  routers: DiscoveryItem<string>[];
  factories: DiscoveryItem<string>[];
  quoteTokens: DiscoveryItem<string>[];
  pairs: PairDiscovery[];
  readableConfig: Record<string, ReadableConfigEntry>;
  functionSelectors: SelectorDiscovery[];
  discoveryErrors: string[];
}

export interface TestPlanItem {
  testId: string;
  category: string;
  name: string;
  callType: CallType;
  requiresLive: boolean;
  status: TestStatus;
  skipReason: string;
  estimatedBnbSpend: string;
}

export interface DiagnosticEvent {
  address: string;
  topics: string[];
  data: string;
  decodedName?: string;
  decodedArgs?: Record<string, string>;
}

export interface TestLogEntry {
  testId: string;
  category: string;
  name: string;
  description: string;
  status: TestStatus;
  skipReason: string;
  startedAt: string;
  endedAt: string;
  blockBefore: string;
  blockAfter: string;
  txHash: string;
  callType: CallType;
  actor: string;
  txOrigin: string;
  msgSender: string;
  tokenFrom: string;
  tokenTo: string;
  spender: string;
  recipient: string;
  amountIn: string;
  amountOut: string;
  path: string[];
  functionCalled: string;
  functionSelector: string;
  arguments: Record<string, unknown>;
  balancesBefore: Record<string, string>;
  balancesAfter: Record<string, string>;
  allowancesBefore: Record<string, string>;
  allowancesAfter: Record<string, string>;
  pairReservesBefore: Record<string, unknown>;
  pairReservesAfter: Record<string, unknown>;
  events: DiagnosticEvent[];
  revert: {
    didRevert: boolean;
    reason: string;
    rawData: string;
    customErrorSelector: string;
  };
  gas: {
    estimated: string;
    used: string;
  };
  hypothesis: string;
  resultInterpretation: string;
  confidence: Confidence;
  notes: string;
}

export interface Insight {
  type: string;
  explanation: string;
  supportingTestIds: string[];
  contradictingTestIds: string[];
  confidence: Confidence;
  nextTests: string[];
  warnings: string[];
}

export interface DiagnosticLog {
  metadata: {
    appVersion: string;
    startedAt: string;
    endedAt: string;
    mode: RunMode;
    network: string;
    chainId: string;
    rpcUrlLabel: string;
    targetTokenAddress: string;
    defaultFundingBnb: string;
    maxBnbSpend: string;
    testWalletAddress: string;
  };
  discovery: {
    token: Record<string, unknown>;
    routers: DiscoveryItem<string>[];
    factories: DiscoveryItem<string>[];
    quoteTokens: DiscoveryItem<string>[];
    pairs: PairDiscovery[];
    readableConfig: Record<string, ReadableConfigEntry>;
    functionSelectors: SelectorDiscovery[];
    discoveryErrors: string[];
  };
  addresses: {
    testWallet: string;
    generatedActors: string[];
    detectedRouter: string;
    detectedFactory: string;
    detectedOfficialPair: string;
    detectedPairs: string[];
    manualOverrides: Record<string, string>;
  };
  baseline: {
    balances: Record<string, string>;
    allowances: Record<string, string>;
    pairReserves: Record<string, unknown>;
    blockNumber: string;
    timestamp: string;
  };
  testPlan: TestPlanItem[];
  tests: TestLogEntry[];
  events: DiagnosticEvent[];
  revertReasons: Array<{ testId: string; reason: string; rawData: string; customErrorSelector: string }>;
  insights: Insight[];
  finalMatrix: Record<string, { possible: "Yes" | "No" | "Unknown"; evidence: string[]; bottleneck: string }>;
  openQuestions: string[];
}
