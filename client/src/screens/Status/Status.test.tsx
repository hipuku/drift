import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Failed, Thinking } from "./Status";
import { axe } from "vitest-axe";

describe("Thinking", () => {
  it("renders the title as the page heading, with its detail", () => {
    render(<Thinking title="Reading the design system" detail="Aggregating every colour." />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Reading the design system" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Aggregating every colour.")).toBeInTheDocument();
  });

  it("hides the spinner from assistive technology", () => {
    // The spinner is decorative; the heading already says what is happening.
    const { container } = render(<Thinking title="Working" detail="…" />);
    expect(container.querySelector("[aria-hidden='true']")).toBeInTheDocument();
  });
});

describe("Failed", () => {
  it("shows the message and a way back", async () => {
    const onRetry = vi.fn();
    render(<Failed message="The crawl failed." onRetry={onRetry} />);

    expect(screen.getByRole("heading", { level: 1, name: "Audit stopped" })).toBeInTheDocument();
    expect(screen.getByText("The crawl failed.")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Start over" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("renders the worker's own message rather than a generic one", () => {
    // The point of threading the reason through is that the user sees what
    // actually happened, not "something went wrong".
    render(<Failed message="net::ERR_CERT_AUTHORITY_INVALID" onRetry={vi.fn()} />);
    expect(screen.getByText("net::ERR_CERT_AUTHORITY_INVALID")).toBeInTheDocument();
  });
});

/**
 * Drift reports contrast failures and unlabelled controls on other people's
 * sites. Its own client shipped thirteen test files and no accessibility
 * assertion, which is the one absence a reader of this repo is entitled to
 * find embarrassing.
 */
describe("accessibility", () => {
  it("Thinking has no violations", async () => {
    const { container } = render(<Thinking title="Working" detail="Aggregating every colour." />);
    expect((await axe(container)).violations).toEqual([]);
  });

  it("Failed has no violations", async () => {
    const { container } = render(<Failed message="The crawl failed." onRetry={vi.fn()} />);
    expect((await axe(container)).violations).toEqual([]);
  });
});
