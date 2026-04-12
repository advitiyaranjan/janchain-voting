function ResultBars({ candidates, totalVotes }) {
  return (
    <div className="space-y-4">
      {candidates.map((candidate) => (
        <div key={candidate.candidateId} className="space-y-2">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="font-semibold text-slate-900">{candidate.name}</p>
              <p className="text-sm text-slate-500">{candidate.party || candidate.tagline || "Independent"}</p>
            </div>
            <div className="text-right">
              <p className="font-semibold text-slate-900">{candidate.voteCount} votes</p>
              <p className="text-sm text-slate-500">{candidate.percentage}%</p>
            </div>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-[var(--teal)] transition-all"
              style={{ width: `${candidate.percentage}%` }}
            />
          </div>
        </div>
      ))}

      <p className="text-sm text-slate-500">Total verified votes on-chain: {totalVotes}</p>
    </div>
  );
}

export default ResultBars;
