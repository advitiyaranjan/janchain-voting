import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ChainPage from "../pages/ChainPage";
import { castVote, readElectionPage, readWalletEligibility } from "../lib/contract";

vi.mock("../hooks/useWallet", () => ({ useWallet: () => ({
  walletAddress: "0x1111111111111111111111111111111111111111", chainId: "0x7a69", isExpectedNetwork: true,
  hasWallet: true, expectedChain: { chainName: "Test chain" }, ensureExpectedNetwork: async () => {},
}) }));
vi.mock("../lib/contract", () => ({
  castVote: vi.fn(), readElectionPage: vi.fn(), readWalletEligibility: vi.fn(), describeVoteError: (error) => error.message,
}));
const data = { count: 1, paused: false, blockNumber: 7, elections: [{
  id: 1, title: "Community ballot", description: "Choose a representative", status: "active", restricted: false,
  startTime: 1700000000000, endTime: 1800000000000, totalVotes: 0, candidates: [{ candidateId: 1, name: "Alice", voteCount: 0 }],
}] };
beforeEach(() => {
  vi.clearAllMocks();
  readElectionPage.mockResolvedValue(data);
  readWalletEligibility.mockResolvedValue({ hasVoted: false, eligible: true });
  castVote.mockResolvedValue({ transactionHash: "0xreceipt", blockNumber: 8 });
});

describe("Direct on-chain voting", () => {
  it("requires review before submitting and shows a confirmed receipt without an account", async () => {
    render(<MemoryRouter><ChainPage /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("radio"));
    expect(castVote).not.toHaveBeenCalled();
    expect(screen.getByRole("region", { name: "Review ballot" })).toHaveTextContent("Alice");
    fireEvent.click(screen.getByRole("button", { name: "Confirm and vote on-chain" }));
    expect(await screen.findByText("Confirmed ballot receipt")).toBeInTheDocument();
    expect(castVote).toHaveBeenCalledWith(1, 1, "0x1111111111111111111111111111111111111111");
    expect(screen.getByText(/Transaction: 0xreceipt/)).toBeInTheDocument();
  });
  it("disables ballot selection when the contract is paused", async () => {
    readElectionPage.mockResolvedValue({ ...data, paused: true });
    render(<MemoryRouter><ChainPage /></MemoryRouter>);
    expect(await screen.findByRole("radio")).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent("paused on-chain");
  });
});
