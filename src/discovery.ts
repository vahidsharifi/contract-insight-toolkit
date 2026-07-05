import { Contract, FunctionFragment, Interface, JsonRpcProvider, ethers } from "ethers";
import {
  ADDRESS_STATUS_GETTER_CANDIDATES,
  COMMON_BSC,
  DEFAULT_RPC_URL,
  ERC20_ABI,
  FACTORY_ABI,
  KNOWN_SELECTORS,
  PAIR_ABI,
  READABLE_GETTER_CANDIDATES,
  ROUTER_ABI
} from "./constants";
import type { DiscoveryItem, DiscoveryState, PairDiscovery, ReadableConfigEntry, SelectorDiscovery } from "./types";

const ZERO_ADDRESS = ethers.ZeroAddress;

export function getRpcUrl(): string {
  return (import.meta.env.VITE_BSC_RPC_URL as string | undefined) || DEFAULT_RPC_URL;
}

export function getRpcUrlLabel(): string {
  return import.meta.env.VITE_BSC_RPC_URL ? "VITE_BSC_RPC_URL" : "public BSC RPC";
}

export function createProvider(rpcUrl = getRpcUrl()): JsonRpcProvider {
  return new JsonRpcProvider(rpcUrl, undefined, { staticNetwork: false });
}

export function validateAddress(address: string): { ok: boolean; checksum?: string; error?: string } {
  try {
    const checksum = ethers.getAddress(address.trim());
    return { ok: true, checksum };
  } catch {
    return { ok: false, error: "Invalid EVM address" };
  }
}

function formatValue(value: unknown): string {
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "boolean") return String(value);
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(formatValue).join(", ");
  if (value === null || value === undefined) return "";
  return String(value);
}

async function optionalCall<T>(fn: () => Promise<T>, errors: string[], label: string): Promise<T | undefined> {
  try {
    return await fn();
  } catch (error) {
    errors.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
    return undefined;
  }
}

export async function discoverToken(targetTokenAddress: string, provider = createProvider()): Promise<DiscoveryState> {
  const discoveryErrors: string[] = [];
  const address = ethers.getAddress(targetTokenAddress);
  const token = new Contract(address, ERC20_ABI, provider);

  const [code, name, symbol, decimals, totalSupply, owner] = await Promise.all([
    optionalCall(() => provider.getCode(address), discoveryErrors, "getCode"),
    optionalCall(() => token.name(), discoveryErrors, "name()"),
    optionalCall(() => token.symbol(), discoveryErrors, "symbol()"),
    optionalCall(() => token.decimals(), discoveryErrors, "decimals()"),
    optionalCall(() => token.totalSupply(), discoveryErrors, "totalSupply()"),
    optionalCall(() => token.owner(), discoveryErrors, "owner()")
  ]);

  const [routers, factories, quoteTokens] = await discoverInfrastructure(provider, discoveryErrors);
  const factory = factories[0]?.value ?? COMMON_BSC.pancakeV2Factory;
  const pairs = await discoverPairs(provider, address, factory, quoteTokens, discoveryErrors);
  const readableConfig = await discoverReadableConfig(provider, address, [
    ...routers.map((item) => item.value),
    ...pairs.map((pair) => pair.address)
  ]);
  const functionSelectors = discoverSelectors(code ?? "0x");

  return {
    token: {
      address,
      name: formatValue(name),
      symbol: formatValue(symbol),
      decimals: typeof decimals === "bigint" ? Number(decimals) : typeof decimals === "number" ? decimals : undefined,
      totalSupply: formatValue(totalSupply),
      owner: typeof owner === "string" ? owner : undefined,
      codeSize: code && code !== "0x" ? (code.length - 2) / 2 : 0,
      contractStatus: code && code !== "0x" ? "contract" : "not-contract"
    },
    routers,
    factories,
    quoteTokens,
    pairs,
    readableConfig,
    functionSelectors,
    discoveryErrors
  };
}

async function discoverInfrastructure(
  provider: JsonRpcProvider,
  errors: string[]
): Promise<[DiscoveryItem<string>[], DiscoveryItem<string>[], DiscoveryItem<string>[]]> {
  const router = new Contract(COMMON_BSC.pancakeV2Router, ROUTER_ABI, provider);
  const factoryFromRouter = await optionalCall(() => router.factory(), errors, "router.factory()");
  const wbnbFromRouter = await optionalCall(() => router.WETH(), errors, "router.WETH()");

  const routers: DiscoveryItem<string>[] = [
    {
      label: "PancakeSwap V2 Router",
      value: COMMON_BSC.pancakeV2Router,
      confidence: factoryFromRouter ? "high" : "medium",
      source: "common BSC infrastructure"
    }
  ];

  const factories: DiscoveryItem<string>[] = [
    {
      label: "PancakeSwap V2 Factory",
      value: factoryFromRouter ? ethers.getAddress(factoryFromRouter) : COMMON_BSC.pancakeV2Factory,
      confidence: factoryFromRouter ? "high" : "medium",
      source: factoryFromRouter ? "router.factory()" : "common BSC infrastructure"
    }
  ];

  const quoteTokens: DiscoveryItem<string>[] = [
    {
      label: "WBNB",
      value: wbnbFromRouter ? ethers.getAddress(wbnbFromRouter) : COMMON_BSC.wbnb,
      confidence: wbnbFromRouter ? "high" : "medium",
      source: wbnbFromRouter ? "router.WETH()" : "common BSC infrastructure"
    },
    { label: "USDT", value: COMMON_BSC.usdt, confidence: "high", source: "common BSC quote token" },
    { label: "BUSD", value: COMMON_BSC.busd, confidence: "medium", source: "common BSC quote token" },
    { label: "USDC", value: COMMON_BSC.usdc, confidence: "medium", source: "common BSC quote token" }
  ];

  return [routers, factories, quoteTokens];
}

async function discoverPairs(
  provider: JsonRpcProvider,
  tokenAddress: string,
  factoryAddress: string,
  quoteTokens: DiscoveryItem<string>[],
  errors: string[]
): Promise<PairDiscovery[]> {
  const factory = new Contract(factoryAddress, FACTORY_ABI, provider);
  const pairs = await Promise.all(
    quoteTokens.map(async (quote) => {
      const pairAddress = await optionalCall(
        () => factory.getPair(tokenAddress, quote.value),
        errors,
        `factory.getPair(${quote.label})`
      );

      if (!pairAddress || pairAddress === ZERO_ADDRESS) return undefined;

      return hydratePair(provider, tokenAddress, ethers.getAddress(pairAddress), quote);
    })
  );

  return pairs.filter((pair): pair is PairDiscovery => Boolean(pair));
}

async function hydratePair(
  provider: JsonRpcProvider,
  tokenAddress: string,
  pairAddress: string,
  quote: DiscoveryItem<string>
): Promise<PairDiscovery> {
  const pair = new Contract(pairAddress, PAIR_ABI, provider);
  try {
    const [token0Raw, token1Raw, reserves, lpTotalSupply] = await Promise.all([
      pair.token0(),
      pair.token1(),
      pair.getReserves(),
      pair.totalSupply()
    ]);
    const token0 = ethers.getAddress(token0Raw);
    const token1 = ethers.getAddress(token1Raw);
    const reserve0 = BigInt(reserves[0]).toString();
    const reserve1 = BigInt(reserves[1]).toString();
    const tokenIs0 = token0.toLowerCase() === tokenAddress.toLowerCase();

    return {
      address: pairAddress,
      quoteToken: quote.value,
      quoteSymbol: quote.label,
      token0,
      token1,
      reserve0,
      reserve1,
      tokenReserve: tokenIs0 ? reserve0 : reserve1,
      quoteReserve: tokenIs0 ? reserve1 : reserve0,
      lpTotalSupply: BigInt(lpTotalSupply).toString(),
      confidence: quote.label === "WBNB" ? "high" : "medium",
      source: `factory.getPair(token, ${quote.label})`
    };
  } catch (error) {
    return {
      address: pairAddress,
      quoteToken: quote.value,
      quoteSymbol: quote.label,
      confidence: "low",
      source: `factory.getPair(token, ${quote.label}); reserve read failed: ${
        error instanceof Error ? error.message : String(error)
      }`
    };
  }
}

export function discoverSelectors(bytecode: string): SelectorDiscovery[] {
  const present = new Set<string>();
  const matches = bytecode.matchAll(/63([0-9a-fA-F]{8})/g);
  for (const match of matches) {
    present.add(`0x${match[1].toLowerCase()}`);
  }

  const all = new Set([...Object.keys(KNOWN_SELECTORS), ...present]);
  return [...all]
    .sort()
    .map((selector) => ({
      selector,
      guessedSignature: KNOWN_SELECTORS[selector]?.signature ?? "unknown()",
      classification: KNOWN_SELECTORS[selector]?.classification ?? "unknown dangerous function",
      presentInBytecode: present.has(selector)
    }));
}

async function discoverReadableConfig(
  provider: JsonRpcProvider,
  tokenAddress: string,
  addressesToCheck: string[]
): Promise<Record<string, ReadableConfigEntry>> {
  const entries: Record<string, ReadableConfigEntry> = {};

  for (const signature of READABLE_GETTER_CANDIDATES) {
    const iface = new Interface([signature]);
    const fragment = iface.fragments[0] as FunctionFragment;
    const name = fragment.name;
    try {
      const contract = new Contract(tokenAddress, [signature], provider);
      const value = await contract.getFunction(name).staticCall();
      entries[name] = { name, signature, value: formatValue(value), confidence: "medium" };
    } catch {
      // Closed-source tokens vary widely; failed getter guesses are expected.
    }
  }

  const uniqueAddresses = [...new Set(addressesToCheck.filter(Boolean).map((address) => ethers.getAddress(address)))];
  for (const signature of ADDRESS_STATUS_GETTER_CANDIDATES) {
    const iface = new Interface([signature]);
    const fragment = iface.fragments[0] as FunctionFragment;
    const name = fragment.name;
    const contract = new Contract(tokenAddress, [signature], provider);

    for (const address of uniqueAddresses) {
      try {
        const value = await contract.getFunction(name).staticCall(address);
        entries[`${name}(${address})`] = {
          name: `${name}(${address})`,
          signature,
          value: formatValue(value),
          confidence: "low"
        };
      } catch {
        // Keep status getter guesses quiet unless one succeeds.
      }
    }
  }

  return entries;
}
