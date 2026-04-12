const Election = require("../models/Election");
const ApiError = require("../utils/ApiError");
const blockchainService = require("../services/blockchainService");

function computeStatus(snapshot, election) {
  if (snapshot) {
    if (snapshot.hasEnded) {
      return "ended";
    }

    return snapshot.isActive ? "active" : "scheduled";
  }

  const now = Date.now();
  const start = new Date(election.startTime).getTime();
  const end = new Date(election.endTime).getTime();

  if (now > end || election.endedAt) {
    return "ended";
  }

  if (now >= start && now <= end) {
    return "active";
  }

  return "scheduled";
}

function mergeElectionData(election, snapshot, userWalletAddress = null) {
  const voteMap = new Map(
    (snapshot?.candidates || []).map((candidate) => [candidate.candidateId, candidate.voteCount])
  );

  return {
    ...election,
    status: computeStatus(snapshot, election),
    totalVotes: snapshot?.totalVotes ?? 0,
    isActive: snapshot?.isActive ?? false,
    hasEnded: snapshot?.hasEnded ?? false,
    hasLinkedWallet: Boolean(userWalletAddress),
    candidates: election.candidates.map((candidate) => ({
      ...candidate,
      voteCount: voteMap.get(candidate.candidateId) || 0,
    })),
  };
}

async function listElections(req, res) {
  const { status = "all", q = "" } = req.query;
  const search = q.trim();
  const filters = {};

  if (search) {
    filters.$or = [
      { title: { $regex: search, $options: "i" } },
      { description: { $regex: search, $options: "i" } },
      { "candidates.name": { $regex: search, $options: "i" } },
    ];
  }

  const elections = await Election.find(filters).sort({ startTime: 1 }).lean();
  const enriched = await Promise.all(
    elections.map(async (election) => {
      const snapshot = await blockchainService.safeGetElectionSnapshot(election.onChainElectionId);
      return mergeElectionData(election, snapshot, req.user?.walletAddress || null);
    })
  );

  const filtered = status === "all" ? enriched : enriched.filter((election) => election.status === status);

  res.json({
    elections: filtered,
  });
}

async function getElection(req, res) {
  const election = await Election.findById(req.params.electionId).lean();
  if (!election) {
    throw new ApiError(404, "Election not found.");
  }

  const snapshot = await blockchainService.safeGetElectionSnapshot(election.onChainElectionId);
  const verification =
    req.user?.walletAddress && blockchainService.isConfigured()
      ? await blockchainService.getVoteVerification(election.onChainElectionId, req.user.walletAddress)
      : { hasVoted: false, candidateId: null, transactionHash: null, blockNumber: null };
  const votedCandidate = verification.hasVoted
    ? election.candidates.find((candidate) => candidate.candidateId === verification.candidateId) || null
    : null;

  res.json({
    election: mergeElectionData(election, snapshot, req.user?.walletAddress || null),
    verification: {
      ...verification,
      candidateName: votedCandidate?.name || null,
    },
  });
}

async function getResults(req, res) {
  const election = await Election.findById(req.params.electionId).lean();
  if (!election) {
    throw new ApiError(404, "Election not found.");
  }

  const snapshot = await blockchainService.safeGetElectionSnapshot(election.onChainElectionId);
  if (!snapshot) {
    throw new ApiError(500, "Unable to fetch live blockchain results.");
  }

  const candidates = election.candidates.map((candidate) => {
    const current = snapshot.candidates.find((item) => item.candidateId === candidate.candidateId);
    const voteCount = current ? current.voteCount : 0;
    const percentage = snapshot.totalVotes ? Number(((voteCount / snapshot.totalVotes) * 100).toFixed(2)) : 0;

    return {
      ...candidate,
      voteCount,
      percentage,
    };
  });

  res.json({
    election: mergeElectionData(election, snapshot, req.user?.walletAddress || null),
    results: {
      totalVotes: snapshot.totalVotes,
      candidates,
      winner:
        candidates
          .slice()
          .sort((left, right) => right.voteCount - left.voteCount)[0] || null,
    },
  });
}

async function verifyVote(req, res) {
  const election = await Election.findById(req.params.electionId).lean();
  if (!election) {
    throw new ApiError(404, "Election not found.");
  }

  const walletAddress = (req.params.walletAddress || "").toLowerCase();
  const verification = await blockchainService.getVoteVerification(election.onChainElectionId, walletAddress);
  const votedCandidate = verification.hasVoted
    ? election.candidates.find((candidate) => candidate.candidateId === verification.candidateId) || null
    : null;

  res.json({
    electionId: election._id.toString(),
    onChainElectionId: election.onChainElectionId,
    walletAddress,
    verification: {
      ...verification,
      candidateName: votedCandidate?.name || null,
    },
    candidate: votedCandidate,
  });
}

module.exports = {
  getElection,
  getResults,
  listElections,
  verifyVote,
};
