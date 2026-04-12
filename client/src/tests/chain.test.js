import { afterEach, describe, expect, it, vi } from "vitest";
import { getExpectedChainConfig, isExpectedChain } from "../lib/chain";

describe("chain helpers", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("builds the expected chain config from env", () => {
    vi.stubEnv("VITE_CHAIN_ID", "31337");
    vi.stubEnv("VITE_CHAIN_NAME", "Hardhat Local");
    vi.stubEnv("VITE_RPC_URL", "http://127.0.0.1:8545");
    vi.stubEnv("VITE_BLOCK_EXPLORER_URL", "");

    const config = getExpectedChainConfig();

    expect(config.chainId).toBe(31337);
    expect(config.hexChainId).toBe("0x7a69");
    expect(config.chainName).toBe("Hardhat Local");
    expect(config.rpcUrls).toEqual(["http://127.0.0.1:8545"]);
  });

  it("checks whether the current chain is the expected one", () => {
    vi.stubEnv("VITE_CHAIN_ID", "31337");

    expect(isExpectedChain("0x7A69")).toBe(true);
    expect(isExpectedChain("0x1")).toBe(false);
  });
});
