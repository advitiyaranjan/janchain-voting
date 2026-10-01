const { ethers } = require("ethers");
const contractArtifact = require("../blockchain/DecentralizedVoting.json");
const env = require("../config/env");
const ApiError = require("../utils/ApiError");

const EIP712_DOMAIN_NAME = "JanChain Voting";
const EIP712_DOMAIN_VERSION = "2";

const friendlyContractErrors = {
  AlreadyVoted: "This wallet has already voted in this election.",
  ElectionClosed: "This election has closed.",
  ElectionNotActive: "This election has not started yet.",
  ElectionNotFound: "This election does not exist on-chain.",
  EnforcedPause: "Voting is temporarily paused by the election commission.",
  ExpectedPause: "Voting is not paused.",
  InvalidCandidate: "That candidate is not part of this election.",
  InvalidSignature: "The ballot signature does not match the voter wallet.",
  InvalidTimeRange: "The election time range is invalid. Start must be in the future and end after start.",
  SignatureExpired: "This signed ballot has expired. Please sign again.",
  VoterNotApproved: "This wallet is not on the approved voter registry for this election.",
  AccessControlUnauthorizedAccount: "The server wallet is missing the contract role required for this action.",
};

let cachedProvider = null;
let cachedReadContract = null;
let cachedWriteContract = null;

function normalizeAddress(address) {
  return address.toLowerCase();
}

function toUnixSeconds(value) {
  return BigInt(Math.floor(new Date(value).getTime() / 1000));
}

function isConfigured() {
  return Boolean(env.contractAddress && contractArtifact.abi.length > 0);
}

function getProvider() {
  if (!cachedProvider) {
    // A cached pending nonce can be reused even after a queued transaction mines.
    cachedProvider = new ethers.JsonRpcProvider(env.rpcUrl, env.chainId, { cacheTimeout: -1 });
  }
  return cachedProvider;
}

function getContract(readOnly = true) {
  if (!isConfigured()) {
    throw new ApiError(
      500,
      "Blockchain integration is not configured. Compile, deploy, and sync the ABI first."
    );
  }

  if (readOnly) {
    if (!cachedReadContract) {
      cachedReadContract = new ethers.Contract(env.contractAddress, contractArtifact.abi, getProvider());
    }
    return cachedReadContract;
  }

  if (!env.serverWalletPrivateKey) {
    throw new ApiError(500, "SERVER_WALLET_PRIVATE_KEY is required for admin blockchain actions.");
  }

  if (!cachedWriteContract) {
    const signer = new ethers.Wallet(env.serverWalletPrivateKey, getProvider());
    cachedWriteContract = new ethers.Contract(env.contractAddress, contractArtifact.abi, signer);
  }
  return cachedWriteContract;
}

let writeQueue = Promise.resolve();

/**
 * Serializes transaction submission from the server wallet so concurrent requests
 * (e.g. several relayed votes) never race for the same nonce. The lock is held only
 * until the transaction is broadcast; mining is awaited outside it.
 */
async function sendTransaction(buildTx) {
  const submission = writeQueue.then(() => buildTx(getContract(false)));
  writeQueue = submission.catch(() => {});
  const tx = await submission;
  const receipt = await tx.wait();
  return { tx, receipt };
}

/**
 * Turns an ethers/contract error into an ApiError with a human sentence.
 */
function toApiError(error, fallbackStatus = 400) {
  if (error instanceof ApiError) {
    return error;
  }

  let errorName = error?.revert?.name;
  if (!errorName && error?.data) {
    try {
      errorName = getContract(true).interface.parseError(error.data)?.name;
    } catch (_parseError) {
      errorName = null;
    }
  }

  if (errorName && friendlyContractErrors[errorName]) {
    return new ApiError(fallbackStatus, friendlyContractErrors[errorName], { contractError: errorName });
  }

  if (error?.code === "ECONNREFUSED" || /ECONNREFUSED|could not detect network/i.test(error?.message || "")) {
    return new ApiError(503, "The blockchain node is unreachable. Check RPC_URL and that the node is running.");
  }

  return new ApiError(fallbackStatus, error?.shortMessage || error?.message || "Blockchain request failed.");
}

async function withContractErrors(action, fallbackStatus) {
  try {
    return await action();
  } catch (error) {
    throw toApiError(error, fallbackStatus);
  }
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
    restricted: election.restricted,
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

function getBallotDomain() {
  return {
    name: EIP712_DOMAIN_NAME,
    version: EIP712_DOMAIN_VERSION,
    chainId: env.chainId,
    verifyingContract: env.contractAddress,
  };
}

async function getSystemStatus() {
  const status = {
    configured: isConfigured(),
    chainId: env.chainId,
    contractAddress: env.contractAddress || "",
    rpcUrl: env.rpcUrl,
    hasServerWallet: Boolean(env.serverWalletPrivateKey),
    serverWalletAddress: env.serverWalletPrivateKey ? new ethers.Wallet(env.serverWalletPrivateKey).address : "",
    onChainElectionCount: null,
    approvedVoterCount: null,
    paused: null,
    blockNumber: null,
    relayerBalance: null,
  };

  if (!status.configured) {
    return status;
  }

  const contract = getContract(true);
  const provider = getProvider();
  const [electionCount, approvedVoterCount, paused, blockNumber, relayerBalance] = await Promise.all([
    contract.electionCount(),
    contract.approvedVoterCount(),
    contract.paused(),
    provider.getBlockNumber(),
    status.serverWalletAddress ? provider.getBalance(status.serverWalletAddress) : Promise.resolve(null),
  ]);

  status.onChainElectionCount = Number(electionCount);
  status.approvedVoterCount = Number(approvedVoterCount);
  status.paused = paused;
  status.blockNumber = blockNumber;
  status.relayerBalance = relayerBalance === null ? null : ethers.formatEther(relayerBalance);
  return status;
}

async function createElection({ title, description, startTime, endTime, metadataURI, candidates, restricted }) {
  return withContractErrors(async () => {
    const candidateNames = candidates.map((candidate) => candidate.name);
    const candidateImageURIs = candidates.map((candidate) => candidate.imageURI || "");

    const { tx, receipt } = await sendTransaction((contract) =>
      contract.createElection(
        title,
        description,
        toUnixSeconds(startTime),
        toUnixSeconds(endTime),
        metadataURI,
        candidateNames,
        candidateImageURIs,
        restricted
      )
    );

    const contract = getContract(false);
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
  });
}

async function approveVoter(walletAddress, approved) {
  return withContractErrors(async () => {
    const { tx } = await sendTransaction((contract) =>
      contract.approveVoter(normalizeAddress(walletAddress), approved)
    );

    return {
      transactionHash: tx.hash,
    };
  });
}

async function approveVoters(walletAddresses, approved) {
  return withContractErrors(async () => {
    const normalizedWallets = walletAddresses.map(normalizeAddress);
    const { tx } = await sendTransaction((contract) => contract.approveVoters(normalizedWallets, approved));

    return {
      transactionHash: tx.hash,
      count: normalizedWallets.length,
    };
  });
}

async function getVoterApprovalStatus(walletAddress) {
  const contract = getContract(true);
  return contract.approvedVoters(normalizeAddress(walletAddress));
}

async function endElection(electionId) {
  return withContractErrors(async () => {
    const { tx } = await sendTransaction((contract) => contract.endElection(BigInt(electionId)));

    return {
      transactionHash: tx.hash,
    };
  });
}

async function extendElection(electionId, newEndTime) {
  return withContractErrors(async () => {
    const { tx } = await sendTransaction((contract) =>
      contract.extendElection(BigInt(electionId), toUnixSeconds(newEndTime))
    );

    return {
      transactionHash: tx.hash,
    };
  });
}

async function setPaused(paused) {
  return withContractErrors(async () => {
    const { tx } = await sendTransaction((contract) => (paused ? contract.pause() : contract.unpause()));

    return {
      transactionHash: tx.hash,
      paused,
    };
  });
}

/**
 * Submits a voter-signed EIP-712 ballot, paying gas from the server wallet.
 * The contract verifies the signature, so the relayer cannot change the vote.
 */
async function relayVote({ electionId, candidateId, voterAddress, deadline, signature }) {
  return withContractErrors(async () => {
    const args = [BigInt(electionId), BigInt(candidateId), voterAddress, BigInt(deadline), signature];

    // Simulate first so a doomed ballot never costs the relayer gas.
    await getContract(false).castVoteBySig.staticCall(...args);

    const { tx, receipt } = await sendTransaction((contract) => contract.castVoteBySig(...args));

    return {
      transactionHash: tx.hash,
      blockNumber: receipt.blockNumber,
    };
  });
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
  if (!isConfigured()) {
    return null;
  }

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
      timestamp: null,
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
    timestamp: event ? Number(event.args.timestamp) : null,
  };
}

async function safeGetVoteVerification(electionId, walletAddress) {
  try {
    return await getVoteVerification(electionId, walletAddress);
  } catch (_error) {
    return { available: false, hasVoted: null, candidateId: null, transactionHash: null, blockNumber: null, timestamp: null };
  }
}

/**
 * Public, append-only ledger of ballots for one election, newest first.
 * Voter addresses are pseudonymous wallet addresses, exactly as stored on-chain.
 */
async function getVoteActivity(electionId, limit = 20) {
  const contract = getContract(true);
  const [castEvents, relayEvents] = await Promise.all([
    contract.queryFilter(contract.filters.VoteCast(BigInt(electionId)), 0, "latest"),
    contract.queryFilter(contract.filters.VoteRelayed(BigInt(electionId)), 0, "latest"),
  ]);

  const relayedTx = new Set(relayEvents.map((event) => event.transactionHash));

  return castEvents
    .slice(-limit)
    .reverse()
    .map((event) => ({
      voter: event.args.voter.toLowerCase(),
      candidateId: Number(event.args.candidateId),
      timestamp: Number(event.args.timestamp),
      blockNumber: Number(event.blockNumber),
      transactionHash: event.transactionHash,
      gasless: relayedTx.has(event.transactionHash),
    }));
}

module.exports = {
  approveVoter,
  approveVoters,
  createElection,
  endElection,
  extendElection,
  getBallotDomain,
  getElectionSnapshot,
  getSystemStatus,
  getVoteActivity,
  getVoterApprovalStatus,
  getVoteVerification,
  isConfigured,
  relayVote,
  safeGetElectionSnapshot,
  safeGetVoteVerification,
  setPaused,
  toApiError,
};
