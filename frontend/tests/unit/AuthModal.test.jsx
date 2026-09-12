import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AuthModal from "../../src/components/AuthModal.jsx";
import * as api from "../../src/api/classificationApi.js";

describe("AuthModal", () => {
  it("renders nothing when isOpen is false", () => {
    const { container } = render(<AuthModal isOpen={false} onClose={vi.fn()} onAuthSuccess={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders OAuth social login buttons and email form when isOpen is true", () => {
    render(<AuthModal isOpen={true} onClose={vi.fn()} onAuthSuccess={vi.fn()} />);

    expect(screen.getByText("Continue with Google")).toBeInTheDocument();
    expect(screen.getByText("Continue with GitHub")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("user@example.com")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("••••••••")).toBeInTheDocument();
  });

  it("triggers demo OAuth token login and calls onAuthSuccess", async () => {
    const onAuthSuccess = vi.fn();
    const onClose = vi.fn();
    const user = userEvent.setup();

    vi.spyOn(api, "oauthTokenLogin").mockResolvedValue({
      access_token: "mock-google-token",
      refresh_token: "mock-google-refresh",
      token_type: "bearer",
      expires_in: 900,
    });

    render(<AuthModal isOpen={true} onClose={onClose} onAuthSuccess={onAuthSuccess} />);

    const demoGoogleBtn = screen.getByText("Demo Google Sign-in");
    await user.click(demoGoogleBtn);

    await waitFor(() => {
      expect(api.oauthTokenLogin).toHaveBeenCalledWith({
        provider: "google",
        subject_id: "google-demo-user-12345",
        email: "google.user@example.com",
        fullName: "Google User",
      });
      expect(onAuthSuccess).toHaveBeenCalledWith({
        access_token: "mock-google-token",
        refresh_token: "mock-google-refresh",
        token_type: "bearer",
        expires_in: 900,
      });
      expect(onClose).toHaveBeenCalled();
    });
  });
});
