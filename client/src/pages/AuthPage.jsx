import { useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { toast } from "sonner";
import LoginForm from "../components/forms/LoginForm";
import RegisterForm from "../components/forms/RegisterForm";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import { useAuth } from "../context/AuthContext";
import { useWallet } from "../hooks/useWallet";

function AuthPage() {
  const [activeTab, setActiveTab] = useState("login");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { login, register, issueWalletChallenge, verifyWalletChallenge, isAuthenticated, isAdmin, loading } = useAuth();
  const wallet = useWallet();
  const location = useLocation();

  const requestedPath = location.state?.from;
  const redirectPath = typeof requestedPath === "string" &&
    /^\/(dashboard|admin|elections(?:\/[a-f0-9]{24})?)$/i.test(requestedPath)
    ? requestedPath : isAdmin ? "/admin" : "/dashboard";

  const handleLogin = async (payload) => {
    setIsSubmitting(true);
    try {
      await login(payload);
      toast.success("Signed in successfully.");
    } catch (error) {
      toast.error(error.response?.data?.message || error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRegister = async (payload) => {
    setIsSubmitting(true);
    try {
      await register(payload);
      toast.success("Account created. An admin must approve you before you can vote.");
      setActiveTab("login");
    } catch (error) {
      toast.error(error.response?.data?.message || error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleWalletLogin = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const walletAddress = await wallet.connectWallet();
      const challenge = await issueWalletChallenge({
        walletAddress,
        intent: "login",
      });
      const signature = await wallet.signMessage(challenge.message);
      await verifyWalletChallenge({
        walletAddress,
        signature,
        intent: "login",
      });
      toast.success("Signed in with wallet.");
    } catch (error) {
      toast.error(error.response?.data?.message || error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return <div className="page-shell" role="status">Checking your session…</div>;
  }

  if (isAuthenticated) {
    return <Navigate to={redirectPath} replace />;
  }

  return (
    <div className="page-shell grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
      <Card className="hero-grid p-8">
        <Badge variant="info">Access control</Badge>
        <h1 className="display-copy mt-5 text-4xl font-bold text-[var(--ink)]">Secure voter onboarding</h1>
        <p className="mt-4 max-w-xl text-base leading-7 text-slate-600">
          Create a voter account, link your wallet, and sign in with either credentials or a MetaMask signature.
        </p>
        <div className="mt-8 grid gap-4">
          <div className="rounded-3xl bg-white/85 p-5">
            <p className="font-semibold text-slate-900">Why both login methods?</p>
            <p className="mt-2 text-sm text-slate-600">
              Email/password keeps onboarding simple, while wallet verification binds a voter to an on-chain identity.
            </p>
          </div>
          <div className="rounded-3xl bg-white/85 p-5">
            <p className="font-semibold text-slate-900">Approval still matters</p>
            <p className="mt-2 text-sm text-slate-600">
              Restricted elections need admin approval. Open polls allow any wallet to vote directly on-chain.
            </p>
          </div>
        </div>
      </Card>

      <div className="space-y-6">
        <Card className="p-3">
          <div className="grid grid-cols-2 gap-2">
            <button
              className={`rounded-2xl px-4 py-3 text-sm font-semibold ${
                activeTab === "login" ? "bg-[var(--ink)] text-white" : "bg-white text-slate-700"
              }`}
              onClick={() => setActiveTab("login")}
              disabled={isSubmitting}
              aria-pressed={activeTab === "login"}
            >
              Login
            </button>
            <button
              className={`rounded-2xl px-4 py-3 text-sm font-semibold ${
                activeTab === "register" ? "bg-[var(--ink)] text-white" : "bg-white text-slate-700"
              }`}
              onClick={() => setActiveTab("register")}
              disabled={isSubmitting}
              aria-pressed={activeTab === "register"}
            >
              Register
            </button>
          </div>
        </Card>

        <Card>
          {activeTab === "login" ? (
            <>
              <h2 className="display-copy text-2xl font-semibold text-slate-900">Welcome back</h2>
              <p className="mt-2 text-sm text-slate-500">Use your email and password to access the voting portal.</p>
              <div className="mt-6">
                <LoginForm onSubmit={handleLogin} isLoading={isSubmitting} />
              </div>
            </>
          ) : (
            <>
              <h2 className="display-copy text-2xl font-semibold text-slate-900">Register as a voter</h2>
              <p className="mt-2 text-sm text-slate-500">You can link your wallet now or after the first login.</p>
              <div className="mt-6">
                <RegisterForm onSubmit={handleRegister} isLoading={isSubmitting} />
              </div>
            </>
          )}
        </Card>

        <Card className="bg-[rgba(16,35,61,0.95)] text-white">
          <p className="text-sm uppercase tracking-[0.2em] text-white/70">Wallet sign-in</p>
          <h3 className="display-copy mt-3 text-2xl font-semibold">Already linked your wallet?</h3>
          <p className="mt-3 text-sm text-white/70">
            Connect MetaMask, sign a fresh server-issued challenge, and enter without retyping a password once the
            wallet has been verified on your voter profile.
          </p>
          <Button className="mt-6" variant="secondary" onClick={handleWalletLogin} disabled={isSubmitting || !wallet.hasWallet}>
            {isSubmitting ? "Waiting for wallet..." : wallet.hasWallet ? "Continue with MetaMask" : "MetaMask is required"}
          </Button>
        </Card>
      </div>
    </div>
  );
}

export default AuthPage;
