import { useState, useMemo } from "react";

const CATEGORY_COLORS = {
  workflow_error: { bg: "#eff6ff", text: "#1d4ed8", border: "#bfdbfe", icon: "bi-diagram-3-fill" },
  resource_usage: { bg: "#fffbeb", text: "#b45309", border: "#fde68a", icon: "bi-cpu-fill" },
  security_alert: { bg: "#fef2f2", text: "#b91c1c", border: "#fecaca", icon: "bi-shield-exclamation" },
  unclassified: { bg: "#f8fafc", text: "#475569", border: "#e2e8f0", icon: "bi-question-circle" },
};

const METHOD_LABELS = {
  regex: { label: "Regex", icon: "bi-lightning-charge-fill", cls: "badge-regex" },
  ml: { label: "ML", icon: "bi-diagram-3-fill", cls: "badge-ml" },
  llm: { label: "Groq LLM", icon: "bi-robot", cls: "badge-llm" },
  human_review: { label: "Review", icon: "bi-exclamation-triangle-fill", cls: "badge-human_review" },
};

export default function MultiLogResult({ result }) {
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  const items = result?.items || [];
  const totalLogs = result?.total_logs || items.length;
  const counts = result?.category_counts || {};

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const matchesCat = selectedCategory === "all" || item.label === selectedCategory;
      const matchesSearch =
        !searchQuery.trim() ||
        item.text.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.reasoning && item.reasoning.toLowerCase().includes(searchQuery.toLowerCase())) ||
        String(item.line_number) === searchQuery.trim();
      return matchesCat && matchesSearch;
    });
  }, [items, selectedCategory, searchQuery]);

  function handleExportCsv() {
    const headers = ["line_number", "label", "confidence", "method_used", "reasoning", "text"];
    const csvRows = [headers.join(",")];
    for (const item of items) {
      const escape = (str) => `"${String(str || "").replace(/"/g, '""')}"`;
      csvRows.push(
        [
          item.line_number,
          escape(item.label),
          item.confidence,
          escape(item.method_used),
          escape(item.reasoning),
          escape(item.text),
        ].join(",")
      );
    }
    const blob = new Blob([csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `incident_classified_${totalLogs}_logs.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function handleExportJson() {
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `incident_classified_${totalLogs}_logs.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  if (!result || !items.length) return null;

  return (
    <div className="multi-log-result-container" data-testid="multi-log-result">
      {/* Executive Incident Diagnosis Header */}
      <div className="card multi-log-incident-card">
        <div className="incident-card-header">
          <div className="incident-title-wrapper">
            <span className="incident-badge">
              <i className="bi bi-cpu-fill"></i> Incident Triage Complete
            </span>
            <span className="incident-total-pill">
              <i className="bi bi-card-checklist"></i> {totalLogs} Logs Analyzed
            </span>
          </div>

          <div className="incident-export-actions">
            <button
              type="button"
              className="export-btn"
              onClick={handleExportCsv}
              title="Export all classified logs as CSV"
            >
              <i className="bi bi-filetype-csv"></i> Export CSV
            </button>
            <button
              type="button"
              className="export-btn"
              onClick={handleExportJson}
              title="Export complete incident analysis as JSON"
            >
              <i className="bi bi-filetype-json"></i> Export JSON
            </button>
          </div>
        </div>

        {/* AI Root Cause Reasoning Section */}
        {result.incident_reasoning && (
          <div className="incident-reasoning-panel" data-testid="incident-reasoning">
            <div className="incident-reasoning-header">
              <i className="bi bi-robot"></i>
              <strong>AI Root Cause Diagnosis & Correlation</strong>
            </div>
            <p className="incident-reasoning-text">{result.incident_reasoning}</p>
          </div>
        )}

        {/* Category Breakdown & Filter Pills */}
        <div className="incident-category-pills">
          <button
            type="button"
            className={`cat-pill-btn ${selectedCategory === "all" ? "active" : ""}`}
            onClick={() => setSelectedCategory("all")}
          >
            <span>All Logs</span>
            <span className="cat-pill-count">{totalLogs}</span>
          </button>

          {Object.entries(counts).map(([cat, count]) => {
            const style = CATEGORY_COLORS[cat] || CATEGORY_COLORS.unclassified;
            const isActive = selectedCategory === cat;
            return (
              <button
                key={cat}
                type="button"
                className={`cat-pill-btn ${isActive ? "active" : ""}`}
                style={
                  isActive
                    ? { background: style.text, color: "#ffffff", borderColor: style.text }
                    : { background: style.bg, color: style.text, borderColor: style.border }
                }
                onClick={() => setSelectedCategory(cat)}
              >
                <i className={`bi ${style.icon}`}></i>
                <span>{cat.replace("_", " ")}</span>
                <span className="cat-pill-count" style={isActive ? { background: "rgba(255,255,255,0.25)", color: "#fff" } : {}}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="multi-log-search-bar">
        <div className="search-input-wrapper">
          <i className="bi bi-search search-icon"></i>
          <input
            type="text"
            className="multi-log-search-input"
            placeholder="Search within classified logs (e.g. deadlock, OOM, orders, line #)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              type="button"
              className="search-clear-btn"
              onClick={() => setSearchQuery("")}
            >
              <i className="bi bi-x-lg"></i>
            </button>
          )}
        </div>
        <div className="search-stats-text">
          Showing <strong>{filteredItems.length}</strong> of {totalLogs} logs
        </div>
      </div>

      {/* Classified Logs List */}
      <div className="multi-log-items-list" data-testid="multi-log-items-list">
        {filteredItems.length === 0 ? (
          <div className="card multi-log-empty">
            <i className="bi bi-search" style={{ fontSize: "2rem", color: "#94a3b8" }}></i>
            <p>No logs match your filter criteria.</p>
          </div>
        ) : (
          filteredItems.map((item) => {
            const catStyle = CATEGORY_COLORS[item.label] || CATEGORY_COLORS.unclassified;
            const methodInfo = METHOD_LABELS[item.method_used] || {
              label: item.method_used,
              icon: "bi-cpu",
              cls: "badge-ml",
            };
            const confPct = Math.round(item.confidence * 100);

            return (
              <div key={item.line_number} className="multi-log-item-card" data-testid={`log-item-${item.line_number}`}>
                <div className="item-card-top">
                  <div className="item-meta-left">
                    <span className="item-line-num">#{item.line_number}</span>
                    <span
                      className="item-cat-badge"
                      style={{
                        background: catStyle.bg,
                        color: catStyle.text,
                        borderColor: catStyle.border,
                      }}
                    >
                      <i className={`bi ${catStyle.icon}`}></i> {item.label}
                    </span>
                    <span className={`badge ${methodInfo.cls}`}>
                      <i className={`bi ${methodInfo.icon}`}></i> {methodInfo.label}
                    </span>
                  </div>

                  <div className="item-meta-right">
                    <span className="item-confidence-label">Confidence:</span>
                    <strong className="item-confidence-pct">{confPct}%</strong>
                  </div>
                </div>

                {/* Specific Reasoning / Error Details */}
                {item.reasoning && (
                  <div className="item-reasoning-box">
                    <i className="bi bi-chat-left-dots-fill"></i>
                    <span>{item.reasoning}</span>
                  </div>
                )}

                {/* Raw Log Line Snippet */}
                <div className="item-raw-log">
                  <code>{item.text}</code>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
