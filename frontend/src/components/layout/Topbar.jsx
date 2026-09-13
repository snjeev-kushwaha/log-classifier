import { useState } from "react";

export default function Topbar({
  activeView,
  adminSection,
  user,
  mobileSidebarOpen,
  setMobileSidebarOpen,
  notifications = [],
  unreadCount = 0,
  onMarkNotificationsRead,
  onLogout,
  onOpenAuth,
}) {
  const [showNotifDropdown, setShowNotifDropdown] = useState(false);

  function getBreadcrumb() {
    if (activeView === "admin") {
      const sectionTitles = {
        telemetry: "System Telemetry",
        users: "User Management",
        rules: "Regex Rules Engine",
        audit: "Audit Trail",
        infrastructure: "Secrets & Database",
        observability: "Observability & Metrics",
      };
      return (
        <div className="topbar-breadcrumb">
          <i className="bi bi-sliders2-vertical"></i>
          <span>Admin Control Center</span>
          <span className="topbar-sub">/ {sectionTitles[adminSection] || "Overview"}</span>
        </div>
      );
    }
    if (activeView === "user") {
      return (
        <div className="topbar-breadcrumb">
          <i className="bi bi-person-workspace"></i>
          <span>My Platform</span>
          <span className="topbar-sub">/ Plans & Privacy</span>
        </div>
      );
    }
    return (
      <div className="topbar-breadcrumb">
        <i className="bi bi-terminal-split"></i>
        <span>Classifier Console</span>
      </div>
    );
  }

  return (
    <header className="chatgpt-topbar">
      <div className="topbar-left">
        <button
          className="mobile-hamburger-btn"
          onClick={() => setMobileSidebarOpen(!mobileSidebarOpen)}
          title="Toggle mobile menu"
        >
          <i className="bi bi-list"></i>
        </button>
        {getBreadcrumb()}
      </div>

      <div className="topbar-right">
        {user ? (
          <>
            {/* Notification Bell */}
            <div style={{ position: "relative" }}>
              <button
                className="topbar-icon-btn"
                onClick={() => {
                  setShowNotifDropdown(!showNotifDropdown);
                  if (!showNotifDropdown && unreadCount > 0 && onMarkNotificationsRead) {
                    onMarkNotificationsRead();
                  }
                }}
                title="Notifications"
              >
                <i className="bi bi-bell"></i>
                {unreadCount > 0 && <span className="notif-badge">{unreadCount}</span>}
              </button>

              {showNotifDropdown && (
                <div className="notif-dropdown">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px", borderBottom: "1px solid #e2e8f0", paddingBottom: "6px" }}>
                    <strong style={{ fontSize: "0.88rem" }}>Notifications</strong>
                    <span style={{ fontSize: "0.75rem", color: "#64748b" }}>{notifications.length} total</span>
                  </div>
                  {notifications.length === 0 ? (
                    <div style={{ padding: "12px 0", textAlign: "center", color: "#94a3b8", fontSize: "0.85rem" }}>
                      No notifications yet
                    </div>
                  ) : (
                    <div style={{ maxHeight: "240px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "6px" }}>
                      {notifications.map((n) => (
                        <div
                          key={n.id}
                          style={{
                            padding: "8px 10px",
                            borderRadius: "6px",
                            background: n.is_read ? "#f8fafc" : "#eff6ff",
                            fontSize: "0.82rem",
                            border: n.is_read ? "1px solid #f1f5f9" : "1px solid #bfdbfe",
                          }}
                        >
                          <div style={{ fontWeight: "600", color: "#1e293b" }}>{n.title}</div>
                          <div style={{ color: "#64748b", marginTop: "2px" }}>{n.message}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* User Chip */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "0.88rem", fontWeight: "600", color: "#1e293b" }}>
                {user.full_name || user.email}
              </span>
              <span style={{
                fontSize: "0.72rem",
                background: user.role === "admin" ? "#e0e7ff" : "#f1f5f9",
                color: user.role === "admin" ? "#3730a3" : "#475569",
                padding: "2px 8px",
                borderRadius: "10px",
                fontWeight: "600",
                textTransform: "uppercase",
              }}>
                {user.role}
              </span>
            </div>
          </>
        ) : (
          <button
            onClick={onOpenAuth}
            style={{
              padding: "7px 14px",
              background: "#0284c7",
              color: "#fff",
              border: "none",
              borderRadius: "6px",
              fontWeight: "600",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              fontSize: "0.85rem",
            }}
          >
            <i className="bi bi-box-arrow-in-right"></i> Sign In / Register
          </button>
        )}
      </div>
    </header>
  );
}
