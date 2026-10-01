import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { electionApi } from "../api/elections";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";

function HomePage() {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    let cancelled = false;
    electionApi
      .stats()
      .then((data) => {
        if (!cancelled) {
          setStats(data.stats);
        }
      })
      // The strip is decorative; hide it when the API is unreachable.
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="page-shell space-y-8">
      <section className="hero-grid surface-card overflow-hidden px-6 py-10 sm:px-10 sm:py-14">
        <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
          <div className="space-y-6">
            <Badge variant="info">Blockchain-secured civic infrastructure</Badge>
            <div className="space-y-4">
              <h1 className="display-copy max-w-3xl text-4xl font-bold tracking-tight text-[var(--ink)] sm:text-6xl">
                Transparent elections with on-chain integrity and human-friendly workflows.
              </h1>
              <p className="max-w-2xl text-lg text-slate-600">
                JanChain Voting combines wallet verification, voter approval, immutable vote receipts, and live results
                into one voting platform. The blockchain stores ballots; accounts and voter approvals are managed by the platform.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button as={Link} to="/elections">Explore elections</Button>
              <Button as={Link} to="/chain" variant="secondary">Vote directly on-chain</Button>
              <Button as={Link} to="/login" variant="secondary">Register or sign in</Button>
              <Button as={Link} to="/help" variant="ghost">How to use the app →</Button>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Card className="bg-[rgba(255,255,255,0.92)]">
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">One wallet, one vote</p>
              <p className="mt-3 text-3xl font-bold text-[var(--ink)]">Smart contract enforced</p>
              <p className="mt-3 text-sm text-slate-600">
                Double-voting is blocked directly on-chain using wallet-based vote receipts.
              </p>
            </Card>
            <Card className="bg-[rgba(255,255,255,0.92)]">
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Public ballot audit</p>
              <p className="mt-3 text-3xl font-bold text-[var(--ink)]">Public verification</p>
              <p className="mt-3 text-sm text-slate-600">
                Every approved voter can verify that their vote made it to the blockchain.
              </p>
            </Card>
            <Card className="bg-[rgba(255,255,255,0.92)] sm:col-span-2">
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Before you vote</p>
              <p className="mt-3 text-2xl font-bold text-[var(--ink)]">
                Your wallet and candidate choice are visible on the blockchain. Confirm your choice before signing.
              </p>
            </Card>
          </div>
        </div>
      </section>

      {stats && (
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Live elections", stats.activeElections],
            ["Upcoming", stats.upcomingElections],
            ["Ballots on-chain", stats.totalVotes],
            ["Approved voters", stats.approvedVoters],
          ].map(([label, value]) => (
            <Card key={label}>
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{label}</p>
              <p className="mt-2 text-3xl font-bold text-[var(--ink)]">{value ?? "Unavailable"}</p>
            </Card>
          ))}
          {stats.paused && (
            <Card className="text-sm font-semibold text-rose-700 sm:col-span-2 lg:col-span-4">
              Voting is temporarily paused by the election commission.
            </Card>
          )}
        </section>
      )}

      <section className="grid gap-6 md:grid-cols-3">
        {[
          {
            title: "Approve voters securely",
            description:
              "Admins verify registrations, approve wallets, and sync eligible voter addresses to the contract.",
          },
          {
            title: "Vote without gas fees",
            description:
              "Voters sign a ballot in MetaMask and the platform relays it, or pay their own gas. Either way the contract checks the signature.",
          },
          {
            title: "Audit results in real time",
            description:
              "Results pages read live vote totals and provide wallet-level verification for post-election trust.",
          },
        ].map((item) => (
          <Card key={item.title}>
            <h2 className="display-copy text-2xl font-semibold text-[var(--ink)]">{item.title}</h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">{item.description}</p>
          </Card>
        ))}
      </section>
    </div>
  );
}

export default HomePage;
