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

  it("calls onInputChange when typing and onClear when clicking Clear button", async () => {
    const onInputChange = vi.fn();
    const onClear = vi.fn();
    const user = userEvent.setup();
    render(
      <LogInput
        onSubmit={vi.fn()}
        isLoading={false}
        onInputChange={onInputChange}
        onClear={onClear}
      />
    );

    const textarea = screen.getByTestId("log-textarea");
    await user.type(textarea, "database error");
    expect(onInputChange).toHaveBeenCalledWith("database error");

    const clearButton = screen.getByRole("button", { name: /clear/i });
    expect(clearButton).toBeInTheDocument();
    await user.click(clearButton);

    expect(onClear).toHaveBeenCalledTimes(1);
    expect(textarea).toHaveValue("");
  });

  it("shows character counter and multi-line hint when multi-line text is entered", async () => {
    const user = userEvent.setup();
    render(<LogInput onSubmit={vi.fn()} isLoading={false} />);

    const textarea = screen.getByTestId("log-textarea");
    await user.type(textarea, "Line 1{enter}Line 2");

    expect(screen.getByText(/2 lines detected/i)).toBeInTheDocument();
    expect(screen.getByText(/chars/i)).toBeInTheDocument();
  });
});
