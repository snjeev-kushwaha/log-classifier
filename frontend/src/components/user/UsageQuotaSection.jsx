export default function UsageQuotaSection({ quota }) {
  if (!quota) return null;

  const percentageUsed = Math.min(100, Math.round((quota.today_count / (quota.daily_limit || 1)) * 100));

  return (
    <div className="card">
      <h3 style={{ margin: "0 0 8px" }}>Daily Classification Quota</h3>
      <p style={{ color: "#64748b", fontSize: "0.88rem", margin: "0 0 16px" }}>
        Every account has a daily quota reset at 00:00 UTC. Upgraded plans receive exponentially higher capacity.
      </p>

      <div className="stat-grid" style={{ marginBottom: "20px" }}>
        <div className="stat-card-modern">
          <div style={{ fontSize: "0.82rem", color: "#64748b", fontWeight: "600" }}>Classifications Today</div>
          <div style={{ fontSize: "1.8rem", fontWeight: "700", color: "#0284c7", marginTop: "4px" }}>
            {quota.today_count.toLocaleString()}
          </div>
        </div>
        <div className="stat-card-modern">
          <div style={{ fontSize: "0.82rem", color: "#64748b", fontWeight: "600" }}>Daily Limit</div>
          <div style={{ fontSize: "1.8rem", fontWeight: "700", color: "#0f172a", marginTop: "4px" }}>
            {quota.daily_limit.toLocaleString()}
          </div>
        </div>
        <div className="stat-card-modern">
          <div style={{ fontSize: "0.82rem", color: "#64748b", fontWeight: "600" }}>Remaining Capacity</div>
          <div style={{ fontSize: "1.8rem", fontWeight: "700", color: quota.remaining > 0 ? "#16a34a" : "#dc2626", marginTop: "4px" }}>
            {quota.remaining.toLocaleString()}
          </div>
        </div>
      </div>

      <div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.82rem", fontWeight: "600", color: "#475569" }}>
          <span>Quota Consumption</span>
          <span>{percentageUsed}% Used</span>
        </div>
        <div className="quota-meter-bar">
          <div className="quota-meter-fill" style={{ width: `${percentageUsed}%` }}></div>
        </div>
      </div>
    </div>
  );
}
