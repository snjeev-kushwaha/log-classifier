export default function Sidebar({
  sidebarCollapsed,
  setSidebarCollapsed,
  mobileSidebarOpen,
  setMobileSidebarOpen,
  activeView,
  setActiveView,
  adminSection,
  setAdminSection,
  user,
  onLogout,
  onNewClassification,
  onOpenAuth,
}) {
  return (
    <>
      {/* Mobile Drawer Backdrop */}
      <div
        className={`sidebar-backdrop ${mobileSidebarOpen ? "active" : ""}`}
        onClick={() => setMobileSidebarOpen(false)}
      />

      {/* ChatGPT-Style Sidebar Navigation */}
      <aside className={`chatgpt-sidebar ${sidebarCollapsed ? "collapsed" : ""} ${mobileSidebarOpen ? "mobile-open" : ""}`}>
        {/* Sidebar Header */}
        <div className="sidebar-header">
          {!sidebarCollapsed && (
            <div className="sidebar-brand">
              <i className="bi bi-shield-check sidebar-brand-icon"></i>
              <span>Log Classifier</span>
            </div>
          )}
          <button
            className="sidebar-toggle-btn"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <i className={sidebarCollapsed ? "bi bi-layout-sidebar" : "bi bi-layout-sidebar-inset"}></i>
          </button>
        </div>

        {/* Quick Action: New Classification */}
        <div style={{ padding: "10px 10px 6px 10px" }}>
          <button
            onClick={() => {
              if (onNewClassification) onNewClassification();
              setMobileSidebarOpen(false);
            }}
            className="new-chat-btn"
            title="New Classification"
          >
            <i className="bi bi-plus-lg"></i>
            {!sidebarCollapsed && <span>New Classification</span>}
          </button>
        </div>

        {/* Scrollable Navigation Menu */}
        <div className="sidebar-nav-scroll">
          {!sidebarCollapsed && (
            <div className="sidebar-section-header">
              <span className="sidebar-section-title">Workspace</span>
            </div>
          )}

          <button
            onClick={() => {
              setActiveView("classifier");
              setMobileSidebarOpen(false);
            }}
            className={`sidebar-item ${activeView === "classifier" ? "active" : ""}`}
            title="Classifier Console"
          >
            <i className="bi bi-terminal-split"></i>
            {!sidebarCollapsed && <span>Classifier Console</span>}
          </button>

          {user && (
            <button
              onClick={() => {
                setActiveView("user");
                setMobileSidebarOpen(false);
              }}
              className={`sidebar-item ${activeView === "user" ? "active" : ""}`}
              title="My Platform"
            >
              <i className="bi bi-person-workspace"></i>
              {!sidebarCollapsed && <span>My Platform (Plans & GDPR)</span>}
            </button>
          )}

          {/* Admin Section */}
          {user && user.role === "admin" && (
            <div style={{ marginTop: "16px" }}>
              {!sidebarCollapsed && (
                <div className="sidebar-section-header">
                  <span className="sidebar-section-title">Control Center</span>
                  <span className="sidebar-badge sidebar-badge-admin">ADMIN</span>
                </div>
              )}

              <button
                onClick={() => {
                  setActiveView("admin");
                  setAdminSection("telemetry");
                  setMobileSidebarOpen(false);
                }}
                className={`sidebar-item ${activeView === "admin" && adminSection === "telemetry" ? "active" : ""}`}
                title="System Telemetry"
              >
                <i className="bi bi-speedometer2"></i>
                {!sidebarCollapsed && <span>System Telemetry</span>}
              </button>

              <button
                onClick={() => {
                  setActiveView("admin");
                  setAdminSection("users");
                  setMobileSidebarOpen(false);
                }}
                className={`sidebar-item ${activeView === "admin" && adminSection === "users" ? "active" : ""}`}
                title="User Management"
              >
                <i className="bi bi-people-fill"></i>
                {!sidebarCollapsed && <span>User Management</span>}
              </button>

              <button
                onClick={() => {
                  setActiveView("admin");
                  setAdminSection("rules");
                  setMobileSidebarOpen(false);
                }}
                className={`sidebar-item ${activeView === "admin" && adminSection === "rules" ? "active" : ""}`}
                title="Regex Rules Engine"
              >
                <i className="bi bi-code-slash"></i>
                {!sidebarCollapsed && <span>Regex Rules Engine</span>}
              </button>

              <button
                onClick={() => {
                  setActiveView("admin");
                  setAdminSection("audit");
                  setMobileSidebarOpen(false);
                }}
                className={`sidebar-item ${activeView === "admin" && adminSection === "audit" ? "active" : ""}`}
                title="Audit Trail"
              >
                <i className="bi bi-journal-text"></i>
                {!sidebarCollapsed && <span>Audit Trail</span>}
              </button>

              <button
                onClick={() => {
                  setActiveView("admin");
                  setAdminSection("infrastructure");
                  setMobileSidebarOpen(false);
                }}
                className={`sidebar-item ${activeView === "admin" && adminSection === "infrastructure" ? "active" : ""}`}
                title="Secrets & Database"
              >
                <i className="bi bi-database-lock"></i>
                {!sidebarCollapsed && <span>Secrets & Database</span>}
              </button>

              <button
                onClick={() => {
                  setActiveView("admin");
                  setAdminSection("observability");
                  setMobileSidebarOpen(false);
                }}
                className={`sidebar-item ${activeView === "admin" && adminSection === "observability" ? "active" : ""}`}
                title="Observability & Metrics"
              >
                <i className="bi bi-activity"></i>
                {!sidebarCollapsed && <span>Observability & Metrics</span>}
              </button>
            </div>
          )}
        </div>

        {/* Sidebar Footer / User Profile or Guest Action */}
        <div className="sidebar-footer">
          {user ? (
            <div className="sidebar-user-card">
              <div className="user-avatar-circle" title={user.full_name || user.email}>
                {(user.full_name || user.email)[0].toUpperCase()}
              </div>
              {!sidebarCollapsed && (
                <div className="sidebar-user-details">
                  <div className="sidebar-user-name">{user.full_name || user.email}</div>
                  <div className="sidebar-user-role">{user.role}</div>
                </div>
              )}
              {!sidebarCollapsed && (
                <button
                  className="sidebar-logout-btn"
                  onClick={onLogout}
                  title="Sign out"
                >
                  <i className="bi bi-box-arrow-right"></i>
                </button>
              )}
            </div>
          ) : (
            <button
              onClick={onOpenAuth}
              className="new-chat-btn"
              style={{ background: "#0284c7", borderColor: "#0284c7" }}
              title="Sign In / Register"
            >
              <i className="bi bi-box-arrow-in-right" style={{ color: "#ffffff" }}></i>
              {!sidebarCollapsed && <span>Sign In / Register</span>}
            </button>
          )}
        </div>
      </aside>
    </>
  );
}
