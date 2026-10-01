const Election = require("../models/Election");
const User = require("../models/User");
const ApiError = require("../utils/ApiError");
const blockchainService = require("../services/blockchainService");
const { uploadElectionMetadata } = require("../services/ipfsService");
const { presentElection } = require("../utils/electionPresenter");
const env = require("../config/env");
const roles = require("../constants/roles");

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function getDashboard(req, res) {
  const [
    totalUsers,
    approvedUsers,
    pendingUsers,
    totalElections,
    verifiedWallets,
    readyWallets,
    pendingWalletVerification,
    blockchain,
  ] = await Promise.all([
    User.countDocuments({ role: roles.VOTER }),
    User.countDocuments({ isApproved: true, role: roles.VOTER }),
    User.countDocuments({ isApproved: false, role: roles.VOTER }),
    Election.countDocuments(),
    User.countDocuments({ linkedWalletAt: { $ne: null }, walletAddress: { $ne: null }, role: roles.VOTER }),
    User.countDocuments({
      isApproved: true,
      linkedWalletAt: { $ne: null },
      walletAddress: { $ne: null },
      role: roles.VOTER,
    }),
    User.countDocuments({
      walletAddress: { $ne: null },
      linkedWalletAt: null,
      role: roles.VOTER,
    }),
    blockchainService.getSystemStatus().catch((error) => ({
      configured: blockchainService.isConfigured(),
      chainId: env.chainId,
      contractAddress: env.contractAddress || "",
      rpcUrl: env.rpcUrl,
      hasServerWallet: Boolean(env.serverWalletPrivateKey),
      onChainElectionCount: null,
      approvedVoterCount: null,
      paused: null,
      error: blockchainService.toApiError(error).message,
    })),
  ]);

  const recentElections = await Election.find().sort({ createdAt: -1 }).limit(5).lean();

  res.json({
    metrics: {
      totalUsers,
      approvedUsers,
      pendingUsers,
      totalElections,
      verifiedWallets,
      readyWallets,
      pendingWalletVerification,
      chainConfigured: blockchainService.isConfigured(),
    },
    blockchain,
    recentElections: recentElections.map((election) => presentElection(election, null)),
    administrator: req.user.toJSON(),
  });
}

async function listUsers(req, res) {
  const { q = "", status = "all" } = req.query;
  const filters = { role: roles.VOTER };
  const search = String(q).trim();

  if (search) {
    const pattern = { $regex: escapeRegex(search), $options: "i" };
    filters.$or = [{ fullName: pattern }, { email: pattern }, { walletAddress: pattern }];
  }

  if (status === "pending") {
    filters.isApproved = false;
  } else if (status === "approved") {
    filters.isApproved = true;
  } else if (status === "unverified") {
    filters.linkedWalletAt = null;
  }

  const users = await User.find(filters).sort({ createdAt: -1 });
  res.json({
    users: users.map((user) => user.toJSON()),
  });
}

async function syncApprovalOnChain(user, approved) {
  if (!user.walletAddress || !user.linkedWalletAt || !blockchainService.isConfigured()) {
    return { transactionHash: null, warning: null };
  }

  try {
    const result = await blockchainService.approveVoter(user.walletAddress, approved);
    return { transactionHash: result.transactionHash, warning: null };
  } catch (error) {
    return { transactionHash: null, warning: `Saved, but the on-chain sync failed: ${error.message}` };
  }
}

async function updateUserApproval(req, res) {
  const { userId } = req.validated.params;
  const { approved } = req.validated.body;

  const user = await User.findOne({ _id: userId, role: roles.VOTER });
  if (!user) {
    throw new ApiError(404, "Voter not found.");
  }

  user.isApproved = approved;
  user.approvedAt = approved ? new Date() : null;
  await user.save();

  const { transactionHash, warning } = await syncApprovalOnChain(user, approved);

  res.json({
    message: approved ? `${user.fullName} is approved to vote.` : `${user.fullName}'s approval was revoked.`,
    transactionHash,
    warning,
    user: user.toJSON(),
  });
}

async function bulkUpdateApproval(req, res) {
  const { userIds, approved } = req.validated.body;
  const users = await User.find({ _id: { $in: userIds }, role: roles.VOTER });

  if (!users.length) {
    throw new ApiError(404, "No matching voters were found.");
  }

  await User.updateMany(
    { _id: { $in: users.map((user) => user._id) } },
    { $set: { isApproved: approved, approvedAt: approved ? new Date() : null } }
  );

  const syncableWallets = users
    .filter((user) => user.walletAddress && user.linkedWalletAt)
    .map((user) => user.walletAddress);

  let transactionHash = null;
  let warning = null;
  if (syncableWallets.length && blockchainService.isConfigured()) {
    try {
      const result = await blockchainService.approveVoters(syncableWallets, approved);
      transactionHash = result.transactionHash;
    } catch (error) {
      warning = `Saved, but the on-chain sync failed: ${error.message}`;
    }
  }

  res.json({
    message: `${users.length} voter${users.length === 1 ? "" : "s"} ${approved ? "approved" : "revoked"}.`,
    syncedWallets: transactionHash ? syncableWallets.length : 0,
    transactionHash,
    warning,
  });
}

async function createElection(req, res) {
  if (!blockchainService.isConfigured()) {
    throw new ApiError(
      500,
      "Blockchain is not configured yet. Deploy the contract and set CONTRACT_ADDRESS before creating elections."
    );
  }

  const { title, description, category, accessMode, startTime, endTime, candidates } = req.validated.body;
  const candidateNames = candidates.map((candidate) => candidate.name.trim().toLowerCase());
  const hasDuplicates = candidateNames.some((name, index) => candidateNames.indexOf(name) !== index);

  if (hasDuplicates) {
    throw new ApiError(422, "Candidate names must be unique within an election.");
  }

  const metadata = {
    title,
    description,
    category,
    accessMode,
    startTime,
    endTime,
    chainId: env.chainId,
    contractAddress: env.contractAddress,
    candidates,
    createdAt: new Date().toISOString(),
  };

  let metadataURI = "";
  try {
    metadataURI = await uploadElectionMetadata(metadata);
  } catch (error) {
    console.warn(error.message);
  }

  const blockchainResult = await blockchainService.createElection({
    title,
    description,
    startTime,
    endTime,
    metadataURI,
    candidates,
    restricted: accessMode === "restricted",
  });

  if (!blockchainResult.electionId) {
    throw new ApiError(500, "Contract succeeded but the election event could not be parsed.");
  }

  const election = await Election.create({
    onChainElectionId: blockchainResult.electionId,
    title,
    description,
    category,
    accessMode,
    metadataURI,
    contractAddress: env.contractAddress,
    chainId: env.chainId,
    startTime: new Date(startTime),
    endTime: new Date(endTime),
    status: "scheduled",
    transactionHash: blockchainResult.transactionHash,
    createdBy: req.user._id,
    candidates: candidates.map((candidate, index) => ({
      candidateId: index + 1,
      name: candidate.name,
      party: candidate.party || "",
      tagline: candidate.tagline || "",
      description: candidate.description || "",
      imageURI: candidate.imageURI || "",
    })),
  });

  res.status(201).json({
    message: "Election published on-chain.",
    election: election.toJSON(),
    blockchain: blockchainResult,
  });
}

async function syncUserWallet(req, res) {
  const { userId } = req.validated.params;
  const user = await User.findById(userId);

  if (!user) {
    throw new ApiError(404, "User not found.");
  }

  if (!blockchainService.isConfigured()) {
    throw new ApiError(500, "Blockchain is not configured yet.");
  }

  if (!user.walletAddress) {
    throw new ApiError(422, "This voter does not have a wallet address on file.");
  }

  if (!user.linkedWalletAt) {
    throw new ApiError(422, "This wallet has not been verified with a signed challenge yet.");
  }

  const blockchainResult = await blockchainService.approveVoter(user.walletAddress, user.isApproved);
  const approvedOnChain = await blockchainService.getVoterApprovalStatus(user.walletAddress);

  res.json({
    message: user.isApproved
      ? "Wallet synced to the blockchain voter registry."
      : "Wallet revocation synced to the blockchain voter registry.",
    transactionHash: blockchainResult.transactionHash,
    approvedOnChain,
    user: user.toJSON(),
  });
}

async function endElection(req, res) {
  const { electionId } = req.validated.params;
  const election = await Election.findById(electionId);

  if (!election) {
    throw new ApiError(404, "Election not found.");
  }

  if (election.contractAddress.toLowerCase() !== env.contractAddress.toLowerCase() || election.chainId !== env.chainId) {
    throw new ApiError(409, "This election belongs to a different contract deployment.");
  }

  const blockchainResult = await blockchainService.endElection(election.onChainElectionId);
  election.status = "ended";
  election.endedAt = new Date();
  await election.save();

  res.json({
    message: "Election closed. Results are now final.",
    transactionHash: blockchainResult.transactionHash,
    election: election.toJSON(),
  });
}

async function extendElection(req, res) {
  const { electionId } = req.validated.params;
  const { endTime } = req.validated.body;
  const election = await Election.findById(electionId);

  if (!election) {
    throw new ApiError(404, "Election not found.");
  }
  if (election.contractAddress.toLowerCase() !== env.contractAddress.toLowerCase() || election.chainId !== env.chainId) {
    throw new ApiError(409, "This election belongs to a different contract deployment.");
  }

  if (new Date(endTime) <= new Date(election.endTime)) {
    throw new ApiError(422, "The new end time must be later than the current end time.");
  }

  const blockchainResult = await blockchainService.extendElection(election.onChainElectionId, endTime);
  election.endTime = new Date(endTime);
  election.extendedAt = new Date();
  await election.save();

  res.json({
    message: "Voting window extended.",
    transactionHash: blockchainResult.transactionHash,
    election: election.toJSON(),
  });
}

async function setVotingPaused(req, res) {
  const { paused } = req.validated.body;
  const result = await blockchainService.setPaused(paused);

  res.json({
    message: paused ? "All voting is paused." : "Voting has resumed.",
    ...result,
  });
}

module.exports = {
  bulkUpdateApproval,
  createElection,
  endElection,
  extendElection,
  getDashboard,
  listUsers,
  setVotingPaused,
  syncUserWallet,
  updateUserApproval,
};
