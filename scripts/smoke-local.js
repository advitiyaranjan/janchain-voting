const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const dotenv = require("dotenv");
const { Wallet, JsonRpcProvider } = require("ethers");

const root = path.join(__dirname, "..");
const server = dotenv.parse(fs.readFileSync(path.join(root, "server", ".env")));
const client = dotenv.parse(fs.readFileSync(path.join(root, "client", ".env")));
const api = client.VITE_API_URL || "http://localhost:5000/api";
let adminToken;
let voterId;
let electionId;
let provider;

async function request(route, method = "GET", body, token) {
  const response = await fetch(`${api.replace(/\/$/, "")}${route}`, {
    method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(20000),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`${route}: ${data.message || "Request failed"}`);
  return data;
}
function check(value, message) { if (!value) throw new Error(message); }

async function main() {
  const rpc = new URL(server.RPC_URL || "http://127.0.0.1:8545");
  const apiEndpoint = new URL(api);
  check(server.NODE_ENV !== "production" && process.env.NODE_ENV !== "production" && Number(server.CHAIN_ID) === 31337 && ["localhost", "127.0.0.1"].includes(rpc.hostname) && ["localhost", "127.0.0.1"].includes(apiEndpoint.hostname), "This smoke test is restricted to the local development API and chain 31337.");
  provider = new JsonRpcProvider(rpc.href);
  check((await provider.getNetwork()).chainId === 31337n, "The RPC is not the local Hardhat chain.");
  console.log("Local smoke test creates a test voter, election, and ballot. It closes the test election and revokes its voter approval afterwards.");
  const admin = await request("/auth/login", "POST", { email: server.ADMIN_EMAIL || "admin@civicledger.app", password: server.ADMIN_PASSWORD || "Admin@12345" });
  adminToken = admin.token;
  check(admin.user.role === "admin", "The configured demo account is not an administrator.");
  console.log("PASS  Administrator sign-in");

  const wallet = Wallet.createRandom();
  const suffix = crypto.randomBytes(6).toString("hex");
  const email = `smoke-${suffix}@example.test`;
  const password = `LocalCheck1${crypto.randomBytes(16).toString("hex")}`;
  const registration = await request("/auth/register", "POST", { fullName: "Local Smoke Test", email, password });
  voterId = registration.user.id;
  const login = await request("/auth/login", "POST", { email, password });
  let voterToken = login.token;
  const challenge = await request("/auth/wallet/challenge", "POST", { walletAddress: wallet.address, intent: "link" }, voterToken);
  const verified = await request("/auth/wallet/verify", "POST", { walletAddress: wallet.address, intent: "link", signature: await wallet.signMessage(challenge.message) }, voterToken);
  voterToken = verified.token;
  check(Boolean(verified.user.linkedWalletAt), "Wallet ownership was not recorded.");
  const approval = await request(`/admin/users/${voterId}/approval`, "PATCH", { approved: true }, adminToken);
  check(approval.transactionHash && !approval.warning, "Voter approval did not sync to the contract.");
  console.log("PASS  Voter registration, sign-in, wallet verification, and on-chain approval");

  const latestBlock = await provider.getBlock("latest");
  const start = Math.max(Date.now(), latestBlock.timestamp * 1000) + 12000;
  check(start - Date.now() < 60000, "The local chain clock is too far ahead for this test; restart a fresh demo chain or use the manual walkthrough.");
  const created = await request("/admin/elections", "POST", {
    title: `Local setup check ${suffix}`, description: "Disposable election for the complete local API and blockchain readiness check.",
    category: "Setup checks", accessMode: "restricted", startTime: new Date(start).toISOString(),
    endTime: new Date(start + 3600000).toISOString(), candidates: [{ name: "Option A" }, { name: "Option B" }],
  }, adminToken);
  electionId = created.election.id;
  console.log("PASS  Administrator election publication; waiting briefly for its voting window");
  await new Promise((resolve) => setTimeout(resolve, Math.max(0, start - Date.now()) + 1500));
  let ballotData;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    ballotData = await request(`/elections/${electionId}`, "GET", undefined, voterToken);
    if (ballotData.election.isActive) break;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  check(ballotData.election.onChainAvailable && ballotData.election.isActive, "The scheduled election did not become active. Start the local node with npm run node to enable its idle blocks.");
  console.log("PASS  Scheduled election becomes active without another transaction");
  check(ballotData.ballot?.gaslessEnabled, "The gasless relayer is unavailable.");
  const domain = ballotData.ballot.domain;
  check(Number(domain.chainId) === 31337 && domain.verifyingContract.toLowerCase() === server.CONTRACT_ADDRESS.toLowerCase(), "The API signing domain does not match the local deployment.");
  const deadline = Math.floor(Date.now() / 1000) + 600;
  const signature = await wallet.signTypedData(domain, { Ballot: [
    { name: "electionId", type: "uint256" }, { name: "candidateId", type: "uint256" },
    { name: "voter", type: "address" }, { name: "deadline", type: "uint256" },
  ] }, { electionId: created.election.onChainElectionId, candidateId: 1, voter: wallet.address, deadline });
  const submitted = await request(`/elections/${electionId}/relay-vote`, "POST", { candidateId: 1, voterAddress: wallet.address, deadline, signature }, voterToken);
  const [receipt, results, ballots] = await Promise.all([
    request(`/elections/${electionId}/verify/${wallet.address}`), request(`/elections/${electionId}/results`),
    request("/elections/me/ballots", "GET", undefined, voterToken),
  ]);
  check(receipt.verification.hasVoted && receipt.verification.candidateId === 1, "The recorded ballot does not match the vote.");
  check(receipt.verification.transactionHash === submitted.receipt.transactionHash, "The receipt transaction does not match the relayed vote.");
  check(results.results.totalVotes === 1 && ballots.ballots.some((ballot) => ballot.electionId === electionId), "Results or My ballots did not reflect the confirmed vote.");
  console.log("PASS  Gasless ballot, results, wallet receipt, and My ballots");
  console.log(`Receipt: ${submitted.receipt.transactionHash}`);
}

main().catch((error) => { console.error(`FAIL  ${error.message}`); process.exitCode = 1; }).finally(async () => {
  if (electionId) {
    try { await request(`/admin/elections/${electionId}/end`, "PATCH", {}, adminToken); console.log("Closed the disposable test election."); }
    catch (_error) { console.error("Could not close the test election; use the admin console."); process.exitCode = 1; }
  }
  if (voterId && adminToken) {
    try { const revoked = await request(`/admin/users/${voterId}/approval`, "PATCH", { approved: false }, adminToken); check(!revoked.warning, "Revocation did not sync."); console.log("Revoked the disposable test voter's approval."); }
    catch (_error) { console.error("Could not revoke the test voter; use the admin console."); process.exitCode = 1; }
  }
  provider?.destroy();
});
