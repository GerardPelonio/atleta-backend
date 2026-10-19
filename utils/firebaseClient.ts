import 'dotenv/config';
import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';

const targetProjectId = process.env.FIREBASE_PROJECT_ID || 'atleta-v1';
const apiKey = process.env.FIREBASE_API_KEY || process.env.EXPO_PUBLIC_FIREBASE_API_KEY || '';

const firebaseConfig = {
  apiKey: apiKey,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN || (targetProjectId ? `${targetProjectId}.firebaseapp.com` : ''),
  projectId: targetProjectId,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET || (targetProjectId ? `${targetProjectId}.appspot.com` : ''),
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || '',
  appId: process.env.FIREBASE_APP_ID || '',
};

let firebaseApp: FirebaseApp;
let clientAuthInstance: Auth;

try {
  firebaseApp = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
  clientAuthInstance = getAuth(firebaseApp);
} catch (err: any) {
  console.warn('⚠️ Firebase Client Web SDK initialization warning:', err?.message || err);
  firebaseApp = getApps()[0];
  try {
    clientAuthInstance = firebaseApp ? getAuth(firebaseApp) : ({} as Auth);
  } catch {
    clientAuthInstance = {} as Auth;
  }
}

export const clientAuth: Auth = clientAuthInstance;
export default firebaseApp;
