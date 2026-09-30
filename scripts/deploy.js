const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

const rootDir = path.join(__dirname, "..");

function upsertEnvValue(filePath, key, value) {
  if (!fs.existsSync(filePath)) {
    return false;
  }

  const contents = fs.readFileSync(filePath, "utf8");
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, "m");
  const next = pattern.test(contents)
    ? contents.replace(pattern, line)
    : `${contents.replace(/\s*$/, "")}\n${line}\n`;

  fs.writeFileSync(filePath, next);
  return true;
}

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const { ELECTION_ADMIN_ADDRESS, VOTER_APPROVER_ADDRESS } = process.env;

  console.log(`Deploying from ${deployer.address}`);

  const Voting = await hre.ethers.getContractFactory("DecentralizedVoting");
  const voting = await Voting.deploy();
  await voting.waitForDeployment();

  const contractAddress = await voting.getAddress();

  if (ELECTION_ADMIN_ADDRESS && ELECTION_ADMIN_ADDRESS !== deployer.address) {
    const role = await voting.ELECTION_ADMIN_ROLE();
    const tx = await voting.grantRole(role, ELECTION_ADMIN_ADDRESS);
    await tx.wait();
  }

  if (VOTER_APPROVER_ADDRESS && VOTER_APPROVER_ADDRESS !== deployer.address) {
    const role = await voting.VOTER_APPROVER_ROLE();
    const tx = await voting.grantRole(role, VOTER_APPROVER_ADDRESS);
    await tx.wait();
  }

  const networkName = hre.network.name;
  const chainId = Number(hre.network.config.chainId || 0);
  const deploymentPath = path.join(rootDir, "deployments", `${networkName}.json`);
  const deployment = {
    network: networkName,
    chainId,
    contractAddress,
    deployer: deployer.address,
    deployedAt: new Date().toISOString(),
  };

  fs.mkdirSync(path.dirname(deploymentPath), { recursive: true });
  fs.writeFileSync(deploymentPath, JSON.stringify(deployment, null, 2));

  console.log(`DecentralizedVoting deployed to ${contractAddress}`);

  // Keep the ABI in the apps in sync with what was just deployed.
  require("./export-artifacts");

  const serverEnv = path.join(rootDir, "server", ".env");
  const clientEnv = path.join(rootDir, "client", ".env");
  const updated = [
    upsertEnvValue(serverEnv, "CONTRACT_ADDRESS", contractAddress) &&
      upsertEnvValue(serverEnv, "CHAIN_ID", chainId) &&
      "server/.env",
    upsertEnvValue(clientEnv, "VITE_CONTRACT_ADDRESS", contractAddress) &&
      upsertEnvValue(clientEnv, "VITE_CHAIN_ID", chainId) &&
      "client/.env",
  ].filter(Boolean);

  if (updated.length) {
    console.log(`Updated contract address in ${updated.join(" and ")}. Restart the API and client to pick it up.`);
  } else {
    console.log("No .env files found. Copy the .env.example files and set CONTRACT_ADDRESS / VITE_CONTRACT_ADDRESS.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
