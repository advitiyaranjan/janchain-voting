import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import { useWallet } from "../hooks/useWallet";
import { castVote, describeVoteError, readElectionPage, readWalletEligibility } from "../lib/contract";
import { formatDateTime, shortenAddress } from "../lib/utils";

const PAGE_SIZE = 12;

export default function ChainPage() {
  const wallet = useWallet();
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [ballot, setBallot] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [receipt, setReceipt] = useState(null);
  const requestVersion = useRef(0);
  const load = useCallback(async () => {
    const version = ++requestVersion.current;
    setLoading(true);
    setError("");
    try { const next = await readElectionPage(offset, PAGE_SIZE); if (version === requestVersion.current) setData(next); }
    catch (err) { if (version === requestVersion.current) setError(describeVoteError(err)); }
    finally { if (version === requestVersion.current) setLoading(false); }
  }, [offset]);
  useEffect(() => { load(); return () => { requestVersion.current += 1; }; }, [load]);
  useEffect(() => { setBallot(null); }, [wallet.walletAddress, wallet.chainId, offset]);

  const connect = async () => {
    try { await wallet.connectWallet(); await wallet.ensureExpectedNetwork(); }
    catch (err) { toast.error(describeVoteError(err)); }
  };
  const submit = async () => {
    if (!ballot || submitting) return;
    setSubmitting(true);
    try {
      await wallet.ensureExpectedNetwork();
      const eligibility = await readWalletEligibility(ballot.electionId, wallet.walletAddress);
      if (eligibility.hasVoted) throw new Error("This wallet already voted in this election.");
      if (!eligibility.eligible) throw new Error("Voting is unavailable for this wallet. Check the election window, approval, and pause status.");
      const result = await castVote(ballot.electionId, ballot.candidateId, wallet.walletAddress);
      setReceipt({ ...result, ...ballot });
      setBallot(null);
      toast.success("Your vote is confirmed on-chain.");
      await load();
    } catch (err) { toast.error(describeVoteError(err)); }
    finally { setSubmitting(false); }
  };

  return <div className="page-shell space-y-6">
    <Card className="hero-grid p-8">
      <Badge variant="info">Direct blockchain access</Badge>
      <h1 className="display-copy mt-4 text-4xl font-bold">Your ballot. Your wallet.</h1>
      <p className="mt-4 max-w-2xl text-slate-600">Browse contract elections and submit directly through MetaMask. No account, catalog API, or gas relayer is needed. You pay the network fee. Restricted elections require on-chain wallet approval.</p>
      <p className="mt-3 text-sm text-slate-600">Your wallet and candidate choice are public. Open polls enforce one vote per wallet, and do not establish one person per vote.</p>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button onClick={connect} disabled={wallet.isConnecting || submitting}>{wallet.isConnecting ? "Connecting…" : wallet.walletAddress ? "Switch / reconnect wallet" : "Connect MetaMask"}</Button>
        <Button variant="secondary" onClick={load} disabled={loading || submitting}>Refresh chain data</Button>
        <span className="text-sm text-slate-600">{wallet.expectedChain.chainName} · {shortenAddress(wallet.walletAddress)}</span>
      </div>
      {!wallet.hasWallet && <p className="mt-3 text-sm text-amber-800">Use a browser with MetaMask to vote. You can still read elections here.</p>}
      <p className="mt-3 break-all font-mono text-xs text-slate-600">Contract: {import.meta.env.VITE_CONTRACT_ADDRESS || "Not configured"}</p>
    </Card>
    {error ? <Card role="alert"><h2 className="font-semibold">Unable to read the blockchain</h2><p className="mt-2 text-sm">{error}</p><Button className="mt-4" onClick={load}>Try again</Button></Card>
      : loading ? <Card role="status">Reading elections from the contract…</Card>
      : <>
        <p className="text-sm text-slate-600">{data?.count} elections · Read at block #{data?.blockNumber}</p>
        {data?.paused && <Card role="alert" className="text-rose-800">Voting is paused on-chain. Results remain available.</Card>}
        {data?.elections.length === 0 && <Card>No elections have been created on this contract yet.</Card>}
        <div className="grid gap-6 lg:grid-cols-2">{data?.elections.map((election) => <Card key={election.id}>
          <div className="flex flex-wrap gap-2"><Badge variant={election.status}>{election.status}</Badge><Badge variant="neutral">{election.restricted ? "Approved wallets" : "Open poll"}</Badge></div>
          <h2 className="display-copy mt-4 text-2xl font-semibold">{election.title}</h2>
          <p className="mt-2 text-sm text-slate-600">{election.description}</p>
          <p className="mt-3 text-sm text-slate-600">{formatDateTime(election.startTime)} – {formatDateTime(election.endTime)}</p>
          <fieldset className="mt-5 space-y-3" disabled={submitting || election.status !== "active" || data.paused || !wallet.walletAddress || !wallet.isExpectedNetwork}>
            <legend className="mb-3 text-sm font-semibold">Candidates · {election.totalVotes} votes</legend>
            {election.candidates.map((candidate) => <label key={candidate.candidateId} className="flex items-center gap-3 rounded-2xl border border-slate-200 p-4">
              <input type="radio" name={`chain-ballot-${election.id}`} checked={ballot?.electionId === election.id && ballot?.candidateId === candidate.candidateId} onChange={() => setBallot({ electionId: election.id, candidateId: candidate.candidateId, candidateName: candidate.name, title: election.title })} />
              <span className="flex-1 font-semibold">{candidate.name}</span><span className="text-sm text-slate-600">{candidate.voteCount} votes</span>
            </label>)}
          </fieldset>
        </Card>)}</div>
        <div className="flex items-center justify-between gap-3"><Button variant="secondary" disabled={offset === 0 || submitting} onClick={() => setOffset(offset - PAGE_SIZE)}>Previous</Button><span className="text-sm">Page {Math.floor(offset / PAGE_SIZE) + 1}</span><Button variant="secondary" disabled={offset + PAGE_SIZE >= (data?.count || 0) || submitting} onClick={() => setOffset(offset + PAGE_SIZE)}>Next</Button></div>
      </>}
    {ballot && !error && <Card className="border-teal-300" role="region" aria-label="Review ballot">
      <h2 className="text-xl font-semibold">Review your ballot</h2><p className="mt-3">{ballot.title}: <strong>{ballot.candidateName}</strong></p>
      <p className="mt-2 text-sm text-slate-600">This public vote cannot be changed once confirmed. Confirm the candidate and network in MetaMask.</p>
      <div className="mt-4 flex flex-wrap gap-3"><Button onClick={submit} disabled={submitting || loading || data?.paused || !wallet.isExpectedNetwork}>{submitting ? "Waiting for confirmation…" : "Confirm and vote on-chain"}</Button><Button variant="secondary" onClick={() => setBallot(null)} disabled={submitting}>Cancel selection</Button></div>
    </Card>}
    {receipt && <Card role="status"><h2 className="font-semibold">Confirmed ballot receipt</h2><p className="mt-2">{receipt.title}: {receipt.candidateName}</p><p className="mt-2 break-all font-mono text-xs">Transaction: {receipt.transactionHash}</p><p className="mt-2 text-sm">Block #{receipt.blockNumber}</p></Card>}
    <Link className="inline-block text-sm font-semibold text-[var(--teal)]" to="/elections">Browse the election catalog →</Link>
  </div>;
}
