import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { electionApi } from "../api/elections";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import { useAuth } from "../context/AuthContext";
import { useWallet } from "../hooks/useWallet";
import { buildExplorerUrl, formatDateTime, shortenAddress, shortenHash } from "../lib/utils";

function DashboardPage() {
  const { user, issueWalletChallenge, refreshUser, verifyWalletChallenge } = useAuth();
  const wallet = useWallet();
  const [elections, setElections] = useState([]);
  const [ballots, setBallots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [linkingWallet, setLinkingWallet] = useState(false);
  const [electionError, setElectionError] = useState("");
  const [ballotError, setBallotError] = useState("");
  const [ballotsLoading, setBallotsLoading] = useState(false);
  const [retry, setRetry] = useState(0);
  const walletVerified = Boolean(user.walletAddress && user.linkedWalletAt);
  const walletMatchesProfile = useMemo(() => {
    if (!user.walletAddress || !wallet.walletAddress) {
      return false;
    }

    return user.walletAddress.toLowerCase() === wallet.walletAddress.toLowerCase();
  }, [user.walletAddress, wallet.walletAddress]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setElectionError("");
    electionApi
      .list({ status: "all" })
      .then((data) => { if (!cancelled) setElections(data.elections.filter((election) => election.status !== "ended").slice(0, 4)); })
      .catch((error) => { if (!cancelled) setElectionError(error.response?.data?.message || error.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [retry]);

  useEffect(() => {
    let cancelled = false;
    if (!walletVerified) {
      setBallots([]);
      return;
    }

    setBallotsLoading(true);
    setBallotError("");
    electionApi
      .myBallots()
      .then((data) => { if (!cancelled) setBallots(data.ballots); })
      .catch((error) => { if (!cancelled) setBallotError(error.response?.data?.message || error.message); })
      .finally(() => { if (!cancelled) setBallotsLoading(false); });
    return () => { cancelled = true; };
  }, [walletVerified, user.walletAddress, retry]);

  const handleConnectWallet = async () => {
    try {
      await wallet.connectWallet();
      toast.success("Wallet connected.");
    } catch (error) {
      toast.error(error.shortMessage || error.message);
    }
  };

  const handleVerifyWallet = async () => {
    setLinkingWallet(true);
    try {
      const connectedWallet = await wallet.connectWallet();
      const normalizedWallet = connectedWallet.toLowerCase();

      if (user.walletAddress && user.walletAddress.toLowerCase() !== normalizedWallet) {
        throw new Error("Connect the same wallet address that is saved on your voter profile.");
      }

      const challenge = await issueWalletChallenge({
        walletAddress: normalizedWallet,
        intent: "link",
      });
      const signature = await wallet.signMessage(challenge.message);
      await verifyWalletChallenge({
        walletAddress: normalizedWallet,
        signature,
        intent: "link",
      });
      await refreshUser();
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

  return (
    <div className="page-shell space-y-6">
      <section className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <Card className="hero-grid p-8">
          <Badge variant={user.isApproved ? "active" : "scheduled"}>
            {user.isApproved ? "Approved voter" : "Awaiting admin approval"}
          </Badge>
          <h1 className="display-copy mt-5 text-4xl font-bold text-[var(--ink)]">Your voter dashboard</h1>
          <p className="mt-4 max-w-2xl text-slate-600">
            Review your approval state, wallet verification, and election access. Once your verified wallet is approved,
            your ballot is written directly to the smart contract.
          </p>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <div className="rounded-3xl bg-white/85 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Account role</p>
              <p className="mt-2 text-lg font-semibold capitalize text-slate-900">{user.role}</p>
            </div>
            <div className="rounded-3xl bg-white/85 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Wallet on file</p>
              <p className="mt-2 text-lg font-semibold text-slate-900">{shortenAddress(user.walletAddress || user.pendingWalletAddress)}</p>
            </div>
            <div className="rounded-3xl bg-white/85 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Ballots cast</p>
              <p className="mt-2 text-lg font-semibold text-slate-900">{ballotsLoading ? "Loading…" : ballotError ? "Unavailable" : ballots.length}</p>
            </div>
          </div>
        </Card>

        <Card>
          <h2 className="display-copy text-2xl font-semibold text-slate-900">Wallet readiness</h2>
          <div className="mt-6 space-y-4 text-sm text-slate-600">
            <div className="rounded-3xl bg-white/80 p-4">
              <p className="font-semibold text-slate-900">Approval</p>
              <p className="mt-2">{user.isApproved ? "Your voter record is approved." : "An administrator still needs to approve your account."}</p>
            </div>
            <div className="rounded-3xl bg-white/80 p-4">
              <p className="font-semibold text-slate-900">Wallet verification</p>
              <p className="mt-2">
                {walletVerified
                  ? `Verified with a signed challenge on ${formatDateTime(user.linkedWalletAt)}.`
                  : user.walletAddress || user.pendingWalletAddress
                    ? "Wallet saved, but it still needs a signature-based verification."
                    : "No wallet is linked to your voter profile yet."}
              </p>
            </div>
            <div className="rounded-3xl bg-white/80 p-4">
              <p className="font-semibold text-slate-900">Connected wallet</p>
              <p className="mt-2">
                {wallet.walletAddress ? shortenAddress(wallet.walletAddress) : "MetaMask is not connected in this browser."}
              </p>
              {wallet.walletAddress && user.walletAddress && !walletMatchesProfile && (
                <p className="mt-2 text-rose-700">The connected wallet does not match the voter profile wallet.</p>
              )}
            </div>
            <div className="rounded-3xl bg-white/80 p-4">
              <p className="font-semibold text-slate-900">Chain status</p>
              <p className="mt-2">
                {wallet.chainId
                  ? wallet.isExpectedNetwork
                    ? `Connected to ${wallet.expectedChain.chainName}.`
                    : `Connected to a different chain. Expected ${wallet.expectedChain.chainName}.`
                  : `Expected voting network: ${wallet.expectedChain.chainName}.`}
              </p>
            </div>
          </div>

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
              <Button variant="accent" onClick={handleVerifyWallet} disabled={linkingWallet}>
                {linkingWallet ? "Verifying wallet..." : user.walletAddress || user.pendingWalletAddress ? "Verify wallet ownership" : "Link wallet"}
              </Button>
            )}
            <Button as={Link} to="/elections">Open election board</Button>
          </div>
        </Card>
      </section>

      <section>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="display-copy text-2xl font-semibold text-slate-900">Upcoming and live elections</h2>
            <p className="text-sm text-slate-500">The latest elections available to your account.</p>
          </div>
          <Button as={Link} to="/elections" variant="secondary">Open election board</Button>
        </div>

        {electionError ? <Card role="alert"><p>{electionError}</p><Button className="mt-3" onClick={() => setRetry((value) => value + 1)}>Try again</Button></Card> : loading ? (
          <Card>Loading elections...</Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {elections.length === 0 && <Card>No upcoming or active elections. Check the election board for completed results.</Card>}
            {elections.map((election) => (
              <Card key={election._id || election.id}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant={election.status}>{election.status}</Badge>
                      {election.accessMode === "open" && <Badge variant="open">Open poll</Badge>}
                    </div>
                    <h3 className="display-copy mt-3 text-2xl font-semibold text-slate-900">{election.title}</h3>
                    <p className="mt-2 text-sm text-slate-600">{election.description}</p>
                  </div>
                  <div className="text-right text-sm text-slate-500">
                    <p>{election.onChainAvailable ? `${election.totalVotes} votes` : "Chain unavailable"}</p>
                    <p>{election.candidates.length} candidates</p>
                  </div>
                </div>
                <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
                  <span>Starts {formatDateTime(election.startTime)}</span>
                  <Link to={`/elections/${election._id || election.id}`} className="font-semibold text-[var(--teal)]">
                    Open election
                  </Link>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="mb-4">
          <h2 className="display-copy text-2xl font-semibold text-slate-900">My ballots</h2>
          <p className="text-sm text-slate-500">
            Receipts read from the blockchain for your verified wallet. They cannot be edited or deleted.
          </p>
        </div>

        {!walletVerified ? (
          <Card className="text-sm text-slate-500">Verify your wallet to see your on-chain ballot receipts.</Card>
        ) : ballotError ? <Card role="alert"><p>{ballotError}</p><Button className="mt-3" onClick={() => setRetry((value) => value + 1)}>Retry receipts</Button></Card> : ballotsLoading ? <Card role="status">Reading your ballots…</Card> : ballots.length === 0 ? (
          <Card className="text-sm text-slate-500">You have not voted in any election yet.</Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {ballots.map((ballot) => {
              const explorerUrl = buildExplorerUrl(ballot.transactionHash);
              return (
                <Card key={ballot.electionId}>
                  <Badge variant="neutral">{ballot.category}</Badge>
                  <h3 className="display-copy mt-3 text-xl font-semibold text-slate-900">{ballot.electionTitle}</h3>
                  <p className="mt-2 text-sm text-slate-600">
                    Voted for <span className="font-semibold">{ballot.candidateName || `#${ballot.candidateId}`}</span>
                    {ballot.timestamp ? ` on ${formatDateTime(ballot.timestamp * 1000)}` : ""}.
                  </p>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-500">
                    <span className="font-mono text-xs">
                      {explorerUrl ? (
                        <a className="text-[var(--teal)]" href={explorerUrl} rel="noreferrer" target="_blank">
                          {shortenHash(ballot.transactionHash)}
                        </a>
                      ) : (
                        shortenHash(ballot.transactionHash)
                      )}
                    </span>
                    <Link to={`/results/${ballot.electionId}`} className="font-semibold text-[var(--teal)]">
                      View results
                    </Link>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

export default DashboardPage;
