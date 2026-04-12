const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

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
  const deploymentPath = path.join(__dirname, "..", "deployments", `${networkName}.json`);
  const deployment = {
    network: networkName,
    chainId: Number(hre.network.config.chainId || 0),
    contractAddress,
    deployer: deployer.address,
    deployedAt: new Date().toISOString(),
  };

  fs.mkdirSync(path.dirname(deploymentPath), { recursive: true });
  fs.writeFileSync(deploymentPath, JSON.stringify(deployment, null, 2));

  console.log(`DecentralizedVoting deployed to ${contractAddress}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
