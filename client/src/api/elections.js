import apiClient from "./client";

export const electionApi = {
  list: (params = {}) => apiClient.get("/elections", { params }).then((response) => response.data),
  getById: (electionId) => apiClient.get(`/elections/${electionId}`).then((response) => response.data),
  getResults: (electionId) =>
    apiClient.get(`/elections/${electionId}/results`).then((response) => response.data),
  verifyVote: (electionId, walletAddress) =>
    apiClient.get(`/elections/${electionId}/verify/${walletAddress}`).then((response) => response.data),
};
