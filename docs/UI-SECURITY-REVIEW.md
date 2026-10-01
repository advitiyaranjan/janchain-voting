# UI, security, and direct blockchain access

## Changes

- Active navigation, mobile navigation spacing, keyboard focus, skip link, real radio selections, accessible alerts, and links without nested buttons.
- Persistent error states and retries for the election board, dashboard, voting, and results. Older search responses cannot overwrite current filters; failed live refreshes show the timestamp of retained results.
- Ballot review, disabled controls during submission, password guidance/autofill, and election time/candidate validation.
- Page code splitting: the initial JavaScript bundle is about 285 kB instead of about 603 kB before these changes (uncompressed).
- `/chain` reads paginated election metadata and results directly from the configured RPC and contract. Any connected wallet can submit a direct transaction without an API account; contract approval still applies to restricted elections.
- Wallet transactions check the actual network, deployed bytecode, selected account, and current contract eligibility. Signed ballot domains must match the application's configured name, version, chain, and contract, following the domain fields defined by [EIP-712](https://eips.ethereum.org/EIPS/eip-712).
- Wallet challenges identify the application and chain and are consumed atomically. Concurrent verification cannot reuse a challenge. Verified wallets cannot be casually replaced; new registrations store optional wallet hints separately until ownership is proven.
- Reads prefer contract election titles, descriptions, dates, access rules, candidate names, and vote totals. Unavailable data is distinguished from zero votes and absent receipts. Old-deployment election URLs and administration actions are rejected.
- JWT validation pins HS256, issuer, and audience. Production refuses missing/short JWT secrets. Production errors hide internal server details. Demo seeding is blocked in production, and passwords are no longer printed by the seed script.
- Updated dependency lockfile and React Router 7; scoped Express's `qs` dependency to a patched release. Production dependency audit reports zero known vulnerabilities at verification time.
- Local setup includes a persistent loopback database helper, a combined development launcher, read-only readiness checks, preserving demo seeding, and an opt-in API/blockchain smoke test. Local idle blocks advance scheduled elections. Server transaction submission disables cached pending nonces to avoid failures during rapid sequential admin actions, as supported by [ethers provider options](https://docs.ethers.org/v6/api/providers/abstract-provider/#AbstractProviderOptions).

## Setup and rollout

1. Run `npm ci` with the updated lockfile.
2. Configure `VITE_RPC_URL`, `VITE_CHAIN_ID`, and `VITE_CONTRACT_ADDRESS` for direct chain browsing. The RPC must permit requests from the browser. Match these to the server's chain and contract configuration.
3. Set a randomly generated production `JWT_SECRET` of at least 32 bytes. Existing tokens issued without the new issuer/audience claims require users to sign in again.
4. Rebuild the client and restart the API. No smart-contract source or ABI changes were made; redeployment is unnecessary for this patch.
5. Existing unverified registration claims can be released when the actual owner proves ownership. Optional addresses on new accounts appear as pending wallet hints.

## Verification

- `npm run lint`
- `npm run compile`
- `npm test` — 14 smart-contract tests
- `npm run test --workspace client` — 20 component/domain/auth-routing tests
- `npm run test --workspace server` — 9 security/presentation/readiness tests
- `npm run build --workspace client`
- `npm audit --omit=dev` — zero reported vulnerabilities
- `npm run doctor` — live database, API, deployment, network, funds, and role checks
- `npm run smoke:local` — real local registration, wallet proof, approval, publication, signed ballot relay, results, and receipt verification; test election closed and voter approval revoked afterwards

No connected browser was available for visual screenshots or interactive MetaMask verification. Component tests exercise direct ballot review, pause handling, and receipt display with mocked wallet/RPC calls; they do not replace a real browser or RPC integration test.

## Remaining architectural limits

- This is a public-ballot application: wallet addresses and candidate choices can be linked from contract events. It does not provide secret ballots or coercion resistance.
- Open polls enforce one wallet per vote, not one person per vote. Restricted elections rely on administrators to establish identity and eligibility.
- Accounts, profile data, catalog enrichment, voter approval, and administration remain centrally operated. The new direct path removes the catalog and relayer dependency for reading and voting, but still depends on the configured RPC and a hosted frontend.
- The relayer and administrator currently share a server wallet. Production governance should separate roles and key custody; privileged roles can be granted to a multisignature account using the contract's existing access controls.
- Authentication still uses browser-readable bearer tokens. A production session design should consider HttpOnly cookies with CSRF protection, revocation, and tighter token lifetimes.
- Development dependencies still have reported advisories, including the Hardhat/Vitest toolchain. These require a separately tested tooling migration; they are excluded from the production-only audit. Do not expose development servers to untrusted networks.
- No deployment, penetration test, independent security audit, or election certification was performed. These changes strengthen the current application without establishing production election readiness.
