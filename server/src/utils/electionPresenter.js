function computeStatus(snapshot, election) {
  if (snapshot) {
    if (snapshot.hasEnded) {
      return "ended";
    }

    return snapshot.isActive ? "active" : "scheduled";
  }

  const now = Date.now();
  const start = new Date(election.startTime).getTime();
  const end = new Date(election.endTime).getTime();

  if (now > end || election.endedAt) {
    return "ended";
  }

  if (now >= start && now <= end) {
    return "active";
  }

  return "scheduled";
}

/**
 * Merges the off-chain catalog entry (names, parties, bios) with the on-chain
 * snapshot (live tallies, real end time, status). Chain values win.
 */
function presentElection(election, snapshot) {
  const voteMap = new Map(
    (snapshot?.candidates || []).map((candidate) => [candidate.candidateId, candidate.voteCount])
  );
  const chainCandidates = new Map((snapshot?.candidates || []).map((candidate) => [candidate.candidateId, candidate]));
  const { _id, ...rest } = election;
  delete rest.__v;

  return {
    ...rest,
    id: (_id || election.id).toString(),
    _id: (_id || election.id).toString(),
    status: computeStatus(snapshot, election),
    title: snapshot?.title ?? election.title,
    description: snapshot?.description ?? election.description,
    startTime: snapshot ? new Date(snapshot.startTime * 1000).toISOString() : election.startTime,
    endTime: snapshot ? new Date(snapshot.endTime * 1000).toISOString() : election.endTime,
    accessMode: snapshot ? (snapshot.restricted ? "restricted" : "open") : election.accessMode || "restricted",
    category: election.category || "General",
    totalVotes: snapshot?.totalVotes ?? null,
    isActive: snapshot?.isActive ?? false,
    hasEnded: snapshot?.hasEnded ?? false,
    onChainAvailable: Boolean(snapshot),
    candidates: election.candidates.map((candidate) => ({
      ...candidate,
      name: chainCandidates.get(candidate.candidateId)?.name ?? candidate.name,
      voteCount: snapshot ? voteMap.get(candidate.candidateId) || 0 : null,
    })),
  };
}

function withPercentages(candidates, totalVotes) {
  return candidates.map((candidate) => ({
    ...candidate,
    percentage: totalVotes ? Number(((candidate.voteCount / totalVotes) * 100).toFixed(2)) : 0,
  }));
}

module.exports = {
  computeStatus,
  presentElection,
  withPercentages,
};
