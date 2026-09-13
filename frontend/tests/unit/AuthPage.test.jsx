import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AuthPage from "../../src/components/auth/AuthPage.jsx";
import * as api from "../../src/api/classificationApi.js";

describe("AuthPage Component", () => {
  it("renders default sign in view with brand header and input fields", () => {
    render(<AuthPage onAuthSuccess={vi.fn()} onContinueAsGuest={vi.fn()} />);

    expect(screen.getByText("Log Classifier Enterprise")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Welcome to the Platform" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("user@example.com or root")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("••••••••")).toBeInTheDocument();
    expect(screen.queryByText("Fill Root Creds")).not.toBeInTheDocument();
    expect(screen.getByText("Explore Classifier Console as Guest")).toBeInTheDocument();
  });

  it("switches to Create Account tab and shows full name input", async () => {
    const user = userEvent.setup();
    render(<AuthPage onAuthSuccess={vi.fn()} onContinueAsGuest={vi.fn()} />);

    const createAccountTab = screen.getByText("Create Account");
    await user.click(createAccountTab);

    expect(screen.getByPlaceholderText("Jane Doe")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("user@example.com")).toBeInTheDocument();
    expect(screen.getByTestId("auth-submit-btn")).toHaveTextContent("Complete Registration");
  });

  it("submits login form and invokes onAuthSuccess on successful login", async () => {
    const onAuthSuccess = vi.fn();
    const user = userEvent.setup();
    vi.spyOn(api, "loginUser").mockResolvedValue({
      access_token: "mock-access-token",
      refresh_token: "mock-refresh-token",
    });

    render(<AuthPage onAuthSuccess={onAuthSuccess} onContinueAsGuest={vi.fn()} />);

    await user.type(screen.getByPlaceholderText("user@example.com or root"), "root");
    await user.type(screen.getByPlaceholderText("••••••••"), "RootAdminPassword123!");
    await user.click(screen.getByRole("button", { name: /Sign In to Platform/i }));

    await waitFor(() => {
      expect(api.loginUser).toHaveBeenCalledWith({
        email: "root",
        password: "RootAdminPassword123!",
      });
      expect(onAuthSuccess).toHaveBeenCalledWith({
        access_token: "mock-access-token",
        refresh_token: "mock-refresh-token",
      });
    });
  });

  it("submits signup form, logs in automatically, and invokes onAuthSuccess", async () => {
    const onAuthSuccess = vi.fn();
    const user = userEvent.setup();
    vi.spyOn(api, "signupUser").mockResolvedValue({
      id: 99,
      email: "newuser@example.com",
      full_name: "New User",
      role: "user",
    });
    vi.spyOn(api, "loginUser").mockResolvedValue({
      access_token: "mock-new-access-token",
      refresh_token: "mock-new-refresh-token",
    });

    render(<AuthPage onAuthSuccess={onAuthSuccess} onContinueAsGuest={vi.fn()} />);

    // Switch to Create Account tab
    await user.click(screen.getByText("Create Account"));

    await user.type(screen.getByPlaceholderText("Jane Doe"), "New User");
    await user.type(screen.getByPlaceholderText("user@example.com"), "newuser@example.com");
    await user.type(screen.getByPlaceholderText("••••••••"), "NewUserPassword123!");
    await user.click(screen.getByTestId("auth-submit-btn"));

    await waitFor(() => {
      expect(api.signupUser).toHaveBeenCalledWith({
        email: "newuser@example.com",
        password: "NewUserPassword123!",
        fullName: "New User",
      });
      expect(api.loginUser).toHaveBeenCalledWith({
        email: "newuser@example.com",
        password: "NewUserPassword123!",
      });
      expect(onAuthSuccess).toHaveBeenCalledWith({
        access_token: "mock-new-access-token",
        refresh_token: "mock-new-refresh-token",
      });
    });
  });

  it("calls onContinueAsGuest when clicking explore as guest link", async () => {
    const onContinueAsGuest = vi.fn();
    const user = userEvent.setup();
    render(<AuthPage onAuthSuccess={vi.fn()} onContinueAsGuest={onContinueAsGuest} />);

    const guestLink = screen.getByText("Explore Classifier Console as Guest");
    await user.click(guestLink);

    expect(onContinueAsGuest).toHaveBeenCalledTimes(1);
  });
});
