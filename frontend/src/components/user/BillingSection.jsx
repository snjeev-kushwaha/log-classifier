export default function BillingSection({
  subscription,
  plans,
  billingLoading,
  onUpgrade,
  onCancelSubscription,
}) {
  return (
    <div>
      {subscription && (
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
            <div>
              <h3 style={{ margin: 0 }}>Current Subscription</h3>
              <div style={{ marginTop: "4px", fontSize: "0.9rem", color: "#64748b" }}>
                Active Plan: <strong style={{ color: "#0284c7", textTransform: "uppercase" }}>{subscription.plan_tier}</strong>
                {" "}| Daily Quota: <strong>{subscription.daily_quota.toLocaleString()} logs/day</strong>
              </div>
            </div>
            {subscription.plan_tier !== "free" && (
              <button
                onClick={onCancelSubscription}
                disabled={billingLoading}
                style={{ padding: "6px 14px", background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca", borderRadius: "6px", cursor: "pointer", fontSize: "0.85rem", fontWeight: "600" }}
              >
                Cancel Subscription
              </button>
            )}
          </div>
        </div>
      )}

      <div className="plans-grid">
        {plans.map((p) => {
          const isCurrent = subscription && subscription.plan_tier === p.tier;
          return (
            <div key={p.tier} className={`plan-card ${isCurrent ? "current-plan" : ""}`}>
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <h3 style={{ margin: 0 }}>{p.name}</h3>
                  {isCurrent && (
                    <span style={{ background: "#e0f2fe", color: "#0284c7", padding: "2px 8px", borderRadius: "10px", fontSize: "0.72rem", fontWeight: "bold" }}>
                      CURRENT
                    </span>
                  )}
                </div>
                <div style={{ fontSize: "1.8rem", fontWeight: "700", color: "#0f172a", margin: "12px 0 4px" }}>
                  ${p.price_usd} <span style={{ fontSize: "0.9rem", color: "#64748b", fontWeight: "normal" }}>/ month</span>
                </div>
                <div style={{ color: "#0284c7", fontWeight: "600", fontSize: "0.9rem", marginBottom: "12px" }}>
                  {p.daily_quota.toLocaleString()} classifications / day
                </div>
                <ul style={{ paddingLeft: "20px", color: "#475569", fontSize: "0.85rem", lineHeight: "1.6", margin: "0 0 16px" }}>
                  {p.features.map((f, i) => (
                    <li key={i}>{f}</li>
                  ))}
                </ul>
              </div>

              {p.tier !== "free" && !isCurrent && (
                <button
                  onClick={() => onUpgrade(p.tier)}
                  disabled={billingLoading}
                  style={{
                    width: "100%",
                    padding: "10px",
                    background: "#0284c7",
                    color: "#fff",
                    border: "none",
                    borderRadius: "8px",
                    fontWeight: "600",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "6px"
                  }}
                >
                  <i className="bi bi-arrow-up-circle"></i> Upgrade to {p.name}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
