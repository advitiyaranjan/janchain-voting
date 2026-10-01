const { test, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { ethers } = require("ethers");
const User = require("../src/models/User");
const auth = require("../src/controllers/authController");
const blockchain = require("../src/services/blockchainService");
const { signToken, verifyToken } = require("../src/utils/jwt");
const { registerSchema } = require("../src/validators/authValidators");
const { presentElection } = require("../src/utils/electionPresenter");

const original = { findOne: User.findOne, findOneAndUpdate: User.findOneAndUpdate, create: User.create, isConfigured: blockchain.isConfigured };
afterEach(() => { Object.assign(User, { findOne: original.findOne, findOneAndUpdate: original.findOneAndUpdate, create: original.create }); blockchain.isConfigured = original.isConfigured; });

test("registration cannot reserve a wallet without proof of ownership", async () => {
  User.findOne = async () => null;
  User.create = async (fields) => {
    assert.equal(fields.walletAddress, undefined);
    assert.equal(fields.pendingWalletAddress, "0x1111111111111111111111111111111111111111");
    return { toJSON: () => ({ id: "test" }) };
  };
  const response = { status() { return this; }, json() {} };
  await auth.register({ validated: { body: { fullName: "Test Voter", email: "test@example.com", password: "SafePass123", walletAddress: "0x1111111111111111111111111111111111111111" } } }, response);
});

test("a verified account cannot request a challenge to replace its wallet", async () => {
  await assert.rejects(auth.issueWalletChallenge({ user: { linkedWalletAt: new Date(), walletAddress: "0x1111111111111111111111111111111111111111" }, validated: { body: { intent: "link", walletAddress: "0x2222222222222222222222222222222222222222" } } }, {}), { statusCode: 409 });
});

test("wallet challenge can be consumed only once, including concurrent requests", async () => {
  const wallet = ethers.Wallet.createRandom();
  const message = "Test wallet ownership nonce";
  const signature = await wallet.signMessage(message);
  const user = { _id: "507f1f77bcf86cd799439011", walletAddress: wallet.address.toLowerCase(),
    walletChallenge: { nonce: "unique", intent: "login", address: wallet.address.toLowerCase(), message, expiresAt: new Date(Date.now() + 60000) },
    toJSON: () => ({ id: "test" }), isApproved: false };
  User.findOne = async () => user;
  let consumed = false;
  User.findOneAndUpdate = async (filter, updates) => {
    assert.equal(filter["walletChallenge.nonce"], "unique");
    assert.ok(filter["walletChallenge.expiresAt"].$gt instanceof Date);
    assert.equal(updates.$unset.walletChallenge, 1);
    if (consumed) return null;
    consumed = true;
    return user;
  };
  blockchain.isConfigured = () => false;
  const request = { validated: { body: { walletAddress: wallet.address, signature, intent: "login" } } };
  const results = await Promise.allSettled([auth.verifyWalletChallenge(request, { json() {} }), auth.verifyWalletChallenge(request, { json() {} })]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.find((result) => result.status === "rejected").reason.statusCode, 401);
});

test("malformed wallet signatures return an authentication error", async () => {
  User.findOne = async () => ({ walletChallenge: { intent: "login", address: "0x1111111111111111111111111111111111111111", message: "nonce", expiresAt: new Date(Date.now() + 60000) } });
  await assert.rejects(auth.verifyWalletChallenge({ validated: { body: { walletAddress: "0x1111111111111111111111111111111111111111", signature: "invalid", intent: "login" } } }, {}), { statusCode: 401 });
});

test("JWTs verify the intended audience and issuer", () => {
  const token = signToken({ _id: "123", role: "voter" });
  assert.equal(verifyToken(token).aud, "janchain-client");
  assert.equal(verifyToken(token).iss, "janchain-voting");
});

test("registration rejects bcrypt-truncated passwords", () => {
  const result = registerSchema.safeParse({ body: { fullName: "Test Voter", email: "test@example.com", password: "Aa1" + "é".repeat(36) } });
  assert.equal(result.success, false);
});

test("catalog presentation uses chain identities and never invents zero totals on outage", () => {
  const election = { id: "test", title: "Catalog title", description: "Catalog", startTime: new Date(), endTime: new Date(), candidates: [{ candidateId: 1, name: "Catalog candidate" }] };
  assert.equal(presentElection(election, null).totalVotes, null);
  const result = presentElection(election, { title: "Contract title", description: "Chain", startTime: 1, endTime: 2, restricted: false, totalVotes: 3, hasEnded: true, candidates: [{ candidateId: 1, name: "Contract candidate", voteCount: 3 }] });
  assert.equal(result.title, "Contract title");
  assert.equal(result.candidates[0].name, "Contract candidate");
  assert.equal(result.accessMode, "open");
});
