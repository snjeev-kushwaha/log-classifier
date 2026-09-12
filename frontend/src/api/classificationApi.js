/**
 * Thin API client for the classification backend. Kept as a single module
 * so it can be mocked wholesale in unit tests (via vi.mock) or intercepted
 * at the network layer in e2e tests (via Playwright route mocking / MSW).
 */
const BASE_URL = "/api/v1";

async function handleResponse(response) {
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const detail = body.detail
      ? Array.isArray(body.detail)
        ? body.detail.map((d) => d.msg).join(", ")
        : body.detail
      : `Request failed with status ${response.status}`;
    throw new Error(detail);
  }
  return response.json();
}

export async function classifyLog(text) {
  const response = await fetch(`${BASE_URL}/classify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  return handleResponse(response);
}

export async function submitFeedback({ text, correctLabel, originalMethod }) {
  const response = await fetch(`${BASE_URL}/feedback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text,
      correct_label: correctLabel,
      original_method: originalMethod,
    }),
  });
  if (!response.ok) {
    throw new Error(`Feedback submission failed with status ${response.status}`);
  }
}

export async function checkHealth() {
  const response = await fetch(`${BASE_URL}/health`);
  return handleResponse(response);
}
