import { initializeApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';

const targetProjectId = process.env.FIREBASE_PROJECT_ID || 'atleta-v1';

const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY || 'AIzaSyDummyApiKeyForNodeTesting12345',
  authDomain: process.env.FIREBASE_AUTH_DOMAIN || `${targetProjectId}.firebaseapp.com`,
  projectId: targetProjectId,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET || `${targetProjectId}.appspot.com`,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || '123456789',
  appId: process.env.FIREBASE_APP_ID || '1:123456789:web:abcdef',
};

const firebaseApp = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
export const clientAuth = getAuth(firebaseApp);
export default firebaseApp;
