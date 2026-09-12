const BADGE_LABELS = {
  regex: "Regex",
  ml: "ML (BERT + LogReg)",
  llm: "LLM (Groq)",
  human_review: "Needs human review",
};

export default function ClassificationResult({ result, onCorrect }) {
  if (!result) return null;

  const methodClass = `badge badge-${result.method_used}`;

  return (
    <div className="card" data-testid="classification-result">
      <div>
        <span className={methodClass} data-testid="method-badge">
          {BADGE_LABELS[result.method_used] || result.method_used}
        </span>
      </div>
      <p style={{ marginBottom: 4 }}>
        <strong data-testid="result-label">{result.label}</strong>
      </p>
      <p style={{ fontSize: 13, color: "#555" }}>
        Confidence: <span data-testid="result-confidence">{(result.confidence * 100).toFixed(0)}%</span>
      </p>
      {result.reasoning && (
        <p style={{ fontSize: 13, color: "#555" }} data-testid="result-reasoning">
          {result.reasoning}
        </p>
      )}
      {result.needs_human_review && (
        <div style={{ marginTop: 8 }}>
          <p className="error-text" data-testid="review-flag">
            Low confidence - please confirm the correct label.
          </p>
          <button
            type="button"
            data-testid="confirm-correct-button"
            onClick={() => onCorrect(result.label)}
          >
            Confirm "{result.label}" is correct
          </button>
        </div>
      )}
    </div>
  );
}
