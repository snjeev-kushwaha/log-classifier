import { useState } from "react";

export default function LogInput({ onSubmit, isLoading }) {
  const [text, setText] = useState("");
  const [error, setError] = useState("");

  function handleSubmit(event) {
    event.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) {
      setError("Enter a log line before classifying");
      return;
    }
    setError("");
    onSubmit(trimmed);
  }

  return (
    <form className="card" onSubmit={handleSubmit} data-testid="log-input-form">
      <label htmlFor="log-text">Log message</label>
      <textarea
        id="log-text"
        data-testid="log-textarea"
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          if (error) setError("");
        }}
        placeholder="Paste a raw log line here..."
      />
      {error && (
        <div className="error-text" data-testid="input-error">
          {error}
        </div>
      )}
      <div style={{ marginTop: 10 }}>
        <button type="submit" disabled={isLoading} data-testid="classify-button">
          {isLoading ? "Classifying..." : "Classify"}
        </button>
      </div>
    </form>
  );
}
