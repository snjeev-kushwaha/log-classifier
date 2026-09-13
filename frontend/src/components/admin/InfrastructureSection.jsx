export default function InfrastructureSection({
  secretsStatus,
  dbStatus,
  secretMsg,
  onRotateSecret,
}) {
  return (
    <div>
      {secretMsg && (
        <div style={{
          backgroundColor: "#f0fdf4",
          color: "#166534",
          border: "1px solid #bbf7d0",
          padding: "10px 14px",
          borderRadius: "6px",
          marginBottom: "16px",
          fontWeight: "500",
          display: "flex",
          alignItems: "center",
          gap: "8px"
        }}>
          <i className="bi bi-check-circle-fill"></i> {secretMsg}
        </div>
      )}

      {/* Database Architecture Section */}
      <div style={{ backgroundColor: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "10px", padding: "20px", marginBottom: "20px" }}>
        <h4 style={{ margin: "0 0 14px 0", display: "flex", alignItems: "center", gap: "8px", color: "#0f172a" }}>
          <i className="bi bi-database-fill-check" style={{ color: "#0284c7" }}></i> Database Architecture & Status
        </h4>
        <div className="stat-grid" style={{ marginBottom: "14px" }}>
          <div className="stat-card-modern">
            <div style={{ fontSize: "1.05rem", fontWeight: "700", color: "#0284c7" }}>PostgreSQL</div>
            <div style={{ fontSize: "0.82rem", color: "#64748b" }}>Primary Database Engine</div>
          </div>
          <div className="stat-card-modern">
            <div style={{ fontSize: "1.05rem", fontWeight: "700", color: "#16a34a" }}>Connected</div>
            <div style={{ fontSize: "0.82rem", color: "#64748b" }}>Single Unified Database</div>
          </div>
          <div className="stat-card-modern">
            <div style={{ fontSize: "1.5rem", fontWeight: "700", color: "#0f172a" }}>{dbStatus?.metrics?.total_users || 0}</div>
            <div style={{ fontSize: "0.82rem", color: "#64748b" }}>Total User Accounts</div>
          </div>
          <div className="stat-card-modern">
            <div style={{ fontSize: "1.5rem", fontWeight: "700", color: "#0f172a" }}>{dbStatus?.metrics?.total_classification_records || 0}</div>
            <div style={{ fontSize: "0.82rem", color: "#64748b" }}>Classification Records</div>
          </div>
        </div>
        <p style={{ margin: 0, fontSize: "0.85rem", color: "#64748b" }}>
          <strong>Foreign Key Integrity:</strong> Strictly enforced across users, refresh tokens, personal API keys, and classification records within a single unified PostgreSQL cluster.
        </p>
      </div>

      {/* Secrets Management & Key Rotation Section */}
      <div style={{ backgroundColor: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "10px", padding: "20px" }}>
        <h4 style={{ margin: "0 0 14px 0", display: "flex", alignItems: "center", gap: "8px", color: "#0f172a" }}>
          <i className="bi bi-key-fill" style={{ color: "#f59e0b" }}></i> Secrets Manager & Key Rotation
        </h4>
        <div className="stat-grid" style={{ marginBottom: "16px" }}>
          <div className="stat-card-modern">
            <div style={{ fontSize: "1rem", fontWeight: "700" }}>{secretsStatus?.backend || "Vault/Env"}</div>
            <div style={{ fontSize: "0.82rem", color: "#64748b" }}>Secrets Manager Provider</div>
          </div>
          <div className="stat-card-modern">
            <div style={{ fontSize: "1rem", fontWeight: "700", fontFamily: "monospace" }}>
              {secretsStatus?.jwt_current_hash_preview ? `${secretsStatus.jwt_current_hash_preview}...` : "Active"}
            </div>
            <div style={{ fontSize: "0.82rem", color: "#64748b" }}>Active JWT Key Hash</div>
          </div>
          <div className="stat-card-modern">
            <div style={{ fontSize: "1rem", fontWeight: "700", color: secretsStatus?.jwt_previous_retained ? "#16a34a" : "#64748b" }}>
              {secretsStatus?.jwt_previous_retained ? "Retained (Grace Period)" : "None"}
            </div>
            <div style={{ fontSize: "0.82rem", color: "#64748b" }}>Previous Key Status</div>
          </div>
          <div className="stat-card-modern">
            <div style={{ fontSize: "1.5rem", fontWeight: "700", color: "#0f172a" }}>{secretsStatus?.rotation_count || 0}</div>
            <div style={{ fontSize: "0.82rem", color: "#64748b" }}>Total Key Rotations</div>
          </div>
        </div>

        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          backgroundColor: "#f8fafc",
          padding: "16px",
          borderRadius: "8px",
          border: "1px solid #e2e8f0",
          flexWrap: "wrap",
          gap: "12px"
        }}>
          <div>
            <strong style={{ display: "block", marginBottom: "4px" }}>Rotate JWT Signing Key</strong>
            <span style={{ fontSize: "0.85rem", color: "#64748b" }}>
              Seamless rotation: Because refresh tokens are stored server-side in PostgreSQL, active users remain logged in without interruption.
            </span>
          </div>
          <button
            onClick={onRotateSecret}
            style={{
              padding: "8px 18px",
              backgroundColor: "#0284c7",
              color: "#fff",
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
              fontWeight: "600",
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              whiteSpace: "nowrap"
            }}
          >
            <i className="bi bi-arrow-repeat"></i> Rotate Key
          </button>
        </div>
      </div>
    </div>
  );
}
