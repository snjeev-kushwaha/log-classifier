export default function TelemetrySection({ telemetry }) {
  if (!telemetry) return null;

  return (
    <div>
      <div className="stat-grid">
        <div className="stat-card-modern">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "0.82rem", color: "#64748b", fontWeight: "600" }}>Total Classifications</span>
            <i className="bi bi-bar-chart-fill" style={{ color: "#64748b", fontSize: "1.2rem" }}></i>
          </div>
          <div style={{ fontSize: "1.6rem", fontWeight: "700", color: "#0f172a", marginTop: "8px" }}>
            {telemetry.total}
          </div>
        </div>

        <div className="stat-card-modern">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "0.82rem", color: "#64748b", fontWeight: "600" }}>Layer 1: Regex Match</span>
            <i className="bi bi-code-square" style={{ color: "#16a34a", fontSize: "1.2rem" }}></i>
          </div>
          <div style={{ fontSize: "1.6rem", fontWeight: "700", color: "#16a34a", marginTop: "8px" }}>
            {telemetry.method_distribution?.regex || 0}
          </div>
        </div>

        <div className="stat-card-modern">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "0.82rem", color: "#64748b", fontWeight: "600" }}>Layer 2: BERT ML</span>
            <i className="bi bi-cpu-fill" style={{ color: "#2563eb", fontSize: "1.2rem" }}></i>
          </div>
          <div style={{ fontSize: "1.6rem", fontWeight: "700", color: "#2563eb", marginTop: "8px" }}>
            {telemetry.method_distribution?.ml || 0}
          </div>
        </div>

        <div className="stat-card-modern">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "0.82rem", color: "#64748b", fontWeight: "600" }}>Layer 3: Groq LLM</span>
            <i className="bi bi-robot" style={{ color: "#9333ea", fontSize: "1.2rem" }}></i>
          </div>
          <div style={{ fontSize: "1.6rem", fontWeight: "700", color: "#9333ea", marginTop: "8px" }}>
            {telemetry.method_distribution?.llm || 0}
          </div>
        </div>

        <div className="stat-card-modern">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "0.82rem", color: "#64748b", fontWeight: "600" }}>Needs Human Review</span>
            <i className="bi bi-exclamation-octagon-fill" style={{ color: "#ea580c", fontSize: "1.2rem" }}></i>
          </div>
          <div style={{ fontSize: "1.6rem", fontWeight: "700", color: "#ea580c", marginTop: "8px" }}>
            {telemetry.method_distribution?.human_review || 0}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
        <i className="bi bi-card-list" style={{ color: "#0284c7" }}></i>
        <h4 style={{ margin: 0 }}>Recent System Logs</h4>
      </div>

      <div className="responsive-table-wrapper">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Log Preview</th>
              <th>Label</th>
              <th>Confidence</th>
              <th>Method</th>
            </tr>
          </thead>
          <tbody>
            {(telemetry.items || []).slice(0, 15).map((item) => (
              <tr key={item.id}>
                <td>{new Date(item.created_at).toLocaleTimeString()}</td>
                <td style={{ maxWidth: "350px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {item.text}
                </td>
                <td>
                  <span className="badge" style={{ background: "#e0f2fe", color: "#0369a1" }}>{item.label}</span>
                </td>
                <td>{(item.confidence * 100).toFixed(1)}%</td>
                <td><code>{item.method_used}</code></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
