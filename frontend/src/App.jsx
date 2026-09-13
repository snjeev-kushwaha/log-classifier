import { useState, useEffect } from "react";
import LogInput from "./components/LogInput.jsx";
import ClassificationResult from "./components/ClassificationResult.jsx";
import UserPlatform from "./components/UserPlatform.jsx";
import AdminControlCenter from "./components/AdminControlCenter.jsx";
import AuthPage from "./components/auth/AuthPage.jsx";
import Sidebar from "./components/layout/Sidebar.jsx";
import Topbar from "./components/layout/Topbar.jsx";
import {
  classifyLog,
  submitFeedback,
  fetchCurrentUser,
  logoutUser,
  fetchNotifications,
  markAllNotificationsRead,
} from "./api/classificationApi.js";

export default function App({ defaultGuest }) {
  const isTestEnv = typeof import.meta !== "undefined" && import.meta.env && import.meta.env.MODE === "test";
  const [token, setToken] = useState(() => localStorage.getItem("access_token") || "");
  const [user, setUser] = useState(null);
  const [guestMode, setGuestMode] = useState(() => {
    if (defaultGuest !== undefined) return defaultGuest;
    return isTestEnv;
  });

  const [activeView, setActiveView] = useState("classifier"); // "classifier" | "user" | "admin"
  const [adminSection, setAdminSection] = useState("telemetry");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Classification state
  const [result, setResult] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [apiError, setApiError] = useState("");
  const [apiSuccess, setApiSuccess] = useState("");

  // Notifications
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (token) {
      loadProfileAndNotifications(token);
    } else {
      setUser(null);
    }
  }, [token]);

  async function loadProfileAndNotifications(activeToken) {
    try {
      const profile = await fetchCurrentUser(activeToken);
      setUser(profile);
      if (profile.role === "admin" && activeView === "admin") {
        // preserve admin
      }
    } catch {
      handleLogout();
      return;
    }

    try {
      const notifData = await fetchNotifications(activeToken);
      setNotifications(notifData.items || []);
      setUnreadCount(notifData.unread_count || 0);
    } catch {
      // Best-effort notifications
    }
  }

  async function handleAuthSuccess(tokenData) {
    const accessToken = tokenData.access_token;
    localStorage.setItem("access_token", accessToken);
    if (tokenData.refresh_token) {
      localStorage.setItem("refresh_token", tokenData.refresh_token);
    }
    setToken(accessToken);
    setGuestMode(false);
    setApiSuccess("Successfully authenticated! Welcome to the platform.");

    try {
      const profile = await fetchCurrentUser(accessToken);
      setUser(profile);

      // RBAC-based landing navigation
      if (profile.role === "admin") {
        setActiveView("admin");
        setAdminSection("telemetry");
      } else {
        setActiveView("classifier");
      }
    } catch {
      setActiveView("classifier");
    }
  }

  async function handleLogout() {
    try {
      const refreshToken = localStorage.getItem("refresh_token");
      if (refreshToken) await logoutUser(refreshToken);
    } catch {
      // Best-effort logout
    } finally {
      setToken("");
      setUser(null);
      localStorage.removeItem("access_token");
      localStorage.removeItem("refresh_token");
      setGuestMode(false);
      setActiveView("classifier");
      setMobileSidebarOpen(false);
      setResult(null);
    }
  }

  async function handleClassify(text) {
    setIsLoading(true);
    setApiError("");
    setResult(null);

    try {
      const data = await classifyLog(text, token);
      setResult(data);
    } catch (err) {
      setApiError(err.message || "Classification failed. Check backend connectivity.");
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

  async function handleMarkNotificationsRead() {
    if (!token) return;
    try {
      await markAllNotificationsRead(token);
      setUnreadCount(0);
    } catch {
      // Ignore
    }
  }

  // 1. Default Login & Register View when unauthenticated
  if (!token && !guestMode) {
    return (
      <AuthPage
        onAuthSuccess={handleAuthSuccess}
        onContinueAsGuest={() => setGuestMode(true)}
      />
    );
  }

  // 2. Guest Mode: Classifier input only, NO sidebar, with back button to login/signup screen
  if (!token && guestMode) {
    return (
      <div className="guest-classifier-layout" data-testid="guest-classifier-layout">
        <main className="guest-main-content">
          <div className="guest-container">
            {/* Header Hero Section */}
            <div className="guest-hero-section">
              <div className="guest-hero-badge">
                <i className="bi bi-cpu-fill"></i>
                <span>Multi-Model Classification Console</span>
              </div>
              <h1 className="guest-hero-title">Real-Time Log Classifier</h1>
              <p className="guest-hero-desc">
                Analyze and categorize raw infrastructure, security, and application logs in real time using our hybrid Regex, BERT ML, and Groq LLM triage engine.
              </p>
            </div>

            <div className="app">
              <LogInput onSubmit={handleClassify} isLoading={isLoading} />
              {apiError && (
                <div className="card api-error-card" data-testid="api-error">
                  <div className="api-error-content">
                    <i className="bi bi-exclamation-octagon-fill"></i>
                    <div>
                      <strong>Classification Error</strong>
                      <p className="error-text">{apiError}</p>
                    </div>
                  </div>
                </div>
              )}
              <ClassificationResult result={result} onCorrect={handleCorrect} />

              {/* Upgrade / Account Prompt - Same width as log message box */}
              <div className="guest-cta-banner">
                <div className="guest-cta-left">
                  <i className="bi bi-stars"></i>
                  <div>
                    <strong>Unlock Full Enterprise Platform</strong>
                    <p>Create an account or sign in to access bulk classification, API keys, regex rules engine, and system telemetry.</p>
                  </div>
                </div>
                <button
                  type="button"
                  className="guest-cta-btn"
                  onClick={() => {
                    setGuestMode(false);
                    setResult(null);
                    setApiError("");
                  }}
                >
                  Sign In / Register →
                </button>
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // 3. Authenticated Platform & Workspace View
  return (
    <div className="chatgpt-layout">
      <Sidebar
        sidebarCollapsed={sidebarCollapsed}
        setSidebarCollapsed={setSidebarCollapsed}
        mobileSidebarOpen={mobileSidebarOpen}
        setMobileSidebarOpen={setMobileSidebarOpen}
        activeView={activeView}
        setActiveView={setActiveView}
        adminSection={adminSection}
        setAdminSection={setAdminSection}
        user={user}
        onLogout={handleLogout}
        onNewClassification={() => {
          setActiveView("classifier");
          setResult(null);
        }}
        onOpenAuth={() => setGuestMode(false)}
      />

      <div className="chatgpt-main">
        <Topbar
          activeView={activeView}
          adminSection={adminSection}
          user={user}
          mobileSidebarOpen={mobileSidebarOpen}
          setMobileSidebarOpen={setMobileSidebarOpen}
          notifications={notifications}
          unreadCount={unreadCount}
          onMarkNotificationsRead={handleMarkNotificationsRead}
          onLogout={handleLogout}
          onOpenAuth={() => setGuestMode(false)}
        />

        {/* Verification Alert Banner */}
        {user && !user.is_verified && (
          <div style={{
            background: "#fffbeb",
            color: "#92400e",
            borderBottom: "1px solid #fef3c7",
            padding: "10px 24px",
            fontSize: "0.85rem",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
              <i className="bi bi-exclamation-triangle-fill"></i>
              <strong>Your email is not verified yet.</strong> Please verify to unlock complete account security.
            </span>
            <button
              onClick={() => setActiveView("user")}
              style={{ border: "none", background: "none", color: "#856404", textDecoration: "underline", cursor: "pointer", fontWeight: "600", fontSize: "0.85rem" }}
            >
              Go to Verification Settings →
            </button>
          </div>
        )}

        {apiSuccess && (
          <div style={{ background: "#f0fdf4", color: "#166534", border: "1px solid #bbf7d0", padding: "10px 18px", margin: "16px 24px 0", borderRadius: "8px", fontSize: "0.9rem", display: "flex", alignItems: "center", gap: "8px" }}>
            <i className="bi bi-check-circle-fill"></i> {apiSuccess}
          </div>
        )}

        {/* Main View Area */}
        <main className="chatgpt-content-scroll">
          {activeView === "classifier" && (
            <div className="app">
              <LogInput onSubmit={handleClassify} isLoading={isLoading} />
              {apiError && (
                <div className="card" data-testid="api-error">
                  <p className="error-text">{apiError}</p>
                </div>
              )}
              <ClassificationResult result={result} onCorrect={handleCorrect} />
            </div>
          )}

          {activeView === "user" && user && (
            <div className="dashboard-container">
              <UserPlatform token={token} onAccountDeleted={handleLogout} />
            </div>
          )}

          {activeView === "admin" && user && user.role === "admin" && (
            <div className="dashboard-container">
              <AdminControlCenter
                token={token}
                activeSection={adminSection}
                onSectionChange={setAdminSection}
              />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
