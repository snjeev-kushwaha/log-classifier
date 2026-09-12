import { useState } from "react";
import { loginUser, signupUser } from "../api/classificationApi.js";

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

  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <h2 style={{ margin: 0, fontSize: "1.25rem" }}>{isSignup ? "Create Account" : "Sign In"}</h2>
          <button onClick={onClose} style={closeBtnStyle} aria-label="Close">✕</button>
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
            <label style={labelStyle}>Email Address</label>
            <input
              type="email"
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

const overlayStyle = {
  position: "fixed",
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: "rgba(0, 0, 0, 0.5)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1000,
};

const modalStyle = {
  backgroundColor: "#fff",
  borderRadius: "8px",
  padding: "24px",
  width: "100%",
  maxWidth: "400px",
  boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
};

const closeBtnStyle = {
  background: "none",
  border: "none",
  fontSize: "1.2rem",
  cursor: "pointer",
  color: "#666",
};

const labelStyle = {
  display: "block",
  fontSize: "0.85rem",
  fontWeight: "600",
  marginBottom: "4px",
  color: "#333",
};

const inputStyle = {
  width: "100%",
  padding: "8px 12px",
  borderRadius: "6px",
  border: "1px solid #ccc",
  boxSizing: "border-box",
  fontSize: "0.95rem",
};

const activeTabStyle = {
  flex: 1,
  padding: "8px",
  border: "none",
  borderBottom: "2px solid #1976d2",
  backgroundColor: "transparent",
  fontWeight: "600",
  color: "#1976d2",
  cursor: "pointer",
};

const inactiveTabStyle = {
  flex: 1,
  padding: "8px",
  border: "none",
  borderBottom: "2px solid #eee",
  backgroundColor: "transparent",
  color: "#777",
  cursor: "pointer",
};

const submitBtnStyle = {
  width: "100%",
  padding: "10px",
  backgroundColor: "#1976d2",
  color: "#fff",
  border: "none",
  borderRadius: "6px",
  fontWeight: "600",
  fontSize: "1rem",
  cursor: "pointer",
};
