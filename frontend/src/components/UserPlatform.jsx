import { useState, useEffect } from "react";
import {
  fetchUserHistory,
  fetchUserQuota,
  createPersonalApiKey,
  listPersonalApiKeys,
  revokePersonalApiKey,
  fetchBillingPlans,
  fetchUserSubscription,
  createCheckoutSession,
  cancelUserSubscription,
  requestEmailVerification,
  exportAccountData,
  deleteAccount,
} from "../api/classificationApi.js";
import HistorySection from "./user/HistorySection.jsx";
import UsageQuotaSection from "./user/UsageQuotaSection.jsx";
import ApiKeysSection from "./user/ApiKeysSection.jsx";
import BillingSection from "./user/BillingSection.jsx";
import GdprPrivacySection from "./user/GdprPrivacySection.jsx";

export default function UserPlatform({ token, onAccountDeleted }) {
  const [activeSubTab, setActiveSubTab] = useState("history"); // history | quota | apikeys | billing | gdpr
  const [history, setHistory] = useState([]);
  const [quota, setQuota] = useState(null);
  const [apiKeys, setApiKeys] = useState([]);
  const [newKeyLabel, setNewKeyLabel] = useState("");
  const [createdRawKey, setCreatedRawKey] = useState("");
  const [plans, setPlans] = useState([]);
  const [subscription, setSubscription] = useState(null);
  const [billingLoading, setBillingLoading] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");

  useEffect(() => {
    if (!token) return;
    loadTabData();
  }, [activeSubTab, token]);

  async function loadTabData() {
    setError("");
    setStatusMessage("");
    setLoading(true);
    try {
      if (activeSubTab === "history") {
        const data = await fetchUserHistory(token);
        setHistory(data.items || []);
      } else if (activeSubTab === "quota") {
        const data = await fetchUserQuota(token);
        setQuota(data);
      } else if (activeSubTab === "apikeys") {
        const data = await listPersonalApiKeys(token);
        setApiKeys(data || []);
      } else if (activeSubTab === "billing") {
        const [plansData, subData] = await Promise.all([
          fetchBillingPlans(token),
          fetchUserSubscription(token),
        ]);
        setPlans(plansData || []);
        setSubscription(subData);
      }
    } catch (err) {
      setError(err.message || "Failed to load user platform data");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateKey(e) {
    e.preventDefault();
    setError("");
    setStatusMessage("");
    try {
      const res = await createPersonalApiKey(token, newKeyLabel || undefined);
      setCreatedRawKey(res.api_key);
      setNewKeyLabel("");
      loadTabData();
    } catch (err) {
      setError(err.message || "Failed to create API key");
    }
  }

  async function handleRevokeKey(keyId) {
    if (!window.confirm("Are you sure you want to revoke this API key?")) return;
    try {
      await revokePersonalApiKey(token, keyId);
      loadTabData();
    } catch (err) {
      setError(err.message || "Failed to revoke key");
    }
  }

  async function handleUpgrade(planTier) {
    setBillingLoading(true);
    setError("");
    try {
      const res = await createCheckoutSession(token, planTier);
      if (res.checkout_url) {
        window.location.href = res.checkout_url;
      }
    } catch (err) {
      setError(err.message || "Checkout creation failed");
    } finally {
      setBillingLoading(false);
    }
  }

  async function handleCancelSubscription() {
    if (!window.confirm("Are you sure you want to cancel your paid subscription?")) return;
    setBillingLoading(true);
    setError("");
    try {
      await cancelUserSubscription(token);
      setStatusMessage("Subscription canceled. Reverted to Free tier.");
      const sub = await fetchUserSubscription(token);
      setSubscription(sub);
    } catch (err) {
      setError(err.message || "Cancellation failed");
    } finally {
      setBillingLoading(false);
    }
  }

  async function handleResendVerification() {
    setError("");
    setStatusMessage("");
    try {
      const res = await requestEmailVerification(token);
      setStatusMessage(res.message || "Verification email sent!");
    } catch (err) {
      setError(err.message || "Failed to send verification email");
    }
  }

  async function handleExportData() {
    setError("");
    try {
      const data = await exportAccountData(token);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `user_data_export_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setStatusMessage("Data export complete! Downloaded JSON archive.");
    } catch (err) {
      setError(err.message || "Failed to export data");
    }
  }

  async function handleDeleteAccount(e) {
    e.preventDefault();
    if (deleteConfirmation !== "DELETE MY ACCOUNT") {
      setError("Please type 'DELETE MY ACCOUNT' to confirm");
      return;
    }
    try {
      await deleteAccount(token, deletePassword, deleteConfirmation);
      alert("Your account has been deleted permanently.");
      if (onAccountDeleted) onAccountDeleted();
    } catch (err) {
      setError(err.message || "Account deletion failed");
    }
  }

  return (
    <div style={{ marginTop: "12px" }}>
      {/* Sub-Navigation Tabs */}
      <div className="user-tabs-nav">
        <button
          onClick={() => setActiveSubTab("history")}
          className={`user-tab-btn ${activeSubTab === "history" ? "active" : ""}`}
        >
          <i className="bi bi-clock-history"></i>
          <span>My History</span>
        </button>
        <button
          onClick={() => setActiveSubTab("quota")}
          className={`user-tab-btn ${activeSubTab === "quota" ? "active" : ""}`}
        >
          <i className="bi bi-bar-chart-fill"></i>
          <span>Usage & Quota</span>
        </button>
        <button
          onClick={() => setActiveSubTab("apikeys")}
          className={`user-tab-btn ${activeSubTab === "apikeys" ? "active" : ""}`}
        >
          <i className="bi bi-key-fill"></i>
          <span>Personal API Keys</span>
        </button>
        <button
          onClick={() => setActiveSubTab("billing")}
          className={`user-tab-btn ${activeSubTab === "billing" ? "active" : ""}`}
        >
          <i className="bi bi-credit-card-fill"></i>
          <span>Plans & Billing</span>
        </button>
        <button
          onClick={() => setActiveSubTab("gdpr")}
          className={`user-tab-btn ${activeSubTab === "gdpr" ? "active" : ""}`}
        >
          <i className="bi bi-shield-lock-fill"></i>
          <span>Account & Privacy (GDPR)</span>
        </button>
      </div>

      {error && (
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          color: "#dc2626",
          backgroundColor: "#fef2f2",
          border: "1px solid #fecaca",
          padding: "10px 14px",
          borderRadius: "8px",
          marginBottom: "16px",
          fontSize: "0.88rem"
        }}>
          <i className="bi bi-exclamation-octagon-fill"></i>
          <span>{error}</span>
        </div>
      )}

      {statusMessage && (
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          color: "#166534",
          backgroundColor: "#f0fdf4",
          border: "1px solid #bbf7d0",
          padding: "10px 14px",
          borderRadius: "8px",
          marginBottom: "16px",
          fontSize: "0.88rem"
        }}>
          <i className="bi bi-check-circle-fill"></i>
          <span>{statusMessage}</span>
        </div>
      )}

      {loading && (
        <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#64748b", padding: "12px 0" }}>
          <i className="bi bi-arrow-repeat" style={{ animation: "spin 1s linear infinite" }}></i>
          <span>Loading data...</span>
        </div>
      )}

      {/* Render Component-Based Sections */}
      {activeSubTab === "history" && !loading && (
        <HistorySection history={history} />
      )}

      {activeSubTab === "quota" && !loading && (
        <UsageQuotaSection quota={quota} />
      )}

      {activeSubTab === "apikeys" && !loading && (
        <ApiKeysSection
          apiKeys={apiKeys}
          newKeyLabel={newKeyLabel}
          setNewKeyLabel={setNewKeyLabel}
          createdRawKey={createdRawKey}
          onCreateKey={handleCreateKey}
          onRevokeKey={handleRevokeKey}
        />
      )}

      {activeSubTab === "billing" && !loading && (
        <BillingSection
          subscription={subscription}
          plans={plans}
          billingLoading={billingLoading}
          onUpgrade={handleUpgrade}
          onCancelSubscription={handleCancelSubscription}
        />
      )}

      {activeSubTab === "gdpr" && !loading && (
        <GdprPrivacySection
          onResendVerification={handleResendVerification}
          onExportData={handleExportData}
          showDeleteModal={showDeleteModal}
          setShowDeleteModal={setShowDeleteModal}
          deletePassword={deletePassword}
          setDeletePassword={setDeletePassword}
          deleteConfirmation={deleteConfirmation}
          setDeleteConfirmation={setDeleteConfirmation}
          onDeleteAccount={handleDeleteAccount}
        />
      )}
    </div>
  );
}
