import { useCallback, useDeferredValue, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { adminApi } from "../api/admin";
import { electionApi } from "../api/elections";
import ElectionForm from "../components/forms/ElectionForm";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import Input from "../components/ui/Input";
import { formatDateTime, shortenAddress, shortenHash } from "../lib/utils";

const userFilters = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "unverified", label: "No verified wallet" },
];

// Relayer balances below this trigger a top-up warning (in the chain's native token).
const LOW_RELAYER_BALANCE = 0.05;

function errorMessage(error) {
  return error.response?.data?.message || error.message;
}

function toDateTimeLocal(value) {
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function AdminPage() {
  const [dashboard, setDashboard] = useState(null);
  const [users, setUsers] = useState([]);
  const [elections, setElections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [busyAction, setBusyAction] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [userStatus, setUserStatus] = useState("all");
  const [selectedUserIds, setSelectedUserIds] = useState([]);
  const [extendingId, setExtendingId] = useState("");
  const [extendValue, setExtendValue] = useState("");
  const userRequestVersion = useRef(0);
  const deferredUserSearch = useDeferredValue(userSearch);

  const loadOverview = useCallback(async () => {
    try {
      const [dashboardData, electionData] = await Promise.all([
        adminApi.dashboard(),
        electionApi.list({ status: "all" }),
      ]);
      setDashboard(dashboardData);
      setElections(electionData.elections);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadUsers = useCallback(async () => {
    const version = ++userRequestVersion.current;
    try {
      const data = await adminApi.listUsers({ q: deferredUserSearch, status: userStatus });
      if (version !== userRequestVersion.current) return;
      setUsers(data.users);
      setSelectedUserIds((current) => current.filter((id) => data.users.some((user) => user.id === id)));
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }, [deferredUserSearch, userStatus]);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const refreshAll = () => Promise.all([loadOverview(), loadUsers()]);

  const runAction = async (actionKey, action) => {
    if (busyAction) return false;
    setBusyAction(actionKey);
    try {
      const data = await action();
      toast.success(data.message);
      if (data.warning) {
        toast.warning(data.warning);
      }
      await refreshAll();
      return true;
    } catch (error) {
      toast.error(errorMessage(error));
      return false;
    } finally {
      setBusyAction("");
    }
  };

  const handleApproval = (userId, approved) =>
    runAction(`approval-${userId}`, () => adminApi.updateApproval(userId, approved));

  const handleBulkApproval = async (approved) => {
    const done = await runAction(`bulk-${approved}`, () => adminApi.bulkApproval(selectedUserIds, approved));
    if (done) {
      setSelectedUserIds([]);
    }
  };

  const handleSyncWallet = (userId) => runAction(`sync-${userId}`, () => adminApi.syncWallet(userId));

  const handleCreateElection = async (payload) => {
    setCreating(true);
    try {
      const data = await adminApi.createElection(payload);
      toast.success(
        data.blockchain?.transactionHash
          ? `Election published on-chain: ${shortenHash(data.blockchain.transactionHash)}`
          : data.message
      );
      await loadOverview();
      return true;
    } catch (error) {
      toast.error(errorMessage(error));
      return false;
    } finally {
      setCreating(false);
    }
  };

  const handleEndElection = (election) => {
    if (!window.confirm(`End "${election.title}" now? Voting closes immediately and cannot be reopened.`)) {
      return;
    }

    runAction(`end-${election.id}`, () => adminApi.endElection(election.id));
  };

  const startExtending = (election) => {
    setExtendingId(election.id);
    setExtendValue(toDateTimeLocal(new Date(election.endTime).getTime() + 60 * 60 * 1000));
  };

  const handleExtendElection = async (election) => {
    if (!extendValue || !Number.isFinite(new Date(extendValue).getTime()) || new Date(extendValue) <= new Date(election.endTime)) {
      toast.error("Choose a valid end time later than the current voting window.");
      return;
    }
    const done = await runAction(`extend-${election.id}`, () =>
      adminApi.extendElection(election.id, new Date(extendValue).toISOString())
    );
    if (done) {
      setExtendingId("");
    }
  };

  const handleTogglePause = () => {
    const pausing = !dashboard.blockchain?.paused;
    const prompt = pausing
      ? "Pause ALL voting across every election? Use this only for emergencies."
      : "Resume voting across all elections?";
    if (!window.confirm(prompt)) {
      return;
    }

    runAction("pause", () => adminApi.setPaused(pausing));
  };

  const toggleUserSelection = (userId) => {
    setSelectedUserIds((current) =>
      current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId]
    );
  };

  const allUsersSelected = users.length > 0 && selectedUserIds.length === users.length;

  if (loading) {
    return <div className="page-shell text-sm text-slate-500">Loading admin console...</div>;
  }

  if (!dashboard) {
    return <div className="page-shell"><Card role="alert"><p>The admin console could not be loaded.</p><Button className="mt-3" onClick={loadOverview}>Try again</Button></Card></div>;
  }

  const { blockchain, metrics } = dashboard;
  // The dashboard's RPC-failure fallback omits the balance entirely, so treat missing like null.
  const relayerBalance = blockchain?.relayerBalance == null ? null : Number(blockchain.relayerBalance);
  const relayerLow = relayerBalance !== null && relayerBalance < LOW_RELAYER_BALANCE;

  return (
    <div className="page-shell space-y-6">
      <Card className="hero-grid p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="info">Election control room</Badge>
              {blockchain?.paused && <Badge variant="danger">Voting paused</Badge>}
            </div>
            <h1 className="display-copy mt-5 text-4xl font-bold text-[var(--ink)]">Admin console</h1>
            <p className="mt-4 max-w-3xl text-slate-600">
              Approve voters, publish elections, adjust voting windows, and monitor the contract and relayer backing
              the platform.
            </p>
          </div>
          {blockchain?.configured && blockchain?.hasServerWallet && typeof blockchain?.paused === "boolean" && (
            <Button
              variant={blockchain.paused ? "accent" : "danger"}
              onClick={handleTogglePause}
              disabled={Boolean(busyAction)}
            >
              {busyAction === "pause" ? "Updating..." : blockchain.paused ? "Resume voting" : "Pause all voting"}
            </Button>
          )}
        </div>
        <div className="mt-8 grid gap-4 md:grid-cols-3 xl:grid-cols-6">
          {[
            ["Registered voters", metrics.totalUsers],
            ["Approved", metrics.approvedUsers],
            ["Pending", metrics.pendingUsers],
            ["Verified wallets", metrics.verifiedWallets],
            ["Ready to vote", metrics.readyWallets],
            ["On-chain registry", blockchain?.approvedVoterCount ?? "N/A"],
          ].map(([label, value]) => (
            <div key={label} className="rounded-3xl bg-white/85 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{label}</p>
              <p className="mt-2 text-3xl font-bold text-slate-900">{value}</p>
            </div>
          ))}
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
                <p className="mt-2 break-all">{blockchain?.contractAddress || "No contract address configured yet."}</p>
                <p className="mt-2">
                  State:{" "}
                  {!metrics.chainConfigured
                    ? "Needs deployment"
                    : blockchain?.paused
                      ? "Paused"
                      : blockchain?.paused === false
                        ? "Accepting votes"
                        : "Unreachable"}
                </p>
              </div>
              <div className="rounded-3xl bg-white/80 p-4">
                <p className="font-semibold text-slate-900">Network</p>
                <p className="mt-2">Chain ID: {blockchain?.chainId || "N/A"}</p>
                <p className="mt-2">Latest block: {blockchain?.blockNumber ?? "Unavailable"}</p>
                <p className="mt-2 break-all">RPC: {blockchain?.rpcUrl || "Unavailable"}</p>
              </div>
              <div className="rounded-3xl bg-white/80 p-4">
                <p className="font-semibold text-slate-900">Server wallet and gasless relayer</p>
                <p className="mt-2">
                  {blockchain?.hasServerWallet
                    ? shortenAddress(blockchain.serverWalletAddress)
                    : "Missing: set SERVER_WALLET_PRIVATE_KEY to enable admin actions and gasless voting."}
                </p>
                {relayerBalance !== null && (
                  <p className={`mt-2 ${relayerLow ? "text-rose-700" : ""}`}>
                    Balance: {relayerBalance.toFixed(4)}
                    {relayerLow && ". Top up soon, or gasless votes will start failing."}
                  </p>
                )}
                <p className="mt-2">Elections deployed: {blockchain?.onChainElectionCount ?? "Unavailable"}</p>
                {blockchain?.error && <p className="mt-2 text-rose-700">RPC warning: {blockchain.error}</p>}
              </div>
            </div>
          </Card>

          <Card>
            <h2 className="display-copy text-2xl font-semibold text-slate-900">Voter approvals</h2>
            <p className="text-sm text-slate-500">Approvals sync verified wallets to the on-chain registry.</p>

            <div className="mt-5 space-y-3">
              <Input
                aria-label="Search voters"
                value={userSearch}
                onChange={(event) => setUserSearch(event.target.value)}
                placeholder="Search name, email, or wallet"
              />
              <div className="flex flex-wrap gap-2">
                {userFilters.map((filter) => (
                  <button
                    key={filter.value}
                    aria-pressed={userStatus === filter.value}
                    type="button"
                    onClick={() => setUserStatus(filter.value)}
                    className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                      userStatus === filter.value
                        ? "bg-[var(--ink)] text-white"
                        : "bg-white/80 text-slate-600 hover:bg-white"
                    }`}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
            </div>

            {users.length > 0 && (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-3xl bg-slate-50 px-4 py-3 text-sm">
                <label className="flex items-center gap-2 text-slate-600">
                  <input
                    type="checkbox"
                    checked={allUsersSelected}
                    onChange={() => setSelectedUserIds(allUsersSelected ? [] : users.map((user) => user.id))}
                  />
                  {selectedUserIds.length ? `${selectedUserIds.length} selected` : "Select all"}
                </label>
                {selectedUserIds.length > 0 && (
                  <div className="flex gap-2">
                    <Button
                      variant="accent"
                      className="px-4 py-2"
                      onClick={() => handleBulkApproval(true)}
                      disabled={Boolean(busyAction)}
                    >
                      Approve selected
                    </Button>
                    <Button
                      variant="secondary"
                      className="px-4 py-2"
                      onClick={() => handleBulkApproval(false)}
                      disabled={Boolean(busyAction)}
                    >
                      Revoke selected
                    </Button>
                  </div>
                )}
              </div>
            )}

            <div className="mt-4 max-h-[36rem] space-y-4 overflow-y-auto pr-1">
              {users.length === 0 && <p className="text-sm text-slate-500">No voters match this filter.</p>}
              {users.map((user) => (
                <div key={user.id} className="rounded-3xl bg-white/80 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <label className="flex items-start gap-3">
                      <input
                        className="mt-1"
                        type="checkbox"
                        checked={selectedUserIds.includes(user.id)}
                        onChange={() => toggleUserSelection(user.id)}
                      />
                      <span>
                        <span className="block font-semibold text-slate-900">{user.fullName}</span>
                        <span className="block text-sm text-slate-500">{user.email}</span>
                        <span className="mt-2 block text-sm text-slate-500">{shortenAddress(user.walletAddress)}</span>
                        {user.linkedWalletAt && (
                          <span className="mt-2 block text-xs text-slate-500">
                            Verified: {formatDateTime(user.linkedWalletAt)}
                          </span>
                        )}
                      </span>
                    </label>
                    <div className="flex flex-wrap justify-end gap-2">
                      <Badge variant={user.isApproved ? "active" : "scheduled"}>
                        {user.isApproved ? "approved" : "pending"}
                      </Badge>
                      <Badge variant={user.linkedWalletAt ? "info" : "neutral"}>
                        {user.linkedWalletAt ? "wallet verified" : user.walletAddress ? "awaiting wallet proof" : "no wallet"}
                      </Badge>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-3">
                    {!user.isApproved ? (
                      <Button
                        variant="accent"
                        className="px-4 py-2"
                        onClick={() => handleApproval(user.id, true)}
                        disabled={Boolean(busyAction)}
                      >
                        Approve
                      </Button>
                    ) : (
                      <Button
                        variant="secondary"
                        className="px-4 py-2"
                        onClick={() => handleApproval(user.id, false)}
                        disabled={Boolean(busyAction)}
                      >
                        Revoke
                      </Button>
                    )}
                    {blockchain?.configured && user.walletAddress && user.linkedWalletAt && (
                      <Button
                        variant="ghost"
                        className="px-4 py-2"
                        onClick={() => handleSyncWallet(user.id)}
                        disabled={Boolean(busyAction)}
                      >
                        {busyAction === `sync-${user.id}`
                          ? "Syncing..."
                          : user.isApproved
                            ? "Resync approval"
                            : "Resync revocation"}
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      <Card>
        <div className="mb-5">
          <h2 className="display-copy text-2xl font-semibold text-slate-900">Election activity</h2>
          <p className="text-sm text-slate-500">Monitor lifecycle state, extend a voting window, or close an election.</p>
        </div>

        {elections.length === 0 && <p className="text-sm text-slate-500">No elections published yet.</p>}

        <div className="grid gap-4 lg:grid-cols-2">
          {elections.map((election) => {
            const isOpen = election.status !== "ended";
            const isExtending = extendingId === election.id;

            return (
              <div key={election.id} className="rounded-3xl border border-slate-200 bg-white/80 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant={election.status}>{election.status}</Badge>
                      <Badge variant={election.accessMode === "open" ? "open" : "neutral"}>
                        {election.accessMode === "open" ? "Open poll" : "Restricted"}
                      </Badge>
                      <Badge variant="neutral">{election.category}</Badge>
                    </div>
                    <h3 className="display-copy mt-3 text-2xl font-semibold text-slate-900">{election.title}</h3>
                    <p className="mt-2 text-sm text-slate-600">{election.description}</p>
                  </div>
                  <p className="text-sm text-slate-500">{election.onChainAvailable ? `${election.totalVotes} votes` : "Chain unavailable"}</p>
                </div>

                <div className="mt-4 grid gap-2 text-sm text-slate-500 sm:grid-cols-2">
                  <p>Start: {formatDateTime(election.startTime)}</p>
                  <p>End: {formatDateTime(election.endTime)}</p>
                  <p>On-chain ID: #{election.onChainElectionId}</p>
                  <p>Tx: {election.transactionHash ? shortenHash(election.transactionHash) : "Unavailable"}</p>
                </div>

                {isOpen && isExtending && (
                  <div className="mt-5 flex flex-wrap items-end gap-3">
                    <label className="block flex-1 space-y-2 text-sm font-medium text-slate-700">
                      <span>New end time</span>
                      <Input
                        type="datetime-local"
                        value={extendValue}
                        min={toDateTimeLocal(election.endTime)}
                        onChange={(event) => setExtendValue(event.target.value)}
                      />
                    </label>
                    <Button
                      variant="accent"
                      onClick={() => handleExtendElection(election)}
                      disabled={!extendValue || Boolean(busyAction)}
                    >
                      {busyAction === `extend-${election.id}` ? "Saving..." : "Save"}
                    </Button>
                    <Button variant="ghost" onClick={() => setExtendingId("")}>
                      Cancel
                    </Button>
                  </div>
                )}

                {isOpen && !isExtending && (
                  <div className="mt-5 flex flex-wrap gap-3">
                    <Button variant="secondary" onClick={() => startExtending(election)} disabled={Boolean(busyAction)}>
                      Extend voting window
                    </Button>
                    {election.status === "active" && (
                      <Button
                        variant="danger"
                        onClick={() => handleEndElection(election)}
                        disabled={Boolean(busyAction)}
                      >
                        {busyAction === `end-${election.id}` ? "Ending..." : "End election now"}
                      </Button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

export default AdminPage;
