import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../context/AuthContext";
import AuthPage from "../pages/AuthPage";
import ProtectedRoute from "../routes/ProtectedRoute";
import AdminRoute from "../routes/AdminRoute";
import { authApi } from "../api/auth";

vi.mock("../api/auth", () => ({ authApi: {
  login: vi.fn(), me: vi.fn(), register: vi.fn(), issueWalletChallenge: vi.fn(), verifyWalletChallenge: vi.fn(),
} }));
vi.mock("../api/client", () => ({ setAuthToken: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("../hooks/useWallet", () => ({ useWallet: () => ({
  hasWallet: true, connectWallet: async () => "0x1111111111111111111111111111111111111111",
  signMessage: async () => "signed-challenge",
}) }));

const voter = { id: "voter", fullName: "Test Voter", role: "voter", preferredLanguage: "en" };
const electionPath = "/elections/507f1f77bcf86cd799439011";

function renderFlow(entry = "/login") {
  return render(<MemoryRouter initialEntries={[entry]}><AuthProvider><Routes>
    <Route path="/login" element={<AuthPage />} />
    <Route path="/dashboard" element={<ProtectedRoute><h1>Voter dashboard destination</h1></ProtectedRoute>} />
    <Route path="/admin" element={<AdminRoute><h1>Admin destination</h1></AdminRoute>} />
    <Route path="/elections/:electionId" element={<ProtectedRoute><h1>Requested election destination</h1></ProtectedRoute>} />
  </Routes></AuthProvider></MemoryRouter>);
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  authApi.login.mockReset().mockResolvedValue({ token: "fresh-token", user: voter });
  authApi.me.mockReset().mockResolvedValue({ user: voter });
  authApi.issueWalletChallenge.mockReset().mockResolvedValue({ message: "Verify wallet" });
  authApi.verifyWalletChallenge.mockReset().mockResolvedValue({ token: "wallet-token", user: voter });
});

async function signIn() {
  fireEvent.change(await screen.findByLabelText("Email address"), { target: { value: "test@example.com" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "SafePass123" } });
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Sign in" })));
}

describe("Login routing", () => {
  it("commits the voter session before entering the protected dashboard", async () => {
    renderFlow();
    await signIn();
    expect(await screen.findByText("Voter dashboard destination")).toBeInTheDocument();
    expect(screen.queryByText("Welcome back")).not.toBeInTheDocument();
    expect(localStorage.getItem("janchain-voting-session")).toBe("fresh-token");
  });

  it("leaves the login page automatically when a saved session is restored", async () => {
    localStorage.setItem("janchain-voting-session", "saved-token");
    renderFlow();
    expect(await screen.findByText("Voter dashboard destination")).toBeInTheDocument();
    expect(authApi.login).not.toHaveBeenCalled();
  });

  it("returns to the election that originally required login", async () => {
    renderFlow({ pathname: "/login", state: { from: electionPath } });
    await signIn();
    expect(await screen.findByText("Requested election destination")).toBeInTheDocument();
  });

  it("opens the admin console for an administrator", async () => {
    authApi.login.mockResolvedValue({ token: "admin-token", user: { ...voter, role: "admin" } });
    renderFlow();
    await signIn();
    expect(await screen.findByText("Admin destination")).toBeInTheDocument();
  });

  it("redirects after wallet sign-in", async () => {
    renderFlow();
    const button = await screen.findByRole("button", { name: "Continue with MetaMask" });
    await act(async () => fireEvent.click(button));
    expect(await screen.findByText("Voter dashboard destination")).toBeInTheDocument();
    expect(authApi.verifyWalletChallenge).toHaveBeenCalledWith({ walletAddress: "0x1111111111111111111111111111111111111111", signature: "signed-challenge", intent: "login" });
  });

  it("keeps the form available when credentials are rejected", async () => {
    authApi.login.mockRejectedValue(new Error("Invalid credentials"));
    renderFlow();
    await signIn();
    await waitFor(() => expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled());
    expect(screen.getByText("Welcome back")).toBeInTheDocument();
    expect(localStorage.getItem("janchain-voting-session")).toBeNull();
  });
});
