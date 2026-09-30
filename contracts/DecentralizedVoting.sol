// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/// @title JanChain DecentralizedVoting
/// @notice One-wallet-one-vote elections with restricted (approved voter) and open (any wallet) modes,
///         direct voting, and gasless voting through EIP-712 signed ballots that anyone can relay.
contract DecentralizedVoting is AccessControl, Pausable, EIP712 {
    bytes32 public constant ELECTION_ADMIN_ROLE = keccak256("ELECTION_ADMIN_ROLE");
    bytes32 public constant VOTER_APPROVER_ROLE = keccak256("VOTER_APPROVER_ROLE");
    bytes32 public constant BALLOT_TYPEHASH =
        keccak256("Ballot(uint256 electionId,uint256 candidateId,address voter,uint256 deadline)");

    error AlreadyVoted(uint256 electionId, address voter);
    error ArrayLengthMismatch();
    error ElectionClosed(uint256 electionId);
    error ElectionNotActive(uint256 electionId);
    error ElectionNotFound(uint256 electionId);
    error EmptyCandidateList();
    error EmptyValue(string fieldName);
    error InvalidCandidate(uint256 electionId, uint256 candidateId);
    error InvalidSignature();
    error InvalidTimeRange();
    error SignatureExpired(uint256 deadline);
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
        bool restricted;
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
        bool restricted;
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
    uint256 public approvedVoterCount;

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
    event ElectionAccessConfigured(uint256 indexed electionId, bool restricted);
    event CandidateRegistered(uint256 indexed electionId, uint256 indexed candidateId, string name);
    event VoteCast(
        uint256 indexed electionId,
        uint256 indexed candidateId,
        address indexed voter,
        uint256 timestamp
    );
    event VoteRelayed(uint256 indexed electionId, address indexed voter, address indexed relayer);
    event VoterApprovalUpdated(address indexed voter, bool approved);
    event ElectionEnded(uint256 indexed electionId, uint256 timestamp);
    event ElectionExtended(uint256 indexed electionId, uint48 previousEndTime, uint48 newEndTime);

    constructor() EIP712("JanChain Voting", "2") {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ELECTION_ADMIN_ROLE, msg.sender);
        _grantRole(VOTER_APPROVER_ROLE, msg.sender);
    }

    // ---------------------------------------------------------------------
    // Election administration
    // ---------------------------------------------------------------------

    function createElection(
        string calldata title,
        string calldata description,
        uint48 startTime,
        uint48 endTime,
        string calldata metadataURI,
        string[] calldata candidateNames,
        string[] calldata candidateImageURIs,
        bool restricted
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
        election.restricted = restricted;
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
        emit ElectionAccessConfigured(electionId, restricted);
    }

    function endElection(uint256 electionId) external onlyRole(ELECTION_ADMIN_ROLE) {
        Election storage election = _getElection(electionId);
        if (election.manuallyEnded || block.timestamp > election.endTime) revert ElectionClosed(electionId);

        election.manuallyEnded = true;
        emit ElectionEnded(electionId, block.timestamp);
    }

    /// @notice Pushes the end time of a running or scheduled election further out.
    function extendElection(uint256 electionId, uint48 newEndTime) external onlyRole(ELECTION_ADMIN_ROLE) {
        Election storage election = _getElection(electionId);
        if (election.manuallyEnded || block.timestamp > election.endTime) revert ElectionClosed(electionId);
        if (newEndTime <= election.endTime) revert InvalidTimeRange();

        uint48 previousEndTime = election.endTime;
        election.endTime = newEndTime;
        emit ElectionExtended(electionId, previousEndTime, newEndTime);
    }

    /// @notice Emergency stop for all voting. Reads keep working.
    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    // ---------------------------------------------------------------------
    // Voter registry
    // ---------------------------------------------------------------------

    function approveVoter(address voter, bool approved) external onlyRole(VOTER_APPROVER_ROLE) {
        _setApproval(voter, approved);
    }

    function approveVoters(address[] calldata voters, bool approved) external onlyRole(VOTER_APPROVER_ROLE) {
        uint256 totalVoters = voters.length;
        for (uint256 index = 0; index < totalVoters; ) {
            _setApproval(voters[index], approved);

            unchecked {
                ++index;
            }
        }
    }

    // ---------------------------------------------------------------------
    // Voting
    // ---------------------------------------------------------------------

    /// @notice Cast a vote paying your own gas.
    function castVote(uint256 electionId, uint256 candidateId) external whenNotPaused {
        _recordVote(electionId, candidateId, msg.sender);
    }

    /// @notice Cast a vote on behalf of `voter` using their EIP-712 signed ballot. Anyone may relay,
    ///         but the signature binds the election, the candidate, and the voter, so a relayer cannot
    ///         alter the choice.
    function castVoteBySig(
        uint256 electionId,
        uint256 candidateId,
        address voter,
        uint256 deadline,
        bytes calldata signature
    ) external whenNotPaused {
        if (block.timestamp > deadline) revert SignatureExpired(deadline);

        bytes32 digest = hashBallot(electionId, candidateId, voter, deadline);
        (address signer, ECDSA.RecoverError recoverError, ) = ECDSA.tryRecover(digest, signature);
        if (recoverError != ECDSA.RecoverError.NoError || signer != voter) revert InvalidSignature();

        _recordVote(electionId, candidateId, voter);
        emit VoteRelayed(electionId, voter, msg.sender);
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    function hashBallot(
        uint256 electionId,
        uint256 candidateId,
        address voter,
        uint256 deadline
    ) public view returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(BALLOT_TYPEHASH, electionId, candidateId, voter, deadline)));
    }

    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    function getElection(uint256 electionId) external view returns (ElectionView memory electionView) {
        Election storage election = _getElection(electionId);
        electionView = _buildElectionView(electionId, election);
    }

    /// @notice Paged listing of elections (1-indexed ids), so clients can browse the chain without a backend.
    function getElections(uint256 offset, uint256 limit) external view returns (ElectionView[] memory page) {
        uint256 total = electionCount;
        if (offset >= total) {
            return new ElectionView[](0);
        }

        uint256 size = total - offset;
        if (size > limit) {
            size = limit;
        }

        page = new ElectionView[](size);
        for (uint256 index = 0; index < size; ) {
            uint256 electionId = offset + index + 1;
            page[index] = _buildElectionView(electionId, elections[electionId]);

            unchecked {
                ++index;
            }
        }
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

    /// @notice Whether `voter` could cast a ballot in `electionId` right now.
    function canVote(uint256 electionId, address voter) external view returns (bool) {
        Election storage election = _getElection(electionId);
        if (paused() || hasVoted[electionId][voter]) return false;
        if (election.restricted && !approvedVoters[voter]) return false;
        return !election.manuallyEnded && block.timestamp >= election.startTime && block.timestamp <= election.endTime;
    }

    // ---------------------------------------------------------------------
    // Internals
    // ---------------------------------------------------------------------

    function _recordVote(uint256 electionId, uint256 candidateId, address voter) private {
        Election storage election = _getElection(electionId);

        if (election.restricted && !approvedVoters[voter]) revert VoterNotApproved(voter);
        if (candidateId == 0 || candidateId > election.candidateCount || !candidates[electionId][candidateId].exists) {
            revert InvalidCandidate(electionId, candidateId);
        }
        if (block.timestamp < election.startTime) revert ElectionNotActive(electionId);
        if (election.manuallyEnded || block.timestamp > election.endTime) revert ElectionClosed(electionId);
        if (hasVoted[electionId][voter]) revert AlreadyVoted(electionId, voter);

        hasVoted[electionId][voter] = true;
        voteReceipts[electionId][voter] = candidateId;

        Candidate storage candidate = candidates[electionId][candidateId];
        unchecked {
            candidate.voteCount += 1;
            election.totalVotes += 1;
        }

        emit VoteCast(electionId, candidateId, voter, block.timestamp);
    }

    function _setApproval(address voter, bool approved) private {
        if (approvedVoters[voter] != approved) {
            approvedVoters[voter] = approved;
            if (approved) {
                ++approvedVoterCount;
            } else {
                --approvedVoterCount;
            }
        }
        emit VoterApprovalUpdated(voter, approved);
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
        bool isActive = !hasEnded && block.timestamp >= election.startTime;

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
            restricted: election.restricted,
            isActive: isActive,
            hasEnded: hasEnded
        });
    }
}
