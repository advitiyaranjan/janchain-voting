const { ethers } = require("ethers");
const contractArtifact = require("../blockchain/DecentralizedVoting.json");
const env = require("../config/env");
const ApiError = require("../utils/ApiError");

function normalizeAddress(address) {
  return address.toLowerCase();
}

function isConfigured() {
  return Boolean(env.contractAddress && contractArtifact.abi.length > 0);
}

function getSystemStatus() {
  return getSystemStatusInternal();
}

function getProvider() {
  return new ethers.JsonRpcProvider(env.rpcUrl, env.chainId);
}

function getContract(readOnly = true) {
  if (!isConfigured()) {
    throw new ApiError(
      500,
      "Blockchain integration is not configured. Compile, deploy, and sync the ABI first."
    );
  }

  const provider = getProvider();

  if (readOnly) {
    return new ethers.Contract(env.contractAddress, contractArtifact.abi, provider);
  }

  if (!env.serverWalletPrivateKey) {
    throw new ApiError(500, "SERVER_WALLET_PRIVATE_KEY is required for admin blockchain actions.");
  }

  const signer = new ethers.Wallet(env.serverWalletPrivateKey, provider);
  return new ethers.Contract(env.contractAddress, contractArtifact.abi, signer);
}

function parseElectionStruct(election) {
  return {
    electionId: Number(election.electionId),
    title: election.title,
    description: election.description,
    metadataURI: election.metadataURI,
    startTime: Number(election.startTime),
    endTime: Number(election.endTime),
    candidateCount: Number(election.candidateCount),
    totalVotes: Number(election.totalVotes),
    manuallyEnded: election.manuallyEnded,
    isActive: election.isActive,
    hasEnded: election.hasEnded,
  };
}

function parseCandidateStruct(candidate) {
  return {
    candidateId: Number(candidate.candidateId),
    name: candidate.name,
    imageURI: candidate.imageURI,
    voteCount: Number(candidate.voteCount),
  };
}

async function getSystemStatusInternal() {
  const status = {
    configured: isConfigured(),
    chainId: env.chainId,
    contractAddress: env.contractAddress || "",
    rpcUrl: env.rpcUrl,
    hasServerWallet: Boolean(env.serverWalletPrivateKey),
    onChainElectionCount: null,
  };

  if (!status.configured) {
    return status;
  }

  const contract = getContract(true);
  status.onChainElectionCount = Number(await contract.electionCount());
  return status;
}

async function createElection({ title, description, startTime, endTime, metadataURI, candidates }) {
  const contract = getContract(false);
  const candidateNames = candidates.map((candidate) => candidate.name);
  const candidateImageURIs = candidates.map((candidate) => candidate.imageURI || "");

  const tx = await contract.createElection(
    title,
    description,
    BigInt(Math.floor(new Date(startTime).getTime() / 1000)),
    BigInt(Math.floor(new Date(endTime).getTime() / 1000)),
    metadataURI,
    candidateNames,
    candidateImageURIs
  );

  const receipt = await tx.wait();
  const createdEvent = receipt.logs
    .map((log) => {
      try {
        return contract.interface.parseLog(log);
      } catch (_error) {
        return null;
      }
    })
    .find((parsed) => parsed && parsed.name === "ElectionCreated");

  return {
    transactionHash: tx.hash,
    electionId: createdEvent ? Number(createdEvent.args.electionId) : null,
  };
}

async function approveVoter(walletAddress, approved) {
  const contract = getContract(false);
  const tx = await contract.approveVoter(walletAddress, approved);
  await tx.wait();

  return {
    transactionHash: tx.hash,
  };
}

async function approveVoters(walletAddresses, approved) {
  const contract = getContract(false);
  const normalizedWallets = walletAddresses.map(normalizeAddress);
  const tx = await contract.approveVoters(normalizedWallets, approved);
  await tx.wait();

  return {
    transactionHash: tx.hash,
    count: normalizedWallets.length,
  };
}

async function getVoterApprovalStatus(walletAddress) {
  const contract = getContract(true);
  return contract.approvedVoters(normalizeAddress(walletAddress));
}

async function endElection(electionId) {
  const contract = getContract(false);
  const tx = await contract.endElection(BigInt(electionId));
  await tx.wait();

  return {
    transactionHash: tx.hash,
  };
}

async function getElectionSnapshot(electionId) {
  const contract = getContract(true);
  const [election, candidates] = await Promise.all([
    contract.getElection(BigInt(electionId)),
    contract.getElectionCandidates(BigInt(electionId)),
  ]);

  return {
    ...parseElectionStruct(election),
    candidates: candidates.map(parseCandidateStruct),
  };
}

async function safeGetElectionSnapshot(electionId) {
  try {
    return await getElectionSnapshot(electionId);
  } catch (_error) {
    return null;
  }
}

async function getVoteVerification(electionId, walletAddress) {
  const contract = getContract(true);
  const [voted, candidateId] = await contract.getVoteReceipt(
    BigInt(electionId),
    normalizeAddress(walletAddress)
  );

  if (!voted) {
    return {
      hasVoted: false,
      candidateId: null,
      transactionHash: null,
      blockNumber: null,
    };
  }

  const filter = contract.filters.VoteCast(BigInt(electionId), null, normalizeAddress(walletAddress));
  const events = await contract.queryFilter(filter, 0, "latest");
  const event = events[0];

  return {
    hasVoted: true,
    candidateId: Number(candidateId),
    transactionHash: event ? event.transactionHash : null,
    blockNumber: event ? Number(event.blockNumber) : null,
  };
}

module.exports = {
  approveVoter,
  approveVoters,
  createElection,
  endElection,
  getSystemStatus,
  getElectionSnapshot,
  getVoterApprovalStatus,
  getVoteVerification,
  isConfigured,
  safeGetElectionSnapshot,
};
