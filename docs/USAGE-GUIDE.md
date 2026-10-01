# JanChain Voting: complete local usage guide

Use this guide to run a local demo, create an election, cast a ballot, and verify the result. The app also has a public [usage guide](http://localhost:5173/help) at `/help` once the client is running.

## Fast start with a project-local database

Run the demo without installing MongoDB as a Windows service. After `npm ci`, use:

```powershell
npm run setup:local -- --repair-defaults
npm run dev
```

Keep this terminal open. The launcher starts a persistent database on loopback, the local blockchain, the API, and the frontend. On the first run, it downloads a MongoDB binary (the Windows archive can be several hundred MB); later runs use the cached binary. Database files stay in `.codex-runtime/mongodb-data` across restarts and are not deleted on shutdown. An available configured database is reused; an unavailable remote database is never replaced with a local one.

The launcher does **not** deploy contracts, seed users, reset a running blockchain, or replace running API/client processes. If those apps are already running, stop their development terminals first, or run `npm run dev:db` separately to add only the missing database. An existing local Hardhat chain is reused.

In another terminal, once the chain has started, complete a **fresh local demo**:

```powershell
npm run deploy:localhost
npm run seed:missing
npm run doctor
```

Deployment updates environment contract addresses. The development API and frontend automatically reload those files; keep the launcher running so its blockchain stays alive. Do not redeploy an existing demo just to restart its API or frontend. `seed:missing` adds missing demo accounts while preserving existing passwords, wallets, and approval states; see step 4.

Open `http://localhost:5173/help`, sign in as `admin@civicledger.app` / `Admin@12345` unless customized, and follow steps 7–9 to publish and vote. Ctrl+C stops processes launched here; a Hardhat node started here loses its in-memory chain state when it stops. The database keeps its data.

`--repair-defaults` replaces only a missing or known placeholder development JWT secret. It backs up the file in `.codex-runtime/env-backups` and preserves other values. It refuses production configuration; after any secret replacement, restart the API and sign in again.

## 1. Prepare the project

Use Node.js 20.19 or newer, npm, a running MongoDB database, and a browser with MetaMask. Run project commands from the repository root. On Windows:

```powershell
Set-Location 'D:\My Projects\Blockchain Voting System'
npm ci
npm run setup:local
```

`setup:local` creates missing root, server, and client `.env` files from their examples. A newly created server file gets a random JWT secret and Hardhat account #0's public test key for local admin transactions and gasless voting. **Existing environment files are preserved**, including customized database URLs, passwords, and wallet keys.

For existing files, check the following values yourself. Do not put server keys in `client/.env`; every `VITE_` value is public in the client build.

| File | Setting | Local value or action |
| --- | --- | --- |
| `server/.env` | `NODE_ENV` | `development` |
| `server/.env` | `PORT` | `5000` |
| `server/.env` | `CLIENT_URL` | `http://localhost:5173` |
| `server/.env` | `MONGODB_URI` | The connection string for your running database; use the same database each time |
| `server/.env` | `JWT_SECRET` | A random secret; generate one below if your file contains a placeholder |
| `server/.env` | `RPC_URL` | `http://127.0.0.1:8545` |
| `server/.env` | `CHAIN_ID` | `31337` |
| `server/.env` | `SERVER_WALLET_PRIVATE_KEY` | Hardhat account #0's test key, shown when you start the local node |
| `server/.env` | `CONTRACT_ADDRESS` | Filled by local deployment in step 3 |
| `client/.env` | `VITE_API_URL` | `http://localhost:5000/api` |
| `client/.env` | `VITE_RPC_URL` | `http://127.0.0.1:8545` |
| `client/.env` | `VITE_CHAIN_ID` | `31337` |
| `client/.env` | `VITE_CHAIN_NAME` | `Hardhat Local` |
| `client/.env` | `VITE_CONTRACT_ADDRESS` | Filled by local deployment in step 3 |
| `client/.env` | `VITE_BLOCK_EXPLORER_URL` | Leave blank; localhost has no public block explorer |

Generate a JWT secret in your own terminal and put its output in `server/.env`:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Changing the secret invalidates existing sign-in tokens. Restart the API and sign in again afterwards.

## 2. Start MongoDB

For the project-local option, use `npm run dev:db` and keep its terminal open. If a database is already available, this command leaves it running and exits. If you used `npm run dev`, this step is already managed by the launcher. The system-service/Atlas instructions below remain available as alternatives.

The API cannot register users, sign them in, or load the catalog without MongoDB. Its health endpoint alone does not prove that the database works.

If MongoDB is installed as a Windows service, use a PowerShell terminal with service-management permission:

```powershell
Get-Service MongoDB
Start-Service MongoDB
```

If the service or `mongod.exe` is missing, install MongoDB Community Server following [MongoDB's Windows installation guide](https://www.mongodb.com/docs/v8.0/tutorial/install-mongodb-on-windows/), then start the service. MongoDB Compass is a client and does not replace a database server.

Alternatively, configure MongoDB Atlas: create a database user, allow your machine's IP, and set `MONGODB_URI` to your cluster's connection string. Use [MongoDB's Atlas connection instructions](https://www.mongodb.com/docs/atlas/connect-to-database-deployment/).

The sample environment file uses:

```dotenv
MONGODB_URI=mongodb://127.0.0.1:27017/civic-ledger-voting
```

Preserve an existing database name if you want to retain its users and catalog. Changing the database name opens a different database and can make your existing account appear missing.

## 3. Start the local blockchain and deploy

In **terminal 1**, start the chain and leave it running:

```powershell
npm run node
```

Hardhat prints funded test accounts and their private keys. These are public development credentials: never transfer real funds to them or use them on a public network. If your existing server file has no wallet key, copy account #0's test private key into `SERVER_WALLET_PRIVATE_KEY` in `server/.env`.

The local node mines immediately for transactions and every three seconds while idle, so scheduled elections become active on time. The test runner keeps its normal mining behavior. This follows [Hardhat's mining modes](https://v2.hardhat.org/hardhat-network/docs/guides/mining-modes).

In **terminal 2**, deploy:

```powershell
npm run deploy:localhost
```

The deployment script exports the current ABI and updates the contract address and chain ID in existing server/client environment files. You do not need to copy the address manually or run `sync:abi` again after this deployment command.

Expected confirmation: `DecentralizedVoting deployed to ...`, followed by environment-update messages. Account #0 is the contract administrator and can create elections, approve voters, and pause voting.

## 4. Create the local demo accounts

With MongoDB and Hardhat running, use terminal 2:

```powershell
npm run seed:missing
```

Run this only against a local demo database. `seed:missing` adds missing demo users, preserves existing account settings, and resyncs currently approved demo wallets on-chain. It is restricted to chain 31337 and blocked when `NODE_ENV=production`.

The separate `npm run seed` command **resets existing demo passwords, wallets, and approval states**. Use it only when intentionally resetting the sample accounts in a disposable demo database.

Unless you customized `ADMIN_EMAIL`/`ADMIN_PASSWORD`, the demo accounts are:

| Account | Email | Password | Wallet and initial state |
| --- | --- | --- | --- |
| Administrator | `admin@civicledger.app` | `Admin@12345` | Uses the server wallet for admin writes; no browser wallet needed to create elections |
| Approved demo voter | `ananya.rao@example.com` | `Voter@123` | Hardhat account #0; verified and approved |
| Pending demo voter | `ravi.sharma@example.com` | `Voter@123` | Hardhat account #1; verified but needs approval |

This is a demo shortcut. New voters created through the Register form must sign a wallet ownership message; entering an address does not approve or verify it. The seed creates users, **not elections**.

## 5. Start the API and web app

In **terminal 2**, after deployment and seeding:

```powershell
npm run dev:server
```

Wait for `MongoDB connected` and `API listening on http://localhost:5000`.

In **terminal 3**:

```powershell
npm run dev:client
```

Open `http://localhost:5173`. Use that exact origin unless you also changed `CLIENT_URL`; `localhost` and `127.0.0.1` are different browser origins. Vite must run on the configured port.

In another terminal, check readiness:

```powershell
npm run doctor
```

This read-only check verifies configuration, API liveness/readiness/catalog access, MongoDB, RPC chain ID, deployed bytecode, pause state, server-wallet funds, and required roles. It prints no secrets and exits with a nonzero status if a check fails. `/api/health` reports API liveness; `/api/ready` returns HTTP 503 until MongoDB is connected. Browser CORS and wallet prompts still need the walkthrough below.

## 6. Connect MetaMask to the local chain

You can let the app request the network switch. To add it manually, open MetaMask's network settings and choose **Add a custom network**. See the [official network instructions](https://support.metamask.io/configure/networks/how-to-add-a-custom-network-rpc).

| Field | Value |
| --- | --- |
| Network name | `Hardhat Local` |
| RPC URL | `http://127.0.0.1:8545` |
| Chain ID | `31337` |
| Currency symbol | `ETH` |
| Block explorer | Leave blank |

Import the funded Hardhat test account you will use, through MetaMask's account import flow. Use the single-account private-key import option, not a replacement of your existing wallet's recovery phrase. See [MetaMask's account import guide](https://support.metamask.io/start/use-an-existing-wallet/).

For the seeded Ananya account, choose Hardhat account #0 (`0xf39f...2266`). For Ravi, choose account #1 (`0x7099...79c8`). A newly generated MetaMask account has no local test ETH unless it is funded, so it cannot pay direct transaction fees yet.

## 7. Administrator: publish the first election

1. Sign in with the demo administrator. You should land on `/admin`.
2. Confirm Blockchain status is reachable, the server wallet has funds, and voting is unpaused.
3. In Create election, enter a title such as `Community Council Demo`, a description of at least 12 characters, and a category.
4. Choose **Approved voters** for the registration/approval workflow, or **Open poll** for any wallet. Open polls enforce one wallet per vote, not one person per vote.
5. Add at least two candidates with unique names. Set the start time **3–5 minutes in the future** and the end time about an hour later. These inputs use your browser's local time and are stored as UTC.
6. Select Create election and wait for on-chain publication. You should see a transaction confirmation and the election under Election activity.
7. Open Elections. The election should say `scheduled`, then become `active` once the chain reaches its start time. Refresh the board/eligibility if needed.

Admin publication uses the configured **server wallet**, not your connected MetaMask account. No browser transaction prompt is expected for creation or approval.

## 8. Voter: register, verify, and get approved

For the shortest demo, sign out of the admin account and sign in as Ananya with Hardhat account #0 selected in MetaMask. The seeded voter already has approval and wallet verification.

For the full onboarding flow:

1. Choose Register, enter your name/email, and use a password with 8+ characters, uppercase, lowercase, and a number. Wallet address is optional.
2. Sign in after registration. You should land on `/dashboard` or return to an election you opened before signing in.
3. Unlock MetaMask, select your voter wallet, and select Link wallet or Verify wallet ownership. Sign the ownership message. This is not a vote and costs no gas.
4. For a restricted election, sign out and sign in as the administrator. Find this voter under Voter approvals and select Approve. Verified wallets sync to the contract when the server is configured.
5. If a sync warning appears, resolve its cause and select Resync approval. Backend account approval alone is insufficient for a restricted on-chain vote.
6. Sign back in as the voter, connect the same wallet, switch to Hardhat Local, and open the active election.

To test a second voter without creating another account, approve the seeded Ravi account as the administrator, then sign in as Ravi and select Hardhat account #1 in MetaMask.

## 9. Cast and verify a ballot

1. Select one candidate on the election voting page and review the displayed choice. Votes and wallet addresses are public, and a confirmed ballot cannot be changed.
2. Select a submission method:
   - **Gasless:** sign the EIP-712 ballot in MetaMask. The server pays the fee. The signed ballot expires after ten minutes if it has not been submitted.
   - **Pay my own gas:** approve the contract transaction in MetaMask. Your connected wallet needs local test ETH.
3. Submit and wait for blockchain confirmation. Save the receipt's transaction hash and block number.
4. Open View results, or use the receipt's verification link. Enter your wallet under Verify a wallet receipt to confirm the candidate and transaction.
5. On `/dashboard`, check My ballots. Try revisiting the same election: the contract prevents this wallet from casting another vote.

If submission times out, verify the wallet receipt before retrying. The transaction may already have confirmed even if the client did not receive its response.

On localhost, a transaction hash is still useful even though there is no public explorer. Results/receipt reads and the Hardhat node can verify it.

## 10. Vote directly without the catalog API

Open `/chain` or choose On-chain. It reads elections and candidate totals from the contract through `VITE_RPC_URL`.

Connect MetaMask, choose the expected network, select a candidate in an active election, review the ballot, and select Confirm and vote on-chain. No account, database, or relayer is needed for this path. You pay gas, and restricted elections still require prior on-chain approval.

The catalog `/elections` and direct `/chain` page share the same deployed contract: a vote submitted through either route counts once in the same tally.

## 11. Manage the election and restart safely

- Use Extend voting window before an election ends to move its end time later.
- Use End election now on an active election to close it permanently.
- Pause all voting is an emergency stop for every election. Reads continue. Resume voting re-enables voting within elections' remaining windows.
- Keep terminal 1 running for the whole demo. A stopped/restarted Hardhat node loses its in-memory contracts, approvals, elections, and votes.
- After a chain reset, redeploy, restart the API/client, resync demo approvals (or reseed the demo database), and create a new election. Old catalog entries can no longer represent live chain state, even if a fresh deployment happens to reuse the old address. Use a separate demo database for a fresh walkthrough instead of deleting data you want to keep.
- The development API and frontend reload their `.env` files automatically. Production processes need a restart or rebuild. After installing updated dependencies, restart all Node services while accounting for the local chain reset described above.

## Troubleshooting

| Symptom | Recovery |
| --- | --- |
| Login/register hangs or catalog times out | Run `npm run doctor`. Start MongoDB and restart the API; a healthy `/api/health` response is not enough. |
| Invalid credentials | Seed the intended **demo** database once, check any custom admin credentials, and use the documented account/password. |
| Still on sign-in after success | Refresh the updated client. Saved sessions redirect automatically; tokens issued before issuer/audience validation or a secret change need a fresh login. |
| Chain unavailable / no deployed contract | Start Hardhat, deploy, confirm the two environment contract addresses match, then restart both apps. |
| Wrong network or mismatched wallet | Use the network details on `/help` and select the profile's verified account in MetaMask. |
| Vote button disabled | Check active dates, pause state, candidate selection, wallet verification/match, expected network, on-chain approval, and whether you already voted. |
| Account approved but wallet rejected | Administrator: Resync approval after ownership verification. Check wallet roles/funds with `doctor`. |
| Gasless submission fails | Check relayer funds, server key and roles, and ballot expiry; verify the receipt, then sign again or use direct voting. |
| Missing server role | Use Hardhat's deploying account #0 locally. A different server wallet needs role grants from the contract administrator. |
| CORS error or Vite moved to another port | Use `http://localhost:5173`, free that port, or update `CLIENT_URL` and `VITE_API_URL` as appropriate; restart services. |
| “Already known” / stale transaction nonce after a local reset | Check the current chain's receipt/state. Clear the test account's activity in MetaMask using its official troubleshooting flow, then reconnect; keep real accounts separate. |

## Validation and production boundary

Run the automated project checks with:

```powershell
npm run check
```

This compiles contracts, lints both workspaces, runs contract/API/client tests, and builds the client. Tests do not prove a complete interactive MetaMask demo or production election readiness.

With the local services running and demo administrator credentials seeded, verify the live API/blockchain flow with:

```powershell
npm run doctor
npm run smoke:local
```

`smoke:local` registers a disposable voter, signs a wallet verification challenge, approves the voter, creates an election, waits for it to become active on idle blocks, signs and relays a ballot, and checks results, its receipt, and My ballots. It then closes its election and revokes its voter approval. The test records remain visible in the demo database and chain. This command writes test data and is restricted to a loopback API/RPC and local chain 31337; it never prints credentials or tokens. A full MetaMask interaction is still a separate browser check.

This guide is for a **local demonstration**. Real deployment requires persistent RPC infrastructure, funded and protected keys, deliberate administrator governance, secure session handling, and an independent review. Public ballot choices, one-wallet rules, centrally operated approvals/accounts, and tooling audit limitations are described in [UI and security review](UI-SECURITY-REVIEW.md).
