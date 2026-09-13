export default function RegexRulesSection({
  rules,
  newLabel,
  setNewLabel,
  newPattern,
  setNewPattern,
  newDesc,
  setNewDesc,
  onCreateRule,
  onDeleteRule,
}) {
  return (
    <div>
      <div className="card">
        <h4 style={{ margin: "0 0 6px 0", display: "flex", alignItems: "center", gap: "8px" }}>
          <i className="bi bi-code-square" style={{ color: "#0284c7" }}></i>
          Add Dynamic Regex Rule
        </h4>
        <p style={{ color: "#64748b", fontSize: "0.85rem", margin: "0 0 14px 0" }}>
          Dynamic rules are stored in PostgreSQL and live-reloaded into the inference pipeline without restarting or redeploying the backend.
        </p>

        <form onSubmit={onCreateRule} style={{ display: "grid", gridTemplateColumns: "1fr 2fr 1.5fr auto", gap: "10px", alignItems: "end" }}>
          <div>
            <label style={{ display: "block", fontSize: "0.82rem", fontWeight: "600", marginBottom: "4px", color: "#334155" }}>
              Target Label
            </label>
            <input
              type="text"
              required
              placeholder="e.g. database_deadlock"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid #cbd5e1" }}
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: "0.82rem", fontWeight: "600", marginBottom: "4px", color: "#334155" }}>
              Regex Pattern
            </label>
            <input
              type="text"
              required
              placeholder="e.g. deadlock detected on transaction \d+"
              value={newPattern}
              onChange={(e) => setNewPattern(e.target.value)}
              style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid #cbd5e1" }}
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: "0.82rem", fontWeight: "600", marginBottom: "4px", color: "#334155" }}>
              Description
            </label>
            <input
              type="text"
              placeholder="Optional context"
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid #cbd5e1" }}
            />
          </div>

          <button
            type="submit"
            style={{
              padding: "8px 18px",
              background: "#16a34a",
              color: "#fff",
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
              fontWeight: "600",
              height: "36px",
              whiteSpace: "nowrap"
            }}
          >
            <i className="bi bi-plus-lg"></i> Add Rule
          </button>
        </form>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "8px", margin: "24px 0 12px 0" }}>
        <i className="bi bi-list-check" style={{ color: "#0284c7" }}></i>
        <h4 style={{ margin: 0 }}>Active Database Rules ({rules.length})</h4>
      </div>

      {rules.length === 0 ? (
        <p style={{ color: "#64748b" }}>No custom database regex rules currently active (using built-in default rules).</p>
      ) : (
        <div className="responsive-table-wrapper">
          <table className="admin-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Target Label</th>
                <th>Pattern</th>
                <th>Description</th>
                <th>Created</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.id}>
                  <td>{r.id}</td>
                  <td>
                    <span className="badge" style={{ background: "#e0f2fe", color: "#0369a1" }}>{r.label}</span>
                  </td>
                  <td style={{ fontFamily: "monospace" }}>{r.pattern}</td>
                  <td>{r.description || "-"}</td>
                  <td>{new Date(r.created_at).toLocaleDateString()}</td>
                  <td>
                    <button
                      onClick={() => onDeleteRule(r.id)}
                      style={{
                        padding: "4px 8px",
                        background: "#fef2f2",
                        color: "#dc2626",
                        border: "1px solid #fca5a5",
                        borderRadius: "6px",
                        cursor: "pointer"
                      }}
                    >
                      <i className="bi bi-trash3-fill"></i> Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
