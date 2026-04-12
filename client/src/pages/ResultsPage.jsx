import { useEffect, useState } from "react";
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

function ResultsPage() {
  const { electionId } = useParams();
  const { user } = useAuth();
  const [results, setResults] = useState(null);
  const [verification, setVerification] = useState(null);
  const [lookupAddress, setLookupAddress] = useState(user?.walletAddress || "");
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    electionApi
      .getResults(electionId)
      .then((data) => {
        setResults(data);
        if (user?.walletAddress) {
          setLookupAddress(user.walletAddress);
        }
      })
      .catch((error) => toast.error(error.response?.data?.message || error.message))
      .finally(() => setLoading(false));
  }, [electionId, user?.walletAddress]);

  useEffect(() => {
    if (!user?.walletAddress) {
      return;
    }

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
      const data = await electionApi.verifyVote(electionId, lookupAddress);
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

  const winner = results.results.winner;
  const explorerUrl = buildExplorerUrl(verification?.transactionHash);

  return (
    <div className="page-shell space-y-6">
      <Card className="hero-grid p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <Badge variant={results.election.status}>{results.election.status}</Badge>
            <h1 className="display-copy mt-5 text-4xl font-bold text-[var(--ink)]">{results.election.title}</h1>
            <p className="mt-4 text-slate-600">{results.election.description}</p>
          </div>
          <div className="rounded-3xl bg-white/85 p-5 text-sm text-slate-600">
            <p>Voting window: {formatDateTime(results.election.startTime)}</p>
            <p className="mt-2">Until: {formatDateTime(results.election.endTime)}</p>
            <p className="mt-2">Total on-chain votes: {results.results.totalVotes}</p>
            <p className="mt-2">Election ID on-chain: #{results.election.onChainElectionId}</p>
          </div>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1fr_0.42fr]">
        <Card>
          <h2 className="display-copy text-2xl font-semibold text-slate-900">Live results</h2>
          <div className="mt-6">
            <ResultBars candidates={results.results.candidates} totalVotes={results.results.totalVotes} />
          </div>
        </Card>

        <div className="space-y-6">
          <Card>
            <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Current leader</p>
            <h2 className="display-copy mt-3 text-3xl font-semibold text-slate-900">
              {winner ? winner.name : "No votes yet"}
            </h2>
            <p className="mt-3 text-sm text-slate-600">
              {winner
                ? `${winner.voteCount} votes, ${winner.percentage}% share`
                : "Results will appear after the first vote lands on-chain."}
            </p>
          </Card>

          <Card>
            <p className="text-sm uppercase tracking-[0.2em] text-slate-500">On-chain references</p>
            <div className="mt-4 space-y-3 rounded-3xl bg-white/80 p-4 text-sm text-slate-600">
              <p>Contract: {shortenAddress(results.election.contractAddress)}</p>
              <p>Creation tx: {results.election.transactionHash ? shortenHash(results.election.transactionHash) : "Unavailable"}</p>
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
