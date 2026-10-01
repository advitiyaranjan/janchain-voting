import { useEffect } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { getCopy } from "../../lib/translations";
import { shortenAddress } from "../../lib/utils";
import Button from "../ui/Button";

function AppShell({ children }) {
  const { isAuthenticated, isAdmin, language, setLanguage, user, logout } = useAuth();
  const copy = getCopy(language);
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);

  return (
    <div className="min-h-screen">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <header className="sticky top-0 z-40 border-b border-white/60 bg-white/70 backdrop-blur-xl">
        <div className="page-shell flex items-center justify-between gap-6 py-4">
          <Link to="/" className="display-copy text-xl font-bold tracking-tight text-[var(--ink)]">
            JanChain Voting
          </Link>

          <nav aria-label="Main navigation" className="hidden items-center gap-1 rounded-full bg-white/80 p-1 lg:flex">
            <NavLink end className="rounded-full px-4 py-2 text-sm hover:bg-slate-100" to="/">
              Home
            </NavLink>
            <NavLink className="rounded-full px-4 py-2 text-sm hover:bg-slate-100" to="/chain">On-chain</NavLink>
            <NavLink className="rounded-full px-4 py-2 text-sm hover:bg-slate-100" to="/elections">
              {copy.elections}
            </NavLink>
            {isAuthenticated && (
              <NavLink className="rounded-full px-4 py-2 text-sm hover:bg-slate-100" to="/dashboard">
                {copy.dashboard}
              </NavLink>
            )}
            {isAdmin && (
              <NavLink className="rounded-full px-4 py-2 text-sm hover:bg-slate-100" to="/admin">
                {copy.admin}
              </NavLink>
            )}
          </nav>

          <div className="flex items-center gap-3">
            <select
              aria-label="Navigation language"
              title="Navigation language"
              className="rounded-full border border-slate-200 bg-white px-3 py-2 text-sm"
              value={language}
              onChange={(event) => setLanguage(event.target.value)}
            >
              <option value="en">EN</option>
              <option value="hi">HI</option>
            </select>

            {isAuthenticated ? (
              <div className="hidden items-center gap-3 rounded-full bg-white/80 px-4 py-2 text-sm lg:flex">
                <div className="hidden xl:block">
                  <p className="max-w-32 truncate font-semibold text-slate-900" title={user.fullName}>{user.fullName}</p>
                  <p className="text-xs text-slate-500">{shortenAddress(user.walletAddress)}</p>
                </div>
                <Button variant="ghost" className="px-3 py-2" onClick={logout}>
                  {copy.signOut}
                </Button>
              </div>
            ) : (
              <Button as={Link} to="/login" className="hidden lg:inline-flex">{copy.signIn}</Button>
            )}
          </div>
        </div>

        <div className="border-t border-white/50 lg:hidden">
          <nav aria-label="Mobile navigation" className="page-shell flex gap-2 overflow-x-auto py-3">
            <NavLink end className="rounded-full bg-white/80 px-4 py-2 text-sm whitespace-nowrap" to="/">
              Home
            </NavLink>
            <NavLink className="rounded-full bg-white/80 px-4 py-2 text-sm whitespace-nowrap" to="/chain">On-chain</NavLink>
            <NavLink className="rounded-full bg-white/80 px-4 py-2 text-sm whitespace-nowrap" to="/elections">
              {copy.elections}
            </NavLink>
            {isAuthenticated && (
              <NavLink className="rounded-full bg-white/80 px-4 py-2 text-sm whitespace-nowrap" to="/dashboard">
                {copy.dashboard}
              </NavLink>
            )}
            {isAdmin && (
              <NavLink className="rounded-full bg-white/80 px-4 py-2 text-sm whitespace-nowrap" to="/admin">
                {copy.admin}
              </NavLink>
            )}
            {isAuthenticated ? (
              <Button variant="ghost" className="px-4 py-2 whitespace-nowrap" onClick={logout}>
                {copy.signOut}
              </Button>
            ) : (
              <Button as={Link} to="/login" className="whitespace-nowrap">{copy.signIn}</Button>
            )}
          </nav>
        </div>
      </header>

      <main id="main-content" tabIndex={-1}>{children}</main>
      <footer className="page-shell border-t border-slate-200 text-sm text-slate-600">
        <p>Public ballots: wallet addresses and choices are visible on-chain. One wallet can vote once per election.</p>
        <Link className="mt-2 inline-block font-semibold text-[var(--teal)]" to="/chain">Read results and vote directly on-chain →</Link>
        <Link className="mt-2 ml-4 inline-block font-semibold text-[var(--teal)]" to="/help">Usage guide →</Link>
      </footer>
    </div>
  );
}

export default AppShell;
