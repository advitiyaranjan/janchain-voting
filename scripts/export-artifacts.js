const fs = require("fs");
const path = require("path");

const artifactPath = path.join(
  __dirname,
  "..",
  "artifacts",
  "contracts",
  "DecentralizedVoting.sol",
  "DecentralizedVoting.json"
);

const outputTargets = [
  path.join(__dirname, "..", "server", "src", "blockchain", "DecentralizedVoting.json"),
  path.join(__dirname, "..", "client", "src", "blockchain", "DecentralizedVoting.json"),
];

if (!fs.existsSync(artifactPath)) {
  console.error("Artifact not found. Run `npm run compile` first.");
  process.exit(1);
}

const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));

for (const target of outputTargets) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(
    target,
    JSON.stringify(
      {
        contractName: artifact.contractName,
        abi: artifact.abi,
      },
      null,
      2
    )
  );
}

console.log("ABI exported to client and server.");
