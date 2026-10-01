const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const dotenv = require("dotenv");
const { ensureLocalDatabase } = require("./local-db");

const root = path.join(__dirname, "..");
const children = [];
let database;
let stopping = false;

async function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (process.platform === "win32" && child.pid) {
      await new Promise((resolve) => {
        const killer = spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
        killer.once("error", resolve);
        killer.once("exit", resolve);
      });
    } else { child.kill("SIGTERM"); }
  }
  if (database) await database.stop({ doCleanup: false });
  process.exitCode = code;
}

function run(name, script) {
  if (!process.env.npm_execpath) throw new Error("Start this launcher with npm run dev.");
  const child = spawn(process.execPath, [process.env.npm_execpath, "run", script], {
    cwd: root, windowsHide: true, stdio: "inherit",
  });
  children.push(child);
  child.once("error", () => { console.error(`${name} could not start.`); stop(1); });
  child.once("exit", (code) => { if (!stopping) { console.error(`${name} stopped. Stopping the services started by this launcher.`); stop(code || 1); } });
}

async function reachable(url) {
  try { return (await fetch(url, { signal: AbortSignal.timeout(1500) })).ok; }
  catch (_error) { return false; }
}

async function main() {
  require("./setup-local");
  const server = dotenv.parse(fs.readFileSync(path.join(root, "server", ".env")));
  if (server.NODE_ENV === "production" || process.env.NODE_ENV === "production") throw new Error("Use this launcher only for local development.");
  if (Number(server.CHAIN_ID || 31337) !== 31337) throw new Error("Use the separate development commands for a public testnet; npm run dev manages the local Hardhat chain.");
  const rpc = new URL(server.RPC_URL || "http://127.0.0.1:8545");
  if (!["localhost", "127.0.0.1"].includes(rpc.hostname) || rpc.port !== "8545") throw new Error("The combined launcher needs the local RPC on port 8545. Use the separate commands for a custom RPC endpoint.");
  // Avoid silently replacing any running services or losing a live local chain.
  const apiUrl = `http://localhost:${server.PORT || 5000}/api/health`;
  const clientUrl = server.CLIENT_URL || "http://localhost:5173";
  if (await reachable(apiUrl) || await reachable(clientUrl)) {
    throw new Error("The API or frontend is already running. Stop their development terminals before npm run dev, or use npm run dev:db to add only the database.");
  }
  database = await ensureLocalDatabase();
  if (stopping) {
    if (database) await database.stop({ doCleanup: false });
    return;
  }
  let chainId;
  try {
    const response = await fetch("http://127.0.0.1:8545", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }), signal: AbortSignal.timeout(1500) });
    chainId = (await response.json()).result;
  } catch (_error) { /* The local chain needs starting. */ }
  if (stopping) return;
  if (chainId && Number(BigInt(chainId)) !== 31337) throw new Error("Port 8545 serves a different chain. Stop that service or use the manual commands with your configured network.");
  if (chainId) {
    const response = await fetch("http://127.0.0.1:8545", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "evm_setIntervalMining", params: [3000] }),
      signal: AbortSignal.timeout(1500),
    });
    if ((await response.json()).error) throw new Error("The existing local node does not support Hardhat interval mining. Use the separate commands for your RPC.");
    console.log("Reusing the existing Hardhat node; scheduled elections advance with blocks every three seconds.");
  } else run("Hardhat", "node");
  run("API", "dev:server");
  run("Frontend", "dev:client");
  console.log("\nDevelopment services are starting. In another terminal, deploy/seed if needed, then run npm run doctor.");
  console.log(`Open ${clientUrl}/help for the usage walkthrough. Ctrl+C stops only services started here.`);
}

process.once("SIGINT", () => stop());
process.once("SIGTERM", () => stop());
main().catch((error) => { console.error(error.message); stop(1); });
