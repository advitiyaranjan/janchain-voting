import { BrowserProvider, Contract } from "ethers";
import artifact from "../blockchain/DecentralizedVoting.json";

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

async function getSigner() {
  if (!window.ethereum) {
    throw new Error("MetaMask is required to cast a vote.");
  }

  const provider = new BrowserProvider(window.ethereum);
  return provider.getSigner();
}

export async function getVotingContract() {
  const contractAddress = import.meta.env.VITE_CONTRACT_ADDRESS;
  if (!contractAddress) {
    throw new Error("VITE_CONTRACT_ADDRESS is missing.");
  }

  return new Contract(contractAddress, artifact.abi, await getSigner());
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

export async function castVote(onChainElectionId, candidateId) {
  const contract = await getVotingContract();
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
  const signer = await getSigner();
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
