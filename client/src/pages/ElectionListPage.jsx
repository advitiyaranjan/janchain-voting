import { startTransition, useDeferredValue, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { electionApi } from "../api/elections";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import Input from "../components/ui/Input";
import { formatDateTime } from "../lib/utils";

function ElectionListPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [category, setCategory] = useState("all");
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [elections, setElections] = useState([]);
  const deferredSearch = useDeferredValue(search);

  useEffect(() => {
    setLoading(true);
    electionApi
      .list({ q: deferredSearch, status, category })
      .then((data) => {
        setElections(data.elections);
        // A filtered response only lists matching categories, so keep every one seen so far.
        setCategories((current) => [...new Set([...current, ...data.categories])].sort());
      })
      .catch((error) => toast.error(error.response?.data?.message || error.message))
      .finally(() => setLoading(false));
  }, [deferredSearch, status, category]);

  return (
    <div className="page-shell space-y-6">
      <Card className="hero-grid p-8">
        <Badge variant="info">Public election board</Badge>
        <h1 className="display-copy mt-5 text-4xl font-bold text-[var(--ink)]">Discover active, scheduled, and completed ballots.</h1>
        <p className="mt-4 max-w-2xl text-slate-600">
          Search by title, policy, or candidate name. Results are sourced from the off-chain catalog and live on-chain
          vote counts.
        </p>
        <div className="mt-6 grid gap-4 md:grid-cols-[1fr_auto]">
          <Input
            value={search}
            onChange={(event) => {
              const value = event.target.value;
              startTransition(() => setSearch(value));
            }}
            placeholder="Search elections or candidates"
          />
          <div className="flex flex-wrap gap-2">
            {["all", "scheduled", "active", "ended"].map((value) => (
              <Button
                key={value}
                variant={status === value ? "primary" : "secondary"}
                className="px-4 py-3 capitalize"
                onClick={() => setStatus(value)}
              >
                {value}
              </Button>
            ))}
          </div>
        </div>
        {categories.length > 1 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {["all", ...categories].map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setCategory(value)}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                  category === value ? "bg-[var(--teal)] text-white" : "bg-white/80 text-slate-600 hover:bg-white"
                }`}
              >
                {value === "all" ? "All categories" : value}
              </button>
            ))}
          </div>
        )}
      </Card>

      {loading ? (
        <Card>Loading election board...</Card>
      ) : elections.length === 0 ? (
        <Card className="text-sm text-slate-500">No elections match these filters yet.</Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {elections.map((election) => {
            const electionId = election._id || election.id;

            return (
              <Card key={electionId}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant={election.status}>{election.status}</Badge>
                      {election.accessMode === "open" && <Badge variant="open">Open poll</Badge>}
                      <Badge variant="neutral">{election.category}</Badge>
                    </div>
                    <h2 className="display-copy mt-3 text-2xl font-semibold text-slate-900">{election.title}</h2>
                    <p className="mt-3 text-sm leading-6 text-slate-600">{election.description}</p>
                  </div>
                  <div className="rounded-2xl bg-white/80 px-4 py-3 text-right text-sm text-slate-500">
                    <p>{election.totalVotes} votes</p>
                    <p>{election.candidates.length} candidates</p>
                  </div>
                </div>

                <div className="mt-6 grid gap-3 text-sm text-slate-500 sm:grid-cols-2">
                  <p>Start: {formatDateTime(election.startTime)}</p>
                  <p>End: {formatDateTime(election.endTime)}</p>
                </div>

                <div className="mt-6 flex flex-wrap gap-3">
                  <Link to={`/elections/${electionId}`}>
                    <Button>Open voting page</Button>
                  </Link>
                  <Link to={`/results/${electionId}`}>
                    <Button variant="secondary">View results</Button>
                  </Link>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default ElectionListPage;
