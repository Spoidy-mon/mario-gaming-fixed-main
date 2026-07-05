import React, { useState, useMemo, useRef, useEffect } from "react";
import { returnItem } from "../firebaseService";
import { announceItemReturned } from "../utils/speak";
import { toast } from "react-toastify";

// ── Category colors for fallback when image fails ─────────────────────────────
const CATEGORY_COLORS = {
  chips:     "linear-gradient(135deg,#f59e0b,#d97706)",
  drink:     "linear-gradient(135deg,#3b82f6,#1e40af)",
  energy:    "linear-gradient(135deg,#10b981,#064e3b)",
  chocolate: "linear-gradient(135deg,#92400e,#451a03)",
};
function getCategoryGradient(cat) {
  return CATEGORY_COLORS[cat] || "linear-gradient(135deg,#6b7280,#374151)";
}

// ── Product images via wsrv.nl proxy (bypasses hotlink protection) ────────────
function img(url) {
  return `https://wsrv.nl/?url=${encodeURIComponent(url)}&w=300&h=300&fit=contain&bg=white`;
}

const ITEM_IMAGES = {
  // Lays variants
  "Dark Green Lays":              img("https://upload.wikimedia.org/wikipedia/commons/thumb/4/40/Lays_Classic.jpg/200px-Lays_Classic.jpg"),
  "LAYS Classic Salted":          img("https://upload.wikimedia.org/wikipedia/commons/thumb/4/40/Lays_Classic.jpg/200px-Lays_Classic.jpg"),
  "Lays Classic":                 img("https://upload.wikimedia.org/wikipedia/commons/thumb/4/40/Lays_Classic.jpg/200px-Lays_Classic.jpg"),
  "LAYS Magic Masala":            img("https://upload.wikimedia.org/wikipedia/en/a/a4/Lays_Magic_Masala.jpg"),
  "Lays Magic Masala":            img("https://upload.wikimedia.org/wikipedia/en/a/a4/Lays_Magic_Masala.jpg"),
  "LAYS American Style Cream":    img("https://upload.wikimedia.org/wikipedia/en/9/99/LaysAmericanStyleCreamOnion.jpg"),
  "Lays American Style Cream":    img("https://upload.wikimedia.org/wikipedia/en/9/99/LaysAmericanStyleCreamOnion.jpg"),
  "Lays Crispz":                  img("https://upload.wikimedia.org/wikipedia/commons/thumb/4/40/Lays_Classic.jpg/200px-Lays_Classic.jpg"),
  "LAYS Hot n Sweet Chilli":      img("https://upload.wikimedia.org/wikipedia/en/a/a4/Lays_Magic_Masala.jpg"),
  "LAYS Sizzlin Hot":             img("https://upload.wikimedia.org/wikipedia/en/a/a4/Lays_Magic_Masala.jpg"),
  "LAYS Spanish Tomato Tango":    img("https://upload.wikimedia.org/wikipedia/en/9/99/LaysAmericanStyleCreamOnion.jpg"),
  "LAYS Wafer Chips":             img("https://upload.wikimedia.org/wikipedia/commons/thumb/4/40/Lays_Classic.jpg/200px-Lays_Classic.jpg"),
  // Kurkure / KKR
  "Kurkure Regular":              img("https://upload.wikimedia.org/wikipedia/commons/thumb/b/ba/Kurkure_Masala_Munch.jpg/200px-Kurkure_Masala_Munch.jpg"),
  "Kurkure":                      img("https://upload.wikimedia.org/wikipedia/commons/thumb/b/ba/Kurkure_Masala_Munch.jpg/200px-Kurkure_Masala_Munch.jpg"),
  "KKR Chilli Chatka":            img("https://upload.wikimedia.org/wikipedia/commons/thumb/b/ba/Kurkure_Masala_Munch.jpg/200px-Kurkure_Masala_Munch.jpg"),
  "KKR Jowar Puffs":              img("https://upload.wikimedia.org/wikipedia/commons/thumb/b/ba/Kurkure_Masala_Munch.jpg/200px-Kurkure_Masala_Munch.jpg"),
  "KKR Puffcorn":                 img("https://upload.wikimedia.org/wikipedia/commons/thumb/b/ba/Kurkure_Masala_Munch.jpg/200px-Kurkure_Masala_Munch.jpg"),
  "KKR Sezwan":                   img("https://upload.wikimedia.org/wikipedia/commons/thumb/b/ba/Kurkure_Masala_Munch.jpg/200px-Kurkure_Masala_Munch.jpg"),
  "KKR Solid Masti":              img("https://upload.wikimedia.org/wikipedia/commons/thumb/b/ba/Kurkure_Masala_Munch.jpg/200px-Kurkure_Masala_Munch.jpg"),
  // DOR
  "DOR Nacho Cheese":             img("https://upload.wikimedia.org/wikipedia/commons/thumb/4/40/Lays_Classic.jpg/200px-Lays_Classic.jpg"),
  "DOR Sweet Chilli":             img("https://upload.wikimedia.org/wikipedia/commons/thumb/4/40/Lays_Classic.jpg/200px-Lays_Classic.jpg"),
  // UC
  "UC Plain Salted":              img("https://upload.wikimedia.org/wikipedia/commons/thumb/4/40/Lays_Classic.jpg/200px-Lays_Classic.jpg"),
  "UC Spicy Treat":               img("https://upload.wikimedia.org/wikipedia/commons/thumb/b/ba/Kurkure_Masala_Munch.jpg/200px-Kurkure_Masala_Munch.jpg"),
  // Drinks
  "Mountain Dew":                 img("https://upload.wikimedia.org/wikipedia/commons/thumb/b/b5/Mountain_Dew_can.jpg/200px-Mountain_Dew_can.jpg"),
  "Dew Can":                      img("https://upload.wikimedia.org/wikipedia/commons/thumb/b/b5/Mountain_Dew_can.jpg/200px-Mountain_Dew_can.jpg"),
  "Pepsi":                        img("https://upload.wikimedia.org/wikipedia/commons/thumb/2/27/CocaCola_can_in_a_bucket_of_ice.jpg/200px-CocaCola_can_in_a_bucket_of_ice.jpg"),
  "Pepsi Can":                    img("https://upload.wikimedia.org/wikipedia/commons/thumb/2/27/CocaCola_can_in_a_bucket_of_ice.jpg/200px-CocaCola_can_in_a_bucket_of_ice.jpg"),
  "Mirinda":                      img("https://upload.wikimedia.org/wikipedia/commons/thumb/7/7d/Sprite_2022.jpg/200px-Sprite_2022.jpg"),
  "Slice":                        img("https://upload.wikimedia.org/wikipedia/commons/thumb/9/9d/Frooti_Mango_Drink.jpg/200px-Frooti_Mango_Drink.jpg"),
  "Coca-Cola":                    img("https://upload.wikimedia.org/wikipedia/commons/thumb/2/27/CocaCola_can_in_a_bucket_of_ice.jpg/200px-CocaCola_can_in_a_bucket_of_ice.jpg"),
  "Sprite":                       img("https://upload.wikimedia.org/wikipedia/commons/thumb/7/7d/Sprite_2022.jpg/200px-Sprite_2022.jpg"),
  "Frooti":                       img("https://upload.wikimedia.org/wikipedia/commons/thumb/9/9d/Frooti_Mango_Drink.jpg/200px-Frooti_Mango_Drink.jpg"),
  // Energy
  "Red Bull":                     img("https://upload.wikimedia.org/wikipedia/commons/thumb/5/5f/Red_Bull_can.jpg/200px-Red_Bull_can.jpg"),
  "Monster Energy":               img("https://upload.wikimedia.org/wikipedia/commons/thumb/0/0b/Monster_Energy_can.jpg/200px-Monster_Energy_can.jpg"),
  // Chocolate
  "Dairy Milk":                   img("https://upload.wikimedia.org/wikipedia/commons/thumb/9/90/Cadbury_Dairy_Milk_chocolate_bar.jpg/200px-Cadbury_Dairy_Milk_chocolate_bar.jpg"),
  "KitKat":                       img("https://upload.wikimedia.org/wikipedia/commons/thumb/6/64/Kitkat_WhiteandChocolate_KiKi.jpg/200px-Kitkat_WhiteandChocolate_KiKi.jpg"),
};

// Smart image with fallback
function ProductImage({ name, category, emoji }) {
  const [failed, setFailed] = React.useState(false);
  const src = ITEM_IMAGES[name];
  if (!src || failed) {
    return (
      <div className="item-emoji-fallback" style={{ display:"flex", background: getCategoryGradient(category) }}>
        <span style={{ fontSize:40 }}>{emoji}</span>
      </div>
    );
  }
  return <img src={src} alt={name} className="item-img" onError={() => setFailed(true)} />;
}

const CATEGORIES = ["all", "chips", "drink", "energy", "chocolate", "snack"];

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString("en-IN", { hour:"2-digit", minute:"2-digit" });
}

// ── Restock Modal ─────────────────────────────────────────────────────────────
function RestockModal({ item, onClose, onRestock }) {
  const [qty, setQty] = useState(10);
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e=>e.stopPropagation()}>
        <h3>Restock {item.name}</h3>
        <p className="modal-sub">Current stock: <strong>{item.stock}</strong></p>
        <div className="restock-qty-row">
          {[5,10,20,50].map(n=>(
            <button key={n} className={`btn btn-duration ${qty===n?"selected":""}`} onClick={()=>setQty(n)}>+{n}</button>
          ))}
        </div>
        <input type="number" className="input-name" value={qty} min={1}
          onChange={e=>setQty(Number(e.target.value))} />
        <div className="form-actions">
          <button className="btn btn-start" onClick={()=>{onRestock(item.id,qty);onClose();}}>✔ Restock</button>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ── Sell Modal — redesigned with CollectModal-style payment UI ────────────────
function SellModal({ item, pcs, ps5Sessions, onClose, onSell }) {
  const [selId,    setSelId]    = useState(null);
  const [selType,  setSelType]  = useState("pc");
  const [filter,   setFilter]   = useState("all");
  const [payMode,  setPayMode]  = useState("cash"); // cash | upi | charge | split
  const [cashAmt,  setCashAmt]  = useState("");
  const [upiAmt,   setUpiAmt]   = useState("");

  const price    = item.price * 1;
  const cashNum  = Number(cashAmt || 0);
  const upiNum   = Number(upiAmt  || 0);
  const totalPaid = payMode === "split" ? cashNum + upiNum : price;
  const dueAmt   = Math.max(0, price - totalPaid);
  const overpaid = totalPaid > price;

  const activePCs  = pcs.filter(p => p.status !== "offline");
  const activePS5s = (ps5Sessions||[]).filter(s => s.status !== "offline");

  const preview = selId !== null && (() => {
    if (selType === "ps5") {
      const s = (ps5Sessions||[]).find(x => x.id === selId);
      return `🎮 PS5 #${selId}${s?.customer_name ? ` · ${s.customer_name}` : ""}`;
    }
    const pc = pcs.find(p => p.id === selId);
    return pc?.customer_name ? `👤 ${pc.customer_name} on ${pc.name}` : `🖥 ${pc?.name}`;
  })();

  const showPCs  = filter === "all" || filter === "pc";
  const showPS5s = filter === "all" || filter === "ps5";

  const handleSell = () => {
    const splitData = payMode === "split" ? { cash: cashNum, upi: upiNum } : undefined;
    onSell(item.id, 1, selId, payMode, splitData);
    onClose();
  };

  const canConfirm = payMode !== "split" || totalPaid > 0;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e=>e.stopPropagation()}>
        <h3>Sell — {item.name}</h3>
        <p className="modal-sub">₹{price} · Stock: <strong>{item.stock}</strong></p>

        {/* Device type filter */}
        <div className="sell-device-filter">
          {[["all","All"],["pc","🖥 PCs"],["ps5","🎮 PS5"]].map(([v,l])=>(
            <button key={v} className={`sell-filter-btn ${filter===v?"active":""}`}
              onClick={()=>setFilter(v)}>{l}</button>
          ))}
        </div>

        <div className="sell-section-label">Assign to Device (optional)</div>
        <div className="pc-selector-grid">
          <button className={`pc-select-btn ${selId===null?"selected":""}`}
            onClick={()=>{setSelId(null);setSelType("pc");}}>
            <span className="pc-sel-icon">🚫</span>
            <span className="pc-sel-name">No Device</span>
            <span className="pc-sel-sub">Walk-in</span>
          </button>
          {showPCs && activePCs.map(pc=>(
            <button key={`pc-${pc.id}`}
              className={`pc-select-btn ${selId===pc.id&&selType==="pc"?"selected":""}`}
              onClick={()=>{setSelId(pc.id);setSelType("pc");}}>
              <span className={`pc-sel-dot pc-sel-dot-${pc.status}`}></span>
              <span className="pc-sel-name">🖥 {pc.name}</span>
              <span className="pc-sel-sub">{pc.customer_name||pc.status}</span>
            </button>
          ))}
          {showPS5s && activePS5s.map(s=>(
            <button key={`ps5-${s.id}`}
              className={`pc-select-btn ps5-sel-btn ${selId===s.id&&selType==="ps5"?"selected":""}`}
              onClick={()=>{setSelId(s.id);setSelType("ps5");}}>
              <span className={`pc-sel-dot pc-sel-dot-${s.status}`}></span>
              <span className="pc-sel-name">🎮 PS5 #{s.id?.replace('ps5_','')||'?'}</span>
              <span className="pc-sel-sub">{s.customer_name||s.status}</span>
            </button>
          ))}
        </div>

        {preview && <div className="sell-assigned-badge">✅ {preview}</div>}

        {/* Payment Mode — big collect-style buttons */}
        <div className="sell-section-label" style={{marginTop:12}}>Payment Mode</div>
        <div className="collect-mode-grid">
          {[["cash","💵","Cash"],["upi","📱","UPI"]].map(([v,icon,lbl])=>(
            <button key={v} className={`collect-mode-btn ${payMode===v?"active":""}`}
              onClick={()=>setPayMode(v)}>
              <span className="collect-mode-icon">{icon}</span>
              <span className="collect-mode-label">{lbl}</span>
            </button>
          ))}
          {selId !== null && (
            <button className={`collect-mode-btn collect-mode-charge ${payMode==="charge"?"active":""}`}
              onClick={()=>setPayMode("charge")}>
              <span className="collect-mode-icon">📋</span>
              <span className="collect-mode-label">Charge</span>
            </button>
          )}
          {selId !== null && (
            <button className={`collect-mode-btn collect-mode-split ${payMode==="split"?"active":""}`}
              onClick={()=>{setPayMode("split");setCashAmt("");setUpiAmt("");}}>
              <span className="collect-mode-icon">⚡</span>
              <span className="collect-mode-label">Split</span>
            </button>
          )}
        </div>

        {payMode === "charge" && selId !== null && (
          <div className="sell-charge-hint">
            ₹{price} will be added to the pending due for <strong>{preview}</strong>
          </div>
        )}

        {payMode === "split" && (
          <div className="modal-section" style={{marginTop:10}}>
            <div className="split-inputs-row">
              <div className="split-input-block">
                <label>💵 Cash</label>
                <input className="input-name" type="number" min="0" max={price}
                  placeholder="₹0" value={cashAmt}
                  onChange={e=>setCashAmt(e.target.value)} autoFocus />
              </div>
              <div className="split-input-block">
                <label>📱 UPI</label>
                <input className="input-name" type="number" min="0" max={price}
                  placeholder="₹0" value={upiAmt}
                  onChange={e=>setUpiAmt(e.target.value)} />
              </div>
            </div>
            <div className="split-status-row">
              <span>Total: <strong style={{color:"var(--green)"}}>₹{totalPaid}</strong></span>
              {dueAmt > 0 && selId !== null && (
                <span style={{color:"var(--red,#f87171)"}}>
                  Still due: ₹{dueAmt.toFixed(2)} → charged to session
                </span>
              )}
              {dueAmt > 0 && selId === null && (
                <span style={{color:"#f59e0b"}}>⚠ No device — full amount must be paid</span>
              )}
              {overpaid && <span style={{color:"var(--yellow,#fbbf24)"}}>⚠ Overpaid ₹{(totalPaid-price).toFixed(2)}</span>}
            </div>
          </div>
        )}

        <div className="form-actions" style={{marginTop:16}}>
          <button className="btn btn-sell-confirm" onClick={handleSell} disabled={!canConfirm}>
            {payMode==="upi"?"📱":payMode==="charge"?"📋":payMode==="split"?"⚡":"💵"}
            {" "}{payMode==="charge"
              ? `Charge ₹${price} to Due`
              : payMode==="split"
                ? dueAmt > 0 && selId !== null
                  ? `Pay ₹${totalPaid} + Charge ₹${dueAmt.toFixed(2)} to Due`
                  : `Collect ₹${price}`
                : `Sell ₹${price}`}
          </button>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ── Add Item Modal ────────────────────────────────────────────────────────────
const CATEGORY_OPTIONS = ["chips","drink","energy","chocolate","snack","other"];
const EMOJI_OPTIONS    = ["🍟","🥤","⚡","🍫","🍿","🧃","🍪","🌮","🥪","🧆","🍱","🍩"];

function AddItemModal({ onClose, onAdd }) {
  const [form,   setForm]   = useState({ name:"", price:"", category:"snack", emoji:"🍿", stock:"0" });
  const [saving, setSaving] = useState(false);
  const set = (k,v) => setForm(f=>({...f,[k]:v}));

  const handleAdd = async () => {
    if (!form.name.trim())        return toast?.error?.("Name required") || alert("Name required");
    if (!form.price || Number(form.price) <= 0) return toast?.error?.("Valid price required") || alert("Price required");
    setSaving(true);
    try {
      await onAdd({ name: form.name.trim(), price: Number(form.price), category: form.category, emoji: form.emoji, stock: Number(form.stock)||0 });
      onClose();
    } catch(e) { console.error(e); }
    setSaving(false);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:400}}>
        <h3>➕ Add New Item</h3>

        <div className="modal-section">
          <label className="settings-label">Item Name *</label>
          <input className="input-name" placeholder="e.g. Lays Magic Masala"
            value={form.name} onChange={e=>set("name",e.target.value)} autoFocus />
        </div>

        <div className="modal-section" style={{display:"flex",gap:10}}>
          <div style={{flex:1}}>
            <label className="settings-label">Price (₹) *</label>
            <input className="input-name" type="number" min="1" placeholder="₹0"
              value={form.price} onChange={e=>set("price",e.target.value)} />
          </div>
          <div style={{flex:1}}>
            <label className="settings-label">Initial Stock</label>
            <input className="input-name" type="number" min="0" placeholder="0"
              value={form.stock} onChange={e=>set("stock",e.target.value)} />
          </div>
        </div>

        <div className="modal-section">
          <label className="settings-label">Category</label>
          <div className="category-pills" style={{marginTop:6}}>
            {CATEGORY_OPTIONS.map(cat=>(
              <button key={cat} className={`category-pill ${form.category===cat?"active":""}`}
                onClick={()=>set("category",cat)}>
                {cat.charAt(0).toUpperCase()+cat.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="modal-section">
          <label className="settings-label">Emoji Icon</label>
          <div style={{display:"flex",flexWrap:"wrap",gap:6,marginTop:6}}>
            {EMOJI_OPTIONS.map(e=>(
              <button key={e}
                className={`btn btn-duration ${form.emoji===e?"selected":""}`}
                style={{fontSize:20,padding:"6px 10px",background:form.emoji===e?"rgba(99,102,241,.3)":"rgba(255,255,255,.05)"}}
                onClick={()=>set("emoji",e)}>{e}</button>
            ))}
          </div>
          <input className="input-name" style={{marginTop:8}} placeholder="or type any emoji"
            value={form.emoji} onChange={e=>set("emoji",e.target.value)} maxLength={4} />
        </div>

        <div className="form-actions" style={{marginTop:16}}>
          <button className="btn btn-start" onClick={handleAdd} disabled={saving} style={{flex:1}}>
            {saving?"Adding…":"✅ Add Item"}
          </button>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ── Return Modal ──────────────────────────────────────────────────────────────
function ReturnModal({ sale, onClose, onConfirm }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e=>e.stopPropagation()}>
        <h3>↩ Return Item</h3>
        <p className="modal-sub">Return <strong>{sale.item_name}</strong> ×{sale.quantity}?</p>
        <div className="payment-summary" style={{ marginBottom:16 }}>
          <div className="pay-sum-row"><span>Item</span><strong>{sale.item_name}</strong></div>
          <div className="pay-sum-row"><span>Qty</span><strong>×{sale.quantity}</strong></div>
          <div className="pay-sum-row"><span>Refund</span><strong style={{color:"var(--green)"}}>₹{sale.total?.toFixed(2)}</strong></div>
          {sale.pc_name&&<div className="pay-sum-row"><span>Device</span><strong>{sale.pc_name}</strong></div>}
          {sale.customer_name&&<div className="pay-sum-row"><span>Customer</span><strong>{sale.customer_name}</strong></div>}
        </div>
        <div className="return-note">⚠️ Restores {sale.quantity} unit(s) to stock and marks sale as returned.</div>
        <div className="form-actions" style={{ marginTop:14 }}>
          <button className="btn btn-resume" onClick={onConfirm}>✔ Confirm Return</button>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
// ── Item Delete Button ────────────────────────────────────────────────────────
function ItemDeleteBtn({ itemId, name, onDelete }) {
  const [confirm, setConfirm] = useState(false);
  const [busy,    setBusy]    = useState(false);
  if (!onDelete) return null;
  const go = async () => {
    setBusy(true);
    try { await onDelete(itemId); } catch(e) { setBusy(false); }
  };
  if (confirm) return (
    <div className="item-del-confirm" onClick={e=>e.stopPropagation()}>
      <span style={{fontSize:10,color:"#fca5a5"}}>Delete {name}?</span>
      <button className="btn-tx-delete-confirm" disabled={busy} onClick={go}>{busy?"…":"✓"}</button>
      <button className="btn-tx-delete-cancel" onClick={()=>setConfirm(false)}>✕</button>
    </div>
  );
  return (
    <button className="btn btn-item-delete" title="Delete item" onClick={()=>setConfirm(true)}>🗑</button>
  );
}

function ResetStockModal({ itemCount, onClose, onConfirm }) {
  const [qty, setQty] = useState("0");
  const presets = [0, 5, 10, 20, 50];
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:380}}>
        <h3>🔄 Reset All Stock</h3>
        <p className="modal-sub" style={{marginBottom:14}}>
          Set stock for all <strong>{itemCount}</strong> items to the same value.
        </p>

        <div className="modal-section">
          <label className="settings-label">Set stock to</label>
          <div style={{display:"flex",gap:6,marginTop:6,flexWrap:"wrap"}}>
            {presets.map(v=>(
              <button key={v}
                className={`btn btn-duration ${Number(qty)===v?"selected":""}`}
                style={{minWidth:44}}
                onClick={()=>setQty(String(v))}>
                {v}
              </button>
            ))}
            <input
              className="input-name"
              type="number" min="0"
              style={{width:80}}
              value={qty}
              onChange={e=>setQty(e.target.value)}
              placeholder="Custom"
            />
          </div>
        </div>

        <div className="form-actions" style={{marginTop:16}}>
          <button
            className="btn btn-reset-stock-confirm"
            onClick={()=>onConfirm(Number(qty)||0)}
            style={{flex:1}}>
            ✅ Set all to {qty||0}
          </button>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ── Inline Price Editor ───────────────────────────────────────────────────────
function InlinePrice({ item, onReprice }) {
  const [editing, setEditing] = useState(false);
  const [val,     setVal]     = useState(String(item.price));
  const inputRef              = useRef(null);

  const startEdit = () => { setVal(String(item.price)); setEditing(true); };
  const commit    = () => {
    const n = Number(val);
    if (!isNaN(n) && n > 0 && n !== item.price) onReprice(item.id, n);
    setEditing(false);
  };
  const cancel = () => setEditing(false);

  useEffect(() => { if (editing && inputRef.current) inputRef.current.select(); }, [editing]);

  if (editing) return (
    <span className="item-price-edit">
      <span className="item-price-rupee">₹</span>
      <input
        ref={inputRef}
        className="price-inline-input"
        type="number" min="1"
        value={val}
        onChange={e=>setVal(e.target.value)}
        onBlur={commit}
        onKeyDown={e=>{ if(e.key==="Enter") commit(); if(e.key==="Escape") cancel(); }}
      />
    </span>
  );
  return (
    <span className="item-price item-price-clickable" onClick={startEdit} title="Click to edit price">
      ₹{item.price} <span className="price-edit-icon">✎</span>
    </span>
  );
}

export default function CanteenManagement({ items=[], sales=[], pcs=[], ps5Sessions=[], onSell, onRestock, onAddItem, onReprice, onResetStock, onDeleteItem }) {
  const [category,    setCategory]    = useState("all");
  const [search,      setSearch]      = useState("");
  const [restockItem, setRestockItem] = useState(null);
  const [sellItem,    setSellItem]    = useState(null);
  const [returnSale,  setReturnSale]  = useState(null);
  const [addingItem,  setAddingItem]  = useState(false);
  const [resetConfirm, setResetConfirm] = useState(false);
  const [viewTab,     setViewTab]     = useState("all");
  const [salesDate,   setSalesDate]   = useState("");
  const [returning,   setReturning]   = useState(false);

  const filtered = items.filter(item =>
    (category === "all" || item.category === category) &&
    item.name.toLowerCase().includes(search.toLowerCase())
  );

  const startOfDay = useMemo(() => {
    if (salesDate) { const d=new Date(salesDate); d.setHours(0,0,0,0); return d.getTime(); }
    const d=new Date(); d.setHours(0,0,0,0); return d.getTime();
  }, [salesDate]);

  const endOfDay = useMemo(() => {
    if (salesDate) { const d=new Date(salesDate); d.setHours(23,59,59,999); return d.getTime(); }
    return null;
  }, [salesDate]);

  const todaySales = useMemo(() =>
    sales.filter(s => s.sold_at >= startOfDay && (!endOfDay || s.sold_at <= endOfDay)),
    [sales, startOfDay, endOfDay]);

  // Totals per device for tabs
  const deviceTotals = useMemo(() => {
    const map = {};
    todaySales.forEach(s => {
      if (s.pc_id)  map[`pc_${s.pc_id}`]    = (map[`pc_${s.pc_id}`]    || 0) + (s.total||0);
      if (s.ps5_id) map[`ps5_${s.ps5_id}`]  = (map[`ps5_${s.ps5_id}`]  || 0) + (s.total||0);
    });
    return map;
  }, [todaySales]);

  const filteredSales = useMemo(() => {
    if (viewTab === "all") return todaySales;
    if (String(viewTab).startsWith("ps5_")) {
      const slotNum = Number(viewTab.replace("ps5_",""));
      return todaySales.filter(s => s.ps5_id === slotNum);
    }
    return todaySales.filter(s => s.pc_id === Number(viewTab));
  }, [todaySales, viewTab]);

  const totalForView = filteredSales.reduce((s,x) => s+(x.total||0), 0);

  const handleReturn = async () => {
    if (!returnSale) return;
    setReturning(true);
    try {
      await returnItem(returnSale.key, returnSale);
      announceItemReturned(returnSale.item_name);
      toast.success(`↩ ${returnSale.item_name} returned`);
      setReturnSale(null);
    } catch(e) { toast.error("Return failed: " + e.message); }
    setReturning(false);
  };

  return (
    <div className="canteen">
      {restockItem && <RestockModal item={restockItem} onClose={()=>setRestockItem(null)} onRestock={onRestock} />}
      {sellItem    && <SellModal item={sellItem} pcs={pcs} ps5Sessions={ps5Sessions}
                        onClose={()=>setSellItem(null)} onSell={onSell} />}
      {returnSale  && <ReturnModal sale={returnSale} onClose={()=>setReturnSale(null)} onConfirm={handleReturn} />}
      {addingItem  && <AddItemModal onClose={()=>setAddingItem(false)} onAdd={onAddItem} />}

      {resetConfirm && (
        <ResetStockModal
          itemCount={items.length}
          onClose={()=>setResetConfirm(false)}
          onConfirm={v=>{ onResetStock(v); setResetConfirm(false); }}
        />
      )}

      <div className="canteen-layout">
        {/* ── Left: Items ── */}
        <div className="canteen-left">
          <div className="canteen-toolbar">
            <input className="input-name search-input" placeholder="🔍 Search items..."
              value={search} onChange={e=>setSearch(e.target.value)} />
            <div className="category-pills">
              {CATEGORIES.map(cat=>(
                <button key={cat}
                  className={`category-pill ${category===cat?"active":""}`}
                  onClick={()=>setCategory(cat)}>
                  {cat==="all"?"All":cat.charAt(0).toUpperCase()+cat.slice(1)}
                </button>
              ))}
            </div>
            <button className="btn btn-add-item" onClick={()=>setAddingItem(true)}>➕ Add Item</button>
            <button className="btn btn-reset-stock" onClick={()=>setResetConfirm(true)}>🔄 Reset Stock</button>
          </div>

          <div className="items-grid">
            {filtered.length===0&&<div className="empty-state">No items found</div>}
            {filtered.map(item=>(
              <div key={item.id}
                className={`item-card ${item.stock===0?"out-of-stock":item.stock<=5?"low-stock":""}`}>
                <div className="item-img-wrap">
                  <ProductImage name={item.name} category={item.category} emoji={item.emoji} />
                </div>
                <div className="item-info">
                  <div className="item-name">{item.name}</div>
                  <div className="item-category">{item.category}</div>
                  <div className="item-meta">
                    <InlinePrice item={item} onReprice={onReprice} />
                    <span className={`item-stock ${item.stock<=5?"stock-low":""}`}>
                      {item.stock===0?"Out of stock":`${item.stock} left`}
                    </span>
                  </div>
                </div>
                <div className="item-actions">
                  <button className="btn btn-sell" disabled={item.stock===0}
                    onClick={()=>setSellItem(item)}>Sell</button>
                  <button className="btn btn-restock-sm" onClick={()=>setRestockItem(item)}>+Stock</button>
                  <ItemDeleteBtn itemId={item.id} name={item.name} onDelete={onDeleteItem} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Right: Sales log ── */}
        <div className="canteen-right">
          <div className="sales-header">
            <div>
              <h3>{salesDate ? new Date(salesDate).toLocaleDateString("en-IN",{day:"2-digit",month:"short"}) : "Today"}'s Sales</h3>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <span className="sales-total">₹{totalForView.toFixed(0)}</span>
              <div className="calendar-input-wrap">
                <input type="date"
                  className={`input-name calendar-input ${salesDate?"calendar-active":""}`}
                  value={salesDate} max={new Date().toISOString().slice(0,10)}
                  onChange={e=>setSalesDate(e.target.value)} style={{width:138,fontSize:11,padding:"4px 8px"}} />
                {salesDate&&<button className="calendar-clear-btn" onClick={()=>setSalesDate("")}>✕</button>}
              </div>
            </div>
          </div>

          {/* Device tabs — PC + PS5 */}
          <div className="sales-pc-tabs">
            <button className={`sales-pc-tab ${viewTab==="all"?"active":""}`} onClick={()=>setViewTab("all")}>
              All <span className="tab-total">₹{todaySales.reduce((s,x)=>s+x.total,0).toFixed(0)}</span>
            </button>
            {/* PC tabs */}
            {pcs.map(pc=>(
              <button key={pc.id}
                className={`sales-pc-tab ${viewTab===pc.id?"active":""}`}
                onClick={()=>setViewTab(pc.id)}>
                <span className={`pc-sel-dot pc-sel-dot-${pc.status}`} style={{marginRight:3}}></span>
                🖥 {pc.name}
                {deviceTotals[`pc_${pc.id}`]&&<span className="tab-total">₹{deviceTotals[`pc_${pc.id}`].toFixed(0)}</span>}
              </button>
            ))}
            {/* PS5 tabs */}
            {(ps5Sessions||[]).map(s=>(
              <button key={`ps5-${s.id}`}
                className={`sales-pc-tab ${viewTab===`ps5_${s.slot}`?"active":""}`}
                onClick={()=>setViewTab(`ps5_${s.slot}`)}>
                <span className={`pc-sel-dot pc-sel-dot-${s.status}`} style={{marginRight:3}}></span>
                🎮 PS5 #{s.id?.replace('ps5_','')||'?'}
                {deviceTotals[`ps5_${s.slot}`]&&<span className="tab-total">₹{deviceTotals[`ps5_${s.slot}`].toFixed(0)}</span>}
              </button>
            ))}
          </div>

          {/* Device header when filtered */}
          {viewTab !== "all" && (()=>{
            if (String(viewTab).startsWith("ps5_")) {
              const slot = Number(String(viewTab).replace("ps5_",""));
              const s = (ps5Sessions||[]).find(x=>x.slot===slot);
              return (
                <div className="pc-bill-header">
                  <span className={`pc-sel-dot pc-sel-dot-${s?.status||"offline"}`}></span>
                  <strong>PS5 #{slot}</strong>
                  {s?.customer_name&&<span className="pc-bill-customer">👤 {s.customer_name}</span>}
                </div>
              );
            }
            const pc = pcs.find(p=>p.id===Number(viewTab));
            return pc ? (
              <div className="pc-bill-header">
                <span className={`pc-sel-dot pc-sel-dot-${pc.status}`}></span>
                <strong>{pc.name}</strong>
                {pc.customer_name&&<span className="pc-bill-customer">👤 {pc.customer_name}</span>}
              </div>
            ) : null;
          })()}

          {/* Sales list */}
          <div className="sales-log">
            {filteredSales.length===0&&(
              <div className="empty-state-sm">No sales {viewTab==="all"?"yet today":"from this device today"}</div>
            )}
            {filteredSales.map(s=>(
              <div key={s.key||s.sold_at}
                className={`sale-row ${s.returned?"sale-row-returned":""}`}>
                <div className="sale-info">
                  <span className="sale-item">{s.item_name}</span>
                  <span className="sale-qty">×{s.quantity}</span>
                  {viewTab==="all"&&s.pc_name&&(
                    <span className="sale-pc-tag">
                      {s.ps5_id?"🎮":"🖥"} {s.pc_name}{s.customer_name?` · ${s.customer_name}`:""}
                    </span>
                  )}
                  {s.payment_mode==="split"&&(
                    <span className="sale-pc-tag" style={{color:"#fbbf24",borderColor:"rgba(245,158,11,.3)"}}>
                      ✂️ Split {s.split_amount_paid!=null?`₹${s.split_amount_paid} paid`:""}
                    </span>
                  )}
                  {s.returned&&<span className="returned-badge">↩ Returned</span>}
                </div>
                <div className="sale-right">
                  <span className={`sale-amount ${s.returned?"sale-amount-returned":""}`}>₹{s.total?.toFixed(0)}</span>
                  <span className="sale-time">{formatTime(s.sold_at)}</span>
                  {!s.returned&&(
                    <button className="btn-return-item" onClick={()=>setReturnSale(s)} title="Return">↩</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}