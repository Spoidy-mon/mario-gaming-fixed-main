// speak.js — AI voice announcements using Web Speech API

const VOICE_SETTINGS = { rate: 0.92, pitch: 1.05, volume: 1.0, lang: "en-IN" };
let selectedVoice = null;

function loadVoice() {
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return;
  const priorities = [
    v => v.lang === "en-IN" && v.name.toLowerCase().includes("female"),
    v => v.lang === "en-IN",
    v => v.lang.startsWith("en") && v.name.toLowerCase().includes("female"),
    v => v.lang.startsWith("en"),
    v => true,
  ];
  for (const check of priorities) {
    const match = voices.find(check);
    if (match) { selectedVoice = match; break; }
  }
}

if (typeof window !== "undefined" && window.speechSynthesis) {
  loadVoice();
  window.speechSynthesis.onvoiceschanged = loadVoice;
}

export function speak(text, options = {}) {
  if (typeof window === "undefined" || !window.speechSynthesis || !text) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate   = options.rate   ?? VOICE_SETTINGS.rate;
  u.pitch  = options.pitch  ?? VOICE_SETTINGS.pitch;
  u.volume = options.volume ?? VOICE_SETTINGS.volume;
  u.lang   = VOICE_SETTINGS.lang;
  if (selectedVoice) u.voice = selectedVoice;
  setTimeout(() => window.speechSynthesis.speak(u), 80);
}

function minStr(min) {
  if (min >= 60) {
    const h = Math.floor(min/60), m = min%60;
    return m > 0 ? `${h} hour ${m} minutes` : `${h} hour${h>1?"s":""}`;
  }
  return `${min} minute${min!==1?"s":""}`;
}

export const announceSessionStarted = (pcName, customerName, totalMin) => {
  const who = customerName ? `for ${customerName}` : "";
  speak(`Session started on ${pcName} ${who}. Enjoy your ${minStr(totalMin)} gaming session!`);
};

export const announceSessionEnded = (pcName, customerName) => {
  const who = customerName ? `for ${customerName}` : "";
  speak(`Time is up! Session on ${pcName} has ended ${who}. Please contact staff to continue playing.`);
};

export const announceSessionPaused  = (pcName) => speak(`${pcName} session is now paused.`);
export const announceSessionResumed = (pcName) => speak(`${pcName} session has been resumed. Enjoy your game!`);

export const announceTimeAdded   = (pcName, min) => speak(`${minStr(min)} added to ${pcName}.`);
export const announceTimeReduced = (pcName, min) => speak(`${minStr(min)} removed from ${pcName}.`);

export const announceItemSold     = (itemName, pcName) =>
  speak(pcName ? `${itemName} sold to ${pcName}.` : `${itemName} sold.`);
export const announceItemReturned = (itemName) =>
  speak(`${itemName} returned. Stock has been updated.`);

export const announceShutdown = (pcName) =>
  speak(`Shutdown command sent to ${pcName}.`);

export const announceLowTime = (pcName, min) =>
  speak(`Attention! ${pcName} has only ${minStr(min)} remaining. Please top up soon.`);
