export default function UserManagementSection({
  users,
  newUserName,
  setNewUserName,
  newUserEmail,
  setNewUserEmail,
  newUserPassword,
  setNewUserPassword,
  newUserRole,
  setNewUserRole,
  userMsg,
  onCreateUser,
  onToggleUserRole,
  onToggleUserActive,
  onDeleteUser,
}) {
  return (
    <div>
      <div className="card">
        <h4 style={{ margin: "0 0 6px 0", display: "flex", alignItems: "center", gap: "8px" }}>
          <i className="bi bi-person-plus-fill" style={{ color: "#0284c7" }}></i>
          Create New User
        </h4>
        <p style={{ color: "#64748b", fontSize: "0.85rem", margin: "0 0 14px 0" }}>
          Manually provision accounts directly into the database with specific roles.
        </p>

        {userMsg && (
          <div style={{
            padding: "10px 14px",
            background: "#f0fdf4",
            color: "#166534",
            border: "1px solid #bbf7d0",
            borderRadius: "6px",
            marginBottom: "14px",
            fontSize: "0.88rem",
            display: "flex",
            alignItems: "center",
            gap: "8px"
          }}>
            <i className="bi bi-check-circle-fill"></i> {userMsg}
          </div>
        )}

        <form onSubmit={onCreateUser} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px", alignItems: "end" }}>
          <div>
            <label style={{ display: "block", fontSize: "0.82rem", fontWeight: "600", marginBottom: "4px", color: "#334155" }}>
              Full Name
            </label>
            <input
              type="text"
              placeholder="e.g. Alice Doe"
              value={newUserName}
              onChange={(e) => setNewUserName(e.target.value)}
              style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid #cbd5e1" }}
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: "0.82rem", fontWeight: "600", marginBottom: "4px", color: "#334155" }}>
              Email Address *
            </label>
            <input
              type="email"
              required
              placeholder="user@example.com"
              value={newUserEmail}
              onChange={(e) => setNewUserEmail(e.target.value)}
              style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid #cbd5e1" }}
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: "0.82rem", fontWeight: "600", marginBottom: "4px", color: "#334155" }}>
              Password *
            </label>
            <input
              type="password"
              required
              minLength={6}
              placeholder="Min 6 characters"
              value={newUserPassword}
              onChange={(e) => setNewUserPassword(e.target.value)}
              style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid #cbd5e1" }}
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: "0.82rem", fontWeight: "600", marginBottom: "4px", color: "#334155" }}>
              Role
            </label>
            <select
              value={newUserRole}
              onChange={(e) => setNewUserRole(e.target.value)}
              style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid #cbd5e1", height: "36px" }}
            >
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
          </div>

          <div>
            <button
              type="submit"
              style={{
                padding: "8px 18px",
                background: "#0284c7",
                color: "#fff",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
                fontWeight: "600",
                height: "36px",
                whiteSpace: "nowrap",
                width: "100%"
              }}
            >
              <i className="bi bi-plus-lg"></i> Add User
            </button>
          </div>
        </form>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
        <i className="bi bi-people-fill" style={{ color: "#0284c7" }}></i>
        <h4 style={{ margin: 0 }}>System Users ({users.length})</h4>
      </div>

      <div className="responsive-table-wrapper">
        <table className="admin-table">
          <thead>
            <tr>
              <th>User</th>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th>Joined</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td><strong>{u.full_name || "Unnamed"}</strong></td>
                <td>{u.email}</td>
                <td>
                  <span style={{
                    padding: "3px 10px",
                    borderRadius: "999px",
                    fontSize: "0.78rem",
                    background: u.role === "admin" ? "#e0e7ff" : "#f1f5f9",
                    color: u.role === "admin" ? "#3730a3" : "#475569",
                    fontWeight: "600"
                  }}>
                    {u.role.toUpperCase()}
                  </span>
                </td>
                <td>
                  <span style={{
                    color: u.is_active ? "#16a34a" : "#dc2626",
                    fontWeight: "600",
                    fontSize: "0.85rem",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px"
                  }}>
                    <i className={u.is_active ? "bi bi-check-circle" : "bi bi-slash-circle"}></i>
                    {u.is_active ? "Active" : "Deactivated"}
                  </span>
                </td>
                <td>{new Date(u.created_at).toLocaleDateString()}</td>
                <td>
                  <button
                    onClick={() => onToggleUserRole(u)}
                    style={{
                      marginRight: "8px",
                      padding: "5px 10px",
                      fontSize: "0.8rem",
                      cursor: "pointer",
                      border: "1px solid #0284c7",
                      background: "#fff",
                      color: "#0284c7",
                      borderRadius: "6px"
                    }}
                  >
                    <i className="bi bi-person-badge"></i> Set as {u.role === "admin" ? "User" : "Admin"}
                  </button>
                  <button
                    onClick={() => onToggleUserActive(u)}
                    style={{
                      marginRight: "8px",
                      padding: "5px 10px",
                      fontSize: "0.8rem",
                      cursor: "pointer",
                      border: "1px solid #d97706",
                      background: "#fff",
                      color: "#d97706",
                      borderRadius: "6px"
                    }}
                  >
                    <i className={u.is_active ? "bi bi-toggle-on" : "bi bi-toggle-off"}></i> {u.is_active ? "Deactivate" : "Activate"}
                  </button>
                  <button
                    onClick={() => onDeleteUser(u)}
                    style={{
                      padding: "5px 10px",
                      fontSize: "0.8rem",
                      cursor: "pointer",
                      border: "1px solid #ef4444",
                      background: "#fef2f2",
                      color: "#dc2626",
                      borderRadius: "6px"
                    }}
                    title="Permanently delete user"
                  >
                    <i className="bi bi-trash3-fill"></i> Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
