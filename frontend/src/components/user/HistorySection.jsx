export default function HistorySection({ history }) {
  if (history.length === 0) {
    return (
      <div className="card">
        <p style={{ color: "#64748b", margin: 0 }}>
          No past classifications recorded yet. Run a classification in the Classifier Console!
        </p>
      </div>
    );
  }

  function badgeStyle(label) {
    const map = {
      database_deadlock: { bg: "#fee2e2", color: "#991b1b" },
      security_alert: { bg: "#fef3c7", color: "#92400e" },
      workflow_error: { bg: "#ede9fe", color: "#6d28d9" },
      unclassified: { bg: "#f1f5f9", color: "#475569" },
    };
    const s = map[label] || { bg: "#e0f2fe", color: "#0369a1" };
    return {
      background: s.bg,
      color: s.color,
      padding: "2px 8px",
      borderRadius: "4px",
      fontSize: "0.8rem",
      fontWeight: "600",
    };
  }

  return (
    <div className="responsive-table-wrapper">
      <table className="admin-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Log Snippet</th>
            <th>Label</th>
            <th>Confidence</th>
            <th>Method</th>
            <th>Correction</th>
          </tr>
        </thead>
        <tbody>
          {history.map((item) => (
            <tr key={item.id}>
              <td>{new Date(item.created_at).toLocaleString()}</td>
              <td style={{ maxWidth: "250px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {item.text}
              </td>
              <td>
                <span style={badgeStyle(item.label)}>{item.label}</span>
              </td>
              <td>{(item.confidence * 100).toFixed(1)}%</td>
              <td><code>{item.method_used}</code></td>
              <td>{item.corrected_label || "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
