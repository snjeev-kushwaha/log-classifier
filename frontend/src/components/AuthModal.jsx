import { useState } from "react";
import { loginUser, oauthTokenLogin, signupUser } from "../api/classificationApi.js";
import { overlayStyle, modalStyle, closeBtnStyle, activeTabStyle, labelStyle, inactiveTabStyle, inputStyle, submitBtnStyle, oauthBtnStyle, githubBtnStyle, demoLinkStyle } from './authStyle.jsx'
export default function AuthModal({ isOpen, onClose, onAuthSuccess }) {
  const [isSignup, setIsSignup] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (isSignup) {
        await signupUser({ email, password, fullName });
        // Automatically login after signup
        const loginData = await loginUser({ email, password });
        onAuthSuccess(loginData);
      } else {
        const loginData = await loginUser({ email, password });
        onAuthSuccess(loginData);
      }
      onClose();
    } catch (err) {
      setError(err.message || "Authentication failed.");
    } finally {
      setLoading(false);
    }
  }

  function handleOAuthRedirect(provider) {
    window.location.href = `/api/v1/auth/oauth/${provider}/authorize`;
  }

  async function handleDemoOAuthLogin(provider) {
    setError("");
    setLoading(true);
    try {
      const demoEmail = provider === "google" ? "google.user@example.com" : "github.developer@example.com";
      const demoName = provider === "google" ? "Google User" : "GitHub Developer";
      const demoSub = provider === "google" ? "google-demo-user-12345" : "github-demo-user-67890";
      const tokens = await oauthTokenLogin({
        provider,
        subject_id: demoSub,
        email: demoEmail,
        fullName: demoName,
      });
      onAuthSuccess(tokens);
      onClose();
    } catch (err) {
      setError(err.message || `${provider} login failed.`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <h2 style={{ margin: 0, fontSize: "1.25rem" }}>{isSignup ? "Create Account" : "Sign In"}</h2>
          <button onClick={onClose} style={closeBtnStyle} aria-label="Close">✕</button>
        </div>

        {/* OAuth Social Login Buttons */}
        <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "16px" }}>
          <button
            type="button"
            onClick={() => handleOAuthRedirect("google")}
            disabled={loading}
            style={oauthBtnStyle}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" style={{ marginRight: "10px" }}>
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
            </svg>
            Continue with Google
          </button>

          <button
            type="button"
            onClick={() => handleOAuthRedirect("github")}
            disabled={loading}
            style={githubBtnStyle}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="#ffffff" style={{ marginRight: "10px" }}>
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
            </svg>
            Continue with GitHub
          </button>
        </div>

        {/* Demo OAuth shortcuts for quick evaluation without external credentials */}
        <div style={{ textAlign: "center", marginBottom: "14px" }}>
          <span style={{ fontSize: "0.78rem", color: "#666" }}>
            Dev Mode:{" "}
            <button
              type="button"
              onClick={() => handleDemoOAuthLogin("google")}
              style={demoLinkStyle}
            >
              Demo Google Sign-in
            </button>
            {" | "}
            <button
              type="button"
              onClick={() => handleDemoOAuthLogin("github")}
              style={demoLinkStyle}
            >
              Demo GitHub Sign-in
            </button>
          </span>
        </div>

        {/* Divider */}
        <div style={{ display: "flex", alignItems: "center", marginBottom: "16px" }}>
          <div style={{ flex: 1, height: "1px", backgroundColor: "#e0e0e0" }} />
          <span style={{ padding: "0 10px", fontSize: "0.75rem", color: "#888", textTransform: "uppercase" }}>
            or with email
          </span>
          <div style={{ flex: 1, height: "1px", backgroundColor: "#e0e0e0" }} />
        </div>

        <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
          <button
            type="button"
            style={isSignup ? inactiveTabStyle : activeTabStyle}
            onClick={() => { setIsSignup(false); setError(""); }}
          >
            Sign In
          </button>
          <button
            type="button"
            style={isSignup ? activeTabStyle : inactiveTabStyle}
            onClick={() => { setIsSignup(true); setError(""); }}
          >
            Sign Up
          </button>
        </div>

        {error && <p style={{ color: "#d32f2f", fontSize: "0.875rem", marginBottom: "12px" }}>{error}</p>}

        <form onSubmit={handleSubmit}>
          {isSignup && (
            <div style={{ marginBottom: "12px" }}>
              <label style={labelStyle}>Full Name (optional)</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                style={inputStyle}
                placeholder="Jane Doe"
              />
            </div>
          )}

          <div style={{ marginBottom: "12px" }}>
            <label style={labelStyle}>{isSignup ? "Email Address" : "Email Address or Username"}</label>
            <input
              type={isSignup ? "email" : "text"}
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={inputStyle}
              placeholder="user@example.com"
            />
          </div>

          <div style={{ marginBottom: "16px" }}>
            <label style={labelStyle}>Password</label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={inputStyle}
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{ ...submitBtnStyle, opacity: loading ? 0.7 : 1 }}
          >
            {loading ? "Processing..." : isSignup ? "Sign Up" : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}
