/**
 * API client for the classification backend, auth, user platform, and admin control center.
 */
const BASE_URL = "/api/v1";

function getAuthHeaders(token) {
  const activeToken = token || localStorage.getItem("access_token");
  const headers = { "Content-Type": "application/json" };
  if (activeToken) {
    headers["Authorization"] = `Bearer ${activeToken}`;
  }
  return headers;
}

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

// --- Classification ---

export async function classifyLog(text, token) {
  const response = await fetch(`${BASE_URL}/classify`, {
    method: "POST",
    headers: getAuthHeaders(token),
    body: JSON.stringify({ text }),
  });
  return handleResponse(response);
}

export async function submitFeedback({ text, correctLabel, originalMethod }, token) {
  const response = await fetch(`${BASE_URL}/feedback`, {
    method: "POST",
    headers: getAuthHeaders(token),
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

// --- Auth Endpoints ---

export async function signupUser({ email, password, fullName }) {
  const response = await fetch(`${BASE_URL}/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, full_name: fullName }),
  });
  return handleResponse(response);
}

export async function loginUser({ email, password }) {
  const response = await fetch(`${BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  return handleResponse(response);
}

export async function refreshToken(refresh_token) {
  const response = await fetch(`${BASE_URL}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token }),
  });
  return handleResponse(response);
}

export async function fetchCurrentUser(token) {
  const response = await fetch(`${BASE_URL}/auth/me`, {
    headers: getAuthHeaders(token),
  });
  return handleResponse(response);
}

export async function logoutUser(refresh_token) {
  await fetch(`${BASE_URL}/auth/logout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token }),
  }).catch(() => {});
}

export async function oauthTokenLogin({ provider, subject_id, email, fullName }) {
  const response = await fetch(`${BASE_URL}/auth/oauth/token-login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      provider,
      subject_id,
      email,
      full_name: fullName,
    }),
  });
  return handleResponse(response);
}

// --- User Platform ---

export async function fetchUserHistory(token, skip = 0, limit = 20) {
  const response = await fetch(`${BASE_URL}/history?skip=${skip}&limit=${limit}`, {
    headers: getAuthHeaders(token),
  });
  return handleResponse(response);
}

export async function fetchUserQuota(token) {
  const response = await fetch(`${BASE_URL}/quota`, {
    headers: getAuthHeaders(token),
  });
  return handleResponse(response);
}

export async function createPersonalApiKey(token, label) {
  const response = await fetch(`${BASE_URL}/api-keys`, {
    method: "POST",
    headers: getAuthHeaders(token),
    body: JSON.stringify({ label }),
  });
  return handleResponse(response);
}

export async function listPersonalApiKeys(token) {
  const response = await fetch(`${BASE_URL}/api-keys`, {
    headers: getAuthHeaders(token),
  });
  return handleResponse(response);
}

export async function revokePersonalApiKey(token, keyId) {
  const response = await fetch(`${BASE_URL}/api-keys/${keyId}`, {
    method: "DELETE",
    headers: getAuthHeaders(token),
  });
  return handleResponse(response);
}

// --- Admin Control Center ---

export async function adminListUsers(token, { skip = 0, limit = 50, role, q } = {}) {
  let url = `${BASE_URL}/admin/users?skip=${skip}&limit=${limit}`;
  if (role) url += `&role=${encodeURIComponent(role)}`;
  if (q) url += `&q=${encodeURIComponent(q)}`;
  const response = await fetch(url, { headers: getAuthHeaders(token) });
  return handleResponse(response);
}

export async function adminCreateUser(token, { email, password, full_name, role = "user", is_active = true }) {
  const response = await fetch(`${BASE_URL}/admin/users`, {
    method: "POST",
    headers: getAuthHeaders(token),
    body: JSON.stringify({ email, password, full_name, role, is_active }),
  });
  return handleResponse(response);
}

export async function adminUpdateUser(token, userId, updates) {
  const response = await fetch(`${BASE_URL}/admin/users/${userId}`, {
    method: "PATCH",
    headers: getAuthHeaders(token),
    body: JSON.stringify(updates),
  });
  return handleResponse(response);
}

export async function adminDeleteUser(token, userId) {
  const response = await fetch(`${BASE_URL}/admin/users/${userId}`, {
    method: "DELETE",
    headers: getAuthHeaders(token),
  });
  return handleResponse(response);
}

export async function adminGetClassifications(token, { skip = 0, limit = 50, method_used } = {}) {
  let url = `${BASE_URL}/admin/classifications?skip=${skip}&limit=${limit}`;
  if (method_used) url += `&method_used=${encodeURIComponent(method_used)}`;
  const response = await fetch(url, { headers: getAuthHeaders(token) });
  return handleResponse(response);
}

export async function adminListRegexRules(token) {
  const response = await fetch(`${BASE_URL}/admin/regex-rules`, {
    headers: getAuthHeaders(token),
  });
  return handleResponse(response);
}

export async function adminCreateRegexRule(token, { label, pattern, description }) {
  const response = await fetch(`${BASE_URL}/admin/regex-rules`, {
    method: "POST",
    headers: getAuthHeaders(token),
    body: JSON.stringify({ label, pattern, description }),
  });
  return handleResponse(response);
}

export async function adminDeleteRegexRule(token, ruleId) {
  const response = await fetch(`${BASE_URL}/admin/regex-rules/${ruleId}`, {
    method: "DELETE",
    headers: getAuthHeaders(token),
  });
  return handleResponse(response);
}

export async function adminListAuditLogs(token, skip = 0, limit = 50) {
  const response = await fetch(`${BASE_URL}/admin/audit-logs?skip=${skip}&limit=${limit}`, {
    headers: getAuthHeaders(token),
  });
  return handleResponse(response);
}

export async function adminGetSecretsStatus(token) {
  const response = await fetch(`${BASE_URL}/admin/secrets/status`, {
    headers: getAuthHeaders(token),
  });
  return handleResponse(response);
}

export async function adminRotateJwtSecret(token) {
  const response = await fetch(`${BASE_URL}/admin/secrets/rotate-jwt`, {
    method: "POST",
    headers: getAuthHeaders(token),
  });
  return handleResponse(response);
}

export async function adminGetDatabaseStatus(token) {
  const response = await fetch(`${BASE_URL}/admin/database/status`, {
    headers: getAuthHeaders(token),
  });
  return handleResponse(response);
}

// --- Phase 7: Notifications ---

export async function fetchNotifications(token, skip = 0, limit = 20) {
  const response = await fetch(`${BASE_URL}/notifications?skip=${skip}&limit=${limit}`, {
    headers: getAuthHeaders(token),
  });
  return handleResponse(response);
}

export async function markNotificationRead(token, notificationId) {
  const response = await fetch(`${BASE_URL}/notifications/${notificationId}/read`, {
    method: "PATCH",
    headers: getAuthHeaders(token),
  });
  return handleResponse(response);
}

export async function markAllNotificationsRead(token) {
  const response = await fetch(`${BASE_URL}/notifications/mark-all-read`, {
    method: "POST",
    headers: getAuthHeaders(token),
  });
  return handleResponse(response);
}

// --- Phase 7: Billing & Subscriptions ---

export async function fetchBillingPlans() {
  const response = await fetch(`${BASE_URL}/billing/plans`);
  return handleResponse(response);
}

export async function fetchUserSubscription(token) {
  const response = await fetch(`${BASE_URL}/billing/subscription`, {
    headers: getAuthHeaders(token),
  });
  return handleResponse(response);
}

export async function createCheckoutSession(token, planTier, successUrl, cancelUrl) {
  const response = await fetch(`${BASE_URL}/billing/checkout-session`, {
    method: "POST",
    headers: getAuthHeaders(token),
    body: JSON.stringify({
      plan_tier: planTier,
      success_url: successUrl,
      cancel_url: cancelUrl,
    }),
  });
  return handleResponse(response);
}

export async function cancelUserSubscription(token) {
  const response = await fetch(`${BASE_URL}/billing/cancel`, {
    method: "POST",
    headers: getAuthHeaders(token),
  });
  return handleResponse(response);
}

// --- Phase 7: Verification & Password Reset ---

export async function requestEmailVerification(token) {
  const response = await fetch(`${BASE_URL}/auth/verify-email/request`, {
    method: "POST",
    headers: getAuthHeaders(token),
  });
  return handleResponse(response);
}

export async function confirmEmailVerification(verifyToken) {
  const response = await fetch(`${BASE_URL}/auth/verify-email/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: verifyToken }),
  });
  return handleResponse(response);
}

export async function requestPasswordReset(email) {
  const response = await fetch(`${BASE_URL}/auth/password-reset/request`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  return handleResponse(response);
}

export async function confirmPasswordReset(resetToken, newPassword) {
  const response = await fetch(`${BASE_URL}/auth/password-reset/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: resetToken, new_password: newPassword }),
  });
  return handleResponse(response);
}

// --- Phase 7: GDPR & Account Management ---

export async function exportAccountData(token) {
  const response = await fetch(`${BASE_URL}/account/export-data`, {
    headers: getAuthHeaders(token),
  });
  return handleResponse(response);
}

export async function deleteAccount(token, password, confirmation) {
  const response = await fetch(`${BASE_URL}/account/delete-my-account`, {
    method: "DELETE",
    headers: getAuthHeaders(token),
    body: JSON.stringify({ password, confirmation }),
  });
  return handleResponse(response);
}

// --- Phase 7: Observability Dashboard ---

export async function adminGetObservabilityStats(token) {
  const response = await fetch(`${BASE_URL}/admin/observability/stats`, {
    headers: getAuthHeaders(token),
  });
  return handleResponse(response);
}

