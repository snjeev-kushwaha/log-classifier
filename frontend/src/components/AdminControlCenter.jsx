import { useState, useEffect } from "react";
import {
  adminListUsers,
  adminUpdateUser,
  adminGetClassifications,
  adminListRegexRules,
  adminCreateRegexRule,
  adminDeleteRegexRule,
  adminListAuditLogs,
  adminGetSecretsStatus,
  adminRotateJwtSecret,
  adminGetDatabaseStatus,
} from "../api/classificationApi.js";

export default function AdminControlCenter({ token }) {
  const [section, setSection] = useState("telemetry");
  const [users, setUsers] = useState([]);
  const [telemetry, setTelemetry] = useState(null);
  const [rules, setRules] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [secretsStatus, setSecretsStatus] = useState(null);
  const [dbStatus, setDbStatus] = useState(null);
  const [secretMsg, setSecretMsg] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newPattern, setNewPattern] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    loadSectionData();
  }, [section, token]);

  async function loadSectionData() {
    setError("");
    setLoading(true);
    try {
      if (section === "telemetry") {
        const data = await adminGetClassifications(token);
        setTelemetry(data);
      } else if (section === "users") {
        const data = await adminListUsers(token);
        setUsers(data.users || []);
      } else if (section === "rules") {
        const data = await adminListRegexRules(token);
        setRules(data || []);
      } else if (section === "audit") {
        const data = await adminListAuditLogs(token);
        setAuditLogs(data.audit_logs || []);
      } else if (section === "infrastructure") {
        const [secData, databaseData] = await Promise.all([
          adminGetSecretsStatus(token),
          adminGetDatabaseStatus(token),
        ]);
        setSecretsStatus(secData);
        setDbStatus(databaseData);
      }
    } catch (err) {
      setError(err.message || "Failed to load admin data");
    } finally {
      setLoading(false);
    }
  }

  async function handleRotateSecret() {
    if (!window.confirm("Rotate active JWT signing key? Server-side refresh tokens will preserve active user sessions.")) return;
    setError("");
    setSecretMsg("");
    try {
      const res = await adminRotateJwtSecret(token);
      setSecretMsg(res.message);
      setSecretsStatus(res.secrets_status);
    } catch (err) {
      setError(err.message || "Failed to rotate secret");
    }
  }


  async function handleToggleUserRole(u) {
    const newRole = u.role === "admin" ? "user" : "admin";
    try {
      await adminUpdateUser(token, u.id, { role: newRole });
      loadSectionData();
    } catch (err) {
      setError(err.message || "Failed to update user role");
    }
  }

  async function handleToggleUserActive(u) {
    try {
      await adminUpdateUser(token, u.id, { is_active: !u.is_active });
      loadSectionData();
    } catch (err) {
      setError(err.message || "Failed to update user active status");
    }
  }

  async function handleCreateRule(e) {
    e.preventDefault();
    if (!newLabel || !newPattern) return;
    try {
      await adminCreateRegexRule(token, {
        label: newLabel.trim(),
        pattern: newPattern.trim(),
        description: newDesc.trim() || undefined,
      });
      setNewLabel("");
      setNewPattern("");
      setNewDesc("");
      loadSectionData();
    } catch (err) {
      setError(err.message || "Failed to add regex rule");
    }
  }

  async function handleDeleteRule(ruleId) {
    if (!window.confirm("Delete this regex rule?")) return;
    try {
      await adminDeleteRegexRule(token, ruleId);
      loadSectionData();
    } catch (err) {
      setError(err.message || "Failed to delete rule");
    }
  }

  return (
    <div style={{ marginTop: "24px" }}>
      <div style={{ background: "#212121", color: "#fff", padding: "12px 20px", borderRadius: "8px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3 style={{ margin: 0, fontSize: "1.1rem" }}>⚙️ Admin Control Center</h3>
        <span style={{ fontSize: "0.85rem", background: "#d32f2f", padding: "3px 10px", borderRadius: "12px", fontWeight: "600" }}>Admin Restricted</span>
      </div>

      <div style={{ display: "flex", gap: "10px", borderBottom: "1px solid #ddd", margin: "16px 0" }}>
        <button onClick={() => setSection("telemetry")} style={section === "telemetry" ? tabActive : tabInactive}>
          System Telemetry
        </button>
        <button onClick={() => setSection("users")} style={section === "users" ? tabActive : tabInactive}>
          User Management
        </button>
        <button onClick={() => setSection("rules")} style={section === "rules" ? tabActive : tabInactive}>
          Regex Rules Engine
        </button>
        <button onClick={() => setSection("audit")} style={section === "audit" ? tabActive : tabInactive}>
          Audit Trail
        </button>
        <button onClick={() => setSection("infrastructure")} style={section === "infrastructure" ? tabActive : tabInactive}>
          Secrets & Database
        </button>
      </div>

      {error && <p style={{ color: "#d32f2f", marginBottom: "12px" }}>{error}</p>}
      {loading && <p style={{ color: "#666" }}>Loading data...</p>}

      {/* Telemetry Tab */}
      {section === "telemetry" && !loading && telemetry && (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px", marginBottom: "24px" }}>
            <div style={statCard}>
              <div style={statNum}>{telemetry.total}</div>
              <div style={statLabel}>Total Classifications</div>
            </div>
            <div style={statCard}>
              <div style={{ ...statNum, color: "#2e7d32" }}>{telemetry.method_distribution?.regex || 0}</div>
              <div style={statLabel}>Layer 1: Regex Match</div>
            </div>
            <div style={statCard}>
              <div style={{ ...statNum, color: "#1976d2" }}>{telemetry.method_distribution?.ml || 0}</div>
              <div style={statLabel}>Layer 2: BERT ML</div>
            </div>
            <div style={statCard}>
              <div style={{ ...statNum, color: "#7b1fa2" }}>{telemetry.method_distribution?.llm || 0}</div>
              <div style={statLabel}>Layer 3: Groq LLM</div>
            </div>
            <div style={statCard}>
              <div style={{ ...statNum, color: "#f57c00" }}>{telemetry.method_distribution?.human_review || 0}</div>
              <div style={statLabel}>Needs Human Review</div>
            </div>
          </div>

          <h4>Recent System Logs</h4>
          <table style={tableStyle}>
            <thead>
              <tr style={{ background: "#f8f9fa" }}>
                <th style={thStyle}>Date</th>
                <th style={thStyle}>Log Preview</th>
                <th style={thStyle}>Label</th>
                <th style={thStyle}>Confidence</th>
                <th style={thStyle}>Method</th>
              </tr>
            </thead>
            <tbody>
              {(telemetry.items || []).slice(0, 15).map((item) => (
                <tr key={item.id} style={{ borderBottom: "1px solid #eee" }}>
                  <td style={tdStyle}>{new Date(item.created_at).toLocaleTimeString()}</td>
                  <td style={{ ...tdStyle, maxWidth: "350px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {item.text}
                  </td>
                  <td style={tdStyle}>{item.label}</td>
                  <td style={tdStyle}>{(item.confidence * 100).toFixed(1)}%</td>
                  <td style={tdStyle}><code>{item.method_used}</code></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* User Management Tab */}
      {section === "users" && !loading && (
        <div>
          <h4>System Users ({users.length})</h4>
          <table style={tableStyle}>
            <thead>
              <tr style={{ background: "#f8f9fa" }}>
                <th style={thStyle}>User</th>
                <th style={thStyle}>Email</th>
                <th style={thStyle}>Role</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Joined</th>
                <th style={thStyle}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} style={{ borderBottom: "1px solid #eee" }}>
                  <td style={tdStyle}><strong>{u.full_name || "Unnamed"}</strong></td>
                  <td style={tdStyle}>{u.email}</td>
                  <td style={tdStyle}>
                    <span style={{ padding: "3px 8px", borderRadius: "10px", fontSize: "0.8rem", background: u.role === "admin" ? "#e8eaf6" : "#f5f5f5", color: u.role === "admin" ? "#283593" : "#333", fontWeight: "600" }}>
                      {u.role.toUpperCase()}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    <span style={{ color: u.is_active ? "#2e7d32" : "#d32f2f", fontWeight: "600" }}>
                      {u.is_active ? "Active" : "Deactivated"}
                    </span>
                  </td>
                  <td style={tdStyle}>{new Date(u.created_at).toLocaleDateString()}</td>
                  <td style={tdStyle}>
                    <button
                      onClick={() => handleToggleUserRole(u)}
                      style={{ marginRight: "8px", padding: "4px 8px", fontSize: "0.8rem", cursor: "pointer", border: "1px solid #1976d2", background: "#fff", color: "#1976d2", borderRadius: "4px" }}
                    >
                      Set as {u.role === "admin" ? "User" : "Admin"}
                    </button>
                    <button
                      onClick={() => handleToggleUserActive(u)}
                      style={{ padding: "4px 8px", fontSize: "0.8rem", cursor: "pointer", border: "1px solid #d32f2f", background: "#fff", color: "#d32f2f", borderRadius: "4px" }}
                    >
                      {u.is_active ? "Deactivate" : "Activate"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Regex Rules Tab */}
      {section === "rules" && !loading && (
        <div>
          <div style={cardStyle}>
            <h4>Add Dynamic Regex Rule</h4>
            <p style={{ color: "#555", fontSize: "0.85rem" }}>
              Dynamic rules are stored in PostgreSQL and live-reloaded into the inference pipeline without restarting or redeploying the backend.
            </p>
            <form onSubmit={handleCreateRule} style={{ display: "grid", gridTemplateColumns: "1fr 2fr 1fr auto", gap: "10px", alignItems: "end" }}>
              <div>
                <label style={labelStyle}>Target Label</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. database_deadlock"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Regex Pattern</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. deadlock detected on transaction \d+"
                  value={newPattern}
                  onChange={(e) => setNewPattern(e.target.value)}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Description</label>
                <input
                  type="text"
                  placeholder="Optional context"
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  style={inputStyle}
                />
              </div>
              <button
                type="submit"
                style={{ padding: "8px 16px", background: "#2e7d32", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: "600", height: "36px" }}
              >
                + Add Rule
              </button>
            </form>
          </div>

          <h4 style={{ marginTop: "24px" }}>Active Database Rules ({rules.length})</h4>
          {rules.length === 0 ? (
            <p style={{ color: "#777" }}>No custom database regex rules currently active (using built-in default rules).</p>
          ) : (
            <table style={tableStyle}>
              <thead>
                <tr style={{ background: "#f8f9fa" }}>
                  <th style={thStyle}>Label</th>
                  <th style={thStyle}>Pattern</th>
                  <th style={thStyle}>Description</th>
                  <th style={thStyle}>Action</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((r) => (
                  <tr key={r.id} style={{ borderBottom: "1px solid #eee" }}>
                    <td style={tdStyle}><strong>{r.label}</strong></td>
                    <td style={tdStyle}><code>{r.pattern}</code></td>
                    <td style={tdStyle}>{r.description || "-"}</td>
                    <td style={tdStyle}>
                      <button
                        onClick={() => handleDeleteRule(r.id)}
                        style={{ color: "#d32f2f", border: "1px solid #d32f2f", background: "none", padding: "4px 8px", borderRadius: "4px", cursor: "pointer" }}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Audit Trail Tab */}
      {section === "audit" && !loading && (
        <div>
          <h4>Audit Trail ({auditLogs.length})</h4>
          <table style={tableStyle}>
            <thead>
              <tr style={{ background: "#f8f9fa" }}>
                <th style={thStyle}>Timestamp</th>
                <th style={thStyle}>Actor ID</th>
                <th style={thStyle}>Action</th>
                <th style={thStyle}>Target</th>
                <th style={thStyle}>Metadata</th>
              </tr>
            </thead>
            <tbody>
              {auditLogs.map((log) => (
                <tr key={log.id} style={{ borderBottom: "1px solid #eee" }}>
                  <td style={tdStyle}>{new Date(log.created_at).toLocaleString()}</td>
                  <td style={tdStyle}><code>User #{log.actor_id}</code></td>
                  <td style={tdStyle}><span style={{ fontWeight: "600", color: "#1976d2" }}>{log.action}</span></td>
                  <td style={tdStyle}>{log.target || "-"}</td>
                  <td style={{ ...tdStyle, fontSize: "0.8rem", color: "#666" }}>{log.metadata_json || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Infrastructure Tab (Secrets & Postgres) */}
      {section === "infrastructure" && !loading && (
        <div>
          {secretMsg && (
            <div style={{ backgroundColor: "#e8f5e9", color: "#2e7d32", padding: "10px 14px", borderRadius: "6px", marginBottom: "16px", fontWeight: "500" }}>
              ✓ {secretMsg}
            </div>
          )}

          {/* Database Architecture Section */}
          <div style={{ backgroundColor: "#fafafa", border: "1px solid #e0e0e0", borderRadius: "8px", padding: "18px", marginBottom: "20px" }}>
            <h4 style={{ margin: "0 0 12px 0", display: "flex", alignItems: "center", gap: "8px" }}>
              🐘 Database Architecture & Status
            </h4>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "14px", marginBottom: "12px" }}>
              <div style={statCard}>
                <div style={{ fontSize: "1.05rem", fontWeight: "700", color: "#1565c0" }}>PostgreSQL</div>
                <div style={statLabel}>Primary Database Engine</div>
              </div>
              <div style={statCard}>
                <div style={{ fontSize: "1.05rem", fontWeight: "700", color: "#2e7d32" }}>Connected</div>
                <div style={statLabel}>Single Unified Database</div>
              </div>
              <div style={statCard}>
                <div style={statNum}>{dbStatus?.metrics?.total_users || 0}</div>
                <div style={statLabel}>Total User Accounts</div>
              </div>
              <div style={statCard}>
                <div style={statNum}>{dbStatus?.metrics?.total_classification_records || 0}</div>
                <div style={statLabel}>Classification Records</div>
              </div>
            </div>
            <p style={{ margin: 0, fontSize: "0.85rem", color: "#555" }}>
              <strong>Foreign Key Integrity:</strong> Strictly enforced across users, refresh tokens, personal API keys, and classification records within a single unified PostgreSQL cluster.
            </p>
          </div>

          {/* Secrets Management & Key Rotation Section */}
          <div style={{ backgroundColor: "#fafafa", border: "1px solid #e0e0e0", borderRadius: "8px", padding: "18px" }}>
            <h4 style={{ margin: "0 0 12px 0", display: "flex", alignItems: "center", gap: "8px" }}>
              🔐 Secrets Manager & Key Rotation
            </h4>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "14px", marginBottom: "16px" }}>
              <div style={statCard}>
                <div style={{ fontSize: "1rem", fontWeight: "700" }}>{secretsStatus?.backend || "Vault/Env"}</div>
                <div style={statLabel}>Secrets Manager Provider</div>
              </div>
              <div style={statCard}>
                <div style={{ fontSize: "1rem", fontWeight: "700", fontFamily: "monospace" }}>
                  {secretsStatus?.jwt_current_hash_preview ? `${secretsStatus.jwt_current_hash_preview}...` : "Active"}
                </div>
                <div style={statLabel}>Active JWT Key Hash</div>
              </div>
              <div style={statCard}>
                <div style={{ fontSize: "1rem", fontWeight: "700", color: secretsStatus?.jwt_previous_retained ? "#2e7d32" : "#757575" }}>
                  {secretsStatus?.jwt_previous_retained ? "Retained (Grace Period)" : "None"}
                </div>
                <div style={statLabel}>Previous Key Status</div>
              </div>
              <div style={statCard}>
                <div style={statNum}>{secretsStatus?.rotation_count || 0}</div>
                <div style={statLabel}>Total Key Rotations</div>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", backgroundColor: "#fff", padding: "14px", borderRadius: "6px", border: "1px solid #e0e0e0" }}>
              <div>
                <strong style={{ display: "block", marginBottom: "4px" }}>Rotate JWT Signing Key</strong>
                <span style={{ fontSize: "0.85rem", color: "#666" }}>
                  Seamless rotation: Because refresh tokens are stored server-side in PostgreSQL, active users remain logged in without interruption.
                </span>
              </div>
              <button
                onClick={handleRotateSecret}
                style={{ backgroundColor: "#d32f2f", color: "#fff", border: "none", padding: "8px 16px", borderRadius: "6px", fontWeight: "600", cursor: "pointer" }}
              >
                Rotate Secret Now
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const tabActive = {
  padding: "8px 16px",
  border: "none",
  borderBottom: "2px solid #212121",
  background: "none",
  fontWeight: "600",
  color: "#212121",
  cursor: "pointer",
};

const tabInactive = {
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

const statCard = {
  background: "#fff",
  padding: "16px",
  borderRadius: "8px",
  border: "1px solid #e0e0e0",
  textAlign: "center",
};

const statNum = {
  fontSize: "1.8rem",
  fontWeight: "700",
  marginBottom: "4px",
};

const statLabel = {
  fontSize: "0.85rem",
  color: "#666",
  fontWeight: "500",
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

const labelStyle = {
  display: "block",
  fontSize: "0.8rem",
  fontWeight: "600",
  marginBottom: "4px",
};

const inputStyle = {
  width: "100%",
  padding: "6px 10px",
  borderRadius: "4px",
  border: "1px solid #ccc",
  fontSize: "0.9rem",
  boxSizing: "border-box",
};
