import { useState, useEffect } from "react";
import {
  fetchUserHistory,
  fetchUserQuota,
  createPersonalApiKey,
  listPersonalApiKeys,
  revokePersonalApiKey,
} from "../api/classificationApi.js";

export default function UserPlatform({ token }) {
  const [activeSubTab, setActiveSubTab] = useState("history");
  const [history, setHistory] = useState([]);
  const [quota, setQuota] = useState(null);
  const [apiKeys, setApiKeys] = useState([]);
  const [newKeyLabel, setNewKeyLabel] = useState("");
  const [createdRawKey, setCreatedRawKey] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    loadData();
  }, [activeSubTab, token]);

  async function loadData() {
    setError("");
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

  return (
    <div style={{ marginTop: "24px" }}>
      <div style={{ display: "flex", gap: "10px", borderBottom: "1px solid #ddd", marginBottom: "16px" }}>
        <button
          onClick={() => setActiveSubTab("history")}
          style={activeSubTab === "history" ? subTabActive : subTabInactive}
        >
          My History
        </button>
        <button
          onClick={() => setActiveSubTab("quota")}
          style={activeSubTab === "quota" ? subTabActive : subTabInactive}
        >
          Usage & Quota
        </button>
        <button
          onClick={() => setActiveSubTab("apikeys")}
          style={activeSubTab === "apikeys" ? subTabActive : subTabInactive}
        >
          Personal API Keys
        </button>
      </div>

      {error && <p style={{ color: "#d32f2f", marginBottom: "12px" }}>{error}</p>}
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
                  <tr style={{ background: "#f8f9fa", textAlign: "left" }}>
                    <th style={thStyle}>Date</th>
                    <th style={thStyle}>Log Text</th>
                    <th style={thStyle}>Predicted Label</th>
                    <th style={thStyle}>Confidence</th>
                    <th style={thStyle}>Method</th>
                    <th style={thStyle}>Review Flag</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((item) => (
                    <tr key={item.id} style={{ borderBottom: "1px solid #eee" }}>
                      <td style={tdStyle}>{new Date(item.created_at).toLocaleString()}</td>
                      <td style={{ ...tdStyle, maxWidth: "300px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {item.text}
                      </td>
                      <td style={tdStyle}>
                        <span style={badgeStyle(item.label)}>{item.label}</span>
                      </td>
                      <td style={tdStyle}>{(item.confidence * 100).toFixed(1)}%</td>
                      <td style={tdStyle}>{item.method_used}</td>
                      <td style={tdStyle}>{item.needs_human_review ? "⚠️ Needed" : "✓"}</td>
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
          <h3>Daily Usage Quota</h3>
          <p style={{ color: "#555" }}>
            Each account is provisioned with a daily limit for classifications to prevent abuse.
          </p>
          <div style={{ margin: "20px 0" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", fontWeight: "600" }}>
              <span>Used Today: {quota.today_count} requests</span>
              <span>Daily Limit: {quota.daily_limit} requests</span>
            </div>
            <div style={{ background: "#e0e0e0", borderRadius: "8px", height: "12px", overflow: "hidden" }}>
              <div
                style={{
                  background: quota.remaining < 50 ? "#d32f2f" : "#1976d2",
                  width: `${Math.min(100, (quota.today_count / quota.daily_limit) * 100)}%`,
                  height: "100%",
                }}
              />
            </div>
            <p style={{ marginTop: "10px", fontSize: "0.9rem", color: "#666" }}>
              Remaining today: <strong>{quota.remaining}</strong> requests.
            </p>
          </div>
        </div>
      )}

      {/* API Keys Tab */}
      {activeSubTab === "apikeys" && !loading && (
        <div>
          <div style={cardStyle}>
            <h3>Generate Programmatic API Key</h3>
            <p style={{ color: "#555", fontSize: "0.9rem" }}>
              Use your personal API key with the <code>X-API-Key: log_live_...</code> header to classify logs programmatically from curl, Python, or CI/CD pipelines.
            </p>
            <form onSubmit={handleCreateKey} style={{ display: "flex", gap: "10px", marginTop: "12px" }}>
              <input
                type="text"
                required
                placeholder="e.g. My Production Service"
                value={newKeyLabel}
                onChange={(e) => setNewKeyLabel(e.target.value)}
                style={{ flex: 1, padding: "8px 12px", borderRadius: "6px", border: "1px solid #ccc" }}
              />
              <button
                type="submit"
                style={{ padding: "8px 16px", background: "#1976d2", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: "600" }}
              >
                Create Key
              </button>
            </form>

            {createdRawKey && (
              <div style={{ marginTop: "16px", padding: "12px", background: "#e8f5e9", border: "1px solid #a5d6a7", borderRadius: "6px" }}>
                <p style={{ margin: "0 0 6px 0", color: "#2e7d32", fontWeight: "600" }}>
                  ✓ API Key Created! Copy it now (it will never be displayed again):
                </p>
                <code style={{ display: "block", wordBreak: "break-all", background: "#fff", padding: "8px", borderRadius: "4px", border: "1px solid #ccc" }}>
                  {createdRawKey}
                </code>
              </div>
            )}
          </div>

          <h4 style={{ marginTop: "24px" }}>Active API Keys</h4>
          {apiKeys.length === 0 ? (
            <p style={{ color: "#777" }}>No personal API keys generated yet.</p>
          ) : (
            <table style={tableStyle}>
              <thead>
                <tr style={{ background: "#f8f9fa", textAlign: "left" }}>
                  <th style={thStyle}>Label</th>
                  <th style={thStyle}>Key Prefix</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Last Used</th>
                  <th style={thStyle}>Created</th>
                  <th style={thStyle}>Action</th>
                </tr>
              </thead>
              <tbody>
                {apiKeys.map((k) => (
                  <tr key={k.id} style={{ borderBottom: "1px solid #eee" }}>
                    <td style={tdStyle}>{k.label}</td>
                    <td style={tdStyle}><code>{k.prefix}</code></td>
                    <td style={tdStyle}>
                      <span style={{ color: k.is_active ? "#2e7d32" : "#d32f2f", fontWeight: "600" }}>
                        {k.is_active ? "Active" : "Revoked"}
                      </span>
                    </td>
                    <td style={tdStyle}>{k.last_used_at ? new Date(k.last_used_at).toLocaleDateString() : "Never"}</td>
                    <td style={tdStyle}>{new Date(k.created_at).toLocaleDateString()}</td>
                    <td style={tdStyle}>
                      {k.is_active && (
                        <button
                          onClick={() => handleRevokeKey(k.id)}
                          style={{ color: "#d32f2f", background: "none", border: "1px solid #d32f2f", borderRadius: "4px", padding: "4px 8px", cursor: "pointer" }}
                        >
                          Revoke
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
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
