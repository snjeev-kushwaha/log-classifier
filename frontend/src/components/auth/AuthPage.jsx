import { useState } from "react";
import { loginUser, signupUser, oauthTokenLogin } from "../../api/classificationApi.js";

export default function AuthPage({ onAuthSuccess, onContinueAsGuest }) {
  const [authMode, setAuthMode] = useState("login"); // "login" | "signup"
  const [emailOrUsername, setEmailOrUsername] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSuccessMsg("");
    setLoading(true);

    try {
      if (authMode === "login") {
        if (!emailOrUsername || !password) {
          setError("Please enter your email/username and password.");
          setLoading(false);
          return;
        }
        const data = await loginUser({ email: emailOrUsername.trim(), password });
        onAuthSuccess(data);
      } else {
        if (!emailOrUsername || !password) {
          setError("Please enter your email and password.");
          setLoading(false);
          return;
        }
        await signupUser({
          email: emailOrUsername.trim(),
          password,
          fullName: fullName.trim() || undefined,
        });
        setSuccessMsg("Account created! Logging you in...");
        const loginData = await loginUser({
          email: emailOrUsername.trim(),
          password,
        });
        onAuthSuccess(loginData);
      }
    } catch (err) {
      setError(err.message || "Authentication failed. Please verify credentials.");
    } finally {
      setLoading(false);
    }
  }

  async function handleOAuthDemo(provider) {
    setError("");
    setLoading(true);
    try {
      const data = await oauthTokenLogin({
        provider,
        subject_id: `${provider}-demo-user-12345`,
        email: `${provider}.user@example.com`,
        fullName: `${provider.charAt(0).toUpperCase() + provider.slice(1)} User`,
      });
      onAuthSuccess(data);
    } catch (err) {
      setError(err.message || `${provider} authentication failed.`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page-wrapper">
      <div className="auth-container-card">
        {/* Header */}
        <div className="auth-card-header">
          <div className="auth-brand-badge">
            <i className="bi bi-shield-check"></i>
            <span>Log Classifier Enterprise</span>
          </div>
          <h1 className="auth-card-title">Welcome to the Platform</h1>
          <p className="auth-card-subtitle">
            Secure AI-driven log classification, RBAC control center & telemetry
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="auth-tabs-header">
          <button
            type="button"
            className={`auth-tab-switch ${authMode === "login" ? "active" : ""}`}
            onClick={() => {
              setAuthMode("login");
              setError("");
              setSuccessMsg("");
            }}
          >
            <i className="bi bi-box-arrow-in-right"></i>
            <span>Sign In</span>
          </button>
          <button
            type="button"
            className={`auth-tab-switch ${authMode === "signup" ? "active" : ""}`}
            onClick={() => {
              setAuthMode("signup");
              setError("");
              setSuccessMsg("");
            }}
          >
            <i className="bi bi-person-plus-fill"></i>
            <span>Create Account</span>
          </button>
        </div>

        {/* Form Body */}
        <div className="auth-card-body">
          {error && (
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              color: "#dc2626",
              background: "#fef2f2",
              border: "1px solid #fecaca",
              padding: "10px 14px",
              borderRadius: "8px",
              fontSize: "0.88rem"
            }}>
              <i className="bi bi-exclamation-triangle-fill"></i>
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              color: "#166534",
              background: "#f0fdf4",
              border: "1px solid #bbf7d0",
              padding: "10px 14px",
              borderRadius: "8px",
              fontSize: "0.88rem"
            }}>
              <i className="bi bi-check-circle-fill"></i>
              <span>{successMsg}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            {authMode === "signup" && (
              <div className="auth-input-group">
                <label className="auth-label">
                  <i className="bi bi-person"></i> Full Name (Optional)
                </label>
                <input
                  type="text"
                  className="auth-input"
                  placeholder="Jane Doe"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  disabled={loading}
                />
              </div>
            )}

            <div className="auth-input-group">
              <label className="auth-label">
                <i className="bi bi-envelope"></i> {authMode === "login" ? "Email or Username" : "Email Address"}
              </label>
              <input
                type="text"
                className="auth-input"
                placeholder={authMode === "login" ? "user@example.com or root" : "user@example.com"}
                value={emailOrUsername}
                onChange={(e) => setEmailOrUsername(e.target.value)}
                autoFocus
                required
                disabled={loading}
              />
            </div>

            <div className="auth-input-group">
              <label className="auth-label">
                <i className="bi bi-lock"></i> Password
              </label>
              <input
                type="password"
                className="auth-input"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
              />
            </div>

            <button type="submit" className="auth-submit-btn" data-testid="auth-submit-btn" disabled={loading}>
              {loading ? (
                <>
                  <i className="bi bi-arrow-repeat" style={{ animation: "spin 1s linear infinite" }}></i>
                  <span>Authenticating...</span>
                </>
              ) : (
                <>
                  <i className={authMode === "login" ? "bi bi-box-arrow-in-right" : "bi bi-check2-circle"}></i>
                  <span>{authMode === "login" ? "Sign In to Platform" : "Complete Registration"}</span>
                </>
              )}
            </button>
          </form>

          {/* Social Logins */}
          <div className="auth-divider">
            <span>Or continue with</span>
          </div>

          <div className="auth-social-btns">
            <button
              type="button"
              className="social-btn social-btn-google"
              onClick={() => handleOAuthDemo("google")}
              disabled={loading}
            >
              <i className="bi bi-google"></i>
              <span>Google Account</span>
            </button>
            <button
              type="button"
              className="social-btn social-btn-github"
              onClick={() => handleOAuthDemo("github")}
              disabled={loading}
            >
              <i className="bi bi-github"></i>
              <span>GitHub Account</span>
            </button>
          </div>
        </div>

        {/* Footer Guest Link */}
        <div className="auth-footer-guest">
          <button
            type="button"
            className="auth-guest-link"
            data-testid="explore-guest-btn"
            onClick={onContinueAsGuest}
          >
            <span>Explore Classifier Console as Guest</span>
            <i className="bi bi-arrow-right"></i>
          </button>
        </div>
      </div>
    </div>
  );
}
