import { ethers } from "ethers";

export interface TestingWallet {
  address: string;
  wallet?: ethers.HDNodeWallet;
  alternateActors: string[];
  persisted: boolean;
  locked: boolean;
}

export interface PersistedWalletRecord {
  address: string;
  alternateActors: string[];
  encryptedJson: string;
  savedAt: string;
}

const WALLET_STORAGE_KEY = "contract-insight-toolkit.wallet.v1";

export function createTestingWallet(): TestingWallet {
  const wallet = ethers.Wallet.createRandom();
  const testingWallet = {
    address: normalizeEvmAddress(wallet.address),
    wallet,
    alternateActors: [normalizeEvmAddress(ethers.Wallet.createRandom().address), normalizeEvmAddress(ethers.Wallet.createRandom().address)],
    persisted: false,
    locked: false
  };

  assertValidTestingWallet(testingWallet);
  return testingWallet;
}

export function loadPersistedWallet(): TestingWallet | undefined {
  const record = loadPersistedWalletRecord();
  if (!record) return undefined;
  return {
    address: normalizeEvmAddress(record.address),
    alternateActors: record.alternateActors.map(normalizeEvmAddress),
    persisted: true,
    locked: true
  };
}

export function loadPersistedWalletRecord(): PersistedWalletRecord | undefined {
  const raw = localStorage.getItem(WALLET_STORAGE_KEY);
  if (!raw) return undefined;

  try {
    const parsed = JSON.parse(raw) as PersistedWalletRecord;
    const normalized: PersistedWalletRecord = {
      ...parsed,
      address: normalizeEvmAddress(parsed.address),
      alternateActors: parsed.alternateActors.map(normalizeEvmAddress)
    };
    assertValidTestingWallet({ address: normalized.address, alternateActors: normalized.alternateActors });
    if (!parsed.encryptedJson || typeof parsed.encryptedJson !== "string") return undefined;
    if (JSON.stringify(parsed) !== JSON.stringify(normalized)) {
      localStorage.setItem(WALLET_STORAGE_KEY, JSON.stringify(normalized));
    }
    return normalized;
  } catch {
    localStorage.removeItem(WALLET_STORAGE_KEY);
    return undefined;
  }
}

export async function saveTestingWallet(testingWallet: TestingWallet, password: string): Promise<TestingWallet> {
  if (!testingWallet.wallet) {
    throw new Error("Wallet must be unlocked before it can be saved.");
  }
  if (password.length < 12) {
    throw new Error("Use a wallet password of at least 12 characters.");
  }

  const encryptedJson = await testingWallet.wallet.encrypt(password);
  const record: PersistedWalletRecord = {
    address: normalizeEvmAddress(testingWallet.address),
    alternateActors: testingWallet.alternateActors.map(normalizeEvmAddress),
    encryptedJson,
    savedAt: new Date().toISOString()
  };
  assertValidTestingWallet(record);
  localStorage.setItem(WALLET_STORAGE_KEY, JSON.stringify(record));

  return {
    ...testingWallet,
    address: record.address,
    alternateActors: record.alternateActors,
    persisted: true,
    locked: false
  };
}

export async function unlockPersistedWallet(password: string): Promise<TestingWallet> {
  const record = loadPersistedWalletRecord();
  if (!record) {
    throw new Error("No saved wallet was found.");
  }
  const wallet = (await ethers.Wallet.fromEncryptedJson(record.encryptedJson, password)) as ethers.HDNodeWallet;
  if (normalizeEvmAddress(wallet.address) !== normalizeEvmAddress(record.address)) {
    throw new Error("Encrypted wallet address does not match the saved funding address.");
  }

  return {
    address: record.address,
    wallet,
    alternateActors: record.alternateActors,
    persisted: true,
    locked: false
  };
}

export function forgetPersistedWallet(): void {
  localStorage.removeItem(WALLET_STORAGE_KEY);
}

export async function getNativeBalance(provider: ethers.Provider, address: string): Promise<string> {
  checksumAddress(address);
  return ethers.formatEther(await provider.getBalance(address));
}

export function checksumAddress(address: string): string {
  return ethers.getAddress(address);
}

export function normalizeEvmAddress(address: string): string {
  return checksumAddress(address).toLowerCase();
}

export function isPlainEvmAddress(address: string): boolean {
  return /^0x[a-f0-9]{40}$/.test(address);
}

export function isValidAddress(address: string): boolean {
  try {
    checksumAddress(address);
    return true;
  } catch {
    return false;
  }
}

export function assertValidTestingWallet(testingWallet: Pick<TestingWallet, "address" | "alternateActors">): void {
  for (const address of [testingWallet.address, ...testingWallet.alternateActors]) {
    if (!isValidAddress(address)) {
      throw new Error(`Generated invalid EVM address: ${address}`);
    }
  }
}
