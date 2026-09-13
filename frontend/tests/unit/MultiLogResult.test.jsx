import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MultiLogResult from "../../src/components/MultiLogResult.jsx";

const MOCK_MULTI_RESULT = {
  total_logs: 3,
  category_counts: {
    workflow_error: 1,
    resource_usage: 1,
    security_alert: 1,
  },
  incident_reasoning: "Cascading database deadlock followed by Redis OOM and repeated SSH authentication failures.",
  items: [
    {
      line_number: 1,
      text: "ERROR: deadlock detected on relation 'orders'",
      label: "workflow_error",
      confidence: 0.95,
      method_used: "regex",
      reasoning: "Database deadlock between transactions on orders table.",
    },
    {
      line_number: 2,
      text: "OOM command not allowed when used memory > 'maxmemory'",
      label: "resource_usage",
      confidence: 0.98,
      method_used: "llm",
      reasoning: "Redis memory capacity limit reached.",
    },
    {
      line_number: 3,
      text: "Failed password for root from 198.51.100.4 port 22",
      label: "security_alert",
      confidence: 0.99,
      method_used: "regex",
      reasoning: "SSH brute force authentication failure.",
    },
  ],
};

describe("MultiLogResult Component", () => {
  it("renders incident triage summary, total logs, and AI root cause diagnosis", () => {
    render(<MultiLogResult result={MOCK_MULTI_RESULT} />);

    expect(screen.getByText(/3 Logs Analyzed/i)).toBeInTheDocument();
    expect(screen.getByTestId("incident-reasoning")).toBeInTheDocument();
    expect(
      screen.getByText(/Cascading database deadlock followed by Redis OOM/i)
    ).toBeInTheDocument();
  });

  it("renders all classified log items with category and method badges", () => {
    render(<MultiLogResult result={MOCK_MULTI_RESULT} />);

    expect(screen.getByTestId("log-item-1")).toBeInTheDocument();
    expect(screen.getByTestId("log-item-2")).toBeInTheDocument();
    expect(screen.getByTestId("log-item-3")).toBeInTheDocument();

    expect(screen.getByText(/deadlock detected on relation 'orders'/i)).toBeInTheDocument();
    expect(screen.getByText(/Redis memory capacity limit reached/i)).toBeInTheDocument();
  });

  it("filters items by category pill and search query", async () => {
    const user = userEvent.setup();
    render(<MultiLogResult result={MOCK_MULTI_RESULT} />);

    // Filter by Security Alert
    const secPill = screen.getByRole("button", { name: /security alert/i });
    await user.click(secPill);

    expect(screen.getByTestId("log-item-3")).toBeInTheDocument();
    expect(screen.queryByTestId("log-item-1")).not.toBeInTheDocument();
    expect(screen.queryByTestId("log-item-2")).not.toBeInTheDocument();

    // Reset to All
    const allPill = screen.getByRole("button", { name: /all logs/i });
    await user.click(allPill);

    // Search by keyword "deadlock"
    const searchInput = screen.getByPlaceholderText(/search within classified logs/i);
    await user.type(searchInput, "deadlock");

    expect(screen.getByTestId("log-item-1")).toBeInTheDocument();
    expect(screen.queryByTestId("log-item-2")).not.toBeInTheDocument();
    expect(screen.queryByTestId("log-item-3")).not.toBeInTheDocument();
  });

  it("triggers CSV and JSON export when buttons are clicked", async () => {
    const user = userEvent.setup();
    const createObjectURLMock = vi.fn(() => "blob:mock-url");
    const revokeObjectURLMock = vi.fn();
    window.URL.createObjectURL = createObjectURLMock;
    window.URL.revokeObjectURL = revokeObjectURLMock;

    render(<MultiLogResult result={MOCK_MULTI_RESULT} />);

    const csvBtn = screen.getByRole("button", { name: /export csv/i });
    await user.click(csvBtn);
    expect(createObjectURLMock).toHaveBeenCalled();

    const jsonBtn = screen.getByRole("button", { name: /export json/i });
    await user.click(jsonBtn);
    expect(createObjectURLMock).toHaveBeenCalledTimes(2);
  });
});
