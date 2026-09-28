import { initializeApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';

const targetProjectId = process.env.FIREBASE_PROJECT_ID || 'atleta-v2';

const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY || 'AIzaSyDTueY4OduMENmSef3BH6ZEmSqXLiQG5Ls',
  authDomain: process.env.FIREBASE_AUTH_DOMAIN || `${targetProjectId}.firebaseapp.com`,
  projectId: targetProjectId,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET || `${targetProjectId}.appspot.com`,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || '1:203586668533:web:30fba3838ff5f78e9302bc',
  appId: process.env.FIREBASE_APP_ID || 'G-6ZF67G2PK2',
};

const firebaseApp = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
export const clientAuth = getAuth(firebaseApp);
export default firebaseApp;
