# 🔥 Firebase Setup Guide

## Step 1 — Create Firebase Project
1. Go to https://console.firebase.google.com
2. Click **Add project** → name it `mario-gaming-cafe`
3. Disable Google Analytics → **Create project**

## Step 2 — Enable Realtime Database
1. Left sidebar → **Realtime Database** → **Create database**
2. Choose **Start in test mode** → **Enable**
3. Copy your database URL (looks like: `https://mario-gaming-cafe-default-rtdb.firebaseio.com`)

## Step 3 — Get your Firebase Config
1. Click ⚙️ **Project Settings** (top left gear icon)
2. Scroll to **"Your apps"** → click **</>** (Web app)
3. Register app name: `mario-gaming-manager` → **Register app**
4. Copy the entire `firebaseConfig` object shown

## Step 4 — Paste Config into the project

Open `manager/src/firebase.js` and replace the placeholder:

```js
const firebaseConfig = {
  apiKey: "AIzaSy...",              // ← paste your values
  authDomain: "mario-gaming-cafe.firebaseapp.com",
  databaseURL: "https://mario-gaming-cafe-default-rtdb.firebaseio.com",
  projectId: "mario-gaming-cafe",
  storageBucket: "mario-gaming-cafe.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef"
};
```

## Step 5 — Set PC Client Project ID

Open `computer-client/main.js` and replace:
```js
const FIREBASE_PROJECT_ID = "mario-gaming-cafe"; // ← your project ID
```

## Step 6 — Set Firebase Rules (for production)

In Firebase Console → Realtime Database → Rules, paste:
```json
{
  "rules": {
    ".read": true,
    ".write": true
  }
}
```
(Keep test mode for now, lock down later with auth)

## Step 7 — Run the Manager

```cmd
cd manager
npm install
npm start
```

Opens at http://localhost:3000
Firebase will auto-seed all 4 PCs and canteen items on first load.

## Step 8 — Run PC Client

```cmd
cd computer-client
npm install
npx electron .
```

Change `DEVICE_ID` in `main.js` (1-4) before running on each PC.

## ✅ No server needed!
Everything runs through Firebase. The manager dashboard
and all PC clients connect directly to Firebase Realtime Database.
