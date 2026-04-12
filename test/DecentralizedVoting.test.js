const { expect } = require("chai");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { time } = require("@nomicfoundation/hardhat-network-helpers");
const { ethers } = require("hardhat");

describe("DecentralizedVoting", function () {
  async function deployFixture() {
    const [owner, approver, voter, otherVoter] = await ethers.getSigners();
    const Voting = await ethers.getContractFactory("DecentralizedVoting");
    const voting = await Voting.deploy();
    await voting.waitForDeployment();

    const approverRole = await voting.VOTER_APPROVER_ROLE();
    await voting.grantRole(approverRole, approver.address);

    return { voting, owner, approver, voter, otherVoter };
  }

  it("creates an election and exposes candidate metadata", async function () {
    const { voting } = await deployFixture();
    const now = await time.latest();

    await voting.createElection(
      "National Student Council",
      "Election for the 2026 student council president.",
      now + 120,
      now + 7200,
      "ipfs://student-council",
      ["Alice", "Bob"],
      ["ipfs://alice", "ipfs://bob"]
    );

    const election = await voting.getElection(1);
    const candidates = await voting.getElectionCandidates(1);

    expect(election.title).to.equal("National Student Council");
    expect(election.candidateCount).to.equal(2);
    expect(candidates[0].name).to.equal("Alice");
    expect(candidates[1].imageURI).to.equal("ipfs://bob");
  });

  it("allows an approved voter to vote exactly once", async function () {
    const { voting, approver, voter } = await deployFixture();
    const now = await time.latest();

    await voting.createElection(
      "City Mayor",
      "Municipal election",
      now + 60,
      now + 3600,
      "ipfs://city-mayor",
      ["Candidate 1", "Candidate 2"],
      ["ipfs://c1", "ipfs://c2"]
    );

    await voting.connect(approver).approveVoter(voter.address, true);
    await time.increaseTo(now + 61);

    await expect(voting.connect(voter).castVote(1, 2))
      .to.emit(voting, "VoteCast")
      .withArgs(1, 2, voter.address, anyValue);

    const [, candidateId] = await voting.getVoteReceipt(1, voter.address);
    const candidates = await voting.getElectionCandidates(1);

    expect(candidateId).to.equal(2);
    expect(candidates[1].voteCount).to.equal(1);
    await expect(voting.connect(voter).castVote(1, 2)).to.be.revertedWithCustomError(
      voting,
      "AlreadyVoted"
    );
  });

  it("blocks unapproved voters and votes after manual closure", async function () {
    const { voting, approver, voter, otherVoter } = await deployFixture();
    const now = await time.latest();

    await voting.createElection(
      "District Referendum",
      "Approve the budget proposal",
      now + 10,
      now + 1800,
      "ipfs://referendum",
      ["Yes", "No"],
      ["", ""]
    );

    await time.increaseTo(now + 15);
    await expect(voting.connect(otherVoter).castVote(1, 1)).to.be.revertedWithCustomError(
      voting,
      "VoterNotApproved"
    );

    await voting.connect(approver).approveVoter(voter.address, true);
    await voting.endElection(1);

    await expect(voting.connect(voter).castVote(1, 1)).to.be.revertedWithCustomError(
      voting,
      "ElectionClosed"
    );
  });
});
