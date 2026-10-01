const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { ethers } = require("ethers");
const User = require("../models/User");
const ApiError = require("../utils/ApiError");
const { signToken } = require("../utils/jwt");
const blockchainService = require("../services/blockchainService");
const env = require("../config/env");

function buildAuthResponse(user) {
  return {
    token: signToken(user),
    user: user.toJSON(),
  };
}

function buildWalletMessage({ walletAddress, nonce, intent }) {
  return [
    "JanChain Voting wallet verification",
    `Application: ${env.clientUrl}`,
    `Chain ID: ${env.chainId}`,
    "This message verifies wallet ownership. It does not authorize a transaction.",
    `Intent: ${intent}`,
    `Wallet: ${walletAddress}`,
    `Nonce: ${nonce}`,
  ].join("\n");
}

async function register(req, res) {
  const { fullName, email, password, walletAddress, preferredLanguage } = req.validated.body;
  const normalizedWallet = walletAddress?.toLowerCase();
  const existingUser = await User.findOne({ email: email.toLowerCase() });
  if (existingUser) {
    throw new ApiError(409, "A user with that email or wallet already exists.");
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await User.create({
    fullName,
    email: email.toLowerCase(),
    passwordHash,
    // An unproven address must not reserve another person's wallet.
    pendingWalletAddress: normalizedWallet,
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
    if (user.linkedWalletAt && user.walletAddress !== normalizedWallet) {
      throw new ApiError(409, "This account already has a verified wallet. Contact the administrator before changing it.");
    }
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

  let recoveredAddress;
  try {
    recoveredAddress = ethers.verifyMessage(user.walletChallenge.message, signature).toLowerCase();
  } catch (_error) {
    throw new ApiError(401, "Wallet signature verification failed.");
  }
  if (recoveredAddress !== normalizedWallet) {
    throw new ApiError(401, "Wallet signature verification failed.");
  }

  if (intent === "link") {
    const existingOwner = await User.findOne({
      walletAddress: normalizedWallet,
      _id: { $ne: user._id },
    });

    if (existingOwner) {
      if (existingOwner.linkedWalletAt) {
        throw new ApiError(409, "That wallet is already linked to another account.");
      }
      // Release legacy registration claims only while they remain unverified.
      await User.updateOne({ _id: existingOwner._id, linkedWalletAt: null, walletAddress: normalizedWallet }, {
        $set: { pendingWalletAddress: normalizedWallet }, $unset: { walletAddress: 1 },
      });
    }

    if (user.linkedWalletAt && user.walletAddress !== normalizedWallet) {
      throw new ApiError(409, "This account already has a verified wallet.");
    }
  }

  // Consume the nonce atomically: two concurrent verification requests cannot reuse it.
  const updates = { lastLoginAt: new Date() };
  if (intent === "link") {
    updates.walletAddress = normalizedWallet;
    updates.linkedWalletAt = user.linkedWalletAt || new Date();
  }
  user = await User.findOneAndUpdate({
    _id: user._id,
    "walletChallenge.nonce": user.walletChallenge.nonce,
    "walletChallenge.address": normalizedWallet,
    "walletChallenge.intent": intent,
    "walletChallenge.expiresAt": { $gt: new Date() },
  }, { $set: updates, $unset: { walletChallenge: 1, ...(intent === "link" ? { pendingWalletAddress: 1 } : {}) } }, { new: true, runValidators: true });
  if (!user) throw new ApiError(401, "The wallet challenge has expired or was already used. Request a new one.");

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
