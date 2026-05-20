import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";

// ── PASTE YOUR FIREBASE CONFIG HERE ──────────────────────────────────────────
// Get this from: Firebase Console → Project Settings
const firebaseConfig = {
  apiKey: "AIzaSyD9yPXFS3bKUvnabbxnOHAaXz8lc9venUg",
  authDomain: "mario-gaming-cafe.firebaseapp.com",
  databaseURL: "https://mario-gaming-cafe-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "mario-gaming-cafe",
  storageBucket: "mario-gaming-cafe.firebasestorage.app",
  messagingSenderId: "655135892566",
  appId: "1:655135892566:web:21c88f6d05c67383d607f7",
  measurementId: "G-32WWGZMSM5"
};

// ─────────────────────────────────────────────────────────────────────────────

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
