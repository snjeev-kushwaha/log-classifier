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

export default function UserPlatform({ token, onAccountDeleted }) {
  const [activeSubTab, setActiveSubTab] = useState("history");
  const [history, setHistory] = useState([]);
  const [quota, setQuota] = useState(null);
  const [apiKeys, setApiKeys] = useState([]);
  const [newKeyLabel, setNewKeyLabel] = useState("");
  const [createdRawKey, setCreatedRawKey] = useState(null);

  // Billing state
  const [plans, setPlans] = useState([]);
  const [subscription, setSubscription] = useState(null);
  const [billingLoading, setBillingLoading] = useState(false);

  // GDPR state
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    loadData();
  }, [activeSubTab, token]);

  async function loadData() {
    setError("");
    setStatusMessage("");
    setLoading(true);
    try {
      if (activeSubTab === "history") {
        const data = await fetchUserHistory(token);
        setHistory(data.items || []);
      } else if (activeSubTab === "quota") {
        const q = await fetchUserQuota(token);
        setQuota(q);
      } else if (activeSubTab === "apikeys") {
        const keys = await listPersonalApiKeys(token);
        setApiKeys(keys || []);
      } else if (activeSubTab === "billing") {
        const [plansData, subData] = await Promise.all([
          fetchBillingPlans(),
          fetchUserSubscription(token),
        ]);
        setPlans(plansData || []);
        setSubscription(subData);
      }
    } catch (err) {
      setError(err.message || "Failed to load data");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateKey(e) {
    e.preventDefault();
    if (!newKeyLabel.trim()) return;
    try {
      const resp = await createPersonalApiKey(token, newKeyLabel.trim());
      setCreatedRawKey(resp.raw_key);
      setNewKeyLabel("");
      const keys = await listPersonalApiKeys(token);
      setApiKeys(keys || []);
    } catch (err) {
      setError(err.message || "Failed to create API key");
    }
  }

  async function handleRevokeKey(keyId) {
    if (!window.confirm("Are you sure you want to revoke this API key?")) return;
    try {
      await revokePersonalApiKey(token, keyId);
      const keys = await listPersonalApiKeys(token);
      setApiKeys(keys || []);
    } catch (err) {
      setError(err.message || "Failed to revoke API key");
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
    <div style={{ marginTop: "24px" }}>
      <div style={{ display: "flex", gap: "10px", borderBottom: "1px solid #ddd", marginBottom: "16px", flexWrap: "wrap" }}>
        <button
          onClick={() => setActiveSubTab("history")}
          style={activeSubTab === "history" ? subTabActive : subTabInactive}
        >
          📜 My History
        </button>
        <button
          onClick={() => setActiveSubTab("quota")}
          style={activeSubTab === "quota" ? subTabActive : subTabInactive}
        >
          📊 Usage & Quota
        </button>
        <button
          onClick={() => setActiveSubTab("apikeys")}
          style={activeSubTab === "apikeys" ? subTabActive : subTabInactive}
        >
          🔑 Personal API Keys
        </button>
        <button
          onClick={() => setActiveSubTab("billing")}
          style={activeSubTab === "billing" ? subTabActive : subTabInactive}
        >
          💳 Plans & Billing
        </button>
        <button
          onClick={() => setActiveSubTab("gdpr")}
          style={activeSubTab === "gdpr" ? subTabActive : subTabInactive}
        >
          🔒 Account & Privacy (GDPR)
        </button>
      </div>

      {error && <p style={{ color: "#d32f2f", marginBottom: "12px", background: "#ffebee", padding: "8px 12px", borderRadius: "4px" }}>{error}</p>}
      {statusMessage && <p style={{ color: "#2e7d32", marginBottom: "12px", background: "#e8f5e9", padding: "8px 12px", borderRadius: "4px" }}>{statusMessage}</p>}
      {loading && <p style={{ color: "#666" }}>Loading...</p>}

      {/* History Tab */}
      {activeSubTab === "history" && !loading && (
        <div>
          {history.length === 0 ? (
            <p style={{ color: "#777" }}>No past classifications recorded yet. Run a classification above!</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={tableStyle}>
                <thead>
                  <tr style={{ background: "#f5f5f5", textAlign: "left" }}>
                    <th style={thStyle}>Date</th>
                    <th style={thStyle}>Log Snippet</th>
                    <th style={thStyle}>Label</th>
                    <th style={thStyle}>Confidence</th>
                    <th style={thStyle}>Method</th>
                    <th style={thStyle}>Correction</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((item) => (
                    <tr key={item.id} style={{ borderBottom: "1px solid #eee" }}>
                      <td style={tdStyle}>{new Date(item.created_at).toLocaleString()}</td>
                      <td style={{ ...tdStyle, maxWidth: "250px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {item.text}
                      </td>
                      <td style={tdStyle}>
                        <span style={badgeStyle(item.label)}>{item.label}</span>
                      </td>
                      <td style={tdStyle}>{(item.confidence * 100).toFixed(1)}%</td>
                      <td style={tdStyle}>{item.method_used}</td>
                      <td style={tdStyle}>{item.corrected_label || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Quota Tab */}
      {activeSubTab === "quota" && !loading && quota && (
        <div style={cardStyle}>
          <h3 style={{ margin: "0 0 12px" }}>Daily Classification Quota</h3>
          <p style={{ color: "#555", fontSize: "0.9rem" }}>
            Every account has a daily quota reset at 00:00 UTC. Upgraded plans receive exponentially higher capacity.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "16px", marginTop: "16px" }}>
            <div style={{ background: "#f8f9fa", padding: "16px", borderRadius: "8px", border: "1px solid #e9ecef" }}>
              <div style={{ fontSize: "0.85rem", color: "#6c757d" }}>Classifications Today</div>
              <div style={{ fontSize: "1.8rem", fontWeight: "700", color: "#1976d2", marginTop: "4px" }}>
                {quota.today_count.toLocaleString()}
              </div>
            </div>
            <div style={{ background: "#f8f9fa", padding: "16px", borderRadius: "8px", border: "1px solid #e9ecef" }}>
              <div style={{ fontSize: "0.85rem", color: "#6c757d" }}>Daily Limit</div>
              <div style={{ fontSize: "1.8rem", fontWeight: "700", color: "#333", marginTop: "4px" }}>
                {quota.daily_limit.toLocaleString()}
              </div>
            </div>
            <div style={{ background: "#f8f9fa", padding: "16px", borderRadius: "8px", border: "1px solid #e9ecef" }}>
              <div style={{ fontSize: "0.85rem", color: "#6c757d" }}>Remaining Capacity</div>
              <div style={{ fontSize: "1.8rem", fontWeight: "700", color: quota.remaining > 0 ? "#2e7d32" : "#d32f2f", marginTop: "4px" }}>
                {quota.remaining.toLocaleString()}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* API Keys Tab */}
      {activeSubTab === "apikeys" && !loading && (
        <div>
          <div style={cardStyle}>
            <h3 style={{ margin: "0 0 8px" }}>Create Personal API Key</h3>
            <p style={{ color: "#666", fontSize: "0.85rem", margin: "0 0 16px" }}>
              Use your personal API key with the <code>X-API-Key</code> header to automate log classifications from CI/CD, scripts, or microservices.
            </p>
            <form onSubmit={handleCreateKey} style={{ display: "flex", gap: "8px" }}>
              <input
                type="text"
                placeholder="Key label (e.g. Jenkins CI, Prod Gateway)"
                value={newKeyLabel}
                onChange={(e) => setNewKeyLabel(e.target.value)}
                style={{ flex: 1, padding: "8px 12px", border: "1px solid #ccc", borderRadius: "4px" }}
              />
              <button type="submit" style={btnPrimary}>
                Generate Key
              </button>
            </form>
          </div>

          {createdRawKey && (
            <div style={{ background: "#e8f5e9", border: "1px solid #c8e6c9", padding: "16px", borderRadius: "8px", marginBottom: "16px" }}>
              <strong style={{ color: "#2e7d32" }}>API Key Generated Successfully:</strong>
              <p style={{ margin: "8px 0", fontSize: "0.85rem", color: "#555" }}>
                Copy your key now! For security reasons, you will never see the full key again:
              </p>
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <code style={{ background: "#fff", padding: "8px 12px", border: "1px solid #ddd", borderRadius: "4px", flex: 1 }}>
                  {createdRawKey}
                </code>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(createdRawKey);
                    alert("API key copied to clipboard!");
                  }}
                  style={btnSecondary}
                >
                  Copy
                </button>
              </div>
            </div>
          )}

          <div style={cardStyle}>
            <h3 style={{ margin: "0 0 12px" }}>Active Keys</h3>
            {apiKeys.length === 0 ? (
              <p style={{ color: "#777" }}>No personal API keys generated yet.</p>
            ) : (
              <table style={tableStyle}>
                <thead>
                  <tr style={{ background: "#f5f5f5", textAlign: "left" }}>
                    <th style={thStyle}>Label</th>
                    <th style={thStyle}>Prefix</th>
                    <th style={thStyle}>Created</th>
                    <th style={thStyle}>Last Used</th>
                    <th style={thStyle}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {apiKeys.map((k) => (
                    <tr key={k.id} style={{ borderBottom: "1px solid #eee" }}>
                      <td style={tdStyle}>{k.label}</td>
                      <td style={tdStyle}><code>{k.prefix}</code></td>
                      <td style={tdStyle}>{new Date(k.created_at).toLocaleDateString()}</td>
                      <td style={tdStyle}>{k.last_used_at ? new Date(k.last_used_at).toLocaleDateString() : "Never"}</td>
                      <td style={tdStyle}>
                        {k.is_active ? (
                          <button onClick={() => handleRevokeKey(k.id)} style={btnDangerSmall}>
                            Revoke
                          </button>
                        ) : (
                          <span style={{ color: "#999" }}>Revoked</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Plans & Billing Tab */}
      {activeSubTab === "billing" && !loading && (
        <div>
          {subscription && (
            <div style={cardStyle}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
                <div>
                  <h3 style={{ margin: 0 }}>Current Subscription</h3>
                  <div style={{ marginTop: "4px", fontSize: "0.9rem", color: "#555" }}>
                    Active Plan: <strong style={{ color: "#1976d2", textTransform: "uppercase" }}>{subscription.plan_tier}</strong>
                    {" "}| Daily Quota: <strong>{subscription.daily_quota.toLocaleString()} logs/day</strong>
                  </div>
                </div>
                {subscription.plan_tier !== "free" && (
                  <button onClick={handleCancelSubscription} disabled={billingLoading} style={btnDangerSmall}>
                    Cancel Subscription
                  </button>
                )}
              </div>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "16px", marginTop: "16px" }}>
            {plans.map((p) => {
              const isCurrent = subscription && subscription.plan_tier === p.tier;
              return (
                <div key={p.tier} style={{ ...cardStyle, border: isCurrent ? "2px solid #1976d2" : "1px solid #e0e0e0" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <h3 style={{ margin: 0 }}>{p.name}</h3>
                    {isCurrent && <span style={{ background: "#e3f2fd", color: "#1976d2", padding: "2px 8px", borderRadius: "10px", fontSize: "0.75rem", fontWeight: "bold" }}>CURRENT</span>}
                  </div>
                  <div style={{ fontSize: "1.8rem", fontWeight: "700", color: "#333", margin: "12px 0 4px" }}>
                    ${p.price_usd} <span style={{ fontSize: "0.9rem", color: "#666", fontWeight: "normal" }}>/ month</span>
                  </div>
                  <div style={{ color: "#1976d2", fontWeight: "600", fontSize: "0.9rem", marginBottom: "12px" }}>
                    {p.daily_quota.toLocaleString()} classifications / day
                  </div>
                  <ul style={{ paddingLeft: "20px", color: "#555", fontSize: "0.85rem", lineHeight: "1.6", margin: "0 0 16px" }}>
                    {p.features.map((f, i) => (
                      <li key={i}>{f}</li>
                    ))}
                  </ul>
                  {p.tier !== "free" && !isCurrent && (
                    <button onClick={() => handleUpgrade(p.tier)} disabled={billingLoading} style={btnPrimaryFull}>
                      Upgrade to {p.name}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Account & GDPR Tab */}
      {activeSubTab === "gdpr" && !loading && (
        <div>
          <div style={cardStyle}>
            <h3 style={{ margin: "0 0 8px" }}>Email Verification</h3>
            <p style={{ color: "#555", fontSize: "0.85rem", margin: "0 0 12px" }}>
              Verifying your email confirms account ownership and enables critical security notifications.
            </p>
            <button onClick={handleResendVerification} style={btnSecondary}>
              📧 Send Email Verification Link
            </button>
          </div>

          <div style={cardStyle}>
            <h3 style={{ margin: "0 0 8px" }}>GDPR Data Portability (Article 20)</h3>
            <p style={{ color: "#555", fontSize: "0.85rem", margin: "0 0 12px" }}>
              Download a complete JSON export of your personal information, classification history, API keys metadata, and usage stats.
            </p>
            <button onClick={handleExportData} style={btnSecondary}>
              📥 Export My Personal Data (JSON)
            </button>
          </div>

          <div style={{ ...cardStyle, border: "1px solid #ffcdd2", background: "#fffbfa" }}>
            <h3 style={{ margin: "0 0 8px", color: "#c62828" }}>Danger Zone: Delete Account (GDPR Article 17)</h3>
            <p style={{ color: "#555", fontSize: "0.85rem", margin: "0 0 12px" }}>
              Permanently remove your account, revoke all sessions and API keys, and anonymize past classification logs. This action is irreversible.
            </p>
            {!showDeleteModal ? (
              <button onClick={() => setShowDeleteModal(true)} style={btnDangerSmall}>
                ⚠️ Delete My Account
              </button>
            ) : (
              <form onSubmit={handleDeleteAccount} style={{ background: "#ffebee", padding: "16px", borderRadius: "6px", border: "1px solid #ef9a9a" }}>
                <p style={{ margin: "0 0 8px", fontSize: "0.85rem", fontWeight: "600", color: "#c62828" }}>
                  To confirm permanent deletion, enter your password and type <code>DELETE MY ACCOUNT</code> below:
                </p>
                <input
                  type="password"
                  placeholder="Your current password"
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                  style={{ width: "100%", padding: "8px", marginBottom: "8px", border: "1px solid #ccc", borderRadius: "4px" }}
                />
                <input
                  type="text"
                  placeholder="Type DELETE MY ACCOUNT"
                  value={deleteConfirmation}
                  onChange={(e) => setDeleteConfirmation(e.target.value)}
                  style={{ width: "100%", padding: "8px", marginBottom: "8px", border: "1px solid #ccc", borderRadius: "4px" }}
                />
                <div style={{ display: "flex", gap: "8px" }}>
                  <button type="submit" style={btnDangerSmall}>
                    Confirm Permanent Deletion
                  </button>
                  <button type="button" onClick={() => setShowDeleteModal(false)} style={btnSecondary}>
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const subTabActive = {
  padding: "8px 16px",
  border: "none",
  borderBottom: "2px solid #1976d2",
  background: "none",
  fontWeight: "600",
  color: "#1976d2",
  cursor: "pointer",
};

const subTabInactive = {
  padding: "8px 16px",
  border: "none",
  background: "none",
  color: "#666",
  cursor: "pointer",
};

const cardStyle = {
  background: "#fff",
  padding: "20px",
  borderRadius: "8px",
  border: "1px solid #e0e0e0",
  marginBottom: "16px",
};

const tableStyle = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: "0.9rem",
};

const thStyle = {
  padding: "10px 12px",
  borderBottom: "2px solid #ddd",
};

const tdStyle = {
  padding: "10px 12px",
};

const btnPrimary = {
  padding: "8px 16px",
  background: "#1976d2",
  color: "#fff",
  border: "none",
  borderRadius: "4px",
  cursor: "pointer",
  fontWeight: "600",
};

const btnPrimaryFull = {
  width: "100%",
  padding: "10px 16px",
  background: "#1976d2",
  color: "#fff",
  border: "none",
  borderRadius: "4px",
  cursor: "pointer",
  fontWeight: "600",
};

const btnSecondary = {
  padding: "6px 14px",
  background: "#f5f5f5",
  color: "#333",
  border: "1px solid #ccc",
  borderRadius: "4px",
  cursor: "pointer",
  fontSize: "0.85rem",
};

const btnDangerSmall = {
  padding: "6px 12px",
  background: "#d32f2f",
  color: "#fff",
  border: "none",
  borderRadius: "4px",
  cursor: "pointer",
  fontSize: "0.85rem",
  fontWeight: "600",
};

function badgeStyle(label) {
  const colors = {
    security_alert: "#c62828",
    resource_usage: "#ef6c00",
    workflow_error: "#283593",
    unclassified: "#616161",
  };
  return {
    backgroundColor: colors[label] || "#424242",
    color: "#fff",
    padding: "3px 8px",
    borderRadius: "12px",
    fontSize: "0.8rem",
    fontWeight: "600",
  };
}
