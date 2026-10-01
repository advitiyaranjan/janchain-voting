const fs = require("node:fs");
const path = require("node:path");
const dotenv = require("dotenv");
const mongoose = require("mongoose");
const { Contract, FetchRequest, JsonRpcProvider, Wallet, id, ZeroHash, isAddress } = require("ethers");
const artifact = require("../server/src/blockchain/DecentralizedVoting.json");

const root = path.join(__dirname, "..");
let failures = 0;
function report(ok, label, help = "") {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${!ok && help ? ` — ${help}` : ""}`);
}
function readEnv(directory) {
  const file = path.join(root, directory, ".env");
  report(fs.existsSync(file), `${directory}/.env exists`, "Run npm run setup:local.");
  return fs.existsSync(file) ? dotenv.parse(fs.readFileSync(file)) : {};
}
async function request(url, body) {
  const response = await fetch(url, { signal: AbortSignal.timeout(5000),
    ...(body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) throw new Error("Service unavailable");
  return response;
}

async function main() {
  console.log("JanChain readiness check (read-only; credentials are never printed)\n");
  const [major, minor] = process.versions.node.split(".").map(Number);
  report(major > 20 || (major === 20 && minor >= 19), "Node.js 20.19 or newer");
  const server = readEnv("server");
  const client = readEnv("client");
  const expectedChainId = Number(server.CHAIN_ID || 31337);
  const address = server.CONTRACT_ADDRESS;
  report(Number(client.VITE_CHAIN_ID || 31337) === expectedChainId, "Client and API chain IDs match", "Use the same network in both environment files.");
  report(isAddress(address || "") && address.toLowerCase() === (client.VITE_CONTRACT_ADDRESS || "").toLowerCase(), "Client and API contract addresses match", "Run npm run deploy:localhost for a local deployment, then restart both apps.");
  report(Boolean(server.JWT_SECRET && !["development-only-secret", "change-this-in-production"].includes(server.JWT_SECRET) && Buffer.byteLength(server.JWT_SECRET) >= 32), "Random JWT secret is configured", "Generate one with node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\" and put it in server/.env.");
  report(Boolean(client.VITE_RPC_URL), "Browser RPC URL is configured", "Set VITE_RPC_URL in client/.env for /chain reads.");
  const apiUrl = client.VITE_API_URL || "http://localhost:5000/api";
  const origin = server.CLIENT_URL || "http://localhost:5173";
  await Promise.all([
    (async () => {
      try {
        const base = apiUrl.replace(/\/$/, "");
        const response = await request(`${base}/health`);
        const health = await response.json();
        report(health.status === "ok", "API health endpoint responds");
        try { const ready = await (await request(`${base}/ready`)).json(); report(ready.status === "ready", "API database readiness endpoint passes"); }
        catch (_error) { report(false, "API database readiness endpoint passes", "Start MongoDB and restart the updated API."); }
        try { const stats = await (await request(`${base}/elections/stats`)).json(); report(Boolean(stats.stats), "API can read the election catalog", "Check MongoDB and restart the API."); }
        catch (_error) { report(false, "API can read the election catalog", "The health route can respond while MongoDB is unavailable. Start MongoDB and restart the API."); }
      }
      catch (_error) { report(false, "API health endpoint responds", "Start npm run dev:server; check the API URL and MongoDB connection."); }
    })(),
    (async () => {
      try { const response = await request(origin); report((await response.text()).includes('id="root"'), "React frontend responds"); }
      catch (_error) { report(false, "React frontend responds", "Start npm run dev:client and use the configured CLIENT_URL."); }
    })(),
    (async () => {
      let connection;
      try { connection = await mongoose.createConnection(server.MONGODB_URI || "mongodb://127.0.0.1:27017/janchain-voting", { serverSelectionTimeoutMS: 4000, connectTimeoutMS: 4000 }).asPromise(); await connection.db.command({ ping: 1 }); report(true, "MongoDB accepts a connection"); }
      catch (_error) { report(false, "MongoDB accepts a connection", "Start MongoDB or check MONGODB_URI, credentials, and Atlas network access."); }
      finally { if (connection) await connection.close(); }
    })(),
  ]);

  let provider;
  try {
    const response = await request(server.RPC_URL || "http://127.0.0.1:8545", { jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] });
    const chain = await response.json();
    if (chain.error || !chain.result) throw new Error("Invalid RPC response");
    const matches = Number(BigInt(chain.result)) === expectedChainId;
    report(matches, "RPC responds on the expected chain", "Start npm run node for local development, or correct RPC_URL and CHAIN_ID.");
    if (!matches) return;
    if (!isAddress(address || "")) return;
    const codeResponse = await request(server.RPC_URL || "http://127.0.0.1:8545", { jsonrpc: "2.0", id: 2, method: "eth_getCode", params: [address, "latest"] });
    const code = await codeResponse.json();
    const deployed = Boolean(code.result && code.result !== "0x");
    report(deployed, "Voting contract is deployed", "A restarted local node loses its chain. Redeploy and restart the API and client.");
    if (!deployed) return;
    const rpcRequest = new FetchRequest(server.RPC_URL || "http://127.0.0.1:8545");
    rpcRequest.timeout = 5000;
    provider = new JsonRpcProvider(rpcRequest, expectedChainId);
    const contract = new Contract(address, artifact.abi, provider);
    const paused = await contract.paused();
    report(!paused, "Voting is unpaused", "Use Resume voting in the admin console.");
    let wallet;
    try { wallet = new Wallet(server.SERVER_WALLET_PRIVATE_KEY); }
    catch (_error) { report(false, "Server wallet is configured", "For localhost, copy account #0's test private key from the Hardhat node into server/.env. Keep real keys out of client settings."); return; }
    const [balance, admin, approver, pauser] = await Promise.all([
      provider.getBalance(wallet.address), contract.hasRole(id("ELECTION_ADMIN_ROLE"), wallet.address),
      contract.hasRole(id("VOTER_APPROVER_ROLE"), wallet.address), contract.hasRole(ZeroHash, wallet.address),
    ]);
    report(balance > 0n, "Server wallet has gas funds", "Use the funded Hardhat deployer locally; on a testnet, fund the configured relayer wallet.");
    report(admin && approver, "Server wallet can create elections and approve voters", "Use the local deployer wallet or grant the required roles from the contract administrator.");
    report(pauser, "Server wallet can pause and resume voting", "The admin console's pause action requires DEFAULT_ADMIN_ROLE.");
    // Independently verify the endpoint used by the browser, without trusting the server endpoint.
    if (client.VITE_RPC_URL) {
      const browserResponse = await request(client.VITE_RPC_URL, { jsonrpc: "2.0", id: 3, method: "eth_chainId", params: [] });
      const browserChain = await browserResponse.json();
      report(Boolean(browserChain.result) && Number(BigInt(browserChain.result)) === expectedChainId, "Browser RPC targets the expected chain", "Correct VITE_RPC_URL and restart Vite. Browser CORS and MetaMask still require a browser check.");
    }
  } catch (_error) {
    report(false, "Blockchain readiness checks complete", "Check RPC availability, contract ABI, address, and server wallet configuration.");
  } finally {
    provider?.destroy();
  }
}

main().catch(() => report(false, "Readiness checks completed", "Check your environment files and installed dependencies.")).finally(() => {
  console.log(`\n${failures ? `${failures} check(s) need attention. See docs/USAGE-GUIDE.md.` : "Services and configuration are ready. Continue with the browser walkthrough in docs/USAGE-GUIDE.md."}`);
  process.exitCode = failures ? 1 : 0;
});
