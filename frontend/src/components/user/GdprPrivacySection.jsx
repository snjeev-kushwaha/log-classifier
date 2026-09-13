export default function GdprPrivacySection({
  onResendVerification,
  onExportData,
  showDeleteModal,
  setShowDeleteModal,
  deletePassword,
  setDeletePassword,
  deleteConfirmation,
  setDeleteConfirmation,
  onDeleteAccount,
}) {
  return (
    <div>
      <div className="card">
        <h3 style={{ margin: "0 0 8px" }}>Email Verification</h3>
        <p style={{ color: "#64748b", fontSize: "0.85rem", margin: "0 0 12px" }}>
          Verifying your email confirms account ownership and enables critical security notifications.
        </p>
        <button
          onClick={onResendVerification}
          style={{ padding: "8px 16px", background: "#f8fafc", color: "#334155", border: "1px solid #cbd5e1", borderRadius: "6px", cursor: "pointer", fontWeight: "600" }}
        >
          <i className="bi bi-envelope-check-fill"></i> Send Email Verification Link
        </button>
      </div>

      <div className="card">
        <h3 style={{ margin: "0 0 8px" }}>GDPR Data Portability</h3>
        <p style={{ color: "#64748b", fontSize: "0.85rem", margin: "0 0 12px" }}>
          Download a complete JSON export of your personal information, classification history, API keys metadata, and usage stats.
        </p>
        <button
          onClick={onExportData}
          style={{ padding: "8px 16px", background: "#f8fafc", color: "#334155", border: "1px solid #cbd5e1", borderRadius: "6px", cursor: "pointer", fontWeight: "600" }}
        >
          <i className="bi bi-download"></i> Export My Personal Data (JSON)
        </button>
      </div>

      <div className="card" style={{ border: "1px solid #fecaca", background: "#fffbfa" }}>
        <h3 style={{ margin: "0 0 8px", color: "#dc2626" }}>Danger Zone: Delete Account</h3>
        <p style={{ color: "#64748b", fontSize: "0.85rem", margin: "0 0 12px" }}>
          Permanently remove your account, revoke all sessions and API keys, and anonymize past classification logs. This action is irreversible.
        </p>

        {!showDeleteModal ? (
          <button
            onClick={() => setShowDeleteModal(true)}
            style={{ padding: "8px 16px", background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca", borderRadius: "6px", cursor: "pointer", fontWeight: "600" }}
          >
            <i className="bi bi-exclamation-triangle-fill"></i> Delete My Account
          </button>
        ) : (
          <form onSubmit={onDeleteAccount} style={{ background: "#ffebee", padding: "16px", borderRadius: "6px", border: "1px solid #ef9a9a" }}>
            <p style={{ margin: "0 0 8px", fontSize: "0.85rem", fontWeight: "600", color: "#c62828" }}>
              To confirm permanent deletion, enter your password and type <code>DELETE MY ACCOUNT</code> below:
            </p>
            <input
              type="password"
              placeholder="Your current password"
              value={deletePassword}
              onChange={(e) => setDeletePassword(e.target.value)}
              style={{ width: "100%", padding: "8px 12px", marginBottom: "8px", border: "1px solid #cbd5e1", borderRadius: "6px" }}
            />
            <input
              type="text"
              placeholder="Type DELETE MY ACCOUNT"
              value={deleteConfirmation}
              onChange={(e) => setDeleteConfirmation(e.target.value)}
              style={{ width: "100%", padding: "8px 12px", marginBottom: "8px", border: "1px solid #cbd5e1", borderRadius: "6px" }}
            />
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                type="submit"
                style={{ padding: "8px 16px", background: "#dc2626", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: "600" }}
              >
                Confirm Permanent Deletion
              </button>
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                style={{ padding: "8px 16px", background: "#fff", color: "#475569", border: "1px solid #cbd5e1", borderRadius: "6px", cursor: "pointer" }}
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
