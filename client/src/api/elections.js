import apiClient from "./client";

export const electionApi = {
  list: (params = {}) => apiClient.get("/elections", { params }).then((response) => response.data),
  stats: () => apiClient.get("/elections/stats").then((response) => response.data),
  myBallots: () => apiClient.get("/elections/me/ballots").then((response) => response.data),
  getById: (electionId) => apiClient.get(`/elections/${electionId}`).then((response) => response.data),
  getResults: (electionId) =>
    apiClient.get(`/elections/${electionId}/results`).then((response) => response.data),
  getActivity: (electionId, limit = 20) =>
    apiClient.get(`/elections/${electionId}/activity`, { params: { limit } }).then((response) => response.data),
  verifyVote: (electionId, walletAddress) =>
    apiClient.get(`/elections/${electionId}/verify/${walletAddress}`).then((response) => response.data),
  relayVote: (electionId, payload) =>
    apiClient.post(`/elections/${electionId}/relay-vote`, payload).then((response) => response.data),
};
