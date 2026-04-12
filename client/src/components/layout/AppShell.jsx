import { Link, NavLink } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { getCopy } from "../../lib/translations";
import { shortenAddress } from "../../lib/utils";
import Button from "../ui/Button";

function AppShell({ children }) {
  const { isAuthenticated, isAdmin, language, setLanguage, user, logout } = useAuth();
  const copy = getCopy(language);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-white/60 bg-white/70 backdrop-blur-xl">
        <div className="page-shell flex items-center justify-between gap-6 py-4">
          <Link to="/" className="display-copy text-xl font-bold tracking-tight text-[var(--ink)]">
            JanChain Voting
          </Link>

          <nav className="hidden items-center gap-2 rounded-full bg-white/80 p-1 md:flex">
            <NavLink className="rounded-full px-4 py-2 text-sm hover:bg-slate-100" to="/">
              Home
            </NavLink>
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
              aria-label="Language"
              className="rounded-full border border-slate-200 bg-white px-3 py-2 text-sm"
              value={language}
              onChange={(event) => setLanguage(event.target.value)}
            >
              <option value="en">EN</option>
              <option value="hi">HI</option>
            </select>

            {isAuthenticated ? (
              <div className="hidden items-center gap-3 rounded-full bg-white/80 px-4 py-2 text-sm md:flex">
                <div>
                  <p className="font-semibold text-slate-900">{user.fullName}</p>
                  <p className="text-xs text-slate-500">{shortenAddress(user.walletAddress)}</p>
                </div>
                <Button variant="ghost" className="px-3 py-2" onClick={logout}>
                  {copy.signOut}
                </Button>
              </div>
            ) : (
              <Link to="/login" className="hidden md:inline-flex">
                <Button>{copy.signIn}</Button>
              </Link>
            )}
          </div>
        </div>

        <div className="border-t border-white/50 md:hidden">
          <div className="page-shell flex gap-2 overflow-x-auto py-3">
            <NavLink className="rounded-full bg-white/80 px-4 py-2 text-sm whitespace-nowrap" to="/">
              Home
            </NavLink>
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
              <Link to="/login">
                <Button className="whitespace-nowrap">{copy.signIn}</Button>
              </Link>
            )}
          </div>
        </div>
      </header>

      <main>{children}</main>
    </div>
  );
}

export default AppShell;
