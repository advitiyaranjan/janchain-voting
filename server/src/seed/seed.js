const bcrypt = require("bcryptjs");
const connectDatabase = require("../config/database");
const env = require("../config/env");
const User = require("../models/User");
const roles = require("../constants/roles");
const blockchainService = require("../services/blockchainService");

async function seed() {
  await connectDatabase();

  const passwordHash = await bcrypt.hash(env.adminPassword, 12);

  const admin = await User.findOneAndUpdate(
    { email: env.adminEmail.toLowerCase() },
    {
      fullName: env.adminName,
      email: env.adminEmail.toLowerCase(),
      passwordHash,
      role: roles.ADMIN,
      isApproved: true,
      preferredLanguage: "en",
    },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    }
  );

  const sampleVoters = [
    {
      fullName: "Ananya Rao",
      email: "ananya.rao@example.com",
      password: "Voter@123",
      walletAddress: "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266",
      isApproved: true,
    },
    {
      fullName: "Ravi Sharma",
      email: "ravi.sharma@example.com",
      password: "Voter@123",
      walletAddress: "0x70997970c51812dc3a010c7d01b50e0d17dc79c8",
      isApproved: false,
    },
  ];

  for (const voter of sampleVoters) {
    const voterPasswordHash = await bcrypt.hash(voter.password, 12);
    await User.findOneAndUpdate(
      { email: voter.email },
      {
        fullName: voter.fullName,
        email: voter.email,
        passwordHash: voterPasswordHash,
        role: roles.VOTER,
        walletAddress: voter.walletAddress,
        isApproved: voter.isApproved,
        linkedWalletAt: voter.walletAddress ? new Date() : undefined,
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
      }
    );
  }

  const approvedWallets = sampleVoters
    .filter((voter) => voter.isApproved && voter.walletAddress)
    .map((voter) => voter.walletAddress.toLowerCase());

  if (approvedWallets.length && blockchainService.isConfigured()) {
    try {
      const result = await blockchainService.approveVoters(approvedWallets, true);
      console.log(`Synced ${result.count} approved wallet(s) on-chain.`);
      console.log(`Blockchain transaction: ${result.transactionHash}`);
    } catch (error) {
      console.warn(`Approved wallet sync skipped: ${error.message}`);
    }
  }

  console.log("Seed complete.");
  console.log(`Admin email: ${admin.email}`);
  console.log(`Admin password: ${env.adminPassword}`);

  process.exit(0);
}

seed().catch((error) => {
  console.error(error);
  process.exit(1);
});
