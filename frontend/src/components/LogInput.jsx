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

export default function LogInput({ onSubmit, isLoading }) {
  const [text, setText] = useState("");
  const [error, setError] = useState("");

  function handleSubmit(event) {
    if (event) event.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) {
      setError("Enter a log line before classifying");
      return;
    }
    setError("");
    onSubmit(trimmed);
  }

  function handleSelectSample(sampleText) {
    setText(sampleText);
    if (error) setError("");
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
          onChange={(event) => {
            setText(event.target.value);
            if (error) setError("");
          }}
          onKeyDown={(event) => {
            if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
              handleSubmit(event);
            }
          }}
          placeholder="Paste a raw log line here... (e.g. 2026-09-13T20:14:02Z [auth] Failed login for user admin)"
          rows={4}
        />
      </div>

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
              onClick={() => {
                setText("");
                if (error) setError("");
              }}
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

