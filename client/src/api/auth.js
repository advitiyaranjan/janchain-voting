import apiClient from "./client";

export const authApi = {
  register: (payload) => apiClient.post("/auth/register", payload).then((response) => response.data),
  login: (payload) => apiClient.post("/auth/login", payload).then((response) => response.data),
  me: () => apiClient.get("/auth/me").then((response) => response.data),
  issueWalletChallenge: (payload) =>
    apiClient.post("/auth/wallet/challenge", payload).then((response) => response.data),
  verifyWalletChallenge: (payload) =>
    apiClient.post("/auth/wallet/verify", payload).then((response) => response.data),
};
