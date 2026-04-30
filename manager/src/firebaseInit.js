// firebaseInit.js — Seeds initial data into Firebase on first load

import { db } from "./firebase";
import { ref, set, get } from "firebase/database";

const DEFAULT_PCS = [
  { id: 1, name: "PC-01", status: "offline", session_start: null, session_duration: 0, time_remaining: 0, is_paused: false, customer_name: "" },
  { id: 2, name: "PC-02", status: "offline", session_start: null, session_duration: 0, time_remaining: 0, is_paused: false, customer_name: "" },
  { id: 3, name: "PC-03", status: "offline", session_start: null, session_duration: 0, time_remaining: 0, is_paused: false, customer_name: "" },
  { id: 4, name: "PC-04", status: "offline", session_start: null, session_duration: 0, time_remaining: 0, is_paused: false, customer_name: "" },
];

const DEFAULT_CANTEEN = {
  1:  { id: 1,  name: "Dark Green Lays",               category: "chips",  price: 20, stock: 12, emoji: "🥔" },
  2:  { id: 2,  name: "Mountain Dew",                  category: "drink",  price: 30, stock: 0,  emoji: "💚" },
  3:  { id: 3,  name: "Dew Can",                       category: "drink",  price: 40, stock: 0,  emoji: "🥤" },
  4:  { id: 4,  name: "DOR Nacho Cheese",              category: "chips",  price: 20, stock: 6,  emoji: "🧀" },
  5:  { id: 5,  name: "DOR Sweet Chilli",              category: "chips",  price: 20, stock: 6,  emoji: "🌶️" },
  6:  { id: 6,  name: "KKR Chilli Chatka",             category: "chips",  price: 20, stock: 5,  emoji: "🔥" },
  7:  { id: 7,  name: "KKR Jowar Puffs",               category: "chips",  price: 20, stock: 0,  emoji: "🌾" },
  8:  { id: 8,  name: "KKR Puffcorn",                  category: "chips",  price: 20, stock: 3,  emoji: "🍿" },
  9:  { id: 9,  name: "KKR Sezwan",                    category: "chips",  price: 20, stock: 5,  emoji: "🌶️" },
  10: { id: 10, name: "KKR Solid Masti",               category: "chips",  price: 20, stock: 0,  emoji: "💥" },
  11: { id: 11, name: "Kurkure Regular",               category: "chips",  price: 20, stock: 10, emoji: "🌽" },
  12: { id: 12, name: "LAYS American Style Cream",     category: "chips",  price: 20, stock: 12, emoji: "🧀" },
  13: { id: 13, name: "LAYS Classic Salted",           category: "chips",  price: 20, stock: 5,  emoji: "🥔" },
  14: { id: 14, name: "Lays Crispz",                   category: "chips",  price: 20, stock: 6,  emoji: "🥔" },
  15: { id: 15, name: "LAYS Hot n Sweet Chilli",       category: "chips",  price: 20, stock: 5,  emoji: "🌶️" },
  16: { id: 16, name: "LAYS Magic Masala",             category: "chips",  price: 20, stock: 10, emoji: "✨" },
  17: { id: 17, name: "LAYS Sizzlin Hot",              category: "chips",  price: 20, stock: 5,  emoji: "🔥" },
  18: { id: 18, name: "LAYS Spanish Tomato Tango",     category: "chips",  price: 20, stock: 5,  emoji: "🍅" },
  19: { id: 19, name: "LAYS Wafer Chips",              category: "chips",  price: 20, stock: 0,  emoji: "🥔" },
  20: { id: 20, name: "Mirinda",                       category: "drink",  price: 30, stock: 0,  emoji: "🍊" },
  21: { id: 21, name: "Pepsi",                         category: "drink",  price: 30, stock: 0,  emoji: "🥤" },
  22: { id: 22, name: "Pepsi Can",                     category: "drink",  price: 40, stock: 0,  emoji: "🥫" },
  23: { id: 23, name: "Slice",                         category: "drink",  price: 30, stock: 0,  emoji: "🥭" },
  24: { id: 24, name: "UC Plain Salted",               category: "chips",  price: 20, stock: 0,  emoji: "🧂" },
  25: { id: 25, name: "UC Spicy Treat",                category: "chips",  price: 20, stock: 5,  emoji: "🌶️" },
};

const DEFAULT_PS5_SESSIONS = {
  1: { slot:1, status:"offline", time_remaining:0, paid_seconds:0, free_seconds:0, session_duration:0, session_start:null, is_paused:false, customer_name:"", payment_status:"", total_charge:0, paid_cash:0, paid_upi:0, balance_due:0 },
  2: { slot:2, status:"offline", time_remaining:0, paid_seconds:0, free_seconds:0, session_duration:0, session_start:null, is_paused:false, customer_name:"", payment_status:"", total_charge:0, paid_cash:0, paid_upi:0, balance_due:0 },
  3: { slot:3, status:"offline", time_remaining:0, paid_seconds:0, free_seconds:0, session_duration:0, session_start:null, is_paused:false, customer_name:"", payment_status:"", total_charge:0, paid_cash:0, paid_upi:0, balance_due:0 },
  4: { slot:4, status:"offline", time_remaining:0, paid_seconds:0, free_seconds:0, session_duration:0, session_start:null, is_paused:false, customer_name:"", payment_status:"", total_charge:0, paid_cash:0, paid_upi:0, balance_due:0 },
  5: { slot:5, status:"offline", time_remaining:0, paid_seconds:0, free_seconds:0, session_duration:0, session_start:null, is_paused:false, customer_name:"", payment_status:"", total_charge:0, paid_cash:0, paid_upi:0, balance_due:0 },
};

const DEFAULT_CONSOLES = {
  ps5_1: { id: "ps5_1", label: "PS5 #1", type: "ps5",      status: "available", customer_name: "", alert: "" },
  ps5_2: { id: "ps5_2", label: "PS5 #2", type: "ps5",      status: "available", customer_name: "", alert: "" },
  ps5_3: { id: "ps5_3", label: "PS5 #3", type: "ps5",      status: "available", customer_name: "", alert: "" },
  ps5_4: { id: "ps5_4", label: "PS5 #4", type: "ps5",      status: "available", customer_name: "", alert: "" },
  ps5_5: { id: "ps5_5", label: "PS5 #5", type: "ps5",      status: "available", customer_name: "", alert: "" },
  steer: { id: "steer", label: "Racing Rig", type: "steering", status: "available", customer_name: "", alert: "" },
};

const DEFAULT_SETTINGS = {
  cafeeName:       "Mario Gaming Café",
  cafeeUpiId:      "",
  cafeeUpiName:    "",
  shutdownDelay:   30,
  warningAt:       300,
  freeOption1:     5,
  freeOption2:     10,
  electricityRate: 8,
  pricing:              { 30: 15,  60: 30,  90: 45,  120: 60  },
  ps5Pricing:           { 30: 60,  60: 120, 90: 180, 120: 240 },
  extraTimePricing:     { 15: 25,  30: 50,  60: 100 },
  ps5ExtraTimePricing:  { 15: 40,  30: 80,  60: 160 },
};

export async function initFirebase() {
  try {
    // Seed PCs
    for (const pc of DEFAULT_PCS) {
      const snap = await get(ref(db, `pcs/${pc.id}`));
      if (!snap.exists()) await set(ref(db, `pcs/${pc.id}`), pc);
    }

    // Seed canteen
    const canteenSnap = await get(ref(db, "canteen_items"));
    if (!canteenSnap.exists()) await set(ref(db, "canteen_items"), DEFAULT_CANTEEN);

    // Seed PS5 sessions
    const ps5Snap = await get(ref(db, "ps5_sessions"));
    if (!ps5Snap.exists()) await set(ref(db, "ps5_sessions"), DEFAULT_PS5_SESSIONS);

    // Seed consoles
    const consolesSnap = await get(ref(db, "consoles"));
    if (!consolesSnap.exists()) await set(ref(db, "consoles"), DEFAULT_CONSOLES);

    // Seed settings defaults (don't overwrite existing)
    const settingsSnap = await get(ref(db, "settings"));
    if (!settingsSnap.exists()) await set(ref(db, "settings"), DEFAULT_SETTINGS);

    // Seed cash_ledger if missing
    const ledgerSnap = await get(ref(db, "cash_ledger"));
    if (!ledgerSnap.exists()) {
      await set(ref(db, "cash_ledger"), { cash_balance: 1000, bank_balance: 1000, last_updated: Date.now() });
    }

    console.log("✅ Firebase initialized");
  } catch (err) {
    console.error("Firebase init error:", err);
    throw err;
  }
}

// ── Force-reset canteen to the new stock list ─────────────────────────────────
// Call this ONCE from browser console: import { resetCanteen } from './firebaseInit'; resetCanteen();
// Or add a button in Settings temporarily
export async function resetCanteen() {
  try {
    await set(ref(db, "canteen_items"), DEFAULT_CANTEEN);
    console.log("✅ Canteen reset to new stock");
    return true;
  } catch(err) {
    console.error("Canteen reset failed:", err);
    return false;
  }
}