import apiClient from "./client";

export const adminApi = {
  dashboard: () => apiClient.get("/admin/dashboard").then((response) => response.data),
  listUsers: () => apiClient.get("/admin/users").then((response) => response.data),
  updateApproval: (userId, approved) =>
    apiClient.patch(`/admin/users/${userId}/approval`, { approved }).then((response) => response.data),
  syncWallet: (userId) =>
    apiClient.post(`/admin/users/${userId}/sync-wallet`).then((response) => response.data),
  createElection: (payload) =>
    apiClient.post("/admin/elections", payload).then((response) => response.data),
  endElection: (electionId) =>
    apiClient.patch(`/admin/elections/${electionId}/end`).then((response) => response.data),
};
