const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { ethers } = require("ethers");
const User = require("../models/User");
const ApiError = require("../utils/ApiError");
const { signToken } = require("../utils/jwt");
const blockchainService = require("../services/blockchainService");

function buildAuthResponse(user) {
  return {
    token: signToken(user),
    user: user.toJSON(),
  };
}

function buildWalletMessage({ walletAddress, nonce, intent }) {
  return [
    "JanChain Voting wallet verification",
    `Intent: ${intent}`,
    `Wallet: ${walletAddress}`,
    `Nonce: ${nonce}`,
  ].join("\n");
}

async function register(req, res) {
  const { fullName, email, password, walletAddress, preferredLanguage } = req.validated.body;
  const normalizedWallet = walletAddress?.toLowerCase();
  const orFilters = [{ email: email.toLowerCase() }];

  if (normalizedWallet) {
    orFilters.push({ walletAddress: normalizedWallet });
  }

  const existingUser = await User.findOne({ $or: orFilters });
  if (existingUser) {
    throw new ApiError(409, "A user with that email or wallet already exists.");
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await User.create({
    fullName,
    email: email.toLowerCase(),
    passwordHash,
    walletAddress: normalizedWallet,
    preferredLanguage: preferredLanguage || "en",
  });

  res.status(201).json({
    message:
      "Registration submitted. An administrator must approve the voter, and any wallet must still be verified with a signed challenge before blockchain voting is enabled.",
    user: user.toJSON(),
  });
}

async function login(req, res) {
  const { email, password } = req.validated.body;
  const user = await User.findOne({ email: email.toLowerCase() });

  if (!user) {
    throw new ApiError(401, "Invalid email or password.");
  }

  const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
  if (!isPasswordValid) {
    throw new ApiError(401, "Invalid email or password.");
  }

  user.lastLoginAt = new Date();
  await user.save();

  res.json(buildAuthResponse(user));
}

async function getCurrentUser(req, res) {
  res.json({
    user: req.user.toJSON(),
  });
}

async function issueWalletChallenge(req, res) {
  const { walletAddress, intent } = req.validated.body;
  const normalizedWallet = walletAddress.toLowerCase();

  let user;
  if (intent === "link") {
    if (!req.user) {
      throw new ApiError(401, "You must be logged in to link a wallet.");
    }
    user = req.user;
  } else {
    user = await User.findOne({
      walletAddress: normalizedWallet,
      linkedWalletAt: { $ne: null },
    });
  }

  if (!user) {
    throw new ApiError(404, "No account is linked to this wallet address.");
  }

  const nonce = crypto.randomBytes(16).toString("hex");
  const message = buildWalletMessage({ walletAddress: normalizedWallet, nonce, intent });

  user.walletChallenge = {
    nonce,
    intent,
    address: normalizedWallet,
    message,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
  };
  await user.save();

  res.json({
    message,
    expiresAt: user.walletChallenge.expiresAt,
  });
}

async function verifyWalletChallenge(req, res) {
  const { walletAddress, signature, intent } = req.validated.body;
  const normalizedWallet = walletAddress.toLowerCase();

  let user;
  if (intent === "link") {
    if (!req.user) {
      throw new ApiError(401, "You must be logged in to link a wallet.");
    }
    user = await User.findById(req.user.id);
  } else {
    user = await User.findOne({ walletAddress: normalizedWallet });
  }

  if (!user || !user.walletChallenge) {
    throw new ApiError(400, "No wallet challenge is pending for this account.");
  }

  if (user.walletChallenge.intent !== intent || user.walletChallenge.address !== normalizedWallet) {
    throw new ApiError(400, "Wallet challenge intent does not match.");
  }

  if (new Date(user.walletChallenge.expiresAt).getTime() < Date.now()) {
    throw new ApiError(400, "Wallet challenge has expired.");
  }

  const recoveredAddress = ethers.verifyMessage(user.walletChallenge.message, signature).toLowerCase();
  if (recoveredAddress !== normalizedWallet) {
    throw new ApiError(401, "Wallet signature verification failed.");
  }

  if (intent === "link") {
    const existingOwner = await User.findOne({
      walletAddress: normalizedWallet,
      _id: { $ne: user._id },
    });

    if (existingOwner) {
      throw new ApiError(409, "That wallet is already linked to another account.");
    }

    user.walletAddress = normalizedWallet;
    user.linkedWalletAt = new Date();
  }

  user.walletChallenge = undefined;
  user.lastLoginAt = new Date();
  await user.save();

  let blockchainWarning = null;
  if (user.isApproved && user.walletAddress && blockchainService.isConfigured()) {
    try {
      await blockchainService.approveVoter(user.walletAddress, true);
    } catch (error) {
      blockchainWarning = error.message;
    }
  }

  res.json({
    ...buildAuthResponse(user),
    warning: blockchainWarning,
  });
}

module.exports = {
  getCurrentUser,
  issueWalletChallenge,
  login,
  register,
  verifyWalletChallenge,
};
