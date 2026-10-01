const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { HDNodeWallet } = require("ethers");
const dotenv = require("dotenv");

const root = path.join(__dirname, "..");
const localWallet = HDNodeWallet.fromPhrase("test test test test test test test test test test test junk");

for (const directory of ["", "server", "client"]) {
  const label = directory ? `${directory}/.env` : ".env";
  const target = path.join(root, directory, ".env");
  if (fs.existsSync(target)) {
    if (directory === "server" && process.argv.includes("--repair-defaults")) {
      const existing = fs.readFileSync(target, "utf8");
      const config = dotenv.parse(existing);
      if (config.NODE_ENV === "production" || process.env.NODE_ENV === "production") throw new Error("Repair local defaults only in a development environment.");
      if (!config.JWT_SECRET || ["development-only-secret", "change-this-in-production"].includes(config.JWT_SECRET)) {
        const backupDirectory = path.join(root, ".codex-runtime", "env-backups");
        fs.mkdirSync(backupDirectory, { recursive: true });
        fs.writeFileSync(path.join(backupDirectory, `server-${Date.now()}.env`), existing, { flag: "wx", mode: 0o600 });
        const line = `JWT_SECRET=${crypto.randomBytes(32).toString("hex")}`;
        const updated = /^JWT_SECRET=.*$/m.test(existing) ? existing.replace(/^JWT_SECRET=.*$/m, line) : `${existing.trimEnd()}\n${line}\n`;
        fs.writeFileSync(target, updated, { mode: 0o600 });
        console.log("Replaced the placeholder JWT secret in server/.env. Backup saved under .codex-runtime/env-backups. Restart the API and sign in again.");
        continue;
      }
    }
    console.log(`Preserved existing ${label}.`);
    continue;
  }
  let contents = fs.readFileSync(path.join(root, directory, ".env.example"), "utf8");
  if (directory === "server") {
    contents = contents.replace(/^JWT_SECRET=.*$/m, `JWT_SECRET=${crypto.randomBytes(32).toString("hex")}`);
    contents = contents.replace(/^SERVER_WALLET_PRIVATE_KEY=.*$/m, `SERVER_WALLET_PRIVATE_KEY=${localWallet.privateKey}`);
  }
  fs.writeFileSync(target, contents, { flag: "wx", mode: 0o600 });
  console.log(`Created ${label} for local development.`);
}
console.log("New server configuration uses a public Hardhat test wallet. Use it only on the local chain (31337).");
console.log("Next: npm run dev, then in another terminal npm run deploy:localhost and npm run seed:missing.");
console.log("Existing values are preserved unless --repair-defaults replaced a missing/known placeholder JWT secret. Run npm run doctor to check readiness.");
