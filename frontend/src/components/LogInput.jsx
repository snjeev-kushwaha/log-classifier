import { useState } from "react";

const SAMPLE_LOGS = [
  {
    label: "Security Alert",
    icon: "bi-shield-exclamation",
    text: "Multiple login failures occurred on user 9052 account from IP 198.51.100.4",
  },
  {
    label: "DB Timeout",
    icon: "bi-database-exclamation",
    text: "Database connection pool exhausted: timeout waiting for connection after 30000ms",
  },
  {
    label: "HTTP 500",
    icon: "bi-hdd-network",
    text: "HTTP 500 Internal Server Error: NullPointerException in PaymentService.processTransaction",
  },
];

export default function LogInput({ onSubmit, isLoading, onInputChange, onClear, maxChars = 65536 }) {
  const [text, setText] = useState("");
  const [error, setError] = useState("");

  function handleChange(event) {
    const val = event.target.value;
    setText(val);
    if (error) setError("");
    if (onInputChange) onInputChange(val);
  }

  function handleClear() {
    setText("");
    setError("");
    if (onClear) onClear();
    if (onInputChange) onInputChange("");
  }

  function handleSubmit(event) {
    if (event) event.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) {
      setError("Enter a log line before classifying");
      return;
    }
    if (trimmed.length > maxChars) {
      setError(`Log message exceeds maximum limit of ${maxChars.toLocaleString()} characters (${trimmed.length.toLocaleString()} characters entered). Please shorten or test individual lines.`);
      return;
    }
    setError("");
    onSubmit(trimmed);
  }

  function handleSelectSample(sampleText) {
    setText(sampleText);
    if (error) setError("");
    if (onClear) onClear();
    if (onInputChange) onInputChange(sampleText);
  }

  return (
    <form className="card log-input-card" onSubmit={handleSubmit} data-testid="log-input-form">
      <div className="log-input-header">
        <label htmlFor="log-text" className="log-input-label">
          <i className="bi bi-terminal-fill"></i>
          <span>Log message</span>
        </label>
        <span className="log-input-hint">Paste raw syslog, Apache, JSON, auth, or kernel log</span>
      </div>

      {/* Quick Sample Selector */}
      <div className="log-samples-bar">
        <span className="samples-intro"><i className="bi bi-stars"></i> Try sample:</span>
        <div className="samples-pills">
          {SAMPLE_LOGS.map((sample) => (
            <button
              key={sample.label}
              type="button"
              className="sample-pill-btn"
              onClick={() => handleSelectSample(sample.text)}
              title={sample.text}
            >
              <i className={`bi ${sample.icon}`}></i>
              <span>{sample.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="log-textarea-wrapper">
        <textarea
          id="log-text"
          data-testid="log-textarea"
          value={text}
          onChange={handleChange}
          onKeyDown={(event) => {
            if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
              handleSubmit(event);
            }
          }}
          placeholder="Paste a raw log line here... (e.g. 2026-09-13T20:14:02Z [auth] Failed login for user admin)"
          rows={4}
        />
      </div>

      {/* Dynamic line & char indicators */}
      {text.length > 0 && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "6px 2px 4px", fontSize: "0.8rem", color: "#64748b" }}>
          <span>
            {text.includes("\n") && (
              <span className="multiline-hint">
                <i className="bi bi-card-text"></i> {text.split("\n").filter((l) => l.trim()).length} lines detected
              </span>
            )}
          </span>
          <span className={`char-counter ${text.length > maxChars ? "char-limit-exceeded" : ""}`}>
            {text.length.toLocaleString()} / {maxChars.toLocaleString()} chars
          </span>
        </div>
      )}

      {/* Multi-Log Batch Analysis Indicator */}
      {text.split("\n").map((l) => l.trim()).filter(Boolean).length > 1 && (
        <div className="multiline-mode-badge" data-testid="multiline-badge" style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "8px 12px",
          margin: "8px 0 4px",
          background: "rgba(59, 130, 246, 0.08)",
          border: "1px solid rgba(59, 130, 246, 0.25)",
          borderRadius: "6px",
          fontSize: "0.82rem",
          color: "#3b82f6"
        }}>
          <i className="bi bi-layers-fill" style={{ fontSize: "1rem" }}></i>
          <span>
            <strong>Multi-Log Analysis Mode:</strong> {text.split("\n").map((l) => l.trim()).filter(Boolean).length} log events will be analyzed concurrently with AI root-cause diagnosis.
          </span>
        </div>
      )}

      {error && (
        <div className="error-text" data-testid="input-error">
          <i className="bi bi-exclamation-triangle-fill"></i> {error}
        </div>
      )}

      <div className="log-input-footer">
        <div className="log-input-actions-left">
          <span className="log-shortcut-tag"><kbd>Ctrl</kbd> + <kbd>Enter</kbd> to classify</span>
          {text && (
            <button
              type="button"
              className="log-clear-btn"
              onClick={handleClear}
            >
              <i className="bi bi-x-circle"></i> Clear
            </button>
          )}
        </div>

        <button
          type="submit"
          disabled={isLoading}
          data-testid="classify-button"
          className="classify-btn-primary"
        >
          <i className={isLoading ? "bi bi-arrow-repeat spin" : "bi bi-lightning-charge-fill"}></i>
          <span>{isLoading ? "Classifying..." : "Classify"}</span>
        </button>
      </div>
    </form>
  );
}

