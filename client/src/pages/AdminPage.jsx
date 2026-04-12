import { useEffect, useState } from "react";
import { toast } from "sonner";
import { adminApi } from "../api/admin";
import { electionApi } from "../api/elections";
import ElectionForm from "../components/forms/ElectionForm";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import { formatDateTime, shortenAddress, shortenHash } from "../lib/utils";

function AdminPage() {
  const [dashboard, setDashboard] = useState(null);
  const [users, setUsers] = useState([]);
  const [elections, setElections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [syncingWalletId, setSyncingWalletId] = useState("");

  const loadPage = async () => {
    setLoading(true);
    try {
      const [dashboardData, userData, electionData] = await Promise.all([
        adminApi.dashboard(),
        adminApi.listUsers(),
        electionApi.list({ status: "all" }),
      ]);
      setDashboard(dashboardData);
      setUsers(userData.users);
      setElections(electionData.elections);
    } catch (error) {
      toast.error(error.response?.data?.message || error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPage();
  }, []);

  const handleApproval = async (userId, approved) => {
    try {
      const data = await adminApi.updateApproval(userId, approved);
      toast.success(data.message);
      if (data.warning) {
        toast.warning(data.warning);
      }
      await loadPage();
    } catch (error) {
      toast.error(error.response?.data?.message || error.message);
    }
  };

  const handleSyncWallet = async (userId) => {
    setSyncingWalletId(userId);
    try {
      const data = await adminApi.syncWallet(userId);
      toast.success(data.message);
      await loadPage();
    } catch (error) {
      toast.error(error.response?.data?.message || error.message);
    } finally {
      setSyncingWalletId("");
    }
  };

  const handleCreateElection = async (payload) => {
    setCreating(true);
    try {
      const data = await adminApi.createElection(payload);
      toast.success(
        data.blockchain?.transactionHash
          ? `Election created on-chain: ${shortenHash(data.blockchain.transactionHash)}`
          : data.message
      );
      await loadPage();
    } catch (error) {
      toast.error(error.response?.data?.message || error.message);
    } finally {
      setCreating(false);
    }
  };

  const handleEndElection = async (electionId) => {
    try {
      const data = await adminApi.endElection(electionId);
      toast.success(data.message);
      await loadPage();
    } catch (error) {
      toast.error(error.response?.data?.message || error.message);
    }
  };

  if (loading) {
    return <div className="page-shell text-sm text-slate-500">Loading admin console...</div>;
  }

  return (
    <div className="page-shell space-y-6">
      <Card className="hero-grid p-8">
        <Badge variant="info">Election control room</Badge>
        <h1 className="display-copy mt-5 text-4xl font-bold text-[var(--ink)]">Admin console</h1>
        <p className="mt-4 max-w-3xl text-slate-600">
          Approve voters, publish new elections, resync verified wallets to the contract, and monitor the blockchain
          connection backing the voting system.
        </p>
        <div className="mt-8 grid gap-4 md:grid-cols-3 xl:grid-cols-6">
          <div className="rounded-3xl bg-white/85 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Registered users</p>
            <p className="mt-2 text-3xl font-bold text-slate-900">{dashboard.metrics.totalUsers}</p>
          </div>
          <div className="rounded-3xl bg-white/85 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Approved</p>
            <p className="mt-2 text-3xl font-bold text-slate-900">{dashboard.metrics.approvedUsers}</p>
          </div>
          <div className="rounded-3xl bg-white/85 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Pending</p>
            <p className="mt-2 text-3xl font-bold text-slate-900">{dashboard.metrics.pendingUsers}</p>
          </div>
          <div className="rounded-3xl bg-white/85 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Verified wallets</p>
            <p className="mt-2 text-3xl font-bold text-slate-900">{dashboard.metrics.verifiedWallets}</p>
          </div>
          <div className="rounded-3xl bg-white/85 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Ready to vote</p>
            <p className="mt-2 text-3xl font-bold text-slate-900">{dashboard.metrics.readyWallets}</p>
          </div>
          <div className="rounded-3xl bg-white/85 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Contract state</p>
            <p className="mt-2 text-lg font-semibold text-slate-900">
              {dashboard.metrics.chainConfigured ? "Connected" : "Needs deployment"}
            </p>
          </div>
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <Card>
          <h2 className="display-copy text-2xl font-semibold text-slate-900">Create election</h2>
          <p className="mt-2 text-sm text-slate-500">
            This publishes metadata to MongoDB, optionally pins JSON to IPFS, and creates the ballot on-chain.
          </p>
          <div className="mt-6">
            <ElectionForm onSubmit={handleCreateElection} isLoading={creating} />
          </div>
        </Card>

        <div className="space-y-6">
          <Card>
            <h2 className="display-copy text-2xl font-semibold text-slate-900">Blockchain status</h2>
            <div className="mt-5 space-y-4 text-sm text-slate-600">
              <div className="rounded-3xl bg-white/80 p-4">
                <p className="font-semibold text-slate-900">Contract</p>
                <p className="mt-2 break-all">
                  {dashboard.blockchain?.contractAddress || "No contract address configured yet."}
                </p>
              </div>
              <div className="rounded-3xl bg-white/80 p-4">
                <p className="font-semibold text-slate-900">Network</p>
                <p className="mt-2">Chain ID: {dashboard.blockchain?.chainId || "N/A"}</p>
                <p className="mt-2 break-all">RPC: {dashboard.blockchain?.rpcUrl || "Unavailable"}</p>
              </div>
              <div className="rounded-3xl bg-white/80 p-4">
                <p className="font-semibold text-slate-900">On-chain catalog</p>
                <p className="mt-2">
                  Elections deployed: {dashboard.blockchain?.onChainElectionCount ?? "Unavailable"}
                </p>
                <p className="mt-2">
                  Server signer: {dashboard.blockchain?.hasServerWallet ? "Configured" : "Missing"}
                </p>
                {dashboard.blockchain?.error && (
                  <p className="mt-2 text-rose-700">RPC warning: {dashboard.blockchain.error}</p>
                )}
              </div>
            </div>
          </Card>

          <Card>
            <div className="flex items-center justify-between">
              <div>
                <h2 className="display-copy text-2xl font-semibold text-slate-900">Voter approvals</h2>
                <p className="text-sm text-slate-500">Approve or revoke wallet-enabled voter access.</p>
              </div>
            </div>

            <div className="mt-5 space-y-4">
              {users.map((user) => (
                <div key={user.id} className="rounded-3xl bg-white/80 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-semibold text-slate-900">{user.fullName}</p>
                      <p className="text-sm text-slate-500">{user.email}</p>
                      <p className="mt-2 text-sm text-slate-500">{shortenAddress(user.walletAddress)}</p>
                      {user.linkedWalletAt && (
                        <p className="mt-2 text-xs text-slate-500">
                          Verified: {formatDateTime(user.linkedWalletAt)}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap justify-end gap-2">
                      <Badge variant={user.isApproved ? "active" : "scheduled"}>
                        {user.isApproved ? "approved" : "pending"}
                      </Badge>
                      <Badge variant={user.linkedWalletAt ? "info" : "neutral"}>
                        {user.linkedWalletAt ? "wallet verified" : user.walletAddress ? "awaiting wallet proof" : "no wallet"}
                      </Badge>
                    </div>
                  </div>
                  {user.role !== "admin" && (
                    <div className="mt-4 flex flex-wrap gap-3">
                      <Button variant="accent" className="px-4 py-2" onClick={() => handleApproval(user.id, true)}>
                        Approve
                      </Button>
                      <Button
                        variant="secondary"
                        className="px-4 py-2"
                        onClick={() => handleApproval(user.id, false)}
                      >
                        Revoke
                      </Button>
                      {dashboard.blockchain?.configured && user.walletAddress && user.linkedWalletAt && (
                        <Button
                          variant="ghost"
                          className="px-4 py-2"
                          onClick={() => handleSyncWallet(user.id)}
                          disabled={syncingWalletId === user.id}
                        >
                          {syncingWalletId === user.id
                            ? "Syncing..."
                            : user.isApproved
                              ? "Sync approved wallet"
                              : "Sync revocation"}
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      <Card>
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="display-copy text-2xl font-semibold text-slate-900">Election activity</h2>
            <p className="text-sm text-slate-500">Monitor lifecycle state and close a running election manually.</p>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {elections.map((election) => (
            <div key={election._id || election.id} className="rounded-3xl border border-slate-200 bg-white/80 p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <Badge variant={election.status}>{election.status}</Badge>
                  <h3 className="display-copy mt-3 text-2xl font-semibold text-slate-900">{election.title}</h3>
                  <p className="mt-2 text-sm text-slate-600">{election.description}</p>
                </div>
                <p className="text-sm text-slate-500">{election.totalVotes} votes</p>
              </div>

              <div className="mt-4 grid gap-2 text-sm text-slate-500 sm:grid-cols-2">
                <p>Start: {formatDateTime(election.startTime)}</p>
                <p>End: {formatDateTime(election.endTime)}</p>
                <p>On-chain ID: #{election.onChainElectionId}</p>
                <p>Tx: {election.transactionHash ? shortenHash(election.transactionHash) : "Unavailable"}</p>
              </div>

              {election.status === "active" && (
                <Button
                  className="mt-5"
                  variant="danger"
                  onClick={() => handleEndElection(election._id || election.id)}
                >
                  End election now
                </Button>
              )}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

export default AdminPage;
