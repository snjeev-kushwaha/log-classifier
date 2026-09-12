import { useState } from "react";
import LogInput from "./components/LogInput.jsx";
import ClassificationResult from "./components/ClassificationResult.jsx";
import { classifyLog, submitFeedback } from "./api/classificationApi.js";

export default function App() {
  const [result, setResult] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [apiError, setApiError] = useState("");

  async function handleClassify(text) {
    setIsLoading(true);
    setApiError("");
    setResult(null);
    try {
      const response = await classifyLog(text);
      setResult(response);
    } catch (err) {
      setApiError(err.message || "Something went wrong classifying that log.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleCorrect(correctLabel) {
    if (!result) return;
    try {
      await submitFeedback({
        text: result.text,
        correctLabel,
        originalMethod: result.method_used,
      });
      setResult({ ...result, needs_human_review: false });
    } catch (err) {
      setApiError(err.message || "Could not submit feedback.");
    }
  }

  return (
    <div className="app">
      <h1>Hybrid log classifier</h1>
      <p style={{ color: "#555" }}>
        Regex for fixed patterns, BERT + LogisticRegression for well-covered
        variable patterns, and an LLM fallback for rare or complex ones.
      </p>
      <LogInput onSubmit={handleClassify} isLoading={isLoading} />
      {apiError && (
        <div className="card" data-testid="api-error">
          <p className="error-text">{apiError}</p>
        </div>
      )}
      <ClassificationResult result={result} onCorrect={handleCorrect} />
    </div>
  );
}
