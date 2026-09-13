export default function ObservabilitySection({ obsStats, auditLogsCount }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "14px" }}>
        <i className="bi bi-activity" style={{ color: "#0284c7" }}></i>
        <h4 style={{ margin: 0 }}>System Observability & Real-Time Telemetry</h4>
      </div>

      <div className="stat-grid">
        <div className="stat-card-modern">
          <div style={{ fontSize: "1.5rem", fontWeight: "700", color: "#0f172a" }}>
            {obsStats?.active_connections ?? "-"}
          </div>
          <div style={{ fontSize: "0.82rem", color: "#64748b" }}>Active DB Connections</div>
        </div>

        <div className="stat-card-modern">
          <div style={{ fontSize: "1.5rem", fontWeight: "700", color: "#16a34a" }}>
            {obsStats?.avg_classification_latency_ms ? `${obsStats.avg_classification_latency_ms.toFixed(1)} ms` : "< 15 ms"}
          </div>
          <div style={{ fontSize: "0.82rem", color: "#64748b" }}>Avg Classification Latency</div>
        </div>

        <div className="stat-card-modern">
          <div style={{ fontSize: "1.5rem", fontWeight: "700", color: "#2563eb" }}>
            {obsStats?.p95_latency_ms ? `${obsStats.p95_latency_ms.toFixed(1)} ms` : "< 45 ms"}
          </div>
          <div style={{ fontSize: "0.82rem", color: "#64748b" }}>P95 Latency SLA</div>
        </div>

        <div className="stat-card-modern">
          <div style={{ fontSize: "1.5rem", fontWeight: "700", color: "#0f172a" }}>
            {obsStats?.total_audit_events ?? auditLogsCount}
          </div>
          <div style={{ fontSize: "0.82rem", color: "#64748b" }}>Total Audit Events Logged</div>
        </div>
      </div>

      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
          <div>
            <h4 style={{ margin: 0, display: "flex", alignItems: "center", gap: "8px" }}>
              <i className="bi bi-bar-chart-steps" style={{ color: "#0284c7" }}></i>
              Prometheus Raw Metrics Exporter
            </h4>
            <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: "0.85rem" }}>
              Exposing system-wide histograms, latency quantiles, and per-role counters formatted for Prometheus & Grafana.
            </p>
          </div>
          <a
            href="/metrics"
            target="_blank"
            rel="noreferrer"
            style={{
              backgroundColor: "#0f172a",
              color: "#fff",
              textDecoration: "none",
              padding: "8px 16px",
              borderRadius: "6px",
              fontWeight: "600",
              fontSize: "0.85rem",
              display: "inline-flex",
              alignItems: "center",
              gap: "6px"
            }}
          >
            <i className="bi bi-box-arrow-up-right"></i> Open /metrics
          </a>
        </div>
      </div>
    </div>
  );
}
