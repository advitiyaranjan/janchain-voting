import { useState } from "react";
import Button from "../ui/Button";
import Input from "../ui/Input";
import Textarea from "../ui/Textarea";

const emptyCandidate = () => ({
  name: "",
  party: "",
  tagline: "",
  description: "",
  imageURI: "",
});

const initialState = {
  title: "",
  description: "",
  category: "General",
  accessMode: "restricted",
  startTime: "",
  endTime: "",
  candidates: [emptyCandidate(), emptyCandidate()],
};

const accessModes = [
  { value: "restricted", label: "Approved voters", hint: "Only wallets on the voter registry." },
  { value: "open", label: "Open poll", hint: "Any verified wallet, one vote each." },
];

const categorySuggestions = ["General", "Student Council", "Governance", "Community", "Workplace"];

function ElectionForm({ onSubmit, isLoading = false }) {
  const [formState, setFormState] = useState(initialState);
  const [error, setError] = useState("");

  const updateField = (name, value) => {
    setFormState((current) => ({ ...current, [name]: value }));
  };

  const updateCandidate = (index, name, value) => {
    setFormState((current) => ({
      ...current,
      candidates: current.candidates.map((candidate, candidateIndex) =>
        candidateIndex === index ? { ...candidate, [name]: value } : candidate
      ),
    }));
  };

  const addCandidate = () => {
    setFormState((current) => ({
      ...current,
      candidates: [...current.candidates, emptyCandidate()],
    }));
  };

  const removeCandidate = (index) => {
    setFormState((current) => ({
      ...current,
      candidates: current.candidates.filter((_, candidateIndex) => candidateIndex !== index),
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    if (new Date(formState.startTime).getTime() <= Date.now() + 60000) {
      setError("Choose a start time at least one minute ahead so the creation transaction can confirm.");
      return;
    }
    if (new Date(formState.endTime) <= new Date(formState.startTime)) {
      setError("End time must be after start time.");
      return;
    }
    const names = formState.candidates.map((candidate) => candidate.name.trim().toLowerCase());
    if (new Set(names).size !== names.length) { setError("Each candidate needs a unique name."); return; }
    const created = await onSubmit({
      ...formState,
      startTime: new Date(formState.startTime).toISOString(),
      endTime: new Date(formState.endTime).toISOString(),
      candidates: formState.candidates,
    });

    // Keep the admin's input if publishing failed so they can fix and resubmit.
    if (created) {
      setFormState(initialState);
    }
  };

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      {error && <p role="alert" className="rounded-2xl bg-rose-50 p-4 text-sm text-rose-800">{error}</p>}
      <fieldset disabled={isLoading} className="space-y-5">
      <legend className="sr-only">Election details</legend>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="block space-y-2 text-sm font-medium text-slate-700 md:col-span-2">
          <span>Election title</span>
          <Input
            required
            minLength={5}
            maxLength={120}
            value={formState.title}
            onChange={(event) => updateField("title", event.target.value)}
            placeholder="2026 National Students Council"
          />
        </label>

        <label className="block space-y-2 text-sm font-medium text-slate-700 md:col-span-2">
          <span>Description</span>
          <Textarea
            required
            minLength={12}
            maxLength={2000}
            value={formState.description}
            onChange={(event) => updateField("description", event.target.value)}
            placeholder="Explain the scope, eligibility, and decision being voted on."
          />
        </label>

        <label className="block space-y-2 text-sm font-medium text-slate-700">
          <span>Category</span>
          <Input
            required
            list="election-categories"
            value={formState.category}
            onChange={(event) => updateField("category", event.target.value)}
            placeholder="General"
          />
          <datalist id="election-categories">
            {categorySuggestions.map((category) => (
              <option key={category} value={category} />
            ))}
          </datalist>
        </label>

        <fieldset className="space-y-2 text-sm font-medium text-slate-700">
          <legend>Who can vote</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {accessModes.map((mode) => (
              <label
                key={mode.value}
                className={`cursor-pointer rounded-2xl border px-4 py-3 transition ${
                  formState.accessMode === mode.value
                    ? "border-[var(--teal)] bg-teal-50"
                    : "border-slate-200 bg-white/80 hover:bg-white"
                }`}
              >
                <input
                  className="sr-only"
                  type="radio"
                  name="accessMode"
                  value={mode.value}
                  checked={formState.accessMode === mode.value}
                  onChange={() => updateField("accessMode", mode.value)}
                />
                <span className="block font-semibold text-slate-900">{mode.label}</span>
                <span className="block text-xs font-normal text-slate-500">{mode.hint}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <label className="block space-y-2 text-sm font-medium text-slate-700">
          <span>Start time</span>
          <Input
            required
            type="datetime-local"
            value={formState.startTime}
            onChange={(event) => updateField("startTime", event.target.value)}
          />
        </label>

        <label className="block space-y-2 text-sm font-medium text-slate-700">
          <span>End time</span>
          <Input
            required
            type="datetime-local"
            value={formState.endTime}
            min={formState.startTime || undefined}
            onChange={(event) => updateField("endTime", event.target.value)}
          />
        </label>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="display-copy text-lg font-semibold text-slate-900">Candidates</h3>
            <p className="text-sm text-slate-500">Add at least two options. Candidate images are optional.</p>
          </div>
          <Button variant="secondary" onClick={addCandidate} disabled={formState.candidates.length >= 20}>
            Add candidate
          </Button>
        </div>

        <div className="space-y-4">
          {formState.candidates.map((candidate, index) => (
            <div key={index} className="rounded-3xl border border-slate-200 bg-white/80 p-4">
              <div className="mb-4 flex items-center justify-between">
                <h4 className="font-semibold text-slate-900">Candidate {index + 1}</h4>
                {formState.candidates.length > 2 && (
                  <Button variant="ghost" className="px-3 py-2 text-xs" onClick={() => removeCandidate(index)}>
                    Remove
                  </Button>
                )}
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="block space-y-2 text-sm font-medium text-slate-700">
                  <span>Name</span>
                  <Input
                    required
                    minLength={2}
                    maxLength={80}
                    value={candidate.name}
                    onChange={(event) => updateCandidate(index, "name", event.target.value)}
                  />
                </label>
                <label className="block space-y-2 text-sm font-medium text-slate-700">
                  <span>Party / Group</span>
                  <Input
                    value={candidate.party}
                    onChange={(event) => updateCandidate(index, "party", event.target.value)}
                  />
                </label>
                <label className="block space-y-2 text-sm font-medium text-slate-700">
                  <span>Tagline</span>
                  <Input
                    value={candidate.tagline}
                    onChange={(event) => updateCandidate(index, "tagline", event.target.value)}
                  />
                </label>
                <label className="block space-y-2 text-sm font-medium text-slate-700">
                  <span>Image URL</span>
                  <Input
                    value={candidate.imageURI}
                    onChange={(event) => updateCandidate(index, "imageURI", event.target.value)}
                  />
                </label>
                <label className="block space-y-2 text-sm font-medium text-slate-700 md:col-span-2">
                  <span>Manifesto summary</span>
                  <Textarea
                    value={candidate.description}
                    onChange={(event) => updateCandidate(index, "description", event.target.value)}
                  />
                </label>
              </div>
            </div>
          ))}
        </div>
      </div>

      </fieldset>

      <Button className="w-full" variant="accent" disabled={isLoading} type="submit">
        {isLoading ? "Publishing election..." : "Create election"}
      </Button>
    </form>
  );
}

export default ElectionForm;
