// lib/firebase.js
import { initializeApp, getApps } from "firebase/app";
import { getDatabase } from "firebase/database";
import { getMessaging, isSupported } from "firebase/messaging";

const firebaseConfig = {
  apiKey:            process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain:        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  databaseURL:       process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
  projectId:         process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket:     process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId:             process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  vapidKey:          process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
};

const configured = !!(firebaseConfig.projectId && firebaseConfig.databaseURL && firebaseConfig.apiKey);

let app      = null;
let database = null;

if (configured) {
  app      = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
  database = getDatabase(app);
} else {
  console.warn(
    "Safe360: Firebase is not configured.\n" +
    "Copy .env.local.example → .env.local and fill in your Firebase project values, then restart the dev server."
  );
}

const getFirebaseMessaging = async () => {
  if (!app) return null;
  const supported = await isSupported();
  return supported ? getMessaging(app) : null;
};

export { app, database, getFirebaseMessaging, firebaseConfig, configured };
