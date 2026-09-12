import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../../src/App.jsx";
import * as api from "../../src/api/classificationApi.js";

describe("App integration (mocked API)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("classifies a log and displays the result end to end within the component tree", async () => {
    vi.spyOn(api, "classifyLog").mockResolvedValue({
      text: "Multiple login failures on user 9052",
      label: "security_alert",
      confidence: 1.0,
      method_used: "regex",
      needs_human_review: false,
    });
    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByTestId("log-textarea"), "Multiple login failures on user 9052");
    await user.click(screen.getByTestId("classify-button"));

    await waitFor(() => {
      expect(screen.getByTestId("classification-result")).toBeInTheDocument();
    });
    expect(screen.getByTestId("result-label")).toHaveTextContent("security_alert");
  });

  it("shows an API error message when the backend call fails", async () => {
    vi.spyOn(api, "classifyLog").mockRejectedValue(new Error("backend unavailable"));
    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByTestId("log-textarea"), "some log line");
    await user.click(screen.getByTestId("classify-button"));

    await waitFor(() => {
      expect(screen.getByTestId("api-error")).toHaveTextContent("backend unavailable");
    });
  });

  it("submits feedback and clears the review flag when the user confirms a low-confidence result", async () => {
    vi.spyOn(api, "classifyLog").mockResolvedValue({
      text: "rare unseen pattern",
      label: "unclassified",
      confidence: 0.4,
      method_used: "llm",
      needs_human_review: true,
    });
    vi.spyOn(api, "submitFeedback").mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByTestId("log-textarea"), "rare unseen pattern");
    await user.click(screen.getByTestId("classify-button"));

    await waitFor(() => expect(screen.getByTestId("review-flag")).toBeInTheDocument());
    await user.click(screen.getByTestId("confirm-correct-button"));

    await waitFor(() => {
      expect(screen.queryByTestId("review-flag")).not.toBeInTheDocument();
    });
    expect(api.submitFeedback).toHaveBeenCalledWith({
      text: "rare unseen pattern",
      correctLabel: "unclassified",
      originalMethod: "llm",
    });
  });
});
