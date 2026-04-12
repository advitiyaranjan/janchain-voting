// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

contract DecentralizedVoting is AccessControl {
    bytes32 public constant ELECTION_ADMIN_ROLE = keccak256("ELECTION_ADMIN_ROLE");
    bytes32 public constant VOTER_APPROVER_ROLE = keccak256("VOTER_APPROVER_ROLE");

    error AlreadyVoted(uint256 electionId, address voter);
    error ArrayLengthMismatch();
    error ElectionClosed(uint256 electionId);
    error ElectionNotActive(uint256 electionId);
    error ElectionNotFound(uint256 electionId);
    error EmptyCandidateList();
    error EmptyValue(string fieldName);
    error InvalidCandidate(uint256 electionId, uint256 candidateId);
    error InvalidTimeRange();
    error TooManyCandidates(uint256 count);
    error VoterNotApproved(address voter);

    struct Election {
        string title;
        string description;
        string metadataURI;
        uint48 startTime;
        uint48 endTime;
        uint16 candidateCount;
        uint96 totalVotes;
        bool manuallyEnded;
        bool exists;
    }

    struct Candidate {
        string name;
        string imageURI;
        uint96 voteCount;
        bool exists;
    }

    struct ElectionView {
        uint256 electionId;
        string title;
        string description;
        string metadataURI;
        uint48 startTime;
        uint48 endTime;
        uint16 candidateCount;
        uint96 totalVotes;
        bool manuallyEnded;
        bool isActive;
        bool hasEnded;
    }

    struct CandidateView {
        uint256 candidateId;
        string name;
        string imageURI;
        uint96 voteCount;
    }

    uint256 public electionCount;

    mapping(uint256 => Election) private elections;
    mapping(uint256 => mapping(uint256 => Candidate)) private candidates;
    mapping(address => bool) public approvedVoters;
    mapping(uint256 => mapping(address => bool)) public hasVoted;
    mapping(uint256 => mapping(address => uint256)) private voteReceipts;

    event ElectionCreated(
        uint256 indexed electionId,
        string title,
        uint48 startTime,
        uint48 endTime,
        string metadataURI
    );
    event CandidateRegistered(uint256 indexed electionId, uint256 indexed candidateId, string name);
    event VoteCast(
        uint256 indexed electionId,
        uint256 indexed candidateId,
        address indexed voter,
        uint256 timestamp
    );
    event VoterApprovalUpdated(address indexed voter, bool approved);
    event ElectionEnded(uint256 indexed electionId, uint256 timestamp);

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ELECTION_ADMIN_ROLE, msg.sender);
        _grantRole(VOTER_APPROVER_ROLE, msg.sender);
    }

    function createElection(
        string calldata title,
        string calldata description,
        uint48 startTime,
        uint48 endTime,
        string calldata metadataURI,
        string[] calldata candidateNames,
        string[] calldata candidateImageURIs
    ) external onlyRole(ELECTION_ADMIN_ROLE) returns (uint256 electionId) {
        if (bytes(title).length == 0) revert EmptyValue("title");
        if (bytes(description).length == 0) revert EmptyValue("description");
        if (candidateNames.length == 0) revert EmptyCandidateList();
        if (candidateNames.length != candidateImageURIs.length) revert ArrayLengthMismatch();
        if (candidateNames.length > type(uint16).max) revert TooManyCandidates(candidateNames.length);
        if (startTime <= block.timestamp || endTime <= startTime) revert InvalidTimeRange();

        electionId = ++electionCount;
        Election storage election = elections[electionId];

        election.title = title;
        election.description = description;
        election.metadataURI = metadataURI;
        election.startTime = startTime;
        election.endTime = endTime;
        election.candidateCount = uint16(candidateNames.length);
        election.exists = true;

        uint256 totalCandidates = candidateNames.length;
        for (uint256 index = 0; index < totalCandidates; ) {
            string calldata candidateName = candidateNames[index];
            if (bytes(candidateName).length == 0) revert EmptyValue("candidateName");

            uint256 candidateId = index + 1;
            candidates[electionId][candidateId] = Candidate({
                name: candidateName,
                imageURI: candidateImageURIs[index],
                voteCount: 0,
                exists: true
            });

            emit CandidateRegistered(electionId, candidateId, candidateName);

            unchecked {
                ++index;
            }
        }

        emit ElectionCreated(electionId, title, startTime, endTime, metadataURI);
    }

    function approveVoter(address voter, bool approved) external onlyRole(VOTER_APPROVER_ROLE) {
        approvedVoters[voter] = approved;
        emit VoterApprovalUpdated(voter, approved);
    }

    function approveVoters(address[] calldata voters, bool approved) external onlyRole(VOTER_APPROVER_ROLE) {
        uint256 totalVoters = voters.length;
        for (uint256 index = 0; index < totalVoters; ) {
            approvedVoters[voters[index]] = approved;
            emit VoterApprovalUpdated(voters[index], approved);

            unchecked {
                ++index;
            }
        }
    }

    function castVote(uint256 electionId, uint256 candidateId) external {
        Election storage election = _getElection(electionId);

        if (!approvedVoters[msg.sender]) revert VoterNotApproved(msg.sender);
        if (candidateId == 0 || candidateId > election.candidateCount || !candidates[electionId][candidateId].exists) {
            revert InvalidCandidate(electionId, candidateId);
        }
        if (block.timestamp < election.startTime) revert ElectionNotActive(electionId);
        if (election.manuallyEnded || block.timestamp > election.endTime) revert ElectionClosed(electionId);
        if (hasVoted[electionId][msg.sender]) revert AlreadyVoted(electionId, msg.sender);

        hasVoted[electionId][msg.sender] = true;
        voteReceipts[electionId][msg.sender] = candidateId;

        Candidate storage candidate = candidates[electionId][candidateId];
        unchecked {
            candidate.voteCount += 1;
            election.totalVotes += 1;
        }

        emit VoteCast(electionId, candidateId, msg.sender, block.timestamp);
    }

    function endElection(uint256 electionId) external onlyRole(ELECTION_ADMIN_ROLE) {
        Election storage election = _getElection(electionId);
        if (election.manuallyEnded || block.timestamp > election.endTime) revert ElectionClosed(electionId);

        election.manuallyEnded = true;
        emit ElectionEnded(electionId, block.timestamp);
    }

    function getElection(uint256 electionId) external view returns (ElectionView memory electionView) {
        Election storage election = _getElection(electionId);
        electionView = _buildElectionView(electionId, election);
    }

    function getElectionCandidates(uint256 electionId) external view returns (CandidateView[] memory electionCandidates) {
        Election storage election = _getElection(electionId);
        uint256 totalCandidates = election.candidateCount;
        electionCandidates = new CandidateView[](totalCandidates);

        for (uint256 index = 0; index < totalCandidates; ) {
            uint256 candidateId = index + 1;
            Candidate storage candidate = candidates[electionId][candidateId];
            electionCandidates[index] = CandidateView({
                candidateId: candidateId,
                name: candidate.name,
                imageURI: candidate.imageURI,
                voteCount: candidate.voteCount
            });

            unchecked {
                ++index;
            }
        }
    }

    function getVoteReceipt(
        uint256 electionId,
        address voter
    ) external view returns (bool voted, uint256 candidateId) {
        _getElection(electionId);
        voted = hasVoted[electionId][voter];
        candidateId = voteReceipts[electionId][voter];
    }

    function isElectionActive(uint256 electionId) external view returns (bool) {
        Election storage election = _getElection(electionId);
        return !election.manuallyEnded && block.timestamp >= election.startTime && block.timestamp <= election.endTime;
    }

    function _getElection(uint256 electionId) private view returns (Election storage election) {
        election = elections[electionId];
        if (!election.exists) revert ElectionNotFound(electionId);
    }

    function _buildElectionView(
        uint256 electionId,
        Election storage election
    ) private view returns (ElectionView memory electionView) {
        bool hasEnded = election.manuallyEnded || block.timestamp > election.endTime;
        bool isActive = !hasEnded && block.timestamp >= election.startTime && block.timestamp <= election.endTime;

        electionView = ElectionView({
            electionId: electionId,
            title: election.title,
            description: election.description,
            metadataURI: election.metadataURI,
            startTime: election.startTime,
            endTime: election.endTime,
            candidateCount: election.candidateCount,
            totalVotes: election.totalVotes,
            manuallyEnded: election.manuallyEnded,
            isActive: isActive,
            hasEnded: hasEnded
        });
    }
}
