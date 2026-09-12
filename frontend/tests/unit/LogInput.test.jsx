import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import LogInput from "../../src/components/LogInput.jsx";

describe("LogInput", () => {
  it("calls onSubmit with trimmed text when the form is valid", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<LogInput onSubmit={onSubmit} isLoading={false} />);

    await user.type(screen.getByTestId("log-textarea"), "  disk io saturation on volume x  ");
    await user.click(screen.getByTestId("classify-button"));

    expect(onSubmit).toHaveBeenCalledWith("disk io saturation on volume x");
  });

  it("shows a validation error and does not submit when text is empty", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<LogInput onSubmit={onSubmit} isLoading={false} />);

    await user.click(screen.getByTestId("classify-button"));

    expect(screen.getByTestId("input-error")).toHaveTextContent(/enter a log line/i);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("clears the validation error once the user starts typing again", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<LogInput onSubmit={onSubmit} isLoading={false} />);

    await user.click(screen.getByTestId("classify-button"));
    expect(screen.getByTestId("input-error")).toBeInTheDocument();

    await user.type(screen.getByTestId("log-textarea"), "a");
    expect(screen.queryByTestId("input-error")).not.toBeInTheDocument();
  });

  it("disables the submit button while loading", () => {
    render(<LogInput onSubmit={vi.fn()} isLoading={true} />);
    expect(screen.getByTestId("classify-button")).toBeDisabled();
    expect(screen.getByTestId("classify-button")).toHaveTextContent(/classifying/i);
  });
});
