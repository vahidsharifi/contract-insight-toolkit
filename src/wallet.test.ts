import { describe, expect, it } from "vitest";
import {
  assertValidTestingWallet,
  checksumAddress,
  createTestingWallet,
  isPlainEvmAddress,
  isValidAddress,
  normalizeEvmAddress
} from "./wallet";

describe("wallet generation", () => {
  it("generates plain lowercase EVM addresses for the funding wallet and actors", () => {
    const testingWallet = createTestingWallet();
    const allAddresses = [testingWallet.address, ...testingWallet.alternateActors];

    expect(normalizeEvmAddress(testingWallet.wallet?.address ?? "")).toBe(testingWallet.address);
    expect(testingWallet.persisted).toBe(false);
    expect(testingWallet.locked).toBe(false);
    expect(allAddresses).toHaveLength(3);
    for (const address of allAddresses) {
      expect(isValidAddress(address)).toBe(true);
      expect(isPlainEvmAddress(address)).toBe(true);
      expect(address).toBe(address.trim());
      expect(address).toBe(address.toLowerCase());
      expect(checksumAddress(address).toLowerCase()).toBe(address);
    }
  });

  it("rejects invalid generated wallet records", () => {
    expect(() =>
      assertValidTestingWallet({
        address: "0xnot-valid",
        alternateActors: [createTestingWallet().address]
      })
    ).toThrow(/invalid EVM address/i);
  });
});
