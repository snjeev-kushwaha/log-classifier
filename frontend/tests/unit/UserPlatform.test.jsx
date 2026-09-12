import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import UserPlatform from "../../src/components/UserPlatform.jsx";
import * as api from "../../src/api/classificationApi.js";

vi.mock("../../src/api/classificationApi.js", () => ({
  fetchUserHistory: vi.fn(),
  fetchUserQuota: vi.fn(),
  createPersonalApiKey: vi.fn(),
  listPersonalApiKeys: vi.fn(),
  revokePersonalApiKey: vi.fn(),
  fetchBillingPlans: vi.fn(),
  fetchUserSubscription: vi.fn(),
  createCheckoutSession: vi.fn(),
  cancelUserSubscription: vi.fn(),
  requestEmailVerification: vi.fn(),
  exportAccountData: vi.fn(),
  deleteAccount: vi.fn(),
}));

describe("UserPlatform Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.fetchUserHistory.mockResolvedValue({ items: [] });
    api.fetchUserQuota.mockResolvedValue({ today_count: 5, daily_limit: 100, remaining: 95 });
    api.listPersonalApiKeys.mockResolvedValue([]);
    api.fetchBillingPlans.mockResolvedValue([
      { tier: "free", name: "Community Free", price_usd: 0, daily_quota: 100, features: ["100/day"] },
      { tier: "pro", name: "Professional Tier", price_usd: 29, daily_quota: 5000, features: ["5000/day"] },
    ]);
    api.fetchUserSubscription.mockResolvedValue({ plan_tier: "free", status: "active", daily_quota: 100 });
  });

  it("renders navigation sub-tabs correctly", () => {
    render(<UserPlatform token="fake-token" />);
    expect(screen.getByText(/My History/i)).toBeInTheDocument();
    expect(screen.getByText(/Usage & Quota/i)).toBeInTheDocument();
    expect(screen.getByText(/Personal API Keys/i)).toBeInTheDocument();
    expect(screen.getByText(/Plans & Billing/i)).toBeInTheDocument();
    expect(screen.getByText(/Account & Privacy/i)).toBeInTheDocument();
  });

  it("switches to Plans & Billing tab and displays active plan tier", async () => {
    render(<UserPlatform token="fake-token" />);
    fireEvent.click(screen.getByText(/Plans & Billing/i));

    await waitFor(() => {
      expect(api.fetchBillingPlans).toHaveBeenCalled();
      expect(api.fetchUserSubscription).toHaveBeenCalledWith("fake-token");
      expect(screen.getByText(/Current Subscription/i)).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Professional Tier" })).toBeInTheDocument();
    });
  });

  it("switches to GDPR tab and allows initiating data export", async () => {
    api.exportAccountData.mockResolvedValue({ user_profile: { email: "test@example.com" } });
    render(<UserPlatform token="fake-token" />);
    fireEvent.click(screen.getByText(/Account & Privacy/i));

    await waitFor(() => {
      expect(screen.getByText(/GDPR Data Portability/i)).toBeInTheDocument();
      expect(screen.getByText(/Danger Zone: Delete Account/i)).toBeInTheDocument();
    });

    // Mock createObjectURL
    window.URL.createObjectURL = vi.fn(() => "blob:fake-url");
    window.URL.revokeObjectURL = vi.fn();

    const exportBtn = screen.getByText(/Export My Personal Data/i);
    fireEvent.click(exportBtn);

    await waitFor(() => {
      expect(api.exportAccountData).toHaveBeenCalledWith("fake-token");
    });
  });
});
