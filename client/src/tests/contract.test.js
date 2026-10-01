import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { validateBallotDomain, describeVoteError } from "../lib/contract";

const address = "0x1111111111111111111111111111111111111111";
const domain = { name: "JanChain Voting", version: "2", chainId: 31337, verifyingContract: address };
beforeEach(() => {
  vi.stubEnv("VITE_CHAIN_ID", "31337");
  vi.stubEnv("VITE_CONTRACT_ADDRESS", address);
});
afterEach(() => vi.unstubAllEnvs());

describe("ballot signing trust boundary", () => {
  it("accepts the configured voting domain", () => expect(() => validateBallotDomain(domain)).not.toThrow());
  it.each([
    { chainId: 1 }, { verifyingContract: "0x2222222222222222222222222222222222222222" },
    { name: "Other app" }, { version: "1" },
  ])("rejects a substituted domain: %j", (change) => {
    expect(() => validateBallotDomain({ ...domain, ...change })).toThrow(/does not match/);
  });
  it("rejects missing configuration", () => {
    vi.stubEnv("VITE_CONTRACT_ADDRESS", "");
    expect(() => validateBallotDomain(domain)).toThrow();
  });
  it("explains wallet cancellation", () => expect(describeVoteError({ code: 4001 })).toMatch(/cancelled/));
});
