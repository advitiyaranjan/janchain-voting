require("dotenv").config({ path: require("path").join(__dirname, "../../.env") });

if (process.env.NODE_ENV === "production" &&
  (!process.env.JWT_SECRET || Buffer.byteLength(process.env.JWT_SECRET, "utf8") < 32 || process.env.JWT_SECRET === "development-only-secret")) {
  throw new Error("Production requires a JWT_SECRET of at least 32 bytes.");
}

module.exports = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT || 5000),
  clientUrl: process.env.CLIENT_URL || "http://localhost:5173",
  mongodbUri: process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/janchain-voting",
  jwtSecret: process.env.JWT_SECRET || "development-only-secret",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",
  rpcUrl: process.env.RPC_URL || "http://127.0.0.1:8545",
  chainId: Number(process.env.CHAIN_ID || 31337),
  contractAddress: process.env.CONTRACT_ADDRESS || "",
  serverWalletPrivateKey: process.env.SERVER_WALLET_PRIVATE_KEY || "",
  pinataJwt: process.env.PINATA_JWT || "",
  adminEmail: process.env.ADMIN_EMAIL || "admin@civicledger.app",
  adminPassword: process.env.ADMIN_PASSWORD || "Admin@12345",
  adminName: process.env.ADMIN_NAME || "Election Commissioner",
};
