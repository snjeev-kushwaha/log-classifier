import { useState, useEffect } from "react";
import LogInput from "./components/LogInput.jsx";
import ClassificationResult from "./components/ClassificationResult.jsx";
import AuthModal from "./components/AuthModal.jsx";
import UserPlatform from "./components/UserPlatform.jsx";
import AdminControlCenter from "./components/AdminControlCenter.jsx";
import { classifyLog, submitFeedback, fetchCurrentUser, logoutUser } from "./api/classificationApi.js";

export default function App() {
  const [result, setResult] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [apiError, setApiError] = useState("");

  // Auth state
  const [token, setToken] = useState(localStorage.getItem("access_token") || "");
  const [user, setUser] = useState(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [activeView, setActiveView] = useState("classifier"); // 'classifier' | 'user' | 'admin'

  useEffect(() => {
    // Check for OAuth tokens or errors passed in URL query parameters
    const params = new URLSearchParams(window.location.search);
    const oauthToken = params.get("oauth_token");
    const oauthRefreshToken = params.get("refresh_token");
    const oauthError = params.get("oauth_error");

    if (oauthToken && oauthRefreshToken) {
      handleAuthSuccess({
        access_token: oauthToken,
        refresh_token: oauthRefreshToken,
      });
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (oauthError) {
      setApiError(`OAuth sign-in failed: ${oauthError}`);
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  useEffect(() => {
    if (token) {
      fetchCurrentUser(token)
        .then((userData) => setUser(userData))
        .catch(() => {
          handleLogout();
        });
    }
  }, [token]);

  function handleAuthSuccess(loginData) {
    const accessToken = loginData.access_token;
    localStorage.setItem("access_token", accessToken);
    localStorage.setItem("refresh_token", loginData.refresh_token);
    setToken(accessToken);
  }

  function handleLogout() {
    const refreshToken = localStorage.getItem("refresh_token");
    if (refreshToken) {
      logoutUser(refreshToken);
    }
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    setToken("");
    setUser(null);
    setActiveView("classifier");
  }

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
      {/* Top Header Bar */}
      <header style={headerStyle}>
        <div>
          <h1 style={{ margin: 0, fontSize: "1.5rem" }}>Hybrid log classifier</h1>
          <p style={{ margin: "4px 0 0", color: "#666", fontSize: "0.85rem" }}>
            Regex + BERT/LogisticRegression + Groq LLM hybrid system
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          {user ? (
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span style={{ fontSize: "0.9rem", color: "#333" }}>
                <strong>{user.full_name || user.email}</strong>{" "}
                <span style={roleBadgeStyle(user.role)}>{user.role.toUpperCase()}</span>
              </span>
              <button onClick={handleLogout} style={secondaryBtnStyle}>
                Logout
              </button>
            </div>
          ) : (
            <button onClick={() => setIsAuthModalOpen(true)} style={primaryBtnStyle}>
              Sign In / Register
            </button>
          )}
        </div>
      </header>

      {/* Main Navigation Tabs */}
      {user && (
        <nav style={navBarStyle}>
          <button
            onClick={() => setActiveView("classifier")}
            style={activeView === "classifier" ? activeNavTab : inactiveNavTab}
          >
            ⚡ Classifier Console
          </button>
          <button
            onClick={() => setActiveView("user")}
            style={activeView === "user" ? activeNavTab : inactiveNavTab}
          >
            📊 My Platform (History & API Keys)
          </button>
          {user.role === "admin" && (
            <button
              onClick={() => setActiveView("admin")}
              style={activeView === "admin" ? activeNavTab : inactiveNavTab}
            >
              ⚙️ Admin Control Center
            </button>
          )}
        </nav>
      )}

      {/* View: Classifier Console */}
      {activeView === "classifier" && (
        <main>
          <LogInput onSubmit={handleClassify} isLoading={isLoading} />
          {apiError && (
            <div className="card" data-testid="api-error">
              <p className="error-text">{apiError}</p>
            </div>
          )}
          <ClassificationResult result={result} onCorrect={handleCorrect} />
        </main>
      )}

      {/* View: User Platform */}
      {activeView === "user" && user && (
        <UserPlatform token={token} />
      )}

      {/* View: Admin Control Center */}
      {activeView === "admin" && user && user.role === "admin" && (
        <AdminControlCenter token={token} />
      )}

      {/* Auth Modal */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        onAuthSuccess={handleAuthSuccess}
      />
    </div>
  );
}

const headerStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  borderBottom: "1px solid #e0e0e0",
  paddingBottom: "16px",
  marginBottom: "16px",
};

const navBarStyle = {
  display: "flex",
  gap: "8px",
  borderBottom: "2px solid #e0e0e0",
  marginBottom: "20px",
};

const activeNavTab = {
  padding: "10px 16px",
  border: "none",
  borderBottom: "3px solid #1976d2",
  background: "none",
  fontWeight: "600",
  color: "#1976d2",
  cursor: "pointer",
  fontSize: "0.95rem",
};

const inactiveNavTab = {
  padding: "10px 16px",
  border: "none",
  background: "none",
  color: "#666",
  cursor: "pointer",
  fontSize: "0.95rem",
};

const primaryBtnStyle = {
  padding: "8px 16px",
  background: "#1976d2",
  color: "#fff",
  border: "none",
  borderRadius: "6px",
  fontWeight: "600",
  cursor: "pointer",
};

const secondaryBtnStyle = {
  padding: "6px 12px",
  background: "#f5f5f5",
  color: "#333",
  border: "1px solid #ccc",
  borderRadius: "6px",
  cursor: "pointer",
  fontSize: "0.85rem",
};

function roleBadgeStyle(role) {
  return {
    fontSize: "0.75rem",
    background: role === "admin" ? "#e8eaf6" : "#f5f5f5",
    color: role === "admin" ? "#283593" : "#616161",
    padding: "2px 6px",
    borderRadius: "10px",
    fontWeight: "600",
    marginLeft: "4px",
  };
}
