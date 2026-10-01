const fs = require("node:fs");
const path = require("node:path");
const dotenv = require("dotenv");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server-core");

const root = path.join(__dirname, "..");

async function ensureLocalDatabase() {
  const file = path.join(root, "server", ".env");
  if (!fs.existsSync(file)) throw new Error("Run npm run setup:local first.");
  const config = dotenv.parse(fs.readFileSync(file));
  if (config.NODE_ENV === "production" || process.env.NODE_ENV === "production") {
    throw new Error("The project-local database helper is for development only.");
  }
  const uri = config.MONGODB_URI || "mongodb://127.0.0.1:27017/janchain-voting";
  let connection;
  try {
    connection = mongoose.createConnection(uri, { serverSelectionTimeoutMS: 2000, connectTimeoutMS: 2000 });
    await connection.asPromise();
    await connection.db.command({ ping: 1 });
    console.log("MongoDB is already available; preserving the existing database service.");
    return null;
  } catch (_error) {
    // A managed instance can only be provisioned for an unauthenticated loopback URI.
  } finally {
    if (connection) await connection.close().catch(() => {});
  }
  let parsed;
  try { parsed = new URL(uri); } catch (_error) { throw new Error("MONGODB_URI is invalid. Check server/.env."); }
  if (parsed.protocol !== "mongodb:" || !["localhost", "127.0.0.1"].includes(parsed.hostname) || parsed.username || parsed.password) {
    throw new Error("The configured database is unavailable. Start your configured MongoDB/Atlas service; this helper only provisions an unauthenticated localhost database.");
  }
  const port = Number(parsed.port || 27017);
  const dbPath = path.join(root, ".codex-runtime", "mongodb-data");
  const downloadDir = path.join(root, ".codex-runtime", "mongodb-binaries");
  fs.mkdirSync(dbPath, { recursive: true });
  fs.mkdirSync(downloadDir, { recursive: true });
  console.log("Starting a persistent local MongoDB. The first run downloads the MongoDB binary; allow it to finish.");
  const instance = new MongoMemoryServer({
    instance: { ip: "127.0.0.1", port, dbPath, storageEngine: "wiredTiger" },
    binary: { downloadDir },
  });
  await instance.start(true);
  console.log(`MongoDB is ready on 127.0.0.1:${port}. Data persists in .codex-runtime/mongodb-data.`);
  return instance;
}

if (require.main === module) {
  let instance;
  const stop = async () => {
    if (instance) await instance.stop({ doCleanup: false });
    process.exit(0);
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  ensureLocalDatabase().then((started) => {
    instance = started;
    if (!instance) return;
    console.log("Keep this terminal open. Ctrl+C stops the database without deleting its data.");
  }).catch((error) => { console.error(error.message); process.exitCode = 1; });
}

module.exports = { ensureLocalDatabase };
