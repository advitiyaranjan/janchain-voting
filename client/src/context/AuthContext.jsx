import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { authApi } from "../api/auth";
import { setAuthToken } from "../api/client";

const AuthContext = createContext(null);
const storageKey = "janchain-voting-session";

export function AuthProvider({ children }) {
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [language, setLanguage] = useState(localStorage.getItem("janchain-voting-language") || "en");
  const sessionVersion = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const version = sessionVersion.current;
    const persistedToken = localStorage.getItem(storageKey);
    if (!persistedToken) {
      setLoading(false);
      return;
    }

    setAuthToken(persistedToken);
    authApi
      .me()
      .then((data) => {
        if (cancelled || version !== sessionVersion.current) return;
        setToken(persistedToken);
        setUser(data.user);
        if (data.user.preferredLanguage) {
          setLanguage(data.user.preferredLanguage);
        }
      })
      .catch(() => {
        if (cancelled || version !== sessionVersion.current) return;
        localStorage.removeItem(storageKey);
        setAuthToken(null);
      })
      .finally(() => { if (!cancelled && version === sessionVersion.current) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    localStorage.setItem("janchain-voting-language", language);
  }, [language]);

  const login = async (payload) => {
    const data = await authApi.login(payload);
    sessionVersion.current += 1;
    localStorage.setItem(storageKey, data.token);
    setAuthToken(data.token);
    setToken(data.token);
    setUser(data.user);
    setLanguage(data.user.preferredLanguage || "en");
    setLoading(false);
    return data;
  };

  const register = (payload) => authApi.register(payload);

  const issueWalletChallenge = (payload) => authApi.issueWalletChallenge(payload);

  const verifyWalletChallenge = async (payload) => {
    const data = await authApi.verifyWalletChallenge(payload);
    sessionVersion.current += 1;
    localStorage.setItem(storageKey, data.token);
    setAuthToken(data.token);
    setToken(data.token);
    setUser(data.user);
    setLanguage(data.user.preferredLanguage || "en");
    setLoading(false);
    return data;
  };

  const refreshUser = async () => {
    if (!token) {
      return null;
    }

    const data = await authApi.me();
    setUser(data.user);
    return data.user;
  };

  const logout = () => {
    sessionVersion.current += 1;
    localStorage.removeItem(storageKey);
    setAuthToken(null);
    setToken(null);
    setUser(null);
    setLoading(false);
  };

  const value = {
    token,
    user,
    loading,
    isAuthenticated: Boolean(token && user),
    isAdmin: user?.role === "admin",
    language,
    setLanguage,
    login,
    logout,
    refreshUser,
    register,
    issueWalletChallenge,
    verifyWalletChallenge,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }

  return context;
}
