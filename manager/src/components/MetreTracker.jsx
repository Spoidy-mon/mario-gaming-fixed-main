import React, { useState, useMemo } from "react";
import { addMetreReading } from "../firebaseService";
import { toast } from "react-toastify";

export default function MetreTracker({ readings = [], settings = {} }) {
  const ratePerUnit = settings.electricityRate || 8; // ₹ per unit
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate]       = useState(today);
  const [reading, setReading] = useState("");
  const [note, setNote]       = useState("");
  const [saving, setSaving]   = useState(false);

  // Compute daily consumption
  const enriched = useMemo(() => {
    return readings.map((r, i) => {
      const prev = readings[i + 1];
      const units = prev ? Math.max(0, r.reading - prev.reading) : null;
      const cost  = units !== null ? units * ratePerUnit : null;
      return { ...r, units, cost };
    });
  }, [readings, ratePerUnit]);

  const totalUnits = enriched.reduce((s, r) => s + (r.units || 0), 0);
  const totalCost  = totalUnits * ratePerUnit;
  const last30     = enriched.slice(0, 30);

  const handleAdd = async () => {
    if (!reading || !date) return toast.error("Date and reading required");
    const val = Number(reading);
    if (isNaN(val) || val < 0) return toast.error("Invalid reading value");
    setSaving(true);
    try {
      await addMetreReading({ date, reading: val, note });
      toast.success("Metre reading saved!");
      setReading(""); setNote("");
    } catch (e) { toast.error(e.message); }
    setSaving(false);
  };

  return (
    <div className="metre-page">
      <div className="metre-stats-row">
        <div className="metre-stat">
          <div className="metre-stat-val">{totalUnits.toFixed(1)}</div>
          <div className="metre-stat-label">Total Units (30 days)</div>
        </div>
        <div className="metre-stat">
          <div className="metre-stat-val" style={{color:"var(--yellow)"}}>₹{totalCost.toFixed(0)}</div>
          <div className="metre-stat-label">Est. Cost @ ₹{ratePerUnit}/unit</div>
        </div>
        <div className="metre-stat">
          <div className="metre-stat-val" style={{color:"var(--green)"}}>
            {enriched[0]?.reading || "—"}
          </div>
          <div className="metre-stat-label">Latest Reading</div>
        </div>
        <div className="metre-stat">
          <div className="metre-stat-val" style={{color:"var(--accent)"}}>
            {enriched[0]?.units?.toFixed(1) ?? "—"}
          </div>
          <div className="metre-stat-label">Yesterday's Units</div>
        </div>
      </div>

      {/* Add reading */}
      <div className="metre-add-card">
        <h3 className="settings-card-title">📊 Add Today's Reading</h3>
        <div className="metre-add-grid">
          <div className="settings-field">
            <label className="settings-label">Date</label>
            <input className="input-name" type="date" value={date}
              onChange={e => setDate(e.target.value)} max={today} />
          </div>
          <div className="settings-field">
            <label className="settings-label">Metre Reading (units)</label>
            <input className="input-name" type="number" placeholder="e.g. 12345"
              value={reading} onChange={e => setReading(e.target.value)} />
          </div>
          <div className="settings-field">
            <label className="settings-label">Note (optional)</label>
            <input className="input-name" placeholder="e.g. Holiday, low usage"
              value={note} onChange={e => setNote(e.target.value)} />
          </div>
        </div>
        <button className="btn btn-start" style={{marginTop:10,minWidth:160}}
          onClick={handleAdd} disabled={saving}>
          {saving ? "Saving..." : "💾 Save Reading"}
        </button>
      </div>

      {/* Log */}
      <div className="metre-table-wrap">
        <table className="hist-table">
          <thead>
            <tr>
              <th>Date</th><th>Reading</th><th>Units Used</th>
              <th>Est. Cost</th><th>Note</th>
            </tr>
          </thead>
          <tbody>
            {last30.length === 0 && (
              <tr><td colSpan={5} style={{textAlign:"center",padding:32,color:"var(--text-muted)"}}>
                No readings yet — add your first one above
              </td></tr>
            )}
            {last30.map(r => (
              <tr key={r.key} className="hist-row">
                <td><strong>{r.date}</strong></td>
                <td><span className="hist-duration">{r.reading}</span></td>
                <td>{r.units !== null ? <span className="hist-pc-badge">{r.units.toFixed(1)} u</span> : "—"}</td>
                <td>{r.cost !== null ? <span style={{color:"var(--yellow)",fontFamily:"var(--font-mono)"}}>₹{r.cost.toFixed(0)}</span> : "—"}</td>
                <td style={{color:"var(--text-muted)",fontSize:12}}>{r.note || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
