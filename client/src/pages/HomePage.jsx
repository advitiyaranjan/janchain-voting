import { Link } from "react-router-dom";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";

function HomePage() {
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
                into one full-stack decentralized voting platform.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link to="/elections">
                <Button>Explore elections</Button>
              </Link>
              <Link to="/login">
                <Button variant="secondary">Register or sign in</Button>
              </Link>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Card className="bg-[rgba(255,255,255,0.92)]">
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">One voter, one vote</p>
              <p className="mt-3 text-3xl font-bold text-[var(--ink)]">Smart contract enforced</p>
              <p className="mt-3 text-sm text-slate-600">
                Double-voting is blocked directly on-chain using wallet-based vote receipts.
              </p>
            </Card>
            <Card className="bg-[rgba(255,255,255,0.92)]">
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Tamper-proof audit</p>
              <p className="mt-3 text-3xl font-bold text-[var(--ink)]">Public verification</p>
              <p className="mt-3 text-sm text-slate-600">
                Every approved voter can verify that their vote made it to the blockchain.
              </p>
            </Card>
            <Card className="bg-[rgba(255,255,255,0.92)] sm:col-span-2">
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">End-to-end stack</p>
              <p className="mt-3 text-2xl font-bold text-[var(--ink)]">
                React + Tailwind, Express + MongoDB, Solidity + Hardhat, MetaMask + Ethers
              </p>
            </Card>
          </div>
        </div>
      </section>

      <section className="grid gap-6 md:grid-cols-3">
        {[
          {
            title: "Approve voters securely",
            description:
              "Admins verify registrations, approve wallets, and sync eligible voter addresses to the contract.",
          },
          {
            title: "Vote with MetaMask",
            description:
              "Voters connect a wallet, cast a single vote, and receive an immutable on-chain receipt.",
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
