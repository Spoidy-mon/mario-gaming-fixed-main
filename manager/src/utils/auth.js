

// auth.js — Persistent admin session using sessionStorage
// Stays unlocked across tab switches, resets on browser/app close

import { ref, get } from "firebase/database";
import { db } from "../firebase";

const AUTH_KEY      = "mario_admin_unlocked";
const FALLBACK_PASS = "rajeev"; // used if Firebase has no adminPassword set

export function isUnlocked() {
  return sessionStorage.getItem(AUTH_KEY) === "yes";
}

export async function tryUnlock(password) {
  try {
    const snap = await get(ref(db, "settings/adminPassword"));
    const stored = snap.val();
    const correct = stored ? String(stored) : FALLBACK_PASS;
    if (password === correct) {
      sessionStorage.setItem(AUTH_KEY, "yes");
      return true;
    }
    return false;
  } catch (e) {
    // Fallback to hardcoded if Firebase unreachable
    if (password === FALLBACK_PASS) {
      sessionStorage.setItem(AUTH_KEY, "yes");
      return true;
    }
    return false;
  }
}

export function lockAdmin() {
  sessionStorage.removeItem(AUTH_KEY);
}