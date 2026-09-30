import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { electionApi } from "../api/elections";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import { useAuth } from "../context/AuthContext";
import { useWallet } from "../hooks/useWallet";
import { castVote, describeVoteError, signBallot } from "../lib/contract";
import { buildExplorerUrl, formatDateTime, shortenAddress, shortenHash } from "../lib/utils";

function getVotingStatusMessage({
  election,
  verification,
  selectedCandidateId,
  user,
  walletAddress,
  walletMatchesProfile,
  walletVerified,
  isExpectedNetwork,
  method,
}) {
  if (verification?.hasVoted) {
    return verification.candidateName
      ? `Your vote has already been recorded for ${verification.candidateName}.`
      : "Your vote has already been recorded on-chain.";
  }

  if (election.status !== "active") {
    return "Voting opens only while the election is active.";
  }

  if (election.accessMode !== "open" && !user.isApproved) {
    return "Your voter account still needs administrator approval for this election.";
  }

  if (!walletVerified) {
    return "Verify the wallet on your voter profile with a signed message before voting.";
  }

  if (!walletAddress) {
    return "Connect MetaMask to continue.";
  }

  if (!walletMatchesProfile) {
    return "Connect the same wallet address that is linked to your voter account.";
  }

  if (!isExpectedNetwork) {
    return "Switch MetaMask to the voting network to continue.";
  }

  if (!selectedCandidateId) {
    return "Select a candidate to unlock the submit action.";
  }

  return method === "gasless"
    ? "Everything is ready. You will sign your ballot in MetaMask and the platform submits it, paying the gas."
    : "Everything is ready. MetaMask will send your vote to the smart contract and you pay the gas.";
}

function VotingPage() {
  const { electionId } = useParams();
  const { user, refreshUser, issueWalletChallenge, verifyWalletChallenge } = useAuth();
  const wallet = useWallet();
  const [election, setElection] = useState(null);
  const [verification, setVerification] = useState(null);
  const [ballotConfig, setBallotConfig] = useState(null);
  const [method, setMethod] = useState("gasless");
  const [receipt, setReceipt] = useState(null);
  const [selectedCandidateId, setSelectedCandidateId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [linkingWallet, setLinkingWallet] = useState(false);
  const walletVerified = Boolean(user.walletAddress && user.linkedWalletAt);

  const loadElection = useCallback(async () => {
    setLoading(true);
    try {
      const data = await electionApi.getById(electionId);
      setElection(data.election);
      setVerification(data.verification);
      setBallotConfig(data.ballot);
      if (!data.ballot?.gaslessEnabled) {
        setMethod("direct");
      }
    } catch (error) {
      toast.error(error.response?.data?.message || error.message);
    } finally {
      setLoading(false);
    }
  }, [electionId]);

  useEffect(() => {
    loadElection();
  }, [loadElection]);

  const walletMatchesProfile = useMemo(() => {
    if (!user.walletAddress || !wallet.walletAddress) {
      return false;
    }

    return user.walletAddress.toLowerCase() === wallet.walletAddress.toLowerCase();
  }, [user.walletAddress, wallet.walletAddress]);

  const isOpenPoll = election?.accessMode === "open";
  const gaslessAvailable = Boolean(ballotConfig?.gaslessEnabled);

  const canSubmitVote = Boolean(
    selectedCandidateId &&
      (isOpenPoll || user.isApproved) &&
      walletVerified &&
      wallet.walletAddress &&
      walletMatchesProfile &&
      wallet.isExpectedNetwork &&
      election?.status === "active" &&
      !verification?.hasVoted
  );

  const votingStatusMessage = election
    ? getVotingStatusMessage({
        election,
        verification,
        selectedCandidateId,
        user,
        walletAddress: wallet.walletAddress,
        walletMatchesProfile,
        walletVerified,
        isExpectedNetwork: wallet.isExpectedNetwork,
        method,
      })
    : "";

  const handleConnectWallet = async () => {
    try {
      await wallet.connectWallet();
      toast.success("Wallet connected.");
    } catch (error) {
      toast.error(error.shortMessage || error.message);
    }
  };

  const handleLinkWallet = async () => {
    setLinkingWallet(true);
    try {
      const connectedWallet = await wallet.connectWallet();
      const normalizedConnected = connectedWallet.toLowerCase();

      if (user.walletAddress && user.walletAddress.toLowerCase() !== normalizedConnected) {
        throw new Error("This account is already linked to a different wallet.");
      }

      const challenge = await issueWalletChallenge({
        walletAddress: normalizedConnected,
        intent: "link",
      });
      const signature = await wallet.signMessage(challenge.message);
      await verifyWalletChallenge({
        walletAddress: normalizedConnected,
        signature,
        intent: "link",
      });
      await refreshUser();
      await loadElection();
      toast.success("Wallet verified successfully.");
    } catch (error) {
      toast.error(error.response?.data?.message || error.message);
    } finally {
      setLinkingWallet(false);
    }
  };

  const handleSwitchNetwork = async () => {
    try {
      await wallet.ensureExpectedNetwork();
      toast.success(`Switched to ${wallet.expectedChain.chainName}.`);
    } catch (error) {
      toast.error(error.shortMessage || error.message);
    }
  };

  const handleVote = async () => {
    setSubmitting(true);
    try {
      const connectedWallet = wallet.walletAddress || (await wallet.connectWallet());

      if (!walletVerified) {
        throw new Error("Verify your wallet before casting a ballot.");
      }

      if (connectedWallet.toLowerCase() !== user.walletAddress.toLowerCase()) {
        throw new Error("Connect the same wallet address that is linked to your voter account.");
      }

      // MetaMask only signs typed data for the active chain, so both paths need the right network.
      await wallet.ensureExpectedNetwork();
      const candidate = election.candidates.find((item) => item.candidateId === selectedCandidateId);

      if (method === "gasless") {
        const { signature, deadline } = await signBallot(ballotConfig.domain, {
          onChainElectionId: election.onChainElectionId,
          candidateId: selectedCandidateId,
          voterAddress: connectedWallet,
        });
        const data = await electionApi.relayVote(electionId, {
          candidateId: selectedCandidateId,
          voterAddress: connectedWallet,
          deadline,
          signature,
        });
        setReceipt(data.receipt);
      } else {
        const result = await castVote(election.onChainElectionId, selectedCandidateId);
        setReceipt({
          candidateName: candidate?.name || null,
          candidateId: selectedCandidateId,
          transactionHash: result.transactionHash,
          blockNumber: result.blockNumber,
          gasless: false,
        });
      }

      toast.success("Your vote is recorded on-chain.");
      setSelectedCandidateId(null);
      await loadElection();
    } catch (error) {
      toast.error(describeVoteError(error));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="page-shell text-sm text-slate-500">Loading election...</div>;
  }

  if (!election) {
    return <div className="page-shell text-sm text-slate-500">Election not found.</div>;
  }

  return (
    <div className="page-shell space-y-6">
      <Card className="hero-grid p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <div className="flex flex-wrap gap-2">
              <Badge variant={election.status}>{election.status}</Badge>
              <Badge variant={isOpenPoll ? "open" : "neutral"}>{isOpenPoll ? "Open poll" : "Approved voters only"}</Badge>
              <Badge variant="info">{election.category}</Badge>
            </div>
            <h1 className="display-copy mt-5 text-4xl font-bold text-[var(--ink)]">{election.title}</h1>
            <p className="mt-4 text-slate-600">{election.description}</p>
          </div>
          <div className="rounded-3xl bg-white/85 p-5 text-sm text-slate-600">
            <p>Start: {formatDateTime(election.startTime)}</p>
            <p className="mt-2">End: {formatDateTime(election.endTime)}</p>
            <p className="mt-2">Current on-chain votes: {election.totalVotes}</p>
            <p className="mt-2">Election ID on-chain: #{election.onChainElectionId}</p>
          </div>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1fr_0.42fr]">
        <Card>
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h2 className="display-copy text-2xl font-semibold text-slate-900">Choose a candidate</h2>
              <p className="text-sm text-slate-500">
                Your selection is recorded by the smart contract and cannot be changed afterwards.
              </p>
            </div>
            <Link to={`/results/${electionId}`} className="text-sm font-semibold text-[var(--teal)]">
              View live results
            </Link>
          </div>

          <div className="space-y-4">
            {election.candidates.map((candidate) => {
              const isSelected = selectedCandidateId === candidate.candidateId;
              return (
                <button
                  key={candidate.candidateId}
                  className={`w-full rounded-3xl border p-5 text-left transition ${
                    isSelected ? "border-[var(--teal)] bg-teal-50" : "border-slate-200 bg-white/80 hover:bg-white"
                  }`}
                  onClick={() => setSelectedCandidateId(candidate.candidateId)}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="display-copy text-2xl font-semibold text-slate-900">{candidate.name}</h3>
                      <p className="mt-1 text-sm font-medium text-slate-600">
                        {candidate.party || candidate.tagline || "Independent candidate"}
                      </p>
                    </div>
                    <Badge variant="neutral">{candidate.voteCount} votes</Badge>
                  </div>
                  {candidate.description && <p className="mt-3 text-sm leading-6 text-slate-600">{candidate.description}</p>}
                </button>
              );
            })}
          </div>

          {!verification?.hasVoted && election.status === "active" && (
            <fieldset className="mt-6">
              <legend className="text-sm font-semibold text-slate-900">How do you want to submit?</legend>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {[
                  {
                    value: "gasless",
                    label: "Gasless",
                    hint: gaslessAvailable
                      ? "Sign your ballot for free. The platform pays the network fee."
                      : "Unavailable: the server has no relayer wallet configured.",
                    disabled: !gaslessAvailable,
                  },
                  {
                    value: "direct",
                    label: "Pay my own gas",
                    hint: "Send the transaction yourself from MetaMask.",
                    disabled: false,
                  },
                ].map((option) => (
                  <label
                    key={option.value}
                    className={`rounded-3xl border p-4 text-sm transition ${
                      option.disabled
                        ? "cursor-not-allowed border-slate-200 bg-slate-50 opacity-60"
                        : method === option.value
                          ? "cursor-pointer border-[var(--teal)] bg-teal-50"
                          : "cursor-pointer border-slate-200 bg-white/80 hover:bg-white"
                    }`}
                  >
                    <input
                      className="sr-only"
                      type="radio"
                      name="voteMethod"
                      value={option.value}
                      checked={method === option.value}
                      disabled={option.disabled}
                      onChange={() => setMethod(option.value)}
                    />
                    <span className="block font-semibold text-slate-900">{option.label}</span>
                    <span className="mt-1 block text-slate-500">{option.hint}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          <div className="mt-6 flex flex-wrap gap-3">
            {!wallet.walletAddress && wallet.hasWallet && (
              <Button variant="secondary" onClick={handleConnectWallet}>
                Connect MetaMask
              </Button>
            )}
            {wallet.walletAddress && !wallet.isExpectedNetwork && (
              <Button variant="secondary" onClick={handleSwitchNetwork}>
                Switch network
              </Button>
            )}
            {!walletVerified && (
              <Button variant="accent" onClick={handleLinkWallet} disabled={linkingWallet}>
                {linkingWallet ? "Verifying wallet..." : user.walletAddress ? "Verify saved wallet" : "Link wallet"}
              </Button>
            )}
            <Button disabled={submitting || !canSubmitVote} onClick={handleVote}>
              {submitting
                ? method === "gasless"
                  ? "Signing and submitting..."
                  : "Submitting vote..."
                : verification?.hasVoted
                  ? "Vote already recorded"
                  : method === "gasless"
                    ? "Sign and cast vote"
                    : "Cast vote on-chain"}
            </Button>
          </div>
          <p className="mt-4 text-sm text-slate-500">{votingStatusMessage}</p>

          {receipt && (
            <div className="mt-6 rounded-3xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-900">
              <p className="font-semibold">Ballot receipt</p>
              <p className="mt-2">
                Vote for {receipt.candidateName || `candidate #${receipt.candidateId}`}
                {receipt.gasless ? ", relayed gas-free" : ""}.
              </p>
              <p className="mt-2 break-all">Transaction: {receipt.transactionHash}</p>
              {receipt.blockNumber && <p className="mt-1">Block: {receipt.blockNumber}</p>}
              <div className="mt-3 flex flex-wrap gap-4 font-semibold">
                {buildExplorerUrl(receipt.transactionHash) && (
                  <a href={buildExplorerUrl(receipt.transactionHash)} rel="noreferrer" target="_blank">
                    Open block explorer
                  </a>
                )}
                <Link to={`/results/${electionId}`}>Verify on the results page</Link>
              </div>
            </div>
          )}
        </Card>

        <div className="space-y-6">
          <Card>
            <h2 className="display-copy text-2xl font-semibold text-slate-900">Eligibility check</h2>
            <div className="mt-5 space-y-4 text-sm text-slate-600">
              <div className="rounded-3xl bg-white/80 p-4">
                <p className="font-semibold text-slate-900">Approval status</p>
                <p className="mt-2">
                  {isOpenPoll
                    ? "Not required: this is an open poll."
                    : user.isApproved
                      ? "Approved and ready for blockchain sync."
                      : "Pending admin approval."}
                </p>
              </div>
              <div className="rounded-3xl bg-white/80 p-4">
                <p className="font-semibold text-slate-900">Profile wallet</p>
                <p className="mt-2">{shortenAddress(user.walletAddress)}</p>
              </div>
              <div className="rounded-3xl bg-white/80 p-4">
                <p className="font-semibold text-slate-900">Wallet verification</p>
                <p className="mt-2">
                  {walletVerified ? `Verified on ${formatDateTime(user.linkedWalletAt)}.` : "Awaiting signed verification."}
                </p>
              </div>
              <div className="rounded-3xl bg-white/80 p-4">
                <p className="font-semibold text-slate-900">Connected wallet</p>
                <p className="mt-2">{wallet.walletAddress ? shortenAddress(wallet.walletAddress) : "Not connected"}</p>
              </div>
              <div className="rounded-3xl bg-white/80 p-4">
                <p className="font-semibold text-slate-900">Chain</p>
                <p className="mt-2">
                  {wallet.chainId
                    ? wallet.isExpectedNetwork
                      ? `${wallet.expectedChain.chainName} connected.`
                      : `Connected to a different chain. Expected ${wallet.expectedChain.chainName}.`
                    : `Expected network: ${wallet.expectedChain.chainName}.`}
                </p>
              </div>
              <div className="rounded-3xl bg-white/80 p-4">
                <p className="font-semibold text-slate-900">Contract</p>
                <p className="mt-2 break-all">{shortenAddress(election.contractAddress)}</p>
              </div>
              <div className="rounded-3xl bg-white/80 p-4">
                <p className="font-semibold text-slate-900">Vote receipt</p>
                <p className="mt-2">
                  {verification?.hasVoted
                    ? verification.candidateName
                      ? `Recorded on-chain for ${verification.candidateName}.`
                      : `Recorded on-chain for candidate #${verification.candidateId}.`
                    : "No vote recorded from your linked wallet yet."}
                </p>
                {verification?.transactionHash && (
                  <p className="mt-2 text-xs text-slate-500">Tx: {shortenHash(verification.transactionHash)}</p>
                )}
              </div>
            </div>
          </Card>

          <Card>
            <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Audit trail</p>
            <p className="mt-3 text-sm text-slate-600">
              Election deployment and results can be checked against the same contract address shown in the backend
              catalog.
            </p>
            <div className="mt-4 rounded-3xl bg-white/80 p-4 text-sm text-slate-600">
              <p>Catalog contract: {shortenAddress(election.contractAddress)}</p>
              <p className="mt-2">Creation tx: {election.transactionHash ? shortenHash(election.transactionHash) : "Unavailable"}</p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default VotingPage;
