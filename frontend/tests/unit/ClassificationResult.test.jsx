import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ClassificationResult from "../../src/components/ClassificationResult.jsx";

describe("ClassificationResult", () => {
  it("renders nothing when there is no result", () => {
    const { container } = render(<ClassificationResult result={null} onCorrect={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders label, confidence, and method badge for a regex result", () => {
    const result = {
      text: "Multiple login failures on user 9052",
      label: "security_alert",
      confidence: 1.0,
      method_used: "regex",
      needs_human_review: false,
    };
    render(<ClassificationResult result={result} onCorrect={vi.fn()} />);

    expect(screen.getByTestId("result-label")).toHaveTextContent("security_alert");
    expect(screen.getByTestId("result-confidence")).toHaveTextContent("100%");
    expect(screen.getByTestId("method-badge")).toHaveTextContent("Regex");
    expect(screen.queryByTestId("review-flag")).not.toBeInTheDocument();
  });

  it("shows a review flag and confirm button when needs_human_review is true", async () => {
    const onCorrect = vi.fn();
    const user = userEvent.setup();
    const result = {
      text: "some unusual log line",
      label: "unclassified",
      confidence: 0.4,
      method_used: "llm",
      needs_human_review: true,
    };
    render(<ClassificationResult result={result} onCorrect={onCorrect} />);

    expect(screen.getByTestId("review-flag")).toBeInTheDocument();
    await user.click(screen.getByTestId("confirm-correct-button"));
    expect(onCorrect).toHaveBeenCalledWith("unclassified");
  });

  it("renders reasoning text when provided by the LLM path", () => {
    const result = {
      text: "log line",
      label: "workflow_error",
      confidence: 0.82,
      method_used: "llm",
      needs_human_review: false,
      reasoning: "Matches escalation failure pattern",
    };
    render(<ClassificationResult result={result} onCorrect={vi.fn()} />);
    expect(screen.getByTestId("result-reasoning")).toHaveTextContent("Matches escalation failure pattern");
  });
});
