const Election = require("../models/Election");
const User = require("../models/User");
const ApiError = require("../utils/ApiError");
const roles = require("../constants/roles");
const env = require("../config/env");
const blockchainService = require("../services/blockchainService");
const { presentElection, withPercentages } = require("../utils/electionPresenter");

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function findElectionOr404(electionId) {
  if (!/^[a-f0-9]{24}$/i.test(electionId || "")) {
    throw new ApiError(404, "Election not found.");
  }

  const election = await Election.findById(electionId).lean();
  if (!election) {
    throw new ApiError(404, "Election not found.");
  }
  if (!env.contractAddress || election.contractAddress.toLowerCase() !== env.contractAddress.toLowerCase() || election.chainId !== env.chainId) {
    throw new ApiError(409, "This election belongs to an older contract deployment. Open the current election board.");
  }
  return election;
}

function currentContractFilter() {
  // Hide catalog entries that belong to an older contract deployment.
  return env.contractAddress ? { contractAddress: env.contractAddress.toLowerCase() } : {};
}

function candidateName(election, candidateId) {
  return election.candidates.find((candidate) => candidate.candidateId === candidateId)?.name || null;
}

function summarizeResults(election, snapshot) {
  const totalVotes = snapshot?.totalVotes ?? 0;
  const candidates = withPercentages(election.candidates, totalVotes).sort(
    (left, right) => right.voteCount - left.voteCount
  );
  const topVotes = candidates[0]?.voteCount || 0;
  const leaders = topVotes > 0 ? candidates.filter((candidate) => candidate.voteCount === topVotes) : [];

  return {
    totalVotes,
    candidates,
    winner: leaders.length === 1 ? leaders[0] : null,
    isTie: leaders.length > 1,
    leaders,
  };
}

async function listElections(req, res) {
  const { status = "all", q = "", category = "" } = req.query;
  const search = String(q).trim();
  const filters = { ...currentContractFilter() };

  if (search) {
    const pattern = { $regex: escapeRegex(search), $options: "i" };
    filters.$or = [{ title: pattern }, { description: pattern }, { "candidates.name": pattern }];
  }

  if (category && category !== "all") {
    // Elections created before categories existed have no field and present as "General".
    filters.category = category === "General" ? { $in: ["General", null] } : String(category);
  }

  const elections = await Election.find(filters).sort({ startTime: -1 }).lean();
  const enriched = await Promise.all(
    elections.map(async (election) => {
      const snapshot = await blockchainService.safeGetElectionSnapshot(election.onChainElectionId);
      return presentElection(election, snapshot);
    })
  );

  const statusOrder = { active: 0, scheduled: 1, ended: 2 };
  const filtered = (status === "all" ? enriched : enriched.filter((election) => election.status === status)).sort(
    (left, right) => statusOrder[left.status] - statusOrder[right.status]
  );

  res.json({
    elections: filtered,
    categories: [...new Set(enriched.map((election) => election.category))].sort(),
  });
}

async function getPlatformStats(_req, res) {
  const elections = await Election.find(currentContractFilter()).lean();
  const snapshots = await Promise.all(
    elections.map((election) => blockchainService.safeGetElectionSnapshot(election.onChainElectionId))
  );
  const presented = elections.map((election, index) => presentElection(election, snapshots[index]));

  const [registeredVoters, approvedVoters, system] = await Promise.all([
    User.countDocuments({ role: roles.VOTER }),
    User.countDocuments({ role: roles.VOTER, isApproved: true }),
    blockchainService.getSystemStatus().catch(() => null),
  ]);

  res.json({
    stats: {
      totalElections: presented.length,
      activeElections: presented.filter((election) => election.status === "active").length,
      upcomingElections: presented.filter((election) => election.status === "scheduled").length,
      endedElections: presented.filter((election) => election.status === "ended").length,
      totalVotes: snapshots.every(Boolean) ? presented.reduce((sum, election) => sum + election.totalVotes, 0) : null,
      registeredVoters,
      approvedVoters,
      onChainApprovedVoters: system?.approvedVoterCount ?? null,
      blockNumber: system?.blockNumber ?? null,
      paused: system?.paused ?? null,
      chainId: env.chainId,
      contractAddress: env.contractAddress,
    },
  });
}

async function getElection(req, res) {
  const election = await findElectionOr404(req.params.electionId);
  const snapshot = await blockchainService.safeGetElectionSnapshot(election.onChainElectionId);
  const system = await blockchainService.getSystemStatus().catch(() => null);
  const verification =
    req.user?.walletAddress && blockchainService.isConfigured()
      ? await blockchainService.safeGetVoteVerification(election.onChainElectionId, req.user.walletAddress)
      : { hasVoted: false, candidateId: null, transactionHash: null, blockNumber: null, timestamp: null };

  res.json({
    election: { ...presentElection(election, snapshot), paused: system?.paused ?? null },
    verification: {
      ...verification,
      candidateName: verification.hasVoted ? candidateName(election, verification.candidateId) : null,
    },
    ballot: blockchainService.isConfigured()
      ? { domain: blockchainService.getBallotDomain(), gaslessEnabled: Boolean(env.serverWalletPrivateKey) }
      : null,
  });
}

async function getResults(req, res) {
  const election = await findElectionOr404(req.params.electionId);
  const snapshot = await blockchainService.safeGetElectionSnapshot(election.onChainElectionId);
  if (!snapshot) {
    throw new ApiError(503, "Unable to fetch live blockchain results. Is the blockchain node running?");
  }

  const presented = presentElection(election, snapshot);

  const [eligibleVoters, system] = await Promise.all([
    election.accessMode === "open"
      ? Promise.resolve(null)
      : User.countDocuments({ role: roles.VOTER, isApproved: true, linkedWalletAt: { $ne: null } }),
    blockchainService.getSystemStatus().catch(() => null),
  ]);

  res.json({
    election: presented,
    results: {
      // Summarize the presented election: its candidates carry the on-chain vote counts.
      ...summarizeResults(presented, snapshot),
      eligibleVoters,
      turnout:
        eligibleVoters && eligibleVoters > 0
          ? Number(((snapshot.totalVotes / eligibleVoters) * 100).toFixed(1))
          : null,
      blockNumber: system?.blockNumber ?? null,
      fetchedAt: new Date().toISOString(),
    },
  });
}

async function getActivity(req, res) {
  const election = await findElectionOr404(req.params.electionId);
  const limit = Math.min(Number(req.query.limit) || 20, 100);

  if (!blockchainService.isConfigured()) {
    return res.json({ activity: [] });
  }

  const activity = await blockchainService.getVoteActivity(election.onChainElectionId, Math.max(1, limit)).catch(() => {
    throw new ApiError(503, "Unable to read ballot activity from the blockchain.");
  });
  res.json({ activity });
}

async function verifyVote(req, res) {
  const election = await findElectionOr404(req.params.electionId);
  const walletAddress = (req.params.walletAddress || "").toLowerCase();

  if (!/^0x[a-f0-9]{40}$/.test(walletAddress)) {
    throw new ApiError(422, "Enter a valid wallet address (0x followed by 40 hex characters).");
  }

  const verification = await blockchainService
    .getVoteVerification(election.onChainElectionId, walletAddress)
    .catch((error) => {
      throw blockchainService.toApiError(error, 503);
    });
  const votedCandidate = verification.hasVoted
    ? election.candidates.find((candidate) => candidate.candidateId === verification.candidateId) || null
    : null;

  res.json({
    electionId: election._id.toString(),
    electionTitle: election.title,
    onChainElectionId: election.onChainElectionId,
    walletAddress,
    verification: {
      ...verification,
      candidateName: votedCandidate?.name || null,
    },
    candidate: votedCandidate,
  });
}

async function getMyBallots(req, res) {
  const walletAddress = req.user.walletAddress && req.user.linkedWalletAt ? req.user.walletAddress : null;
  if (!walletAddress || !blockchainService.isConfigured()) {
    return res.json({ ballots: [], walletAddress });
  }

  const elections = await Election.find(currentContractFilter()).sort({ startTime: -1 }).lean();
  const receipts = await Promise.all(
    elections.map((election) =>
      blockchainService.safeGetVoteVerification(election.onChainElectionId, walletAddress)
    )
  );
  if (receipts.some((receipt) => receipt.available === false)) {
    throw new ApiError(503, "Unable to read your ballot receipts. Please try again.");
  }

  const ballots = elections
    .map((election, index) => ({ election, receipt: receipts[index] }))
    .filter(({ receipt }) => receipt.hasVoted)
    .map(({ election, receipt }) => ({
      electionId: election._id.toString(),
      electionTitle: election.title,
      category: election.category || "General",
      candidateId: receipt.candidateId,
      candidateName: candidateName(election, receipt.candidateId),
      transactionHash: receipt.transactionHash,
      blockNumber: receipt.blockNumber,
      timestamp: receipt.timestamp,
    }));

  res.json({ ballots, walletAddress });
}

async function relayVote(req, res) {
  const election = await findElectionOr404(req.validated.params.electionId);
  const { candidateId, voterAddress, deadline, signature } = req.validated.body;
  const normalizedVoter = voterAddress.toLowerCase();

  // The relayer spends server gas, so only sponsor ballots from the signed-in voter's verified wallet.
  if (!req.user.walletAddress || !req.user.linkedWalletAt) {
    throw new ApiError(403, "Verify a wallet on your profile before using gasless voting.");
  }
  if (req.user.walletAddress.toLowerCase() !== normalizedVoter) {
    throw new ApiError(403, "Gasless ballots can only be relayed for the wallet linked to your account.");
  }
  if (election.accessMode !== "open" && !req.user.isApproved) {
    throw new ApiError(403, "Your voter registration has not been approved yet.");
  }
  if (!election.candidates.some((candidate) => candidate.candidateId === candidateId)) {
    throw new ApiError(422, "That candidate is not part of this election.");
  }

  const result = await blockchainService.relayVote({
    electionId: election.onChainElectionId,
    candidateId,
    voterAddress: normalizedVoter,
    deadline,
    signature,
  });

  res.status(201).json({
    message: "Your ballot was recorded on-chain.",
    receipt: {
      electionId: election._id.toString(),
      electionTitle: election.title,
      candidateId,
      candidateName: candidateName(election, candidateId),
      voterAddress: normalizedVoter,
      transactionHash: result.transactionHash,
      blockNumber: result.blockNumber,
      gasless: true,
      timestamp: Math.floor(Date.now() / 1000),
    },
  });
}

module.exports = {
  getActivity,
  getElection,
  getMyBallots,
  getPlatformStats,
  getResults,
  listElections,
  relayVote,
  verifyVote,
};
