export default function ApiKeysSection({
  apiKeys,
  newKeyLabel,
  setNewKeyLabel,
  createdRawKey,
  onCreateKey,
  onRevokeKey,
}) {
  return (
    <div>
      <div className="card">
        <h3 style={{ margin: "0 0 8px" }}>Create Personal API Key</h3>
        <p style={{ color: "#64748b", fontSize: "0.85rem", margin: "0 0 16px" }}>
          Use your personal API key with the <code>X-API-Key</code> header to automate log classifications from CI/CD, scripts, or microservices.
        </p>
        <form onSubmit={onCreateKey} style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <input
            type="text"
            placeholder="Key label (e.g. Jenkins CI, Prod Gateway)"
            value={newKeyLabel}
            onChange={(e) => setNewKeyLabel(e.target.value)}
            style={{ flex: 1, minWidth: "240px", padding: "8px 12px", border: "1px solid #cbd5e1", borderRadius: "6px" }}
          />
          <button type="submit" style={{ padding: "8px 18px", background: "#0284c7", color: "#fff", border: "none", borderRadius: "6px", fontWeight: "600", cursor: "pointer" }}>
            <i className="bi bi-key-fill"></i> Generate Key
          </button>
        </form>
      </div>

      {createdRawKey && (
        <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", padding: "16px", borderRadius: "8px", marginBottom: "16px" }}>
          <strong style={{ color: "#166534" }}>API Key Generated Successfully:</strong>
          <p style={{ margin: "8px 0", fontSize: "0.85rem", color: "#475569" }}>
            Copy your key now! For security reasons, you will never see the full key again:
          </p>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <code style={{ background: "#fff", padding: "8px 12px", border: "1px solid #cbd5e1", borderRadius: "4px", flex: 1, wordBreak: "break-all" }}>
              {createdRawKey}
            </code>
            <button
              onClick={() => {
                navigator.clipboard.writeText(createdRawKey);
                alert("API key copied to clipboard!");
              }}
              style={{ padding: "8px 14px", background: "#ffffff", border: "1px solid #cbd5e1", borderRadius: "6px", cursor: "pointer", fontWeight: "600" }}
            >
              <i className="bi bi-clipboard"></i> Copy
            </button>
          </div>
        </div>
      )}

      <div className="card">
        <h3 style={{ margin: "0 0 12px" }}>Active Keys ({apiKeys.length})</h3>
        {apiKeys.length === 0 ? (
          <p style={{ color: "#64748b", margin: 0 }}>No personal API keys generated yet.</p>
        ) : (
          <div className="responsive-table-wrapper">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Label</th>
                  <th>Prefix</th>
                  <th>Created</th>
                  <th>Last Used</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {apiKeys.map((k) => (
                  <tr key={k.id}>
                    <td><strong>{k.label}</strong></td>
                    <td><code>{k.prefix}</code></td>
                    <td>{new Date(k.created_at).toLocaleDateString()}</td>
                    <td>{k.last_used_at ? new Date(k.last_used_at).toLocaleDateString() : "Never"}</td>
                    <td>
                      {k.is_active ? (
                        <button
                          onClick={() => onRevokeKey(k.id)}
                          style={{ padding: "4px 10px", background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca", borderRadius: "6px", cursor: "pointer", fontSize: "0.82rem" }}
                        >
                          Revoke
                        </button>
                      ) : (
                        <span style={{ color: "#94a3b8", fontSize: "0.82rem" }}>Revoked</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
