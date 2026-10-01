import { Link } from "react-router-dom";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import { getExpectedChainConfig } from "../lib/chain";

const voterSteps = [
  ["Create an account and sign in", "Choose Register on the sign-in page. Use at least 8 password characters, including uppercase, lowercase, and a number. After registering, sign in to open your dashboard."],
  ["Connect and verify your wallet", "Unlock MetaMask and choose the account you want to use. On your dashboard, select Link wallet or Verify wallet ownership, then sign the ownership message. Saving an address during registration does not verify it."],
  ["Check eligibility", "Restricted elections require the administrator to approve your account and sync your verified wallet to the contract. Open polls do not need administrator approval. Use the same verified wallet on the voting page."],
  ["Choose an active election", "Open Elections and check the voting window. Select one candidate, review your choice, and choose gasless voting or pay your own network fee. Switch to the voting network when prompted."],
  ["Confirm and save your receipt", "For gasless voting, sign the ballot in MetaMask; the platform submits it. For direct voting, confirm the transaction and pay the network fee. Wait for confirmation, then save the transaction hash."],
  ["Verify your vote", "Open the election's results page and enter your wallet under Verify a wallet receipt. Your dashboard also lists My ballots. If submission timed out, check your receipt before trying again."],
];
const adminSteps = [
  ["Sign in as an administrator", "An administrator account opens the admin console after sign-in. A regular voter account cannot create elections or approve other voters."],
  ["Review voter registrations", "Find the voter under Voter approvals. Approve the account after checking eligibility. The wallet must be verified before it can sync on-chain. Use Resync approval if an earlier sync failed."],
  ["Publish an election", "Add a title, description, category, access mode, and 2–20 candidates with unique names. Set the start time at least a few minutes ahead and the end time later. Wait for the on-chain publication confirmation."],
  ["Monitor and close voting", "Use results to review the tally. You can extend a scheduled or running window, or end an active election. Manual closure cannot be reopened. Emergency pause affects every election; resume it when voting can continue."],
];

export default function HelpPage() {
  const chain = getExpectedChainConfig();
  return <div className="page-shell space-y-6">
    <Card className="hero-grid p-8">
      <Badge variant="info">Usage guide</Badge>
      <h1 className="display-copy mt-4 text-4xl font-bold">From sign-in to a verified ballot</h1>
      <p className="mt-4 max-w-2xl text-slate-600">Follow the steps for your role. Keep MetaMask unlocked, check the selected account and network, and wait for blockchain confirmation before leaving the voting page.</p>
      <div className="mt-5 flex flex-wrap gap-3"><Button as={Link} to="/dashboard">Open dashboard</Button><Button as={Link} to="/elections" variant="secondary">Browse elections</Button><Button as={Link} to="/chain" variant="secondary">Vote directly on-chain</Button></div>
    </Card>
    <Card className="border-amber-200 bg-amber-50">
      <h2 className="font-semibold text-amber-900">Before casting a ballot</h2>
      <p className="mt-2 text-sm text-amber-900">Your wallet address and candidate choice are public on-chain. A confirmed vote cannot be changed. The contract allows one vote per wallet per election; an open poll does not verify that wallets belong to different people.</p>
    </Card>
    <div className="grid items-start gap-6 lg:grid-cols-2">
      {[{ heading: "For voters", steps: voterSteps }, { heading: "For administrators", steps: adminSteps }].map(({ heading, steps }) => <Card key={heading}>
        <h2 className="display-copy text-2xl font-semibold">{heading}</h2>
        <ol className="mt-6 space-y-5">{steps.map(([title, description], index) => <li key={title} className="flex gap-3">
          <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-teal-100 text-sm font-bold text-teal-800">{index + 1}</span>
          <div><h3 className="font-semibold">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-600">{description}</p></div>
        </li>)}</ol>
      </Card>)}
    </div>
    <Card>
      <h2 className="display-copy text-2xl font-semibold">Connect to the right network</h2>
      <p className="mt-3 text-sm text-slate-600">The app can request a network switch in MetaMask. If you add the network manually, use these configured details and check the contract address before voting.</p>
      <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
        {[["Network", chain.chainName], ["Chain ID", chain.chainId], ["RPC URL", chain.rpcUrls[0] || "Ask the election administrator"], ["Currency", chain.nativeCurrency.symbol], ["Contract", import.meta.env.VITE_CONTRACT_ADDRESS || "Not configured"]].map(([label, value]) => <div key={label} className="rounded-2xl bg-slate-50 p-4"><dt className="font-semibold">{label}</dt><dd className="mt-1 break-all text-slate-600">{value}</dd></div>)}
      </dl>
      <p className="mt-4 text-sm text-slate-600">For a local demo, use a funded account from the local Hardhat node. Those public test accounts must never hold real funds. Local chains have no public block explorer.</p>
      <div className="mt-4 flex flex-wrap gap-4 text-sm font-semibold text-[var(--teal)]"><a href="https://support.metamask.io/configure/networks/how-to-add-a-custom-network-rpc" target="_blank" rel="noreferrer">MetaMask network instructions ↗</a><a href="https://support.metamask.io/start/use-an-existing-wallet/" target="_blank" rel="noreferrer">MetaMask account import instructions ↗</a></div>
    </Card>
    <Card>
      <h2 className="display-copy text-2xl font-semibold">Common questions</h2>
      <div className="mt-4 divide-y divide-slate-200">
        {[
          ["The vote button is disabled", "Check that voting has started, the contract is unpaused, your wallet is verified and matches your profile, and MetaMask is on the expected network. Restricted elections also need on-chain approval. Pick a candidate and use Refresh eligibility."],
          ["My approval is still pending", "Ask the election administrator to review your account. If your account is approved but the contract rejects the wallet, ask them to use Resync approval. Signing in alone does not grant voting eligibility."],
          ["Gasless voting failed", "A funded relayer must be available. First verify whether your ballot was recorded; if it was not, retry or use the direct transaction option with a funded wallet."],
          ["I cannot see elections or results", "Retry the page. Direct on-chain browsing works if the catalog API is unavailable and the blockchain RPC is reachable. If the local node was restarted, the administrator must redeploy and restore the demo setup."],
          ["Do I need an account for direct voting?", "No. The On-chain page reads elections and sends a transaction from your wallet. You pay the fee, and restricted elections still require your wallet to be approved on-chain."],
        ].map(([question, answer]) => <details key={question} className="py-4"><summary className="cursor-pointer font-semibold">{question}</summary><p className="mt-3 text-sm leading-6 text-slate-600">{answer}</p></details>)}
      </div>
    </Card>
  </div>;
}
