const BADGE_LABELS = {
  regex: "Regex",
  ml: "ML (BERT + LogReg)",
  llm: "LLM (Groq)",
  human_review: "Needs human review",
};

const BADGE_ICONS = {
  regex: "bi-lightning-charge-fill",
  ml: "bi-diagram-3-fill",
  llm: "bi-robot",
  human_review: "bi-exclamation-triangle-fill",
};

export default function ClassificationResult({ result, onCorrect }) {
  if (!result) return null;

  const methodClass = `badge badge-${result.method_used}`;
  const iconClass = BADGE_ICONS[result.method_used] || "bi-cpu";
  const confidencePct = Math.round(result.confidence * 100);

  return (
    <div className="card classification-result-card" data-testid="classification-result">
      <div className="result-card-header">
        <div className="result-method-wrapper">
          <span className={methodClass} data-testid="method-badge">
            <i className={`bi ${iconClass}`}></i> {BADGE_LABELS[result.method_used] || result.method_used}
          </span>
          <span className="result-sub-badge">Inference Complete</span>
        </div>

        <div className="result-confidence-box">
          <span className="confidence-label">Confidence: </span>
          <strong className="confidence-number" data-testid="result-confidence">
            {confidencePct}%
          </strong>
        </div>
      </div>

      <div className="result-card-body">
        <div className="result-label-row">
          <span className="result-field-caption">Detected Category:</span>
          <div className="result-label-tag">
            <i className="bi bi-tag-fill"></i>
            <strong data-testid="result-label">{result.label}</strong>
          </div>
        </div>

        {/* Confidence Meter Bar */}
        <div className="confidence-meter-track" title={`Confidence: ${confidencePct}%`}>
          <div
            className="confidence-meter-fill"
            style={{
              width: `${Math.max(5, Math.min(100, confidencePct))}%`,
              background:
                confidencePct >= 80
                  ? "linear-gradient(90deg, #10b981, #059669)"
                  : confidencePct >= 50
                  ? "linear-gradient(90deg, #38bdf8, #0284c7)"
                  : "linear-gradient(90deg, #f59e0b, #d97706)",
            }}
          />
        </div>

        {result.reasoning && (
          <div className="result-reasoning-panel" data-testid="result-reasoning">
            <div className="reasoning-header">
              <i className="bi bi-chat-left-text-fill"></i>
              <span>Model Reasoning</span>
            </div>
            <p className="reasoning-content">{result.reasoning}</p>
          </div>
        )}

        {result.needs_human_review && (
          <div className="result-review-section">
            <p className="error-text" data-testid="review-flag">
              <i className="bi bi-exclamation-triangle-fill"></i> Low confidence - please confirm the correct label.
            </p>
            <button
              type="button"
              className="confirm-review-btn"
              data-testid="confirm-correct-button"
              onClick={() => onCorrect(result.label)}
            >
              <i className="bi bi-check-circle-fill"></i> Confirm "{result.label}" is correct
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

