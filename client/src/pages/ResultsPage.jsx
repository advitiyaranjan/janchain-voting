import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { toast } from "sonner";
import { electionApi } from "../api/elections";
import ResultBars from "../components/charts/ResultBars";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import Input from "../components/ui/Input";
import { useAuth } from "../context/AuthContext";
import {
  buildExplorerUrl,
  formatDateTime,
  shortenAddress,
  shortenHash,
} from "../lib/utils";

const LIVE_REFRESH_MS = 15000;

function ResultsPage() {
  const { electionId } = useParams();
  const { user } = useAuth();
  const [results, setResults] = useState(null);
  const [activity, setActivity] = useState([]);
  const [verification, setVerification] = useState(null);
  const [lookupAddress, setLookupAddress] = useState(user?.walletAddress || "");
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);

  const loadResults = useCallback(
    async ({ silent = false } = {}) => {
      try {
        const [resultData, activityData] = await Promise.all([
          electionApi.getResults(electionId),
          electionApi.getActivity(electionId).catch(() => ({ activity: [] })),
        ]);
        setResults(resultData);
        setActivity(activityData.activity);
      } catch (error) {
        if (!silent) {
          toast.error(error.response?.data?.message || error.message);
        }
      } finally {
        setLoading(false);
      }
    },
    [electionId]
  );

  useEffect(() => {
    loadResults();
  }, [loadResults]);

  const isLive = results?.election.status === "active";

  useEffect(() => {
    if (!isLive) {
      return undefined;
    }

    const timer = setInterval(() => loadResults({ silent: true }), LIVE_REFRESH_MS);
    return () => clearInterval(timer);
  }, [isLive, loadResults]);

  useEffect(() => {
    if (!user?.walletAddress) {
      return;
    }

    setLookupAddress(user.walletAddress);
    electionApi
      .verifyVote(electionId, user.walletAddress)
      .then((data) => setVerification(data.verification))
      .catch(() => {});
  }, [electionId, user?.walletAddress]);

  const handleVerify = async () => {
    if (!lookupAddress) {
      toast.error("Enter a wallet address to verify.");
      return;
    }

    setVerifying(true);
    try {
      const data = await electionApi.verifyVote(electionId, lookupAddress.trim());
      setVerification(data.verification);
    } catch (error) {
      toast.error(error.response?.data?.message || error.message);
    } finally {
      setVerifying(false);
    }
  };

  if (loading) {
    return <div className="page-shell text-sm text-slate-500">Loading results...</div>;
  }

  if (!results) {
    return <div className="page-shell text-sm text-slate-500">Results unavailable.</div>;
  }

  const { election } = results;
  const { winner, isTie, leaders, turnout, eligibleVoters, totalVotes } = results.results;
  const hasEnded = election.status === "ended";
  const explorerUrl = buildExplorerUrl(verification?.transactionHash);
  const candidateNames = new Map(election.candidates.map((candidate) => [candidate.candidateId, candidate.name]));

  let leaderHeading = "No votes yet";
  let leaderDetail = "Results will appear after the first vote lands on-chain.";
  if (isTie) {
    leaderHeading = `Tie: ${leaders.map((leader) => leader.name).join(" & ")}`;
    leaderDetail = `${leaders[0].voteCount} votes each.`;
  } else if (winner) {
    leaderHeading = winner.name;
    leaderDetail = `${winner.voteCount} votes, ${winner.percentage}% share`;
  }

  return (
    <div className="page-shell space-y-6">
      <Card className="hero-grid p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <div className="flex flex-wrap gap-2">
              <Badge variant={election.status}>{election.status}</Badge>
              <Badge variant={election.accessMode === "open" ? "open" : "neutral"}>
                {election.accessMode === "open" ? "Open poll" : "Approved voters only"}
              </Badge>
              {isLive && <Badge variant="info">Live, refreshes every 15s</Badge>}
            </div>
            <h1 className="display-copy mt-5 text-4xl font-bold text-[var(--ink)]">{election.title}</h1>
            <p className="mt-4 text-slate-600">{election.description}</p>
          </div>
          <div className="rounded-3xl bg-white/85 p-5 text-sm text-slate-600">
            <p>Voting window: {formatDateTime(election.startTime)}</p>
            <p className="mt-2">Until: {formatDateTime(election.endTime)}</p>
            <p className="mt-2">Total on-chain votes: {totalVotes}</p>
            {turnout !== null && (
              <p className="mt-2">
                Turnout: {turnout}% of {eligibleVoters} eligible voters
              </p>
            )}
            <p className="mt-2">Election ID on-chain: #{election.onChainElectionId}</p>
            {results.results.blockNumber && <p className="mt-2">As of block #{results.results.blockNumber}</p>}
          </div>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1fr_0.42fr]">
        <div className="space-y-6">
          <Card>
            <h2 className="display-copy text-2xl font-semibold text-slate-900">
              {hasEnded ? "Final results" : "Live results"}
            </h2>
            <div className="mt-6">
              <ResultBars candidates={results.results.candidates} totalVotes={totalVotes} />
            </div>
          </Card>

          <Card>
            <h2 className="display-copy text-2xl font-semibold text-slate-900">Public ballot ledger</h2>
            <p className="mt-2 text-sm text-slate-500">
              The latest ballots read straight from contract events. Voters appear only as wallet addresses.
            </p>
            {activity.length === 0 ? (
              <p className="mt-5 text-sm text-slate-500">No ballots have been cast yet.</p>
            ) : (
              <div className="mt-5 overflow-x-auto">
                <table className="w-full min-w-[520px] text-left text-sm text-slate-600">
                  <thead className="text-xs uppercase tracking-[0.15em] text-slate-500">
                    <tr>
                      <th className="pb-3 font-semibold">Wallet</th>
                      <th className="pb-3 font-semibold">Choice</th>
                      <th className="pb-3 font-semibold">When</th>
                      <th className="pb-3 font-semibold">Transaction</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {activity.map((entry) => {
                      const txUrl = buildExplorerUrl(entry.transactionHash);
                      return (
                        <tr key={entry.transactionHash}>
                          <td className="py-3 font-mono text-xs">{shortenAddress(entry.voter)}</td>
                          <td className="py-3">
                            {candidateNames.get(entry.candidateId) || `#${entry.candidateId}`}
                            {entry.gasless && (
                              <Badge variant="info" className="ml-2">
                                gasless
                              </Badge>
                            )}
                          </td>
                          <td className="py-3">{formatDateTime(entry.timestamp * 1000)}</td>
                          <td className="py-3 font-mono text-xs">
                            {txUrl ? (
                              <a className="text-[var(--teal)]" href={txUrl} rel="noreferrer" target="_blank">
                                {shortenHash(entry.transactionHash)}
                              </a>
                            ) : (
                              shortenHash(entry.transactionHash)
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <p className="text-sm uppercase tracking-[0.2em] text-slate-500">
              {hasEnded ? (isTie ? "Outcome" : "Winner") : "Current leader"}
            </p>
            <h2 className="display-copy mt-3 text-3xl font-semibold text-slate-900">{leaderHeading}</h2>
            <p className="mt-3 text-sm text-slate-600">{leaderDetail}</p>
          </Card>

          <Card>
            <p className="text-sm uppercase tracking-[0.2em] text-slate-500">On-chain references</p>
            <div className="mt-4 space-y-3 rounded-3xl bg-white/80 p-4 text-sm text-slate-600">
              <p>Contract: {shortenAddress(election.contractAddress)}</p>
              <p>Creation tx: {election.transactionHash ? shortenHash(election.transactionHash) : "Unavailable"}</p>
            </div>
          </Card>

          <Card>
            <h2 className="display-copy text-2xl font-semibold text-slate-900">Verify a wallet receipt</h2>
            <p className="mt-2 text-sm text-slate-500">
              Enter any wallet address to confirm whether it voted in this election.
            </p>
            <div className="mt-5 space-y-3">
              <Input value={lookupAddress} onChange={(event) => setLookupAddress(event.target.value)} placeholder="0x..." />
              <Button className="w-full" onClick={handleVerify} disabled={verifying}>
                {verifying ? "Verifying..." : "Verify wallet on-chain"}
              </Button>
            </div>

            {verification && (
              <div className="mt-5 rounded-3xl bg-white/80 p-4 text-sm text-slate-600">
                {verification.hasVoted ? (
                  <>
                    <p className="font-semibold text-slate-900">Vote found</p>
                    <p className="mt-2">
                      Candidate: {verification.candidateName || `Candidate #${verification.candidateId}`}
                    </p>
                    <p className="mt-2">Candidate ID: {verification.candidateId}</p>
                    <p className="mt-2">Block: {verification.blockNumber || "N/A"}</p>
                    <p className="mt-2 break-all">Transaction: {verification.transactionHash || "Unavailable"}</p>
                    {explorerUrl && (
                      <a className="mt-3 inline-block font-semibold text-[var(--teal)]" href={explorerUrl} rel="noreferrer" target="_blank">
                        Open block explorer
                      </a>
                    )}
                  </>
                ) : (
                  <p className="font-semibold text-slate-900">No vote found for this wallet in the selected election.</p>
                )}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

export default ResultsPage;
