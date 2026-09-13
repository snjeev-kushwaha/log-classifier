export default function AuditLogsSection({ auditLogs }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
        <i className="bi bi-journal-text" style={{ color: "#0284c7" }}></i>
        <h4 style={{ margin: 0 }}>System Audit Trail ({auditLogs.length})</h4>
      </div>
      <p style={{ color: "#64748b", fontSize: "0.85rem", marginBottom: "14px" }}>
        Immutable chronological record of administrative actions, key rotations, user mutations, and rule updates.
      </p>

      <div className="responsive-table-wrapper">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Action</th>
              <th>Actor ID</th>
              <th>Target</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {auditLogs.map((log) => (
              <tr key={log.id}>
                <td>{new Date(log.created_at).toLocaleString()}</td>
                <td>
                  <span style={{
                    padding: "3px 8px",
                    borderRadius: "4px",
                    fontSize: "0.78rem",
                    background: "#f1f5f9",
                    fontWeight: "600",
                    fontFamily: "monospace"
                  }}>
                    {log.action}
                  </span>
                </td>
                <td>{log.actor_id || "System"}</td>
                <td>{log.target || "-"}</td>
                <td style={{ fontSize: "0.8rem", color: "#64748b" }}>{log.metadata_json || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
