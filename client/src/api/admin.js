import apiClient from "./client";

export const adminApi = {
  dashboard: () => apiClient.get("/admin/dashboard").then((response) => response.data),
  listUsers: (params = {}) => apiClient.get("/admin/users", { params }).then((response) => response.data),
  updateApproval: (userId, approved) =>
    apiClient.patch(`/admin/users/${userId}/approval`, { approved }).then((response) => response.data),
  bulkApproval: (userIds, approved) =>
    apiClient.post("/admin/users/bulk-approval", { userIds, approved }).then((response) => response.data),
  syncWallet: (userId) =>
    apiClient.post(`/admin/users/${userId}/sync-wallet`).then((response) => response.data),
  createElection: (payload) =>
    apiClient.post("/admin/elections", payload).then((response) => response.data),
  endElection: (electionId) =>
    apiClient.patch(`/admin/elections/${electionId}/end`).then((response) => response.data),
  extendElection: (electionId, endTime) =>
    apiClient.patch(`/admin/elections/${electionId}/extend`, { endTime }).then((response) => response.data),
  setPaused: (paused) => apiClient.post("/admin/system/pause", { paused }).then((response) => response.data),
};
