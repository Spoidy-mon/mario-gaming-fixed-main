import React, { useState, useEffect } from "react";
import {
  saveSettings,
  addPC, deletePC, updatePCConfig, setPCOnlineStatus,
  addPS5, deletePS5, updatePS5Config, setPS5OnlineStatus,
  resetAllPCSessions, resetAllPS5Sessions,
  clearPayments, clearSales, clearPendingDues,
  clearSessionHistory,
  resetCashLedger, clearAllTransactionalData,
} from "../firebaseService";
import { resetCanteen } from "../firebaseInit";
import { toast } from "react-toastify";

const DEFAULT_SETTINGS = {
  shutdownDelay: 30,
  warningAt: 300,
  cafeeName: "Mario Gaming Café",
  cafeeUpiId: "",
  cafeeUpiName: "",
  pricing: { 30: 15, 60: 30, 90: 45, 120: 60 },
  ps5Pricing: { 30: 60, 60: 120, 90: 180, 120: 240 },
  extraTimePricing: { 15: 25, 30: 50, 60: 100 },
  ps5ExtraTimePricing: { 15: 40, 30: 80, 60: 160 },
  freeOption1: 5,
  freeOption2: 10,
  electricityRate: 8,
  adminPassword: "1234",
};

function Section({ icon, title, subtitle, children, accent, danger }) {
  return (
    <div
      className="st-section"
      style={{
        borderTopColor: danger ? "var(--red)" : accent || "var(--accent)",
      }}
    >
      <div className="st-section-hdr">
        <div
          className="st-section-icon"
          style={accent ? { background: `${accent}22`, color: accent } : {}}
        >
          {icon}
        </div>
        <div>
          <h3 className="st-section-title">{title}</h3>
          {subtitle && <p className="st-section-sub">{subtitle}</p>}
        </div>
      </div>
      <div className="st-section-body">{children}</div>
    </div>
  );
}

function Field({ label, hint, children }) {
  return (
    <div className="st-field">
      <div className="st-field-left">
        <label className="st-field-label">{label}</label>
        {hint && <span className="st-field-hint">{hint}</span>}
      </div>
      <div className="st-field-right">{children}</div>
    </div>
  );
}

function TxtIn({ value, onChange, placeholder, type = "text", style }) {
  return (
    <input
      className="st-text-input"
      type={type}
      value={value ?? ""}
      placeholder={placeholder}
      style={style}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function NumIn({ value, onChange, min = 0, max, step = 1, prefix = "₹", width = 90 }) {
  return (
    <div className="st-num-wrap" style={{ width }}>
      {prefix && <span className="st-num-prefix">{prefix}</span>}
      <input
        className="st-num-input"
        type="number"
        min={min}
        max={max}
        step={step}
        value={value ?? ""}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
      />
    </div>
  );
}

function SliderField({ label, value, min, max, step = 1, format, marks, onChange }) {
  const display = format ? format(value) : value;
  return (
    <div className="st-slider-field">
      <div className="st-slider-header">
        <label className="st-field-label">{label}</label>
        <span className="st-slider-value">{display}</span>
      </div>
      <input
        type="range"
        className="st-slider"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {marks && (
        <div className="st-slider-marks">
          {marks.map((m) => (
            <span key={m}>{format ? format(m) : m}</span>
          ))}
        </div>
      )}
    </div>
  );
}

function PricingCard({ color, durations, extraOptions, rpmLabel }) {
  return (
    <div className="st-pricing-card" style={{ "--pc": color || "var(--accent)" }}>
      <div>
        <div className="st-pricing-group-label">Session Pricing</div>
        {durations.map(({ dur, value, onChange }) => (
          <div key={dur} className="st-pricing-row">
            <span className="st-pricing-dur">{dur < 60 ? `${dur}m` : `${dur / 60}h`}</span>
            <div className="st-pricing-bar-wrap">
              <div
                className="st-pricing-bar"
                style={{ width: `${Math.min(100, value / 3)}%` }}
              />
            </div>
            <NumIn value={value} onChange={onChange} width={90} />
          </div>
        ))}
      </div>

      <div>
        <div className="st-pricing-group-label" style={{ color: "var(--yellow)" }}>
          Extra Time
        </div>
        {extraOptions.map(({ dur, value, onChange }) => (
          <div key={dur} className="st-pricing-row">
            <span className="st-pricing-dur" style={{ color: "var(--yellow)" }}>
              +{dur}m
            </span>
            <div className="st-pricing-bar-wrap">
              <div
                className="st-pricing-bar"
                style={{
                  width: `${Math.min(100, value / 2)}%`,
                  background: "var(--yellow)",
                }}
              />
            </div>
            <NumIn value={value} onChange={onChange} width={90} />
          </div>
        ))}
        {rpmLabel && <div className="st-pricing-rpm">{rpmLabel}</div>}
      </div>
    </div>
  );
}

function DeviceEditModal({ device, type, onSave, onClose }) {
  const isPC = type === "pc";
  const [name, setName] = useState(device.name || "");
  const [notes, setNotes] = useState(device.notes || "");
  const [specs, setSpecs] = useState(device.specs || "");
  const [seat, setSeat] = useState(device.seat || "");
  const [hdmi, setHdmi] = useState(device.hdmi || "");
  const [busy, setBusy] = useState(false);

  const handle = async () => {
    if (!name.trim()) return toast.error("Name is required");
    setBusy(true);
    try {
      await onSave({ name, notes, specs, seat, hdmi });
      toast.success(`✅ ${device.name} updated`);
      onClose();
    } catch (e) {
      toast.error(e.message);
    }
    setBusy(false);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>
            {isPC ? "🖥" : "🎮"} Edit — {device.name}
          </h3>
          <button className="modal-close-btn" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body">
          <div className="modal-section">
            <div className="modal-section-title">🏷 Display Name</div>
            <input
              className="input-name player-name-big"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={isPC ? "PC-01" : "PS5 #1"}
              autoFocus
            />
          </div>

          <div className="modal-section">
            <div className="modal-section-title">📋 Location & Notes</div>
            <div className="detail-fields-grid">
              <div>
                <label className="settings-label">Seat / Position</label>
                <input
                  className="input-name"
                  value={seat}
                  onChange={(e) => setSeat(e.target.value)}
                  placeholder="e.g. Row A, Seat 2"
                />
              </div>
              {isPC ? (
                <div>
                  <label className="settings-label">PC Specs</label>
                  <input
                    className="input-name"
                    value={specs}
                    onChange={(e) => setSpecs(e.target.value)}
                    placeholder="e.g. i5, 16GB, RTX 3060"
                  />
                </div>
              ) : (
                <div>
                  <label className="settings-label">HDMI / TV Number</label>
                  <input
                    className="input-name"
                    value={hdmi}
                    onChange={(e) => setHdmi(e.target.value)}
                    placeholder="e.g. TV-3"
                  />
                </div>
              )}
            </div>
            <div style={{ marginTop: 8 }}>
              <label className="settings-label">Notes</label>
              <input
                className="input-name"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any notes about this device…"
              />
            </div>
          </div>

          <div className="form-actions">
            <button className="btn btn-start" style={{ flex: 2 }} onClick={handle} disabled={busy}>
              {busy ? "Saving…" : "💾 Save Changes"}
            </button>
            <button className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function DeviceCard({ device, type, onEdit, onDelete, onToggleOnline }) {
  const isPC = type === "pc";
  const isActive = device.status === "active";
  const isOnline = device.status === "online";
  const isOffline = device.status === "offline";

  const statusColor = isActive
    ? "var(--green)"
    : isOnline
    ? "var(--blue)"
    : "var(--text-muted)";
  const statusLabel = isActive ? "Active" : isOnline ? "Idle" : "Offline";

  return (
    <div className={`dv-card ${isActive ? "dv-active" : ""} ${type === "ps5" ? "dv-ps5" : ""}`}>
      <div
        className="dv-topbar"
        style={{
          background: isActive
            ? "var(--green)"
            : isOnline
            ? "var(--blue)"
            : "var(--border)",
        }}
      />

      <div className="dv-header">
        <div className="dv-title-row">
          <span className="dv-icon">{isPC ? "🖥" : "🎮"}</span>
          <span className="dv-name">{device.name}</span>
          <span className="dv-status-dot" style={{ background: statusColor }} />
          <span className="dv-status-label" style={{ color: statusColor }}>
            {statusLabel}
          </span>
        </div>
        <div className="dv-id">ID: {device.id || device.slot}</div>
      </div>

      {isActive && device.customer_name && (
        <div className="dv-session-info">
          <span className="dv-session-player">👤 {device.customer_name}</span>
          {device.time_remaining > 0 && (
            <span className="dv-session-time">
              ⏱ {Math.floor(device.time_remaining / 60)}m left
            </span>
          )}
        </div>
      )}

      <div className="dv-meta">
        {device.seat && <span className="dv-meta-chip">📍 {device.seat}</span>}
        {isPC && device.specs && <span className="dv-meta-chip">💻 {device.specs}</span>}
        {!isPC && device.hdmi && <span className="dv-meta-chip">📺 {device.hdmi}</span>}
        {device.notes && <span className="dv-meta-chip">📝 {device.notes}</span>}
      </div>

      <div className="dv-actions">
        <button className="dv-btn dv-btn-edit" onClick={() => onEdit(device)}>
          ✎ Edit
        </button>
        <button
          className={`dv-btn ${isOffline ? "dv-btn-online" : "dv-btn-offline"}`}
          onClick={() => onToggleOnline(device.id || device.slot, !isOffline)}
          disabled={isActive}
        >
          {isOffline ? "⬆ Bring Online" : "⬇ Set Offline"}
        </button>
        <button
          className="dv-btn dv-btn-delete"
          onClick={() => onDelete(device)}
          disabled={isActive}
          title={isActive ? "Cannot delete while session is active" : "Delete device"}
        >
          🗑
        </button>
      </div>
    </div>
  );
}

function AddDeviceModal({ type, existingIds, onClose, onAdded }) {
  const isPC = type === "pc";
  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [seat, setSeat] = useState("");
  const [specs, setSpecs] = useState("");
  const [busy, setBusy] = useState(false);

  const suggestName = (rawId) => {
    const n = Number(rawId);
    if (!n) return;
    const suggested = isPC ? `PC-0${String(n).padStart(2, "0")}` : `PS5 #${n}`;
    setName((prev) => (prev ? prev : suggested));
  };

  const handle = async () => {
    if (!id) return toast.error("ID is required");
    if (isPC && (!Number(id) || Number(id) < 1 || Number(id) > 50)) {
      return toast.error("PC ID must be 1–50");
    }
    if (!name.trim()) return toast.error("Name is required");
    if (existingIds.includes(isPC ? Number(id) : `ps5_${id}`)) {
      return toast.error(`${isPC ? "PC" : "PS5"} with this ID already exists`);
    }

    setBusy(true);
    try {
      if (isPC) {
        await addPC(Number(id), name.trim());
        if (seat || specs) {
          await updatePCConfig(Number(id), { name: name.trim(), seat, specs });
        }
      } else {
        await addPS5(`ps5_${id}`, name.trim());
        if (seat) {
          await updatePS5Config(`ps5_${id}`, { name: name.trim(), seat });
        }
      }
      toast.success(`✅ ${name.trim()} added`);
      onAdded();
      onClose();
    } catch (e) {
      toast.error(e.message);
    }
    setBusy(false);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{isPC ? "🖥 Add New PC" : "🎮 Add New PS5"}</h3>
          <button className="modal-close-btn" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body">
          <div className="modal-section">
            <div className="modal-section-title">🔢 Device ID</div>
            <input
              className="input-name"
              type="number"
              min="1"
              max="50"
              placeholder={isPC ? "e.g. 7" : "e.g. 3"}
              value={id}
              onChange={(e) => {
                setId(e.target.value);
                suggestName(e.target.value);
              }}
              autoFocus
            />
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
              {isPC ? "Unique number for this PC (1–50)" : "Slot number (1–10)"}
            </div>
          </div>

          <div className="modal-section">
            <div className="modal-section-title">🏷 Display Name</div>
            <input
              className="input-name player-name-big"
              placeholder={isPC ? "PC-07" : "PS5 #3"}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handle()}
            />
          </div>

          <div className="modal-section">
            <div className="modal-section-title">📋 Optional Details</div>
            <div className="detail-fields-grid">
              <div>
                <label className="settings-label">Seat / Position</label>
                <input
                  className="input-name"
                  placeholder="e.g. Row B, Seat 1"
                  value={seat}
                  onChange={(e) => setSeat(e.target.value)}
                />
              </div>
              {isPC && (
                <div>
                  <label className="settings-label">PC Specs</label>
                  <input
                    className="input-name"
                    placeholder="e.g. i7, RTX 4060"
                    value={specs}
                    onChange={(e) => setSpecs(e.target.value)}
                  />
                </div>
              )}
            </div>
          </div>

          <div className="form-actions">
            <button className="btn btn-start" style={{ flex: 2 }} onClick={handle} disabled={busy}>
              {busy ? "Adding…" : `✅ Add ${isPC ? "PC" : "PS5"}`}
            </button>
            <button className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const DEFAULT_PCS = [
  { id: 1, name: "PC-01" },
  { id: 2, name: "PC-02" },
  { id: 3, name: "PC-03" },
  { id: 4, name: "PC-04" },
  { id: 5, name: "PC-05" },
  { id: 6, name: "PC-06" },
];

const DEFAULT_PS5S = [
  { slot: "ps5_1", name: "PS5 #1" },
  { slot: "ps5_2", name: "PS5 #2" },
  { slot: "ps5_3", name: "PS5 #3" },
  { slot: "ps5_4", name: "PS5 #4" },
  { slot: "ps5_5", name: "PS5 #5" },
];

function DeviceManager({ pcs = [], ps5Sessions = [] }) {
  const [tab, setTab] = useState("pc");
  const [editDev, setEditDev] = useState(null);
  const [addModal, setAddModal] = useState(null);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [initBusy, setInitBusy] = useState(false);

  const isPC = tab === "pc";
  const devices = isPC ? pcs : ps5Sessions;
  const filtered = search.trim()
    ? devices.filter(
        (d) =>
          (d.name || "").toLowerCase().includes(search.toLowerCase()) ||
          String(d.id || d.slot || "").includes(search)
      )
    : devices;

  const pcActive = pcs.filter((d) => d.status === "active").length;
  const pcOnline = pcs.filter((d) => d.status === "online").length;
  const ps5Active = ps5Sessions.filter((d) => d.status === "active").length;
  const ps5Online = ps5Sessions.filter((d) => d.status === "online").length;

  const handleDelete = async (device) => {
    const label = isPC ? `PC "${device.name}"` : `PS5 "${device.name}"`;
    if (
      !window.confirm(
        `Delete ${label}?\n\nAll data for this device will be removed. This cannot be undone.`
      )
    ) {
      return;
    }

    setBusy(true);
    try {
      if (isPC) {
        await deletePC(device.id);
      } else {
        await deletePS5(device.id || device.slot);
      }
      toast.success(`🗑 ${label} deleted`);
    } catch (e) {
      toast.error(e.message);
    }
    setBusy(false);
  };

  const handleToggleOnline = async (id, online) => {
    try {
      if (isPC) {
        await setPCOnlineStatus(id, online);
      } else {
        await setPS5OnlineStatus(id, online);
      }
      toast.info(`${online ? "⬆ Online" : "⬇ Offline"}`);
    } catch (e) {
      toast.error(e.message);
    }
  };

  const handleEditSave = async (device, config) => {
    if (isPC) {
      await updatePCConfig(device.id, config);
    } else {
      await updatePS5Config(device.id || device.slot, config);
    }
  };

  const handleInitDefaults = async () => {
    if (
      !window.confirm(
        "This will add the default 6 PCs (PC-01 → PC-06) and 5 PS5s (PS5 #1 → PS5 #5).\n" +
          "Devices that already exist will be skipped.\n\nContinue?"
      )
    ) {
      return;
    }

    setInitBusy(true);
    let added = 0;
    let skipped = 0;

    try {
      const existingPcIds = pcs.map((p) => p.id);
      const existingPs5Ids = ps5Sessions.map((p) => p.id || p.slot);

      for (const { id, name } of DEFAULT_PCS) {
        if (existingPcIds.includes(id)) {
          skipped++;
          continue;
        }
        await addPC(id, name);
        added++;
      }

      for (const { slot, name } of DEFAULT_PS5S) {
        if (existingPs5Ids.includes(slot)) {
          skipped++;
          continue;
        }
        await addPS5(slot, name);
        added++;
      }

      toast.success(
        `✅ Initialized ${added} device(s)${
          skipped ? `, ${skipped} already existed` : ""
        }`
      );
    } catch (e) {
      toast.error("Init failed: " + e.message);
    }

    setInitBusy(false);
  };

  return (
    <div className="dv-manager">
      {editDev && (
        <DeviceEditModal
          device={editDev}
          type={tab}
          onSave={(config) => handleEditSave(editDev, config)}
          onClose={() => setEditDev(null)}
        />
      )}

      {addModal && (
        <AddDeviceModal
          type={addModal}
          existingIds={addModal === "pc" ? pcs.map((p) => p.id) : ps5Sessions.map((p) => p.id || p.slot)}
          onAdded={() => {}}
          onClose={() => setAddModal(null)}
        />
      )}

      <div className="dv-summary">
        <div className="dv-sum-card" style={{ borderColor: "rgba(59,130,246,.3)" }}>
          <span className="dv-sum-num">{pcs.length}</span>
          <span className="dv-sum-label">PCs Total</span>
        </div>
        <div className="dv-sum-card" style={{ borderColor: "rgba(16,185,129,.3)" }}>
          <span className="dv-sum-num" style={{ color: "var(--green)" }}>
            {pcActive}
          </span>
          <span className="dv-sum-label">PC Active</span>
        </div>
        <div className="dv-sum-card" style={{ borderColor: "rgba(59,130,246,.3)" }}>
          <span className="dv-sum-num" style={{ color: "var(--blue)" }}>
            {pcOnline}
          </span>
          <span className="dv-sum-label">PC Idle</span>
        </div>
        <div className="dv-sum-card" style={{ borderColor: "rgba(139,92,246,.3)" }}>
          <span className="dv-sum-num">{ps5Sessions.length}</span>
          <span className="dv-sum-label">PS5s Total</span>
        </div>
        <div className="dv-sum-card" style={{ borderColor: "rgba(139,92,246,.4)" }}>
          <span className="dv-sum-num" style={{ color: "#8b5cf6" }}>
            {ps5Active}
          </span>
          <span className="dv-sum-label">PS5 Active</span>
        </div>
        <div className="dv-sum-card" style={{ borderColor: "rgba(139,92,246,.2)" }}>
          <span className="dv-sum-num" style={{ color: "#a78bfa" }}>
            {ps5Online}
          </span>
          <span className="dv-sum-label">PS5 Idle</span>
        </div>
      </div>

      <div className="dv-toolbar">
        <div className="dv-tabs">
          {[["pc", "🖥 PCs", pcs.length], ["ps5", "🎮 PS5s", ps5Sessions.length]].map(
            ([v, l, cnt]) => (
              <button
                key={v}
                className={`dv-tab ${tab === v ? "active" : ""}`}
                onClick={() => {
                  setTab(v);
                  setSearch("");
                }}
              >
                {l}
                <span className="dv-tab-count">{cnt}</span>
              </button>
            )
          )}
        </div>

        <input
          className="dv-search"
          placeholder="Search…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        {(pcs.length + ps5Sessions.length) < 11 && (
          <button
            className="dv-add-btn"
            style={{
              background: "rgba(139,92,246,.15)",
              borderColor: "rgba(139,92,246,.4)",
              color: "#a78bfa",
              marginRight: 6,
            }}
            onClick={handleInitDefaults}
            disabled={initBusy}
            title="Add default 6 PCs + 5 PS5s in one click"
          >
            {initBusy ? "⏳ Initializing…" : "⚡ Init Defaults (6PC+5PS5)"}
          </button>
        )}

        <button className="dv-add-btn" onClick={() => setAddModal(isPC ? "pc" : "ps5")}>
          + Add {isPC ? "PC" : "PS5"}
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="dv-empty">
          {search
            ? `No ${isPC ? "PCs" : "PS5s"} match "${search}"`
            : `No ${isPC ? "PCs" : "PS5s"} configured yet`}

          {!search && (
            <button
              className="dv-add-btn"
              style={{ marginTop: 12 }}
              onClick={() => setAddModal(isPC ? "pc" : "ps5")}
            >
              + Add your first {isPC ? "PC" : "PS5"}
            </button>
          )}
        </div>
      ) : (
        <div className="dv-grid">
          {filtered.map((device) => (
            <DeviceCard
              key={device.id || device.slot}
              device={device}
              type={tab}
              onEdit={setEditDev}
              onDelete={handleDelete}
              onToggleOnline={handleToggleOnline}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function DataManagement() {
  const [busy, setBusy] = useState(null);
  const [openCash, setOpenCash] = useState("");
  const [openBank, setOpenBank] = useState("");
  const [nukeWord, setNukeWord] = useState("");
  const [showNuke, setShowNuke] = useState(false);

  const run = async (key, fn, msg) => {
    setBusy(key);
    try {
      await fn();
      toast.success(msg);
    } catch (e) {
      toast.error(e.message);
    }
    setBusy(null);
  };

  const resets = [
    { key: "sessions", icon: "🖥", label: "Reset PC Sessions", desc: "Clear active PC sessions", fn: resetAllPCSessions },
    { key: "ps5sess", icon: "🎮", label: "Reset PS5 Sessions", desc: "Clear active PS5 sessions", fn: resetAllPS5Sessions },
    { key: "payments", icon: "💳", label: "Clear Payments", desc: "Delete payment records", fn: clearPayments },
    { key: "sales", icon: "🛒", label: "Clear Canteen Sales", desc: "Delete canteen sale records", fn: clearSales },
    { key: "dues", icon: "💸", label: "Clear Pending Dues", desc: "Delete all pending dues", fn: clearPendingDues },
    { key: "history", icon: "📋", label: "Clear Session History", desc: "Delete session history log", fn: clearSessionHistory },
    { key: "canteen", icon: "📦", label: "Reset Canteen Stock", desc: "Reset all quantities to 0", fn: resetCanteen },
  ];

  return (
    <div className="st-dataman">
      <div className="st-dataman-ledger">
        <div className="st-dataman-ledger-title">💰 Set Opening Balances</div>
        <div className="st-dataman-ledger-row">
          <div className="st-dataman-bal-field">
            <label className="st-field-label">💵 Counter Cash</label>
            <div className="st-num-wrap" style={{ width: "100%" }}>
              <span className="st-num-prefix">₹</span>
              <input
                className="st-num-input"
                type="number"
                min="0"
                placeholder="0"
                value={openCash}
                onChange={(e) => setOpenCash(e.target.value)}
                style={{ flex: 1 }}
              />
            </div>
          </div>

          <div className="st-dataman-bal-field">
            <label className="st-field-label">🏦 Bank Balance</label>
            <div className="st-num-wrap" style={{ width: "100%" }}>
              <span className="st-num-prefix">₹</span>
              <input
                className="st-num-input"
                type="number"
                min="0"
                placeholder="0"
                value={openBank}
                onChange={(e) => setOpenBank(e.target.value)}
                style={{ flex: 1 }}
              />
            </div>
          </div>

          <button
            className="st-btn-primary"
            disabled={busy === "ledger"}
            onClick={() =>
              run(
                "ledger",
                async () => {
                  if (!window.confirm(`Set counter to ₹${openCash || 0} and bank to ₹${openBank || 0}?`)) return;
                  await resetCashLedger(Number(openCash || 0), Number(openBank || 0));
                },
                "✅ Balances updated"
              )
            }
          >
            {busy === "ledger" ? "Saving…" : "💾 Set"}
          </button>
        </div>
      </div>

      <div className="st-dataman-resets">
        <div className="st-dataman-resets-title">🔧 Individual Resets</div>
        <div className="st-dataman-resets-grid">
          {resets.map(({ key, icon, label, desc, fn }) => (
            <button
              key={key}
              className="st-reset-btn"
              disabled={busy === key}
              onClick={() => {
                if (!window.confirm(`${label}?\n${desc}.\nCannot be undone.`)) return;
                run(key, fn, `✅ ${label} done`);
              }}
            >
              <span className="st-reset-icon">{icon}</span>
              <div>
                <div className="st-reset-label">{busy === key ? "Processing…" : label}</div>
                <div className="st-reset-desc">{desc}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="st-dataman-nuke">
        <div className="st-nuke-header">
          <span className="st-nuke-icon">☢️</span>
          <div>
            <div className="st-nuke-title">Wipe All Transactional Data</div>
            <div className="st-nuke-sub">
              Deletes sessions, payments, sales, dues, history. Resets cash to ₹0. Keeps devices, stock &amp; settings.
            </div>
          </div>
        </div>

        {!showNuke ? (
          <button className="st-btn-nuke" onClick={() => setShowNuke(true)}>
            ☢️ Wipe All Data
          </button>
        ) : (
          <div className="st-nuke-confirm">
            <p className="st-nuke-confirm-label">
              Type <code>WIPE</code> to confirm:
            </p>
            <div className="st-nuke-confirm-row">
              <input
                className="st-text-input"
                value={nukeWord}
                onChange={(e) => setNukeWord(e.target.value)}
                placeholder="Type WIPE"
                style={{ flex: 1, borderColor: nukeWord === "WIPE" ? "var(--red)" : undefined }}
              />
              <button
                className="st-btn-nuke"
                disabled={nukeWord !== "WIPE" || busy === "nuke"}
                onClick={() =>
                  run(
                    "nuke",
                    async () => {
                      await clearAllTransactionalData();
                      setShowNuke(false);
                      setNukeWord("");
                    },
                    "☢️ All data wiped"
                  )
                }
              >
                {busy === "nuke" ? "Wiping…" : "Confirm Wipe"}
              </button>
              <button
                className="st-btn-ghost"
                onClick={() => {
                  setShowNuke(false);
                  setNukeWord("");
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Settings({ settings, onSave, pcs = [], ps5Sessions = [] }) {
  const [form, setForm] = useState({ ...DEFAULT_SETTINGS, ...settings });
  const [saving, setSaving] = useState(false);
  const [activeTab, setTab] = useState("devices");

  useEffect(() => setForm((s) => ({ ...DEFAULT_SETTINGS, ...settings })), [settings]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const setPri = (m, v) => setForm((f) => ({ ...f, pricing: { ...f.pricing, [m]: Number(v) || 0 } }));
  const setPS5P = (m, v) => setForm((f) => ({ ...f, ps5Pricing: { ...f.ps5Pricing, [m]: Number(v) || 0 } }));
  const setXPC = (m, v) => setForm((f) => ({ ...f, extraTimePricing: { ...f.extraTimePricing, [m]: Number(v) || 0 } }));
  const setXPS5 = (m, v) => setForm((f) => ({ ...f, ps5ExtraTimePricing: { ...f.ps5ExtraTimePricing, [m]: Number(v) || 0 } }));

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveSettings(form);
      toast.success("✅ Settings saved!");
      if (onSave) onSave(form);
    } catch (e) {
      toast.error("Failed: " + e.message);
    }
    setSaving(false);
  };

  const pcRpm = Number(((form.extraTimePricing?.[30] || 50) / 30).toFixed(2));
  const ps5Rpm = Number(((form.ps5ExtraTimePricing?.[30] || 80) / 30).toFixed(2));

  const TABS = [
    { id: "devices", icon: "🖥", label: "Devices" },
    { id: "pricing", icon: "💰", label: "Pricing" },
    { id: "cafe", icon: "🏪", label: "Café Info" },
    { id: "timers", icon: "⏱", label: "Timers" },
    { id: "data", icon: "🗄", label: "Data" },
  ];

  return (
    <div className="st-page">
      <div className="st-sidebar">
        <div className="st-sidebar-title">Settings</div>
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`st-sidebar-tab ${activeTab === t.id ? "active" : ""}`}
            onClick={() => setTab(t.id)}
          >
            <span className="st-sidebar-icon">{t.icon}</span>
            <span>{t.label}</span>
            {t.id === "devices" && (
              <span className="st-sidebar-badge">{pcs.length + ps5Sessions.length}</span>
            )}
          </button>
        ))}
        <div className="st-sidebar-spacer" />
        <button className="st-save-btn" onClick={handleSave} disabled={saving}>
          {saving ? (
            <>
              <span className="st-save-spinner" />
              Saving…
            </>
          ) : (
            <>💾 Save Settings</>
          )}
        </button>
      </div>

      <div className="st-content">
        {activeTab === "devices" && (
          <div className="st-panel">
            <div className="st-panel-header">
              <h2 className="st-panel-title">🖥 Device Management</h2>
              <p className="st-panel-sub">
                Add, edit, remove PCs and PS5 consoles. Configure names, seats and specs.
              </p>
            </div>
            <DeviceManager pcs={pcs} ps5Sessions={ps5Sessions} />
          </div>
        )}

        {activeTab === "pricing" && (
          <div className="st-panel">
            <div className="st-panel-header">
              <h2 className="st-panel-title">💰 Pricing Configuration</h2>
              <p className="st-panel-sub">Session start rates and mid-session extra time pricing</p>
            </div>
            <div className="st-pricing-grid">
              <Section icon="🖥" title="PC Pricing" accent="var(--blue)">
                <PricingCard
                  color="var(--blue)"
                  durations={[
                    { dur: 30, value: form.pricing?.[30] || 0, onChange: (v) => setPri(30, v) },
                    { dur: 60, value: form.pricing?.[60] || 0, onChange: (v) => setPri(60, v) },
                    { dur: 90, value: form.pricing?.[90] || 0, onChange: (v) => setPri(90, v) },
                    { dur: 120, value: form.pricing?.[120] || 0, onChange: (v) => setPri(120, v) },
                  ]}
                  extraOptions={[
                    { dur: 15, value: form.extraTimePricing?.[15] || 0, onChange: (v) => setXPC(15, v) },
                    { dur: 30, value: form.extraTimePricing?.[30] || 0, onChange: (v) => setXPC(30, v) },
                    { dur: 60, value: form.extraTimePricing?.[60] || 0, onChange: (v) => setXPC(60, v) },
                  ]}
                  rpmLabel={`₹${pcRpm}/min · +15m=₹${(pcRpm * 15).toFixed(0)} · +30m=₹${(pcRpm * 30).toFixed(0)} · +60m=₹${(pcRpm * 60).toFixed(0)}`}
                />
              </Section>

              <Section icon="🎮" title="PS5 Pricing" accent="#8b5cf6">
                <PricingCard
                  color="#8b5cf6"
                  durations={[
                    { dur: 30, value: form.ps5Pricing?.[30] || 0, onChange: (v) => setPS5P(30, v) },
                    { dur: 60, value: form.ps5Pricing?.[60] || 0, onChange: (v) => setPS5P(60, v) },
                    { dur: 90, value: form.ps5Pricing?.[90] || 0, onChange: (v) => setPS5P(90, v) },
                    { dur: 120, value: form.ps5Pricing?.[120] || 0, onChange: (v) => setPS5P(120, v) },
                  ]}
                  extraOptions={[
                    { dur: 15, value: form.ps5ExtraTimePricing?.[15] || 0, onChange: (v) => setXPS5(15, v) },
                    { dur: 30, value: form.ps5ExtraTimePricing?.[30] || 0, onChange: (v) => setXPS5(30, v) },
                    { dur: 60, value: form.ps5ExtraTimePricing?.[60] || 0, onChange: (v) => setXPS5(60, v) },
                  ]}
                  rpmLabel={`₹${ps5Rpm}/min · +15m=₹${(ps5Rpm * 15).toFixed(0)} · +30m=₹${(ps5Rpm * 30).toFixed(0)} · +60m=₹${(ps5Rpm * 60).toFixed(0)}`}
                />
              </Section>
            </div>

            <div className="st-pricing-summary">
              <div className="st-ps-title">📊 Quick Reference</div>
              <div className="st-ps-grid">
                {[30, 60, 90, 120].map((m) => (
                  <div key={m} className="st-ps-card">
                    <div className="st-ps-dur">{m < 60 ? `${m}m` : `${m / 60}h`}</div>
                    <div className="st-ps-prices">
                      <div className="st-ps-row">
                        <span>🖥 PC</span>
                        <strong style={{ color: "var(--blue)" }}>₹{form.pricing?.[m] || 0}</strong>
                      </div>
                      <div className="st-ps-row">
                        <span>🎮 PS5</span>
                        <strong style={{ color: "#8b5cf6" }}>₹{form.ps5Pricing?.[m] || 0}</strong>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === "cafe" && (
          <div className="st-panel">
            <div className="st-panel-header">
              <h2 className="st-panel-title">🏪 Café Information</h2>
              <p className="st-panel-sub">Business name, UPI, free time and admin password</p>
            </div>
            <Section icon="🏪" title="Business Details">
              <Field label="Café Name" hint="Shown in header and overlays">
                <TxtIn
                  value={form.cafeeName}
                  onChange={(v) => set("cafeeName", v)}
                  placeholder="Mario Gaming Café"
                />
              </Field>
            </Section>
            <Section icon="📱" title="UPI Payment">
              <Field label="UPI ID">
                <TxtIn value={form.cafeeUpiId} onChange={(v) => set("cafeeUpiId", v)} placeholder="name@upi" />
              </Field>
              <Field label="Display Name">
                <TxtIn value={form.cafeeUpiName} onChange={(v) => set("cafeeUpiName", v)} placeholder="Mario Gaming" />
              </Field>
            </Section>
            <Section icon="🎁" title="Free Time Options" subtitle="Bonus minutes at session start">
              <Field label="Option 1" hint="minutes">
                <NumIn value={form.freeOption1 ?? 5} onChange={(v) => set("freeOption1", v)} prefix="+" width={90} />
              </Field>
              <Field label="Option 2" hint="minutes">
                <NumIn value={form.freeOption2 ?? 10} onChange={(v) => set("freeOption2", v)} prefix="+" width={90} />
              </Field>
            </Section>
            <Section icon="🔐" title="Admin Password" subtitle="Used to unlock Sales report">
              <Field label="Password">
                <TxtIn
                  value={form.adminPassword || ""}
                  onChange={(v) => set("adminPassword", v)}
                  placeholder="1234"
                  type="password"
                />
              </Field>
            </Section>
          </div>
        )}

        {activeTab === "timers" && (
          <div className="st-panel">
            <div className="st-panel-header">
              <h2 className="st-panel-title">⏱ Timer Settings</h2>
              <p className="st-panel-sub">Shutdown delay, warning threshold and electricity rate</p>
            </div>
            <Section icon="⏻" title="Auto-Shutdown" subtitle="PC shuts down after session ends">
              <SliderField
                label="Shutdown Delay"
                value={form.shutdownDelay || 30}
                min={0}
                max={300}
                step={15}
                format={(v) => (v === 0 ? "Disabled" : v >= 60 ? `${v / 60}min` : `${v}s`)}
                marks={[0, 30, 60, 120, 300]}
                onChange={(v) => set("shutdownDelay", v)}
              />
              <div className="st-timer-preview">
                {(form.shutdownDelay || 30) === 0
                  ? "⚠️ Auto-shutdown disabled"
                  : `PC shuts down ${
                      (form.shutdownDelay || 30) >= 60
                        ? `${(form.shutdownDelay || 30) / 60} minute(s)`
                        : `${form.shutdownDelay || 30} seconds`
                    } after session ends`}
              </div>
            </Section>

            <Section icon="⚠️" title="Low Time Warning">
              <SliderField
                label="Warning Threshold"
                value={form.warningAt || 300}
                min={60}
                max={600}
                step={60}
                format={(v) => `${v / 60}min`}
                marks={[60, 120, 300, 600]}
                onChange={(v) => set("warningAt", v)}
              />
              <div className="st-timer-preview">
                Warning bar turns red when <strong>{(form.warningAt || 300) / 60} minutes</strong> remain
              </div>
            </Section>

            <Section icon="⚡" title="Electricity">
              <Field label="Rate" hint="₹ per kWh">
                <NumIn
                  value={form.electricityRate ?? 8}
                  onChange={(v) => set("electricityRate", v)}
                  prefix="₹"
                  min={0}
                  step={0.5}
                  width={100}
                />
              </Field>
            </Section>
          </div>
        )}

        {activeTab === "data" && (
          <div className="st-panel">
            <div className="st-panel-header">
              <h2 className="st-panel-title">🗄 Data Management</h2>
              <p className="st-panel-sub">Reset balances, clear records or wipe all data</p>
            </div>
            <Section icon="🗄" title="Data Controls" danger>
              <DataManagement />
            </Section>
          </div>
        )}
      </div>
    </div>
  );
}