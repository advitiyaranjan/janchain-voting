import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ElectionListPage from "../pages/ElectionListPage";
import { electionApi } from "../api/elections";

vi.mock("../api/elections", () => ({ electionApi: { list: vi.fn() } }));
beforeEach(() => vi.clearAllMocks());

describe("Election board", () => {
  it("offers retry and direct chain access when the API is offline", async () => {
    electionApi.list.mockRejectedValue(new Error("Offline"));
    render(<MemoryRouter><ElectionListPage /></MemoryRouter>);
    expect(await screen.findByRole("alert")).toHaveTextContent("Offline");
    expect(screen.getByRole("link", { name: /directly on-chain/ })).toHaveAttribute("href", "/chain");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Try again" })));
    expect(electionApi.list).toHaveBeenCalledTimes(2);
  });
  it("ignores an old response after the voter changes filters", async () => {
    let finishOld;
    electionApi.list.mockImplementationOnce(() => new Promise((resolve) => { finishOld = resolve; }))
      .mockResolvedValueOnce({ elections: [], categories: [] });
    render(<MemoryRouter><ElectionListPage /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "active" }));
    await screen.findByText(/No elections match/);
    await act(async () => finishOld({ elections: [{ id: "old", title: "Stale election" }], categories: ["old"] }));
    expect(screen.queryByText("Stale election")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "active" })).toHaveAttribute("aria-pressed", "true");
  });
});
