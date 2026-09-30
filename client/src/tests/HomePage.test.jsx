import { render, screen } from "@testing-library/react";
import { vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import HomePage from "../pages/HomePage";

vi.mock("../api/elections", () => ({
  electionApi: {
    stats: () => Promise.reject(new Error("offline")),
  },
}));

describe("HomePage", () => {
  it("renders the main JanChain Voting message", () => {
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    );

    expect(screen.getByText(/Transparent elections/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Explore elections/i })).toBeInTheDocument();
  });
});
