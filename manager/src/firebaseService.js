import { db } from "./firebase";
import { ref, set, update, get, push, onValue, remove, runTransaction } from "firebase/database";

// ─────────────────────────────────────────────────────────────────────────────
// HELPER
// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// PRICING HELPERS
// ─────────────────────────────────────────────────────────────────────────────

// Session start pricing (tiered)
function priceForSeconds(seconds, pricing = {}) {
  const min = Math.ceil(seconds / 60);
  if (min <= 30)  return pricing[30]  || 15;
  if (min <= 60)  return pricing[60]  || 30;
  if (min <= 90)  return pricing[90]  || 45;
  return pricing[120] || 60;
}

// Extra-time rate: settings.extraTimePricing = { 15:25, 30:50, 60:100 }
// Falls back to 30-min block rate if not set
// ₹50 for 30 min = ₹1.667/min
function ratePerMinuteExtra(settings = {}) {
  const xp = settings.extraTimePricing || {};
  // Use 30-min block as the base extra rate (₹50 / 30 = ₹1.667/min)
  const base30 = xp[30] || 50;
  return base30 / 30;
}

// Price for extra minutes added/removed mid-session — always a clean integer (₹)
function priceForMinutes(minutes, settings = {}) {
  const rpm = ratePerMinuteExtra(settings);
  return Math.round(rpm * minutes); // round to nearest rupee, no floats
}

// Safe round to 2 decimal places to kill floating-point dust
function round2(n) { return Math.round((n || 0) * 100) / 100; }

// ─────────────────────────────────────────────────────────────────────────────
// PC OPERATIONS
// ─────────────────────────────────────────────────────────────────────────────
export function listenPCs(callback) {
  return onValue(ref(db, "pcs"), (snap) => {
    const data = snap.val();
    if (!data) return callback([]);
    callback(Object.values(data).sort((a, b) => a.id - b.id));
  });
}

// Quick-start: just name, no payment yet → payment_status = "pending"
export async function quickStartSession(pcId, customerName, durationMinutes = 60, settings = {}) {
  const sessionStart   = Date.now();
  const durationSec    = (durationMinutes || 60) * 60;
  // Calculate price from duration so dues shows correct amount immediately
  const sessionPrice   = priceForSeconds(durationSec, settings?.pricing);
  // session_end_time: absolute epoch ms when session will expire.
  // Client reads this for server-anchored countdown — survives reloads.
  const sessionEndTime = sessionStart + (durationSec * 1000);

  await update(ref(db, `pcs/${pcId}`), {
    status:           "active",
    time_remaining:   durationSec,
    session_duration: durationSec,
    paid_seconds:     durationSec,
    free_seconds:     0,
    session_start:    sessionStart,
    session_end_time: sessionEndTime,   // ← server-anchored end timestamp
    is_paused:        false,
    customer_name:    customerName || "",
    customer_phone:   "",
    customer_address: "",
    payment_status:   "pending",
    payment_amount:   sessionPrice,   // original session charge — never mutated by add/reduce
    payment_cash:     0,
    payment_upi:      0,
    payment_mode:     "pending",
    base_price:       sessionPrice,   // frozen anchor used by addTime / reduceTime
    total_charge:     sessionPrice,   // starts equal to base_price; grows/shrinks with extra_charges
    balance_due:      sessionPrice,   // starts fully unpaid
    paid_cash:        0,
    paid_upi:         0,
    extra_charges:    0,              // cumulative net extra time charges (+/-)
    shutdown_delay:   null,
    timer_started_at: sessionStart,
    games_played:     "",
  });
  // Auto-create due with the correct amount
  const dueKey = await push(ref(db, "pending_dues"), {
    customer_name:  customerName || "",
    pc_id:          pcId,
    pc_name:        `PC-0${pcId}`,
    device_type:    "pc",
    reason:         "Session started — payment pending",
    amount:         sessionPrice,     // ← correct amount shown in dues immediately
    session_due:    sessionPrice,     // ← session portion (tracks separately from canteen)
    canteen_due:    0,
    session_ref:    `pcs/${pcId}`,
    paid:           false,
    auto:           true,
    created_at:     sessionStart,
  });
  await update(ref(db, `pcs/${pcId}`), { due_key: dueKey.key });
}

// Full start with payment
export async function startSession(pcId, durationSeconds, customer, paymentInfo, freeMinutes = 0, shutdownDelay = null) {
  const sessionStart = Date.now();
  const info = typeof customer === "string"
    ? { name: customer, phone: "", address: "" }
    : customer || {};
  const totalSeconds  = durationSeconds + (freeMinutes * 60);
  const cashAmt  = paymentInfo?.cash  ?? (paymentInfo?.mode === "cash"  ? paymentInfo?.amount || 0 : 0);
  const upiAmt   = paymentInfo?.upi   ?? (paymentInfo?.mode === "upi"   ? paymentInfo?.amount || 0 : 0);
  const totalPaid = cashAmt + upiAmt;
  const totalDue  = paymentInfo?.amount || totalPaid;
  const payStatus = totalPaid >= totalDue ? "paid" : totalPaid > 0 ? "partial" : "pending";
  const sessionEndTime = sessionStart + (totalSeconds * 1000); // server-anchored end

  await update(ref(db, `pcs/${pcId}`), {
    status:           "active",
    time_remaining:   totalSeconds,
    paid_seconds:     durationSeconds,
    free_seconds:     freeMinutes * 60,
    session_duration: totalSeconds,
    session_start:    sessionStart,
    session_end_time: sessionEndTime,   // ← server-anchored end timestamp
    is_paused:        false,
    customer_name:    info.name    || "",
    customer_phone:   info.phone   || "",
    customer_address: info.address || "",
    payment_status:   payStatus,
    payment_amount:   totalDue,
    payment_cash:     cashAmt,
    payment_upi:      upiAmt,
    payment_mode:     paymentInfo?.mode || (cashAmt > 0 && upiAmt > 0 ? "split" : cashAmt > 0 ? "cash" : "upi"),
    shutdown_delay:   shutdownDelay,
    timer_started_at: sessionStart,
    games_played:     info.games_played || "",
    due_key:          null,
  });

  if (totalPaid > 0) {
    await push(ref(db, "payments"), {
      pc_id: pcId, pc_name: `PC-0${pcId}`,
      device_type: "pc",
      customer_name: info.name || "",
      customer_phone: info.phone || "",
      amount: totalPaid, cash: cashAmt, upi: upiAmt,
      cash_amount: cashAmt, upi_amount: upiAmt,
      mode: paymentInfo?.mode || "cash",
      session_duration: durationSeconds,
      free_minutes: freeMinutes,
      paid_at: sessionStart,
    });
    // Route cash → counter, UPI → bank
    if (cashAmt > 0) await addToCashBalance(cashAmt, `session PC-${pcId}`);
    if (upiAmt  > 0) await addToUpiBalance(upiAmt,   `session PC-${pcId}`);
  }

  // If partial/pending create a due
  if (payStatus !== "paid") {
    const dueRef = await push(ref(db, "pending_dues"), {
      customer_name: info.name || "",
      pc_id: pcId, pc_name: `PC-0${pcId}`,
      device_type: "pc",
      reason: "Session payment pending",
      amount: totalDue - totalPaid,
      session_ref: `pcs/${pcId}`,
      paid: false, auto: true,
      created_at: sessionStart,
    });
    await update(ref(db, `pcs/${pcId}`), { due_key: dueRef.key });
  }
}

// Update session details after quick-start
export async function updateSessionDetails(pcId, details, settings) {
  const { durationMinutes, freeMinutes, customerPhone, customerAddress, gamesPlayed,
          paymentCash, paymentUpi, shutdownDelay } = details;
  const durationSec   = (durationMinutes || 0) * 60;
  const freeSec       = (freeMinutes || 0) * 60;
  const totalSec      = durationSec + freeSec;
  const cashAmt       = Number(paymentCash  || 0);
  const upiAmt        = Number(paymentUpi   || 0);
  const totalPaid     = cashAmt + upiAmt;
  const totalDue      = priceForSeconds(durationSec, settings?.pricing);
  const remaining     = Math.max(0, totalDue - totalPaid);
  const payStatus     = totalPaid >= totalDue ? "paid" : totalPaid > 0 ? "partial" : "pending";

  const snap = await get(ref(db, `pcs/${pcId}`));
  const pc   = snap.val() || {};

  // Only reset timer anchor if the session duration actually changed.
  // Preserving timer_started_at keeps the countdown running uninterrupted.
  const prevTotalSec = (pc.session_duration || 0);
  const timerAnchorUpdate = (totalSec !== prevTotalSec)
    ? { timer_started_at: Date.now() }
    : {};

  await update(ref(db, `pcs/${pcId}`), {
    time_remaining:   totalSec,
    session_duration: totalSec,
    paid_seconds:     durationSec,
    free_seconds:     freeSec,
    customer_phone:   customerPhone   || "",
    customer_address: customerAddress || "",
    games_played:     gamesPlayed     || "",
    payment_status:   payStatus,
    payment_amount:   totalDue,
    payment_cash:     cashAmt,
    payment_upi:      upiAmt,
    payment_mode:     cashAmt > 0 && upiAmt > 0 ? "split" : cashAmt > 0 ? "cash" : upiAmt > 0 ? "upi" : "pending",
    // Freeze base_price at the session charge so addTime/reduceTime always have a correct anchor
    base_price:       totalDue,
    total_charge:     totalDue,
    balance_due:      Math.max(0, totalDue - (cashAmt + upiAmt)),
    paid_cash:        cashAmt,
    paid_upi:         upiAmt,
    extra_charges:    0,
    canteen_charges:  0,
    shutdown_delay:   shutdownDelay || null,
    due_key:          remaining > 0 ? pc.due_key || null : null, // clear due_key if fully paid
    ...timerAnchorUpdate,
  });

  // Update or clear the pending due
  if (pc.due_key) {
    if (remaining > 0) {
      await update(ref(db, `pending_dues/${pc.due_key}`), { amount: remaining });
    } else {
      await update(ref(db, `pending_dues/${pc.due_key}`), { paid: true, paid_at: Date.now() });
    }
  }

  if (totalPaid > 0) {
    await push(ref(db, "payments"), {
      pc_id: pcId, pc_name: `PC-0${pcId}`, device_type: "pc",
      customer_name: pc.customer_name || "",
      amount: totalPaid, cash: cashAmt, upi: upiAmt,
      cash_amount: cashAmt, upi_amount: upiAmt,
      mode: cashAmt > 0 && upiAmt > 0 ? "split" : cashAmt > 0 ? "cash" : "upi",
      session_duration: durationSec,
      free_minutes: freeMinutes || 0,
      paid_at: Date.now(),
    });
    // Route cash → counter, UPI → bank
    if (cashAmt > 0) await addToCashBalance(cashAmt, `updateSession PC-${pcId}`);
    if (upiAmt  > 0) await addToUpiBalance(upiAmt,   `updateSession PC-${pcId}`);
  }
}

export async function addTime(pcId, seconds, settings = {}) {
  const minutes  = seconds / 60;
  const addPrice = priceForMinutes(minutes, settings);

  await runTransaction(ref(db, `pcs/${pcId}`), (pc) => {
    if (!pc) return pc;
    pc.time_remaining   = (pc.time_remaining   || 0) + seconds;
    pc.session_duration = (pc.session_duration || 0) + seconds;
    pc.paid_seconds     = (pc.paid_seconds     || 0) + seconds;
    pc.session_end_time = (pc.session_end_time || Date.now()) + (seconds * 1000);
    pc.extra_charges    = round2((pc.extra_charges || 0) + addPrice);

    // base_price = FROZEN original session price. Stored once, never changed by add/reduce.
    // We read payment_amount only the first time (before any addTime ever ran) to seed base_price.
    const basePrice  = pc.base_price || pc.payment_amount || pc.total_charge || 0;
    pc.base_price    = round2(basePrice); // freeze it
    pc.total_charge  = round2(pc.base_price + pc.extra_charges);

    const alreadyPaid = round2((pc.paid_cash || pc.payment_cash || 0) + (pc.paid_upi || pc.payment_upi || 0));
    pc.balance_due    = round2(Math.max(0, pc.total_charge - alreadyPaid));
    // payment_amount stays as the original session charge — do NOT overwrite it
    pc.payment_status = alreadyPaid === 0 ? "pending" : pc.balance_due > 0 ? "partial" : "paid";
    return pc;
  });

  const snap = await get(ref(db, `pcs/${pcId}`));
  const pc   = snap.val();
  const sessionBalanceDue  = pc?.balance_due || 0;
  const canteenCharges     = pc?.canteen_charges || 0;
  // Total due = session balance + any outstanding canteen charges
  const totalDueAmount     = round2(sessionBalanceDue + canteenCharges);
  const dueReason  = `+${minutes}min added — session ₹${pc?.total_charge || 0}`;

  if (pc?.due_key) {
    if (totalDueAmount > 0) {
      await update(ref(db, `pending_dues/${pc.due_key}`), {
        amount: totalDueAmount,
        session_due: sessionBalanceDue,
        canteen_due: canteenCharges,
        reason: dueReason,
      });
    } else {
      await update(ref(db, `pending_dues/${pc.due_key}`), { paid: true, paid_at: Date.now() });
    }
  } else if (addPrice > 0) {
    // Session was fully paid — create a fresh due for the extra time
    const newDue = await push(ref(db, "pending_dues"), {
      customer_name: pc?.customer_name || "",
      pc_id: pcId, pc_name: pc?.name || `PC-0${pcId}`,
      device_type: "pc",
      reason: dueReason,
      amount: addPrice,
      session_due: addPrice,
      canteen_due: 0,
      session_ref: `pcs/${pcId}`,
      paid: false, auto: true, created_at: Date.now(),
    });
    await update(ref(db, `pcs/${pcId}`), { due_key: newDue.key });
  }

  if (pc?.session_key) {
    await update(ref(db, `session_ledger/${pc.session_key}`), {
      total_charge: pc.total_charge, balance_due: pc.balance_due, payment_status: pc.payment_status,
    });
  }

  if (addPrice > 0) {
    await push(ref(db, "payments"), {
      pc_id: pcId, pc_name: pc?.name || `PC-0${pcId}`, device_type: "pc",
      customer_name: pc?.customer_name || "",
      amount: addPrice, cash: addPrice, upi: 0, cash_amount: addPrice, upi_amount: 0,
      mode: "cash", reason: `Extra time +${minutes}min`, paid_at: Date.now(),
    });
    await addToCashBalance(addPrice, `addTime PC-${pcId}`);
  }

  return { addedMinutes: minutes, chargeAdded: addPrice, newBalanceDue: balanceDue };
}

export async function reduceTime(pcId, seconds, settings = {}) {
  const minutes     = seconds / 60;
  const deductPrice = priceForMinutes(minutes, settings);

  await runTransaction(ref(db, `pcs/${pcId}`), (pc) => {
    if (!pc) return pc;
    pc.time_remaining   = Math.max(0, (pc.time_remaining   || 0) - seconds);
    pc.session_duration = Math.max(0, (pc.session_duration || 0) - seconds);
    pc.session_end_time = Math.max(Date.now(), (pc.session_end_time || Date.now()) - (seconds * 1000));

    // Reduce from extra_charges first; if extra_charges run out, we cannot go below base_price.
    const prevExtra  = pc.extra_charges || 0;
    pc.extra_charges = round2(Math.max(0, prevExtra - deductPrice));

    // base_price is the original frozen session charge (set at session start or on first addTime)
    const basePrice  = pc.base_price || pc.payment_amount || pc.total_charge || 0;
    pc.base_price    = round2(basePrice); // ensure it stays frozen
    // total = base + whatever extra_charges remain after the deduction
    pc.total_charge  = round2(Math.max(0, pc.base_price + pc.extra_charges));

    const alreadyPaid = round2((pc.paid_cash || pc.payment_cash || 0) + (pc.paid_upi || pc.payment_upi || 0));
    pc.balance_due    = round2(Math.max(0, pc.total_charge - alreadyPaid));
    // payment_amount stays as original — do NOT overwrite
    pc.payment_status = alreadyPaid === 0 ? "pending" : pc.balance_due > 0 ? "partial" : "paid";
    return pc;
  });

  const snap = await get(ref(db, `pcs/${pcId}`));
  const pc   = snap.val();
  const sessionBalanceDue = pc?.balance_due || 0;
  const canteenCharges    = pc?.canteen_charges || 0;
  // Total due always = session balance + canteen charges — reduce time never touches canteen
  const totalDueAmount    = round2(sessionBalanceDue + canteenCharges);
  const dueReason = `-${minutes}min removed — session ₹${pc?.total_charge || 0}`;

  if (pc?.due_key) {
    if (totalDueAmount <= 0) {
      await update(ref(db, `pending_dues/${pc.due_key}`), { paid: true, paid_at: Date.now() });
    } else {
      await update(ref(db, `pending_dues/${pc.due_key}`), {
        amount: totalDueAmount,
        session_due: sessionBalanceDue,
        canteen_due: canteenCharges,
        reason: dueReason,
      });
    }
  }

  if (pc?.session_key) {
    await update(ref(db, `session_ledger/${pc.session_key}`), {
      total_charge: pc.total_charge, balance_due: pc.balance_due, payment_status: pc.payment_status,
    });
  }

  return { reducedMinutes: minutes, chargeDeducted: deductPrice, newBalanceDue: pc?.balance_due || 0 };
}

export async function pauseSession(pcId, currentlyPaused) {
  const updates = { is_paused: !currentlyPaused };
  if (!currentlyPaused) updates.paused_at = Date.now();
  else { updates.timer_started_at = Date.now(); updates.paused_at = null; }
  await update(ref(db, `pcs/${pcId}`), updates);
}

export async function endSession(pcId, pcs) {
  const pc = pcs ? pcs.find((p) => p.id === pcId) : null;
  if (pc && pc.session_start) {
    await logSessionHistory({
      pc_id: pcId, pc_name: pc.name, device_type: "pc",
      customer_name: pc.customer_name || "", customer_phone: pc.customer_phone || "",
      customer_address: pc.customer_address || "", games_played: pc.games_played || "",
      session_start: pc.session_start, session_end: Date.now(),
      session_duration: pc.session_duration || 0,
      paid_seconds: pc.paid_seconds || 0, free_seconds: pc.free_seconds || 0,
      payment_mode: pc.payment_mode || "", payment_amount: pc.payment_amount || 0,
      payment_cash: pc.payment_cash || 0, payment_upi: pc.payment_upi || 0,
      payment_status: pc.payment_status || "pending",
      ended_by: "manager",
    });
    // If payment still pending, keep the due open
    if (pc.payment_status === "pending" || pc.payment_status === "partial") {
      if (pc.due_key) {
        await update(ref(db, `pending_dues/${pc.due_key}`), {
          reason: `Session ended — payment ${pc.payment_status}`,
          session_ended: true,
        });
      }
    }
  }
  await update(ref(db, `pcs/${pcId}`), {
    status: "online", time_remaining: 0,
    session_start: null, session_duration: 0,
    paid_seconds: 0, free_seconds: 0, is_paused: false,
    customer_name: "", customer_phone: "", customer_address: "", games_played: "",
    payment_mode: "", payment_amount: 0, payment_cash: 0, payment_upi: 0,
    payment_status: null, due_key: null,
    timer_started_at: null, paused_at: null,
    shutdown_command: null, welcome_overlay: null,
  });
}

export async function toggleOnline(pcId, currentStatus) {
  const newStatus = currentStatus === "offline" ? "online" : "offline";
  await update(ref(db, `pcs/${pcId}`), { status: newStatus });
  return newStatus;
}

export async function updateTimeRemaining(pcId, newTime) {
  await update(ref(db, `pcs/${pcId}`), { time_remaining: newTime });
}

export async function setSessionEnded(pcId, pcData) {
  if (pcData && pcData.session_start) {
    await logSessionHistory({
      pc_id: pcId, pc_name: pcData.name, device_type: "pc",
      customer_name: pcData.customer_name || "", customer_phone: pcData.customer_phone || "",
      customer_address: pcData.customer_address || "", games_played: pcData.games_played || "",
      session_start: pcData.session_start, session_end: Date.now(),
      session_duration: pcData.session_duration || 0,
      paid_seconds: pcData.paid_seconds || 0, free_seconds: pcData.free_seconds || 0,
      payment_mode: pcData.payment_mode || "", payment_amount: pcData.payment_amount || 0,
      payment_cash: pcData.payment_cash || 0, payment_upi: pcData.payment_upi || 0,
      payment_status: pcData.payment_status || "pending",
      ended_by: "timer",
    });
  }
  await update(ref(db, `pcs/${pcId}`), {
    status: "online", time_remaining: 0,
    session_start: null, is_paused: false,
    customer_name: "", customer_phone: "", customer_address: "", games_played: "",
    payment_mode: "", payment_amount: 0, payment_cash: 0, payment_upi: 0,
    payment_status: null, due_key: null,
    timer_started_at: null, paused_at: null,
    shutdown_command: null, welcome_overlay: null,
  });
}

export async function sendShutdownCommand(pcId) {
  await update(ref(db, `pcs/${pcId}`), {
    shutdown_command: "shutdown", shutdown_sent_at: Date.now(),
  });
}

export async function sendWelcomeOverlay(pcId, customerName, totalMinutes) {
  await update(ref(db, `pcs/${pcId}`), {
    welcome_overlay: { show: true, customer_name: customerName, total_minutes: totalMinutes, sent_at: Date.now() }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// PS5 OPERATIONS  (mirrors PC exactly, stored under /ps5_sessions)
// ─────────────────────────────────────────────────────────────────────────────
const PS5_IDS = ["ps5_1","ps5_2","ps5_3","ps5_4","ps5_5"];

export function listenPS5Sessions(callback) {
  return onValue(ref(db, "ps5_sessions"), (snap) => {
    const data = snap.val() || {};
    // Ensure all 5 consoles exist
    const result = PS5_IDS.map((id, i) => ({
      id, name: `PS5 #${i+1}`,
      status: "online",
      ...data[id],
    }));
    callback(result);
  });
}

export async function ps5QuickStart(ps5Id, customerName, durationMinutes = 60, settings = {}) {
  const sessionStart = Date.now();
  const durationSec  = (durationMinutes || 60) * 60;
  const sessionPrice = priceForSeconds(durationSec, settings?.pricing);
  await update(ref(db, `ps5_sessions/${ps5Id}`), {
    status: "active", time_remaining: durationSec, session_duration: durationSec,
    session_start: sessionStart, is_paused: false,
    customer_name: customerName || "", customer_phone: "", customer_address: "",
    payment_status: "pending", payment_amount: sessionPrice, payment_cash: 0, payment_upi: 0,
    payment_mode: "pending", games_played: "",
  });
  const dueRef = await push(ref(db, "pending_dues"), {
    customer_name: customerName || "",
    ps5_id: ps5Id, ps5_name: `PS5 #${PS5_IDS.indexOf(ps5Id)+1}`,
    device_type: "ps5",
    reason: "PS5 Session started — payment pending",
    amount: sessionPrice, paid: false, auto: true, created_at: sessionStart,
  });
  await update(ref(db, `ps5_sessions/${ps5Id}`), { due_key: dueRef.key });
}

export async function ps5StartSession(ps5Id, durationSeconds, customer, paymentInfo, freeMinutes = 0) {
  const sessionStart = Date.now();
  const info = typeof customer === "string" ? { name: customer } : customer || {};
  const totalSeconds = durationSeconds + (freeMinutes * 60);
  const cashAmt  = paymentInfo?.cash  ?? (paymentInfo?.mode === "cash" ? paymentInfo?.amount || 0 : 0);
  const upiAmt   = paymentInfo?.upi   ?? (paymentInfo?.mode === "upi"  ? paymentInfo?.amount || 0 : 0);
  const totalPaid = cashAmt + upiAmt;
  const totalDue  = paymentInfo?.amount || totalPaid;
  const payStatus = totalPaid >= totalDue ? "paid" : totalPaid > 0 ? "partial" : "pending";

  await update(ref(db, `ps5_sessions/${ps5Id}`), {
    status: "active", time_remaining: totalSeconds, session_duration: totalSeconds,
    paid_seconds: durationSeconds, free_seconds: freeMinutes * 60,
    session_start: sessionStart, is_paused: false,
    customer_name: info.name || "", customer_phone: info.phone || "", customer_address: info.address || "",
    payment_status: payStatus, payment_amount: totalDue,
    payment_cash: cashAmt, payment_upi: upiAmt,
    payment_mode: cashAmt > 0 && upiAmt > 0 ? "split" : cashAmt > 0 ? "cash" : "upi",
    games_played: info.games_played || "",
    timer_started_at: sessionStart, due_key: null,
  });

  if (totalPaid > 0) {
    await push(ref(db, "payments"), {
      ps5_id: ps5Id, ps5_name: `PS5 #${PS5_IDS.indexOf(ps5Id)+1}`,
      device_type: "ps5",
      customer_name: info.name || "", customer_phone: info.phone || "",
      amount: totalPaid, cash: cashAmt, upi: upiAmt,
      cash_amount: cashAmt, upi_amount: upiAmt,
      mode: cashAmt > 0 && upiAmt > 0 ? "split" : cashAmt > 0 ? "cash" : "upi",
      session_duration: durationSeconds, free_minutes: freeMinutes, paid_at: sessionStart,
    });
    // Route cash → counter, UPI → bank
    if (cashAmt > 0) await addToCashBalance(cashAmt, `PS5 session ${ps5Id}`);
    if (upiAmt  > 0) await addToUpiBalance(upiAmt,   `PS5 session ${ps5Id}`);
  }
  if (payStatus !== "paid") {
    const dueRef = await push(ref(db, "pending_dues"), {
      customer_name: info.name || "",
      ps5_id: ps5Id, ps5_name: `PS5 #${PS5_IDS.indexOf(ps5Id)+1}`,
      device_type: "ps5",
      reason: "PS5 session payment pending",
      amount: totalDue - totalPaid,
      paid: false, auto: true, created_at: sessionStart,
    });
    await update(ref(db, `ps5_sessions/${ps5Id}`), { due_key: dueRef.key });
  }
}

export async function ps5AddTime(ps5Id, seconds) {
  await runTransaction(ref(db, `ps5_sessions/${ps5Id}`), (s) => {
    if (!s) return s;
    s.time_remaining   = (s.time_remaining   || 0) + seconds;
    s.session_duration = (s.session_duration || 0) + seconds;
    s.paid_seconds     = (s.paid_seconds     || 0) + seconds;
    s.timer_started_at = Date.now();
    return s;
  });
}

export async function ps5ReduceTime(ps5Id, seconds) {
  await runTransaction(ref(db, `ps5_sessions/${ps5Id}`), (s) => {
    if (!s) return s;
    s.time_remaining   = Math.max(0, (s.time_remaining   || 0) - seconds);
    s.session_duration = Math.max(0, (s.session_duration || 0) - seconds);
    return s;
  });
}

export async function ps5PauseSession(ps5Id, currentlyPaused) {
  const updates = { is_paused: !currentlyPaused };
  if (!currentlyPaused) updates.paused_at = Date.now();
  else { updates.timer_started_at = Date.now(); updates.paused_at = null; }
  await update(ref(db, `ps5_sessions/${ps5Id}`), updates);
}

export async function ps5EndSession(ps5Id, sessions) {
  const s = sessions ? sessions.find(x => x.id === ps5Id) : null;
  if (s && s.session_start) {
    await logSessionHistory({
      ps5_id: ps5Id, ps5_name: s.name, device_type: "ps5",
      customer_name: s.customer_name || "", customer_phone: s.customer_phone || "",
      session_start: s.session_start, session_end: Date.now(),
      session_duration: s.session_duration || 0,
      payment_mode: s.payment_mode || "", payment_amount: s.payment_amount || 0,
      payment_cash: s.payment_cash || 0, payment_upi: s.payment_upi || 0,
      payment_status: s.payment_status || "pending", ended_by: "manager",
    });
  }
  await update(ref(db, `ps5_sessions/${ps5Id}`), {
    status: "online", time_remaining: 0, session_start: null, session_duration: 0,
    paid_seconds: 0, free_seconds: 0, is_paused: false,
    customer_name: "", customer_phone: "", customer_address: "", games_played: "",
    payment_mode: "", payment_amount: 0, payment_cash: 0, payment_upi: 0,
    payment_status: null, due_key: null, timer_started_at: null, paused_at: null,
  });
}

export async function ps5ToggleOnline(ps5Id, currentStatus) {
  const newStatus = currentStatus === "offline" ? "online" : "offline";
  await update(ref(db, `ps5_sessions/${ps5Id}`), { status: newStatus });
  return newStatus;
}

export async function updatePS5TimeRemaining(ps5Id, newTime) {
  await update(ref(db, `ps5_sessions/${ps5Id}`), { time_remaining: newTime });
}

export async function setPS5SessionEnded(ps5Id, psData) {
  if (psData && psData.session_start) {
    await logSessionHistory({
      ps5_id: ps5Id, ps5_name: psData.name, device_type: "ps5",
      customer_name: psData.customer_name || "",
      session_start: psData.session_start, session_end: Date.now(),
      session_duration: psData.session_duration || 0,
      payment_mode: psData.payment_mode || "", payment_amount: psData.payment_amount || 0,
      payment_cash: psData.payment_cash || 0, payment_upi: psData.payment_upi || 0,
      payment_status: psData.payment_status || "pending", ended_by: "timer",
    });
  }
  await update(ref(db, `ps5_sessions/${ps5Id}`), {
    status: "online", time_remaining: 0, session_start: null, is_paused: false,
    customer_name: "", customer_phone: "", customer_address: "", games_played: "",
    payment_mode: "", payment_amount: 0, payment_cash: 0, payment_upi: 0,
    payment_status: null, due_key: null, timer_started_at: null, paused_at: null,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// SETTINGS
// ─────────────────────────────────────────────────────────────────────────────
export async function getSettings() {
  const snap = await get(ref(db, "settings")); return snap.val() || {};
}
export function listenSettings(callback) {
  return onValue(ref(db, "settings"), (snap) => callback(snap.val() || {}));
}
export async function saveSettings(settings) {
  await set(ref(db, "settings"), settings);
}

// ─────────────────────────────────────────────────────────────────────────────
// SESSION HISTORY
// ─────────────────────────────────────────────────────────────────────────────
export async function logSessionHistory(entry) {
  try { await push(ref(db, "session_history"), { ...entry, logged_at: Date.now() }); }
  catch (e) { console.error("logSessionHistory error:", e); }
}
export function listenSessionHistory(callback) {
  return onValue(ref(db, "session_history"), (snap) => {
    const data = snap.val();
    if (!data) return callback([]);
    callback(Object.entries(data).map(([key, val]) => ({ ...val, key }))
      .sort((a, b) => b.session_end - a.session_end));
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// PAYMENTS
// ─────────────────────────────────────────────────────────────────────────────
export function listenPayments(callback) {
  return onValue(ref(db, "payments"), (snap) => {
    const data = snap.val();
    if (!data) return callback([]);
    callback(Object.entries(data).map(([key, val]) => ({ ...val, key }))
      .sort((a, b) => b.paid_at - a.paid_at));
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// CANTEEN
// ─────────────────────────────────────────────────────────────────────────────
export function listenCanteen(callback) {
  return onValue(ref(db, "canteen_items"), (snap) => {
    const data = snap.val();
    if (!data) return callback([]);
    callback(Object.values(data).sort((a, b) =>
      a.category.localeCompare(b.category) || a.name.localeCompare(b.name)));
  });
}
export async function sellItem(itemId, quantity, pcId, pcs, ps5Sessions, paymentMode = "cash") {
  const itemRef = ref(db, `canteen_items/${itemId}`);
  let saleData = null;
  await runTransaction(itemRef, (item) => {
    if (!item) return item;
    if (item.stock < quantity) throw new Error("Insufficient stock");
    item.stock -= quantity;
    saleData = { ...item };
    return item;
  });
  if (!saleData) throw new Error("Item not found");
  const pc  = pcId && pcs        ? pcs.find((p) => p.id === Number(pcId))           : null;
  const ps5 = pcId && ps5Sessions ? ps5Sessions.find((p) => p.id === String(pcId))  : null;
  const total = saleData.price * quantity;
  const mode  = paymentMode || "cash";
  const now   = Date.now();

  await push(ref(db, "sales"), {
    item_id: Number(itemId), item_name: saleData.name,
    quantity: Number(quantity), price: saleData.price, total,
    payment_mode: mode,
    pc_id:    pc  ? pc.id   : null, pc_name: pc  ? pc.name   : null,
    ps5_id:   ps5 ? ps5.id  : null, ps5_name: ps5 ? ps5.name : null,
    customer_name: (pc || ps5)?.customer_name || null,
    device_type: pc ? "pc" : ps5 ? "ps5" : null,
    sold_at: now,
  });

  if (mode === "charge" && (pc || ps5)) {
    // BUG FIX: "Charge to session" — add canteen cost to the device's pending due
    const device     = pc || ps5;
    const devicePath = pc ? `pcs/${device.id}` : `ps5_sessions/${device.id}`;
    const deviceName = pc ? (device.name || `PC-0${device.id}`) : (device.name || device.id);

    // Update device's canteen_charges field
    const devSnap = await get(ref(db, devicePath));
    const devData = devSnap.val() || {};
    const newCanteenCharges = round2((devData.canteen_charges || 0) + total);
    await update(ref(db, devicePath), { canteen_charges: newCanteenCharges });

    if (devData.due_key) {
      // Update existing due — add canteen cost, keeping session_due separate from canteen_due
      const dueSnap = await get(ref(db, `pending_dues/${devData.due_key}`));
      const dueData = dueSnap.val() || {};
      if (!dueData.paid) {
        const prevCanteenDue = dueData.canteen_due || 0;
        const newCanteenDue  = round2(prevCanteenDue + total);
        const sessionDue     = dueData.session_due !== undefined
          ? dueData.session_due
          : round2((dueData.amount || 0) - prevCanteenDue); // migrate old entries
        await update(ref(db, `pending_dues/${devData.due_key}`), {
          amount:      round2(sessionDue + newCanteenDue),
          session_due: sessionDue,
          canteen_due: newCanteenDue,
          reason:      `Session + canteen — ₹${newCanteenCharges} canteen total`,
        });
      } else {
        // Due was paid — create new due for just this canteen charge
        const newDue = await push(ref(db, "pending_dues"), {
          customer_name: device.customer_name || "",
          pc_id:         pc ? device.id : null,
          ps5_id:        ps5 ? device.id : null,
          pc_name:       deviceName, device_type: pc ? "pc" : "ps5",
          reason:        `Canteen: ${saleData.name}${quantity > 1 ? ` ×${quantity}` : ""}`,
          amount:        total,
          session_due:   0,
          canteen_due:   total,
          session_ref:   devicePath,
          paid: false, auto: true, created_at: now,
        });
        await update(ref(db, devicePath), { due_key: newDue.key });
      }
    } else {
      // No due yet — create one for the canteen charge
      const newDue = await push(ref(db, "pending_dues"), {
        customer_name: device.customer_name || "",
        pc_id:         pc ? device.id : null,
        ps5_id:        ps5 ? device.id : null,
        pc_name:       deviceName, device_type: pc ? "pc" : "ps5",
        reason:        `Canteen: ${saleData.name}${quantity > 1 ? ` ×${quantity}` : ""}`,
        amount:        total,
        session_due:   0,
        canteen_due:   total,
        session_ref:   devicePath,
        paid: false, auto: true, created_at: now,
      });
      await update(ref(db, devicePath), { due_key: newDue.key });
    }
    // Charged to session — no immediate ledger entry (collected when due is paid)
  } else if (mode === "upi") {
    await addToUpiBalance(total, `canteen ${saleData.name}`);
  } else {
    await addToCashBalance(total, `canteen ${saleData.name}`);
  }
  return total;
}
export async function restockItem(itemId, quantity) {
  await runTransaction(ref(db, `canteen_items/${itemId}`), (item) => {
    if (!item) return item;
    item.stock = (item.stock || 0) + Number(quantity);
    return item;
  });
}
export function listenSales(callback) {
  return onValue(ref(db, "sales"), (snap) => {
    const data = snap.val();
    if (!data) return callback([]);
    callback(Object.entries(data).map(([key, val]) => ({ ...val, key }))
      .sort((a, b) => b.sold_at - a.sold_at).slice(0, 200));
  });
}
export async function returnItem(saleKey, sale) {
  await runTransaction(ref(db, `canteen_items/${sale.item_id}`), (item) => {
    if (!item) return item;
    item.stock = (item.stock || 0) + Number(sale.quantity);
    return item;
  });
  await update(ref(db, `sales/${saleKey}`), { returned: true, returned_at: Date.now() });
  await push(ref(db, "returns"), {
    sale_key: saleKey, item_id: sale.item_id, item_name: sale.item_name,
    quantity: sale.quantity, refund_amount: sale.total,
    pc_id: sale.pc_id || null, pc_name: sale.pc_name || null,
    customer_name: sale.customer_name || null, returned_at: Date.now(),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// PENDING DUES
// ─────────────────────────────────────────────────────────────────────────────
export function listenPendingDues(callback) {
  return onValue(ref(db, "pending_dues"), (snap) => {
    const data = snap.val();
    if (!data) return callback([]);
    callback(Object.entries(data).map(([key, val]) => ({ ...val, key }))
      .filter(d => !d.paid)
      .sort((a, b) => b.created_at - a.created_at));
  });
}
export async function addPendingDue(due) {
  await push(ref(db, "pending_dues"), { ...due, paid: false, created_at: Date.now() });
}
export async function markDuePaid(key, paidInfo) {
  const now = Date.now();
  await update(ref(db, `pending_dues/${key}`), {
    paid: true, paid_at: now, paid_mode: paidInfo.mode || "cash", ...paidInfo,
  });
  // Correctly route cash vs UPI to the right ledger
  const mode     = paidInfo.mode || "cash";
  const dueAmt   = Number(paidInfo.amount || 0);
  const cashPaid = mode === "cash"  ? dueAmt
                 : mode === "split" ? Number(paidInfo.cash_amount || 0)
                 : 0;
  const upiPaid  = mode === "upi"   ? dueAmt
                 : mode === "split" ? Number(paidInfo.upi_amount  || 0)
                 : 0;
  if (cashPaid > 0) await addToCashBalance(cashPaid, `due collected key:${key}`);
  if (upiPaid  > 0) await addToUpiBalance(upiPaid,   `due collected key:${key}`);

  // BUG FIX: write to payments so Sales tab reflects collected dues
  const dueSnap = await get(ref(db, `pending_dues/${key}`));
  const due = dueSnap.val() || {};
  if (dueAmt > 0) {
    await push(ref(db, "payments"), {
      pc_id: due.pc_id || null,
      pc_name: due.pc_name || due.ps5_name || "General",
      device_type: due.device_type || "pc",
      customer_name: due.customer_name || "",
      amount: dueAmt,
      cash: cashPaid, upi: upiPaid,
      cash_amount: cashPaid, upi_amount: upiPaid,
      mode,
      reason: due.reason || "Due collected",
      paid_at: now,
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// METRE / WITHDRAWALS / CONSOLES
// ─────────────────────────────────────────────────────────────────────────────
export function listenMetreReadings(callback) {
  return onValue(ref(db, "metre_readings"), (snap) => {
    const data = snap.val();
    if (!data) return callback([]);
    callback(Object.entries(data).map(([key, val]) => ({ ...val, key }))
      .sort((a, b) => b.date.localeCompare(a.date)));
  });
}
export async function addMetreReading(entry) {
  await push(ref(db, "metre_readings"), { ...entry, logged_at: Date.now() });
}
export function listenWithdrawals(callback) {
  return onValue(ref(db, "withdrawals"), (snap) => {
    const data = snap.val();
    if (!data) return callback([]);
    callback(Object.entries(data).map(([key, val]) => ({ ...val, key }))
      .sort((a, b) => b.withdrawn_at - a.withdrawn_at));
  });
}
export function listenConsoles(callback) {
  return onValue(ref(db, "consoles"), (snap) => callback(snap.val() || {}));
}
export async function checkAndRecoverStaleSessions(pcs) {
  const now = Date.now();
  for (const pc of pcs) {
    if (pc.status === "active" && !pc.is_paused) {
      const lastBeat = pc.timer_started_at || 0;
      if (now - lastBeat > 30000 && pc.time_remaining <= 0) {
        await update(ref(db, `pcs/${pc.id}`), {
          status: "online", time_remaining: 0,
          session_start: null, is_paused: false, customer_name: "",
          timer_started_at: null,
        });
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// BANK / CASH LEDGER
// ═══════════════════════════════════════════════════════════════════════════════

// Get current cash & bank balances
export function listenCashLedger(callback) {
  return onValue(ref(db, "cash_ledger"), (snap) => {
    callback(snap.val() || { cash_balance: 0, bank_balance: 0, last_updated: null });
  });
}

// Transfer cash → bank
export async function transferToBank(amount, who, reason) {
  const amt = Number(amount);
  if (!amt || amt <= 0) throw new Error("Invalid amount");

  // Read current balances
  const snap    = await get(ref(db, "cash_ledger"));
  const current = snap.val() || { cash_balance: 0, bank_balance: 0 };

  if (current.cash_balance < amt) {
    throw new Error(`Insufficient cash. Available: ₹${current.cash_balance}`);
  }

  const newCash = current.cash_balance - amt;
  const newBank = current.bank_balance + amt;
  const now     = Date.now();

  // Update balances atomically
  await update(ref(db, "cash_ledger"), {
    cash_balance:  newCash,
    bank_balance:  newBank,
    last_updated:  now,
  });

  // Log withdrawal to withdrawals collection (existing) + bank_transfers
  const logEntry = {
    type:         "bank_transfer",
    amount:       amt,
    who:          who || "Staff",
    reason:       reason || "Transfer to bank",
    cash_before:  current.cash_balance,
    cash_after:   newCash,
    bank_before:  current.bank_balance,
    bank_after:   newBank,
    withdrawn_at: now,
    transferred_at: now,
  };

  await push(ref(db, "withdrawals"),    { ...logEntry });
  await push(ref(db, "bank_transfers"), { ...logEntry });
  await push(ref(db, "audit_log"),      { ...logEntry, action: "bank_transfer" });

  return { newCash, newBank };
}

// Cash withdrawal (counter withdrawal — not bank transfer)
export async function withdrawCash(amount, who, reason) {
  const amt = Number(amount);
  if (!amt || amt <= 0) throw new Error("Invalid amount");

  const snap    = await get(ref(db, "cash_ledger"));
  const current = snap.val() || { cash_balance: 0, bank_balance: 0 };

  if (current.cash_balance < amt) {
    throw new Error(`Insufficient cash. Available: ₹${current.cash_balance}`);
  }

  const newCash = current.cash_balance - amt;
  const now     = Date.now();

  await update(ref(db, "cash_ledger"), {
    cash_balance: newCash,
    last_updated: now,
  });

  const logEntry = {
    type:         "cash_withdrawal",
    amount:       amt,
    who:          who || "Staff",
    reason:       reason || "",
    cash_before:  current.cash_balance,
    cash_after:   newCash,
    withdrawn_at: now,
  };

  await push(ref(db, "withdrawals"), { ...logEntry });
  await push(ref(db, "audit_log"),   { ...logEntry, action: "cash_withdrawal" });

  return { newCash };
}

// Called whenever cash payment received — adds to cash_balance
export async function addToCashBalance(amount, source) {
  if (!amount || amount <= 0) return;
  const snap    = await get(ref(db, "cash_ledger"));
  const current = snap.val() || { cash_balance: 0, bank_balance: 0 };
  await update(ref(db, "cash_ledger"), {
    cash_balance: (current.cash_balance || 0) + Number(amount),
    last_updated: Date.now(),
  });
}

// Called whenever UPI payment received — adds to bank_balance
export async function addToUpiBalance(amount, source) {
  if (!amount || amount <= 0) return;
  const snap    = await get(ref(db, "cash_ledger"));
  const current = snap.val() || { cash_balance: 0, bank_balance: 0 };
  await update(ref(db, "cash_ledger"), {
    bank_balance: (current.bank_balance || 0) + Number(amount),
    last_updated: Date.now(),
  });
}

// Audit log listener
export function listenAuditLog(callback) {
  return onValue(ref(db, "audit_log"), (snap) => {
    const data = snap.val();
    if (!data) return callback([]);
    callback(Object.entries(data)
      .map(([key, val]) => ({ ...val, key }))
      .sort((a, b) => (b.withdrawn_at || b.transferred_at || 0) - (a.withdrawn_at || a.transferred_at || 0))
      .slice(0, 200));
  });
}

// Return money from bank back to counter cash
export async function returnToCounter(amount, who, reason) {
  const amt = Number(amount);
  if (!amt || amt <= 0) throw new Error("Invalid amount");

  const snap    = await get(ref(db, "cash_ledger"));
  const current = snap.val() || { cash_balance: 0, bank_balance: 0 };

  if (current.bank_balance < amt) {
    throw new Error(`Insufficient bank balance. Available: ₹${current.bank_balance}`);
  }

  const newCash = current.cash_balance + amt;
  const newBank = current.bank_balance - amt;
  const now     = Date.now();

  await update(ref(db, "cash_ledger"), {
    cash_balance: newCash,
    bank_balance: newBank,
    last_updated: now,
  });

  const logEntry = {
    type:         "return_to_counter",
    amount:       amt,
    who:          who || "Staff",
    reason:       reason || "Return to counter",
    cash_before:  current.cash_balance,
    cash_after:   newCash,
    bank_before:  current.bank_balance,
    bank_after:   newBank,
    withdrawn_at: now,
    transferred_at: now,
  };

  await push(ref(db, "withdrawals"),  { ...logEntry });
  await push(ref(db, "audit_log"),    { ...logEntry, action: "return_to_counter" });

  return { newCash, newBank };
}

// Set/reset cash or bank balance manually (for corrections)
export async function setLedgerBalance(cashBalance, bankBalance) {
  await update(ref(db, "cash_ledger"), {
    cash_balance: Number(cashBalance),
    bank_balance: Number(bankBalance),
    last_updated: Date.now(),
  });
  await push(ref(db, "audit_log"), {
    action: "manual_adjustment",
    type:   "manual_adjustment",
    cash_after:  Number(cashBalance),
    bank_after:  Number(bankBalance),
    who:    "Admin",
    reason: "Manual balance adjustment",
    withdrawn_at: Date.now(),
  });
}

// Bank transfers log listener
export function listenBankTransfers(callback) {
  return onValue(ref(db, "bank_transfers"), (snap) => {
    const data = snap.val();
    if (!data) return callback([]);
    callback(Object.entries(data)
      .map(([key, val]) => ({ ...val, key }))
      .sort((a, b) => b.transferred_at - a.transferred_at));
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// PC MANAGEMENT — Add / Delete / Rename
// ═══════════════════════════════════════════════════════════════════════════════

export async function addPC(id, name) {
  const snap = await get(ref(db, `pcs/${id}`));
  if (snap.exists()) throw new Error(`PC ${id} already exists`);
  await set(ref(db, `pcs/${id}`), {
    id, name: name || `PC-0${id}`,
    status: "offline", time_remaining: 0, session_duration: 0,
    paid_seconds: 0, free_seconds: 0, is_paused: false,
    customer_name: "", customer_phone: "", customer_address: "",
    payment_status: "", total_charge: 0, paid_cash: 0, paid_upi: 0, balance_due: 0,
    session_start: null, session_key: null, timer_started_at: null,
  });
}

export async function deletePC(id) {
  const snap = await get(ref(db, `pcs/${id}`));
  const pc   = snap.val();
  if (pc?.status === "active") throw new Error("Cannot delete a PC with an active session");
  await set(ref(db, `pcs/${id}`), null); // Firebase delete = set null
}

export async function renamePC(id, name) {
  if (!name?.trim()) throw new Error("Name cannot be empty");
  await update(ref(db, `pcs/${id}`), { name: name.trim() });
}

// ═══════════════════════════════════════════════════════════════════════════════
// PS5 MANAGEMENT — Add / Delete / Rename
// ═══════════════════════════════════════════════════════════════════════════════

export async function addPS5(slot, name) {
  const snap = await get(ref(db, `ps5_sessions/${slot}`));
  if (snap.exists()) throw new Error(`PS5 #${slot} already exists`);
  await set(ref(db, `ps5_sessions/${slot}`), {
    slot, name: name || `PS5 #${slot}`,
    status: "offline", time_remaining: 0, session_duration: 0,
    paid_seconds: 0, free_seconds: 0, is_paused: false,
    customer_name: "", customer_phone: "", customer_address: "",
    payment_status: "", total_charge: 0, paid_cash: 0, paid_upi: 0, balance_due: 0,
    session_start: null, session_key: null, timer_started_at: null,
  });
}

export async function deletePS5(slot) {
  const snap = await get(ref(db, `ps5_sessions/${slot}`));
  const s    = snap.val();
  if (s?.status === "active") throw new Error("Cannot delete a PS5 with an active session");
  await set(ref(db, `ps5_sessions/${slot}`), null);
}

export async function renamePS5(slot, name) {
  if (!name?.trim()) throw new Error("Name cannot be empty");
  await update(ref(db, `ps5_sessions/${slot}`), { name: name.trim() });
}

// Update full PC config (name, notes, custom pricing override)
export async function updatePCConfig(id, config) {
  await update(ref(db, `pcs/${id}`), {
    name:    config.name?.trim()  || `PC-0${id}`,
    notes:   config.notes   || "",
    specs:   config.specs   || "",
    seat:    config.seat    || "",
  });
}

// Update full PS5 config
export async function updatePS5Config(slot, config) {
  await update(ref(db, `ps5_sessions/${slot}`), {
    name:  config.name?.trim()  || `PS5 #${slot}`,
    notes: config.notes  || "",
    seat:  config.seat   || "",
    hdmi:  config.hdmi   || "",
  });
}

// Bring PC online / take offline
export async function setPCOnlineStatus(id, online) {
  await update(ref(db, `pcs/${id}`), { status: online ? "online" : "offline" });
}
export async function setPS5OnlineStatus(slot, online) {
  await update(ref(db, `ps5_sessions/${slot}`), { status: online ? "online" : "offline" });
}
// ═══════════════════════════════════════════════════════════════════════════════
// DATA MANAGEMENT — Reset / Wipe collections
// ═══════════════════════════════════════════════════════════════════════════════

// Wipe all active sessions on PCs (reset to online/idle)
export async function resetAllPCSessions() {
  const snap = await get(ref(db, "pcs"));
  const pcs  = snap.val() || {};
  const updates = {};
  Object.keys(pcs).forEach(id => {
    updates[`pcs/${id}/status`]           = "online";
    updates[`pcs/${id}/time_remaining`]   = 0;
    updates[`pcs/${id}/session_duration`] = 0;
    updates[`pcs/${id}/session_start`]    = null;
    updates[`pcs/${id}/is_paused`]        = false;
    updates[`pcs/${id}/customer_name`]    = "";
    updates[`pcs/${id}/customer_phone`]   = "";
    updates[`pcs/${id}/payment_status`]   = null;
    updates[`pcs/${id}/payment_amount`]   = 0;
    updates[`pcs/${id}/due_key`]          = null;
    updates[`pcs/${id}/timer_started_at`] = null;
  });
  await update(ref(db), updates);
}

// Wipe all active sessions on PS5s
export async function resetAllPS5Sessions() {
  const snap = await get(ref(db, "ps5_sessions"));
  const sess = snap.val() || {};
  const updates = {};
  Object.keys(sess).forEach(id => {
    updates[`ps5_sessions/${id}/status`]           = "online";
    updates[`ps5_sessions/${id}/time_remaining`]   = 0;
    updates[`ps5_sessions/${id}/session_duration`] = 0;
    updates[`ps5_sessions/${id}/session_start`]    = null;
    updates[`ps5_sessions/${id}/is_paused`]        = false;
    updates[`ps5_sessions/${id}/customer_name`]    = "";
    updates[`ps5_sessions/${id}/payment_status`]   = null;
    updates[`ps5_sessions/${id}/payment_amount`]   = 0;
    updates[`ps5_sessions/${id}/due_key`]          = null;
    updates[`ps5_sessions/${id}/timer_started_at`] = null;
  });
  await update(ref(db), updates);
}

// Clear all payments (sales revenue history)
export async function clearPayments() {
  await set(ref(db, "payments"), null);
}

// Clear all canteen sales
export async function clearSales() {
  await set(ref(db, "sales"), null);
}

// Clear all pending dues
export async function clearPendingDues() {
  await set(ref(db, "pending_dues"), null);
}

// Clear session history log
export async function clearSessionHistory() {
  await set(ref(db, "session_history"), null);
}

// Clear withdrawals / audit log
export async function clearWithdrawals() {
  await set(ref(db, "withdrawals"), null);
  await set(ref(db, "bank_transfers"), null);
  await set(ref(db, "audit_log"), null);
}

// Reset cash ledger to zero
export async function resetCashLedger(cashBalance = 0, bankBalance = 0) {
  await set(ref(db, "cash_ledger"), {
    cash_balance: cashBalance,
    bank_balance: bankBalance,
    last_updated: Date.now(),
  });
}

// Nuclear option — wipe ALL transactional data (keeps devices + settings + canteen)
export async function clearAllTransactionalData() {
  await Promise.all([
    set(ref(db, "payments"),        null),
    set(ref(db, "sales"),           null),
    set(ref(db, "pending_dues"),    null),
    set(ref(db, "session_history"), null),
    set(ref(db, "withdrawals"),     null),
    set(ref(db, "bank_transfers"),  null),
    set(ref(db, "audit_log"),       null),
    set(ref(db, "returns"),         null),
    resetAllPCSessions(),
    resetAllPS5Sessions(),
    set(ref(db, "cash_ledger"), { cash_balance: 0, bank_balance: 0, last_updated: Date.now() }),
  ]);
}