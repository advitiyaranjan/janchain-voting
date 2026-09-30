const { expect } = require("chai");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");
const { ethers } = require("hardhat");

const RESTRICTED = true;
const OPEN = false;

describe("DecentralizedVoting", function () {
  async function deployFixture() {
    const [owner, approver, voter, otherVoter, relayer] = await ethers.getSigners();
    const Voting = await ethers.getContractFactory("DecentralizedVoting");
    const voting = await Voting.deploy();
    await voting.waitForDeployment();

    const approverRole = await voting.VOTER_APPROVER_ROLE();
    await voting.grantRole(approverRole, approver.address);

    return { voting, owner, approver, voter, otherVoter, relayer };
  }

  async function createElection(voting, { restricted = RESTRICTED, startIn = 60, duration = 3600 } = {}) {
    const now = await time.latest();
    await voting.createElection(
      "City Mayor",
      "Municipal election",
      now + startIn,
      now + startIn + duration,
      "ipfs://city-mayor",
      ["Candidate 1", "Candidate 2"],
      ["ipfs://c1", "ipfs://c2"],
      restricted
    );
    const electionId = await voting.electionCount();
    return { electionId, startTime: now + startIn, endTime: now + startIn + duration };
  }

  async function signBallot(voting, signer, { electionId, candidateId, deadline }) {
    const { chainId } = await ethers.provider.getNetwork();
    const domain = {
      name: "JanChain Voting",
      version: "2",
      chainId,
      verifyingContract: await voting.getAddress(),
    };
    const types = {
      Ballot: [
        { name: "electionId", type: "uint256" },
        { name: "candidateId", type: "uint256" },
        { name: "voter", type: "address" },
        { name: "deadline", type: "uint256" },
      ],
    };
    return signer.signTypedData(domain, types, {
      electionId,
      candidateId,
      voter: signer.address,
      deadline,
    });
  }

  describe("election lifecycle", function () {
    it("creates an election and exposes candidate metadata", async function () {
      const { voting } = await loadFixture(deployFixture);
      await createElection(voting);

      const election = await voting.getElection(1);
      const candidates = await voting.getElectionCandidates(1);

      expect(election.title).to.equal("City Mayor");
      expect(election.candidateCount).to.equal(2);
      expect(election.restricted).to.equal(true);
      expect(candidates[0].name).to.equal("Candidate 1");
      expect(candidates[1].imageURI).to.equal("ipfs://c2");
    });

    it("rejects elections that start in the past", async function () {
      const { voting } = await loadFixture(deployFixture);
      const now = await time.latest();

      await expect(
        voting.createElection("T", "D", now - 10, now + 100, "", ["A"], [""], OPEN)
      ).to.be.revertedWithCustomError(voting, "InvalidTimeRange");
    });

    it("pages through elections", async function () {
      const { voting } = await loadFixture(deployFixture);
      await createElection(voting);
      await createElection(voting, { restricted: OPEN });
      await createElection(voting);

      const firstPage = await voting.getElections(0, 2);
      const secondPage = await voting.getElections(2, 2);
      const emptyPage = await voting.getElections(5, 2);

      expect(firstPage.length).to.equal(2);
      expect(firstPage[1].restricted).to.equal(false);
      expect(secondPage.length).to.equal(1);
      expect(secondPage[0].electionId).to.equal(3);
      expect(emptyPage.length).to.equal(0);
    });

    it("lets admins extend a running election but not shorten it", async function () {
      const { voting, voter } = await loadFixture(deployFixture);
      const { electionId, endTime } = await createElection(voting, { restricted: OPEN });

      await expect(voting.extendElection(electionId, endTime - 1)).to.be.revertedWithCustomError(
        voting,
        "InvalidTimeRange"
      );
      await expect(voting.extendElection(electionId, endTime + 600))
        .to.emit(voting, "ElectionExtended")
        .withArgs(electionId, endTime, endTime + 600);

      await time.increaseTo(endTime + 300);
      await expect(voting.connect(voter).castVote(electionId, 1)).to.emit(voting, "VoteCast");
    });

    it("restricts admin actions to role holders", async function () {
      const { voting, voter } = await loadFixture(deployFixture);
      const { electionId } = await createElection(voting);

      await expect(voting.connect(voter).endElection(electionId)).to.be.revertedWithCustomError(
        voting,
        "AccessControlUnauthorizedAccount"
      );
      await expect(voting.connect(voter).pause()).to.be.revertedWithCustomError(
        voting,
        "AccessControlUnauthorizedAccount"
      );
    });
  });

  describe("restricted elections", function () {
    it("allows an approved voter to vote exactly once", async function () {
      const { voting, approver, voter } = await loadFixture(deployFixture);
      const { electionId, startTime } = await createElection(voting);

      await voting.connect(approver).approveVoter(voter.address, true);
      await time.increaseTo(startTime + 1);

      await expect(voting.connect(voter).castVote(electionId, 2))
        .to.emit(voting, "VoteCast")
        .withArgs(electionId, 2, voter.address, anyValue);

      const [, candidateId] = await voting.getVoteReceipt(electionId, voter.address);
      const candidates = await voting.getElectionCandidates(electionId);

      expect(candidateId).to.equal(2);
      expect(candidates[1].voteCount).to.equal(1);
      await expect(voting.connect(voter).castVote(electionId, 2)).to.be.revertedWithCustomError(
        voting,
        "AlreadyVoted"
      );
    });

    it("blocks unapproved voters and votes after manual closure", async function () {
      const { voting, approver, voter, otherVoter } = await loadFixture(deployFixture);
      const { electionId, startTime } = await createElection(voting);

      await time.increaseTo(startTime + 1);
      await expect(voting.connect(otherVoter).castVote(electionId, 1)).to.be.revertedWithCustomError(
        voting,
        "VoterNotApproved"
      );

      await voting.connect(approver).approveVoter(voter.address, true);
      await voting.endElection(electionId);

      await expect(voting.connect(voter).castVote(electionId, 1)).to.be.revertedWithCustomError(
        voting,
        "ElectionClosed"
      );
    });

    it("tracks the approved voter count without double counting", async function () {
      const { voting, approver, voter, otherVoter } = await loadFixture(deployFixture);

      await voting.connect(approver).approveVoters([voter.address, otherVoter.address], true);
      await voting.connect(approver).approveVoter(voter.address, true);
      expect(await voting.approvedVoterCount()).to.equal(2);

      await voting.connect(approver).approveVoter(otherVoter.address, false);
      await voting.connect(approver).approveVoter(otherVoter.address, false);
      expect(await voting.approvedVoterCount()).to.equal(1);
    });
  });

  describe("open polls", function () {
    it("lets any wallet vote once without approval", async function () {
      const { voting, voter, otherVoter } = await loadFixture(deployFixture);
      const { electionId, startTime } = await createElection(voting, { restricted: OPEN });

      await time.increaseTo(startTime + 1);
      expect(await voting.canVote(electionId, voter.address)).to.equal(true);

      await voting.connect(voter).castVote(electionId, 1);
      await voting.connect(otherVoter).castVote(electionId, 2);

      const election = await voting.getElection(electionId);
      expect(election.totalVotes).to.equal(2);
      expect(await voting.canVote(electionId, voter.address)).to.equal(false);
    });
  });

  describe("gasless voting", function () {
    it("records a relayed vote for the signer, not the relayer", async function () {
      const { voting, approver, voter, relayer } = await loadFixture(deployFixture);
      const { electionId, startTime } = await createElection(voting);
      await voting.connect(approver).approveVoter(voter.address, true);
      await time.increaseTo(startTime + 1);

      const deadline = startTime + 600;
      const signature = await signBallot(voting, voter, { electionId, candidateId: 1, deadline });

      await expect(
        voting.connect(relayer).castVoteBySig(electionId, 1, voter.address, deadline, signature)
      )
        .to.emit(voting, "VoteCast")
        .withArgs(electionId, 1, voter.address, anyValue)
        .and.to.emit(voting, "VoteRelayed")
        .withArgs(electionId, voter.address, relayer.address);

      expect(await voting.hasVoted(electionId, voter.address)).to.equal(true);
      expect(await voting.hasVoted(electionId, relayer.address)).to.equal(false);
    });

    it("rejects a relayer that tampers with the candidate", async function () {
      const { voting, approver, voter, relayer } = await loadFixture(deployFixture);
      const { electionId, startTime } = await createElection(voting);
      await voting.connect(approver).approveVoter(voter.address, true);
      await time.increaseTo(startTime + 1);

      const deadline = startTime + 600;
      const signature = await signBallot(voting, voter, { electionId, candidateId: 1, deadline });

      await expect(
        voting.connect(relayer).castVoteBySig(electionId, 2, voter.address, deadline, signature)
      ).to.be.revertedWithCustomError(voting, "InvalidSignature");
    });

    it("rejects expired ballots and replays", async function () {
      const { voting, approver, voter, relayer } = await loadFixture(deployFixture);
      const { electionId, startTime } = await createElection(voting);
      await voting.connect(approver).approveVoter(voter.address, true);
      await time.increaseTo(startTime + 1);

      const expired = startTime;
      const expiredSig = await signBallot(voting, voter, { electionId, candidateId: 1, deadline: expired });
      await expect(
        voting.connect(relayer).castVoteBySig(electionId, 1, voter.address, expired, expiredSig)
      ).to.be.revertedWithCustomError(voting, "SignatureExpired");

      const deadline = startTime + 600;
      const signature = await signBallot(voting, voter, { electionId, candidateId: 1, deadline });
      await voting.connect(relayer).castVoteBySig(electionId, 1, voter.address, deadline, signature);
      await expect(
        voting.connect(relayer).castVoteBySig(electionId, 1, voter.address, deadline, signature)
      ).to.be.revertedWithCustomError(voting, "AlreadyVoted");
    });

    it("still enforces approval for relayed restricted ballots", async function () {
      const { voting, voter, relayer } = await loadFixture(deployFixture);
      const { electionId, startTime } = await createElection(voting);
      await time.increaseTo(startTime + 1);

      const deadline = startTime + 600;
      const signature = await signBallot(voting, voter, { electionId, candidateId: 1, deadline });
      await expect(
        voting.connect(relayer).castVoteBySig(electionId, 1, voter.address, deadline, signature)
      ).to.be.revertedWithCustomError(voting, "VoterNotApproved");
    });
  });

  describe("emergency pause", function () {
    it("blocks every voting path while paused", async function () {
      const { voting, voter } = await loadFixture(deployFixture);
      const { electionId, startTime } = await createElection(voting, { restricted: OPEN });
      await time.increaseTo(startTime + 1);

      await voting.pause();
      await expect(voting.connect(voter).castVote(electionId, 1)).to.be.revertedWithCustomError(
        voting,
        "EnforcedPause"
      );
      expect(await voting.canVote(electionId, voter.address)).to.equal(false);

      await voting.unpause();
      await expect(voting.connect(voter).castVote(electionId, 1)).to.emit(voting, "VoteCast");
    });
  });
});
