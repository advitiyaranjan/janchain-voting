const Election = require("../models/Election");
const User = require("../models/User");
const ApiError = require("../utils/ApiError");
const blockchainService = require("../services/blockchainService");
const { uploadElectionMetadata } = require("../services/ipfsService");
const env = require("../config/env");
const roles = require("../constants/roles");

function resolveStatus(snapshot, election) {
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
    User.countDocuments(),
    User.countDocuments({ isApproved: true }),
    User.countDocuments({ isApproved: false, role: roles.VOTER }),
    Election.countDocuments(),
    User.countDocuments({ linkedWalletAt: { $ne: null }, walletAddress: { $ne: null } }),
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
      error: error.message,
    })),
  ]);

  const recentElections = await Election.find()
    .sort({ createdAt: -1 })
    .limit(5)
    .lean();

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
    recentElections: recentElections.map((election) => ({
      id: election._id.toString(),
      title: election.title,
      status: resolveStatus(null, election),
      startTime: election.startTime,
      endTime: election.endTime,
      onChainElectionId: election.onChainElectionId,
      transactionHash: election.transactionHash,
    })),
    administrator: req.user.toJSON(),
  });
}

async function listPendingUsers(_req, res) {
  const users = await User.find({ role: "voter" }).sort({ createdAt: -1 });
  res.json({
    users: users.map((user) => user.toJSON()),
  });
}

async function updateUserApproval(req, res) {
  const { userId } = req.validated.params;
  const { approved } = req.validated.body;

  const user = await User.findById(userId);
  if (!user) {
    throw new ApiError(404, "User not found.");
  }

  user.isApproved = approved;
  await user.save();

  let transactionHash = null;
  let warning = null;
  if (user.walletAddress && user.linkedWalletAt && blockchainService.isConfigured()) {
    try {
      const blockchainResult = await blockchainService.approveVoter(user.walletAddress, approved);
      transactionHash = blockchainResult.transactionHash;
    } catch (error) {
      warning = error.message;
    }
  }

  res.json({
    message: approved ? "User approved successfully." : "User approval revoked successfully.",
    transactionHash,
    warning,
    user: user.toJSON(),
  });
}

async function createElection(req, res) {
  if (!blockchainService.isConfigured()) {
    throw new ApiError(
      500,
      "Blockchain is not configured yet. Deploy the contract and set CONTRACT_ADDRESS before creating elections."
    );
  }

  const { title, description, startTime, endTime, candidates } = req.validated.body;
  const candidateNames = candidates.map((candidate) => candidate.name.trim().toLowerCase());
  const hasDuplicates = candidateNames.some((name, index) => candidateNames.indexOf(name) !== index);

  if (hasDuplicates) {
    throw new ApiError(422, "Candidate names must be unique within an election.");
  }

  const metadata = {
    title,
    description,
    startTime,
    endTime,
    chainId: env.chainId,
    contractAddress: env.contractAddress,
    candidates,
    createdBy: req.user.email,
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
  });

  if (!blockchainResult.electionId) {
    throw new ApiError(500, "Contract succeeded but the election event could not be parsed.");
  }

  const election = await Election.create({
    onChainElectionId: blockchainResult.electionId,
    title,
    description,
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
    message: "Election created successfully.",
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

  const blockchainResult = await blockchainService.endElection(election.onChainElectionId);
  election.status = "ended";
  election.endedAt = new Date();
  await election.save();

  res.json({
    message: "Election ended successfully.",
    transactionHash: blockchainResult.transactionHash,
    election: election.toJSON(),
  });
}

module.exports = {
  createElection,
  endElection,
  getDashboard,
  listPendingUsers,
  syncUserWallet,
  updateUserApproval,
};
