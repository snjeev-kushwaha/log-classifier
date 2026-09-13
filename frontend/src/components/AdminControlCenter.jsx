import { useState, useEffect } from "react";
import {
  adminListUsers,
  adminCreateUser,
  adminUpdateUser,
  adminDeleteUser,
  adminGetClassifications,
  adminListRegexRules,
  adminCreateRegexRule,
  adminDeleteRegexRule,
  adminListAuditLogs,
  adminGetSecretsStatus,
  adminRotateJwtSecret,
  adminGetDatabaseStatus,
  adminGetObservabilityStats,
} from "../api/classificationApi.js";
import TelemetrySection from "./admin/TelemetrySection.jsx";
import UserManagementSection from "./admin/UserManagementSection.jsx";
import RegexRulesSection from "./admin/RegexRulesSection.jsx";
import AuditLogsSection from "./admin/AuditLogsSection.jsx";
import InfrastructureSection from "./admin/InfrastructureSection.jsx";
import ObservabilitySection from "./admin/ObservabilitySection.jsx";

export default function AdminControlCenter({ token, activeSection, onSectionChange }) {
  const [internalSection, setInternalSection] = useState("telemetry");
  const section = activeSection !== undefined ? activeSection : internalSection;
  const setSection = onSectionChange || setInternalSection;

  const [users, setUsers] = useState([]);
  const [telemetry, setTelemetry] = useState(null);
  const [rules, setRules] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [secretsStatus, setSecretsStatus] = useState(null);
  const [dbStatus, setDbStatus] = useState(null);
  const [obsStats, setObsStats] = useState(null);
  const [secretMsg, setSecretMsg] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newPattern, setNewPattern] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserName, setNewUserName] = useState("");
  const [newUserRole, setNewUserRole] = useState("user");
  const [userMsg, setUserMsg] = useState("");
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
      } else if (section === "observability") {
        const stats = await adminGetObservabilityStats(token);
        setObsStats(stats);
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
      setError(err.message || "Failed to toggle user status");
    }
  }

  async function handleCreateUser(e) {
    e.preventDefault();
    if (!newUserEmail || !newUserPassword) return;
    setError("");
    setUserMsg("");
    try {
      await adminCreateUser(token, {
        email: newUserEmail.trim(),
        password: newUserPassword,
        full_name: newUserName.trim() || undefined,
        role: newUserRole,
      });
      setUserMsg(`User "${newUserEmail}" created successfully.`);
      setNewUserEmail("");
      setNewUserPassword("");
      setNewUserName("");
      setNewUserRole("user");
      loadSectionData();
    } catch (err) {
      setError(err.message || "Failed to create user");
    }
  }

  async function handleDeleteUser(u) {
    if (!window.confirm(`Are you sure you want to permanently delete user "${u.email}"? This action cannot be undone.`)) {
      return;
    }
    setError("");
    setUserMsg("");
    try {
      await adminDeleteUser(token, u.id);
      setUserMsg(`User "${u.email}" deleted successfully.`);
      loadSectionData();
    } catch (err) {
      setError(err.message || "Failed to delete user");
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
    <div style={{ marginTop: "4px" }}>
      {/* Sleek Admin Header Banner */}
      <div className="admin-header-banner">
        <div className="admin-header-left">
          <div className="admin-header-icon">
            <i className="bi bi-sliders2-vertical"></i>
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: "1.15rem", fontWeight: "600" }}>Admin Control Center</h3>
            <p style={{ margin: "2px 0 0", fontSize: "0.82rem", color: "#94a3b8" }}>Enterprise monitoring, user administration, regex rule engine, and platform security</p>
          </div>
        </div>
        <span className="admin-header-badge">
          <i className="bi bi-shield-lock-fill"></i> Admin Restricted
        </span>
      </div>

      {/* Sub-Navigation Tabs */}
      <div className="admin-tabs-nav">
        <button
          onClick={() => setSection("telemetry")}
          className={`admin-tab-btn ${section === "telemetry" ? "active" : ""}`}
        >
          <i className="bi bi-speedometer2"></i>
          <span>System Telemetry</span>
        </button>
        <button
          onClick={() => setSection("users")}
          className={`admin-tab-btn ${section === "users" ? "active" : ""}`}
        >
          <i className="bi bi-people-fill"></i>
          <span>User Management</span>
        </button>
        <button
          onClick={() => setSection("rules")}
          className={`admin-tab-btn ${section === "rules" ? "active" : ""}`}
        >
          <i className="bi bi-code-slash"></i>
          <span>Regex Rules Engine</span>
        </button>
        <button
          onClick={() => setSection("audit")}
          className={`admin-tab-btn ${section === "audit" ? "active" : ""}`}
        >
          <i className="bi bi-journal-text"></i>
          <span>Audit Trail</span>
        </button>
        <button
          onClick={() => setSection("infrastructure")}
          className={`admin-tab-btn ${section === "infrastructure" ? "active" : ""}`}
        >
          <i className="bi bi-database-lock"></i>
          <span>Secrets & Database</span>
        </button>
        <button
          onClick={() => setSection("observability")}
          className={`admin-tab-btn ${section === "observability" ? "active" : ""}`}
        >
          <i className="bi bi-activity"></i>
          <span>Observability & Metrics</span>
        </button>
      </div>

      {error && (
        <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#b91c1c", backgroundColor: "#fef2f2", border: "1px solid #fecaca", padding: "10px 14px", borderRadius: "8px", marginBottom: "16px", fontSize: "0.9rem" }}>
          <i className="bi bi-exclamation-octagon-fill"></i>
          <span>{error}</span>
        </div>
      )}
      {loading && (
        <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#64748b", padding: "12px 0" }}>
          <i className="bi bi-arrow-repeat" style={{ animation: "spin 1s linear infinite" }}></i>
          <span>Loading control center data...</span>
        </div>
      )}

      {/* Render Component-Based Sections */}
      {section === "telemetry" && !loading && (
        <TelemetrySection telemetry={telemetry} />
      )}

      {section === "users" && !loading && (
        <UserManagementSection
          users={users}
          newUserName={newUserName}
          setNewUserName={setNewUserName}
          newUserEmail={newUserEmail}
          setNewUserEmail={setNewUserEmail}
          newUserPassword={newUserPassword}
          setNewUserPassword={setNewUserPassword}
          newUserRole={newUserRole}
          setNewUserRole={setNewUserRole}
          userMsg={userMsg}
          onCreateUser={handleCreateUser}
          onToggleUserRole={handleToggleUserRole}
          onToggleUserActive={handleToggleUserActive}
          onDeleteUser={handleDeleteUser}
        />
      )}

      {section === "rules" && !loading && (
        <RegexRulesSection
          rules={rules}
          newLabel={newLabel}
          setNewLabel={setNewLabel}
          newPattern={newPattern}
          setNewPattern={setNewPattern}
          newDesc={newDesc}
          setNewDesc={setNewDesc}
          onCreateRule={handleCreateRule}
          onDeleteRule={handleDeleteRule}
        />
      )}

      {section === "audit" && !loading && (
        <AuditLogsSection auditLogs={auditLogs} />
      )}

      {section === "infrastructure" && !loading && (
        <InfrastructureSection
          secretsStatus={secretsStatus}
          dbStatus={dbStatus}
          secretMsg={secretMsg}
          onRotateSecret={handleRotateSecret}
        />
      )}

      {section === "observability" && !loading && (
        <ObservabilitySection obsStats={obsStats} auditLogsCount={auditLogs.length} />
      )}
    </div>
  );
}
