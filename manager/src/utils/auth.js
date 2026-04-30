// auth.js — Persistent admin session using sessionStorage
// Stays unlocked across tab switches, resets on browser/app close

const AUTH_KEY   = "mario_admin_unlocked";
const ADMIN_PASS = "rajeev";

export function isUnlocked() {
  return sessionStorage.getItem(AUTH_KEY) === "yes";
}

export function tryUnlock(password) {
  if (password === ADMIN_PASS) {
    sessionStorage.setItem(AUTH_KEY, "yes");
    return true;
  }
  return false;
}

export function lockAdmin() {
  sessionStorage.removeItem(AUTH_KEY);
}
