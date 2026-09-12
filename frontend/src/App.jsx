import { useState, useEffect } from "react";
import LogInput from "./components/LogInput.jsx";
import ClassificationResult from "./components/ClassificationResult.jsx";
import AuthModal from "./components/AuthModal.jsx";
import UserPlatform from "./components/UserPlatform.jsx";
import AdminControlCenter from "./components/AdminControlCenter.jsx";
import {
  classifyLog,
  submitFeedback,
  fetchCurrentUser,
  logoutUser,
  fetchNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  confirmEmailVerification,
} from "./api/classificationApi.js";

export default function App() {
  const [result, setResult] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [apiError, setApiError] = useState("");
  const [apiSuccess, setApiSuccess] = useState("");

  // Auth state
  const [token, setToken] = useState(localStorage.getItem("access_token") || "");
  const [user, setUser] = useState(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [activeView, setActiveView] = useState("classifier"); // 'classifier' | 'user' | 'admin'

  // Notification state
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifDropdown, setShowNotifDropdown] = useState(false);

  useEffect(() => {
    // Check for tokens, verification, or errors passed in URL query parameters
    const params = new URLSearchParams(window.location.search);
    const oauthToken = params.get("oauth_token");
    const oauthRefreshToken = params.get("refresh_token");
    const oauthError = params.get("oauth_error");
    const verifyToken = params.get("verify_token");

    if (oauthToken && oauthRefreshToken) {
      handleAuthSuccess({
        access_token: oauthToken,
        refresh_token: oauthRefreshToken,
      });
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (oauthError) {
      setApiError(`OAuth sign-in failed: ${oauthError}`);
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (verifyToken) {
      confirmEmailVerification(verifyToken)
        .then(() => {
          setApiSuccess("Your email address has been verified successfully!");
          if (token) {
            fetchCurrentUser(token).then((u) => setUser(u)).catch(() => {});
          }
        })
        .catch((err) => {
          setApiError(err.message || "Failed to verify email.");
        });
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  useEffect(() => {
    if (token) {
      fetchCurrentUser(token)
        .then((userData) => {
          setUser(userData);
          loadNotifications();
        })
        .catch(() => {
          handleLogout();
        });
    }
  }, [token]);

  async function loadNotifications() {
    if (!token) return;
    try {
      const data = await fetchNotifications(token);
      setNotifications(data.items || []);
      setUnreadCount(data.unread_count || 0);
    } catch {
      // Background fetch silent catch
    }
  }

  async function handleMarkSingleRead(notifId) {
    try {
      await markNotificationRead(token, notifId);
      loadNotifications();
    } catch (err) {
      console.error(err);
    }
  }

  async function handleMarkAllRead() {
    try {
      await markAllNotificationsRead(token);
      loadNotifications();
    } catch (err) {
      console.error(err);
    }
  }

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
    setNotifications([]);
    setUnreadCount(0);
    setActiveView("classifier");
  }

  async function handleClassify(text) {
    setIsLoading(true);
    setApiError("");
    setResult(null);
    try {
      const response = await classifyLog(text);
      setResult(response);
      loadNotifications();
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
              {/* Notification Bell */}
              <div style={{ position: "relative" }}>
                <button
                  onClick={() => {
                    setShowNotifDropdown(!showNotifDropdown);
                    if (!showNotifDropdown) loadNotifications();
                  }}
                  style={iconBtnStyle}
                  title="Notifications"
                >
                  🔔
                  {unreadCount > 0 && (
                    <span style={unreadBadgeStyle}>{unreadCount}</span>
                  )}
                </button>

                {showNotifDropdown && (
                  <div style={notifDropdownStyle}>
                    <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #eee", paddingBottom: "8px", marginBottom: "8px" }}>
                      <strong style={{ fontSize: "0.9rem" }}>Notifications</strong>
                      {unreadCount > 0 && (
                        <button onClick={handleMarkAllRead} style={{ border: "none", background: "none", color: "#1976d2", cursor: "pointer", fontSize: "0.75rem", fontWeight: "600" }}>
                          Mark all read
                        </button>
                      )}
                    </div>
                    {notifications.length === 0 ? (
                      <p style={{ color: "#777", fontSize: "0.85rem", margin: "12px 0" }}>No notifications yet.</p>
                    ) : (
                      <div style={{ maxHeight: "250px", overflowY: "auto" }}>
                        {notifications.map((n) => (
                          <div key={n.id} style={{ padding: "8px 0", borderBottom: "1px solid #f0f0f0", opacity: n.is_read ? 0.65 : 1 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                              <strong style={{ fontSize: "0.85rem", color: "#333" }}>{n.title}</strong>
                              {!n.is_read && (
                                <button onClick={() => handleMarkSingleRead(n.id)} style={{ border: "none", background: "none", color: "#1976d2", fontSize: "0.75rem", cursor: "pointer" }}>
                                  Mark read
                                </button>
                              )}
                            </div>
                            <p style={{ margin: "4px 0 0", fontSize: "0.8rem", color: "#666" }}>{n.message}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

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

      {/* Email Verification Banner */}
      {user && !user.is_verified && (
        <div style={verificationBannerStyle}>
          <span>⚠️ <strong>Your email is not verified yet.</strong> Please verify to unlock complete account security.</span>
          <button
            onClick={() => setActiveView("user")}
            style={{ border: "none", background: "none", color: "#856404", textDecoration: "underline", cursor: "pointer", fontWeight: "600", fontSize: "0.85rem" }}
          >
            Go to Verification Settings →
          </button>
        </div>
      )}

      {apiSuccess && (
        <div style={{ background: "#e8f5e9", color: "#2e7d32", padding: "10px 16px", borderRadius: "6px", marginBottom: "16px", fontSize: "0.9rem" }}>
          {apiSuccess}
        </div>
      )}

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
            📊 My Platform (Plans & GDPR)
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
        <UserPlatform token={token} onAccountDeleted={handleLogout} />
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

const iconBtnStyle = {
  background: "#f5f5f5",
  border: "1px solid #ddd",
  borderRadius: "50%",
  width: "36px",
  height: "36px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  position: "relative",
};

const unreadBadgeStyle = {
  position: "absolute",
  top: "-4px",
  right: "-4px",
  background: "#d32f2f",
  color: "#fff",
  fontSize: "0.7rem",
  fontWeight: "700",
  borderRadius: "10px",
  padding: "1px 5px",
  minWidth: "14px",
  textAlign: "center",
};

const notifDropdownStyle = {
  position: "absolute",
  right: 0,
  top: "42px",
  width: "300px",
  background: "#fff",
  border: "1px solid #ddd",
  borderRadius: "8px",
  boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
  padding: "12px",
  zIndex: 1000,
};

const verificationBannerStyle = {
  background: "#fff3cd",
  color: "#856404",
  border: "1px solid #ffeeba",
  padding: "10px 16px",
  borderRadius: "6px",
  marginBottom: "16px",
  fontSize: "0.85rem",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  flexWrap: "wrap",
  gap: "8px",
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
