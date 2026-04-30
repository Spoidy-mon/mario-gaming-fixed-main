import React, { useState } from "react";
import { updatePS5 } from "../firebaseService";
import { toast } from "react-toastify";

const STATUS_OPTIONS = [
  { value: "available", label: "✅ Available",  cls: "ps5-available" },
  { value: "in_use",    label: "🎮 In Use",     cls: "ps5-inuse" },
  { value: "booked",    label: "📅 Booked",     cls: "ps5-booked" },
  { value: "offline",   label: "⛔ Offline",    cls: "ps5-offline" },
];

export default function PS5Panel({ ps5 }) {
  const [status,   setStatus]   = useState(ps5?.status || "available");
  const [customer, setCustomer] = useState(ps5?.customer_name || "");
  const [alert,    setAlert]    = useState(ps5?.alert || "");
  const [saving,   setSaving]   = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updatePS5({ status, customer_name: customer, alert });
      toast.success("PS5 status updated!");
    } catch (e) { toast.error("Failed to update PS5"); }
    setSaving(false);
  };

  const current = STATUS_OPTIONS.find(s => s.value === (ps5?.status || "available"));

  return (
    <div className="ps5-panel">
      <div className="ps5-header">
        <div className="ps5-icon-wrap">
          <span className="ps5-icon">🎮</span>
          <span className="ps5-label">PlayStation 5</span>
        </div>
        <span className={`ps5-status-badge ${current?.cls || ""}`}>{current?.label}</span>
      </div>

      {ps5?.alert && (
        <div className="ps5-alert-banner">🔔 {ps5.alert}</div>
      )}

      {ps5?.customer_name && (
        <div className="ps5-customer">👤 {ps5.customer_name}</div>
      )}

      <div className="ps5-controls">
        <div className="ps5-status-grid">
          {STATUS_OPTIONS.map(opt => (
            <button key={opt.value}
              className={`btn ps5-btn ${status === opt.value ? "selected" : ""} ${opt.cls}`}
              onClick={() => setStatus(opt.value)}>
              {opt.label}
            </button>
          ))}
        </div>
        <input className="input-name" placeholder="Customer name (if in use / booked)"
          value={customer} onChange={e => setCustomer(e.target.value)} />
        <input className="input-name" placeholder="🔔 Alert message (optional)"
          value={alert} onChange={e => setAlert(e.target.value)} />
        <button className="btn btn-start" onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Update PS5 Status"}
        </button>
      </div>
    </div>
  );
}
