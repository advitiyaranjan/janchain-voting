import { BrowserProvider, Contract, JsonRpcProvider, getAddress } from "ethers";
import artifact from "../blockchain/DecentralizedVoting.json";
import { getExpectedChainConfig } from "./chain";

// How long a signed gasless ballot stays valid before the relayer must submit it.
const BALLOT_TTL_SECONDS = 10 * 60;

const BALLOT_TYPES = {
  Ballot: [
    { name: "electionId", type: "uint256" },
    { name: "candidateId", type: "uint256" },
    { name: "voter", type: "address" },
    { name: "deadline", type: "uint256" },
  ],
};

const friendlyContractErrors = {
  AlreadyVoted: "This wallet has already voted in this election.",
  ElectionClosed: "This election has closed.",
  ElectionNotActive: "This election has not started yet.",
  EnforcedPause: "Voting is temporarily paused by the election commission.",
  InvalidCandidate: "That candidate is not part of this election.",
  VoterNotApproved: "This wallet is not on the approved voter registry for this election.",
};

export function validateBallotDomain(domain) {
  const expected = getExpectedChainConfig();
  if (!domain || domain.name !== "JanChain Voting" || domain.version !== "2" ||
    Number(domain.chainId) !== expected.chainId ||
    getAddress(domain.verifyingContract) !== getAddress(import.meta.env.VITE_CONTRACT_ADDRESS)) {
    throw new Error("The election contract or network does not match this application. Voting is blocked.");
  }
}

async function getSigner(expectedVoter) {
  if (!window.ethereum) {
    throw new Error("MetaMask is required to cast a vote.");
  }

  const provider = new BrowserProvider(window.ethereum);
  const network = await provider.getNetwork();
  if (Number(network.chainId) !== getExpectedChainConfig().chainId) {
    throw new Error("Switch to the voting network before continuing.");
  }
  const signer = await provider.getSigner();
  if (expectedVoter && getAddress(await signer.getAddress()) !== getAddress(expectedVoter)) {
    throw new Error("Your wallet account changed. Reconnect the wallet you selected before voting.");
  }
  return signer;
}

export async function getVotingContract(expectedVoter) {
  const contractAddress = import.meta.env.VITE_CONTRACT_ADDRESS;
  if (!contractAddress) {
    throw new Error("VITE_CONTRACT_ADDRESS is missing.");
  }

  const signer = await getSigner(expectedVoter);
  if (await signer.provider.getCode(contractAddress) === "0x") {
    throw new Error("No voting contract was found on this network.");
  }
  return new Contract(contractAddress, artifact.abi, signer);
}

export async function getReadContract() {
  const chain = getExpectedChainConfig();
  const address = import.meta.env.VITE_CONTRACT_ADDRESS;
  if (!address || !chain.rpcUrls[0]) throw new Error("Set the voting contract and RPC URL to browse on-chain elections.");
  const provider = new JsonRpcProvider(chain.rpcUrls[0]);
  const network = await provider.getNetwork();
  if (Number(network.chainId) !== chain.chainId) throw new Error("The RPC endpoint is connected to the wrong network.");
  if (await provider.getCode(address) === "0x") throw new Error("No voting contract was found. Check the deployment address.");
  return new Contract(address, artifact.abi, provider);
}

export async function readElectionPage(offset = 0, limit = 12) {
  const contract = await getReadContract();
  const [rows, count, paused, blockNumber] = await Promise.all([
    contract.getElections(offset, limit), contract.electionCount(), contract.paused(), contract.runner.getBlockNumber(),
  ]);
  const elections = await Promise.all(rows.map(async (row) => ({
    id: Number(row.electionId), title: row.title, description: row.description,
    startTime: Number(row.startTime) * 1000, endTime: Number(row.endTime) * 1000,
    status: row.hasEnded ? "ended" : row.isActive ? "active" : "scheduled",
    restricted: row.restricted, totalVotes: Number(row.totalVotes),
    candidates: (await contract.getElectionCandidates(row.electionId)).map((candidate) => ({
      candidateId: Number(candidate.candidateId), name: candidate.name, voteCount: Number(candidate.voteCount),
    })),
  })));
  return { elections, count: Number(count), paused, blockNumber };
}

export async function readWalletEligibility(electionId, voter) {
  const contract = await getReadContract();
  const [receipt, eligible] = await Promise.all([contract.getVoteReceipt(electionId, voter), contract.canVote(electionId, voter)]);
  return { hasVoted: receipt[0], candidateId: Number(receipt[1]), eligible };
}

/**
 * Turns wallet and contract errors into a sentence a voter can act on.
 */
export function describeVoteError(error) {
  if (error?.code === "ACTION_REJECTED" || error?.code === 4001) {
    return "You cancelled the request in MetaMask.";
  }

  const errorName = error?.revert?.name;
  if (errorName && friendlyContractErrors[errorName]) {
    return friendlyContractErrors[errorName];
  }

  return error?.response?.data?.message || error?.shortMessage || error?.message || "Voting failed.";
}

export async function castVote(onChainElectionId, candidateId, expectedVoter) {
  const contract = await getVotingContract(expectedVoter);
  if (!await contract.canVote(BigInt(onChainElectionId), await contract.runner.getAddress())) {
    throw new Error("This wallet cannot vote now. Check approval, election dates, pause status, and your receipt.");
  }
  const tx = await contract.castVote(BigInt(onChainElectionId), BigInt(candidateId));
  const receipt = await tx.wait();

  return {
    transactionHash: tx.hash,
    blockNumber: receipt?.blockNumber ?? null,
  };
}

/**
 * Signs an EIP-712 ballot for gasless voting. The signature binds the election, candidate
 * and voter, so whoever relays it cannot change the choice.
 */
export async function signBallot(domain, { onChainElectionId, candidateId, voterAddress }) {
  validateBallotDomain(domain);
  const signer = await getSigner(voterAddress);
  const deadline = Math.floor(Date.now() / 1000) + BALLOT_TTL_SECONDS;
  const ballot = {
    electionId: BigInt(onChainElectionId),
    candidateId: BigInt(candidateId),
    voter: voterAddress,
    deadline: BigInt(deadline),
  };

  const signature = await signer.signTypedData(domain, BALLOT_TYPES, ballot);
  return { signature, deadline };
}
