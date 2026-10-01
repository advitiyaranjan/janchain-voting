require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

const {
  SEPOLIA_RPC_URL,
  AMOY_RPC_URL,
  DEPLOYER_PRIVATE_KEY,
  ETHERSCAN_API_KEY,
  POLYGONSCAN_API_KEY,
} = process.env;

const accounts = DEPLOYER_PRIVATE_KEY ? [DEPLOYER_PRIVATE_KEY] : [];

module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      viaIR: true,
      evmVersion: "cancun",
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    hardhat: {
      chainId: 31337,
      // Keep scheduled demo elections moving without changing unit-test mining.
      mining: { auto: true, interval: process.argv.includes("node") ? 3000 : 0 },
    },
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 31337,
    },
    sepolia: {
      url: SEPOLIA_RPC_URL || "",
      accounts,
      chainId: 11155111,
    },
    amoy: {
      url: AMOY_RPC_URL || "https://rpc-amoy.polygon.technology",
      accounts,
      chainId: 80002,
    },
  },
  etherscan: {
    apiKey: {
      sepolia: ETHERSCAN_API_KEY || "",
      polygonAmoy: POLYGONSCAN_API_KEY || "",
    },
  },
};
