import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import path from 'path';
import fs from 'fs';

function getFirebaseCredential() {
  // 1. Check for JSON string or base64 in environment variable (Ideal for Vercel)
  const envServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT || process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (envServiceAccount) {
    try {
      let parsed: any;
      if (typeof envServiceAccount === 'string') {
        const raw = envServiceAccount.trim();
        if (raw.startsWith('{')) {
          parsed = JSON.parse(raw);
        } else {
          const decoded = Buffer.from(raw, 'base64').toString('utf-8');
          parsed = JSON.parse(decoded);
        }
      } else {
        parsed = envServiceAccount;
      }
      if (parsed.private_key) {
        parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
      }
      return cert(parsed);
    } catch (e: any) {
      console.warn('⚠️ Could not parse FIREBASE_SERVICE_ACCOUNT as JSON:', e.message);
    }
  }

  // 2. Check for base64-encoded JSON in environment variable
  const base64ServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  if (base64ServiceAccount) {
    try {
      const decoded = Buffer.from(base64ServiceAccount, 'base64').toString('utf-8');
      const parsed = JSON.parse(decoded);
      if (parsed.private_key) {
        parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
      }
      return cert(parsed);
    } catch (e: any) {
      console.warn('⚠️ Could not parse FIREBASE_SERVICE_ACCOUNT_BASE64:', e.message);
    }
  }

  // 3. Check for individual environment variables
  if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
    const privateKey = process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');
    return cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: privateKey,
    });
  }

  // 4. Check for local serviceAccountKey.json file (Local development)
  const serviceAccountPath = path.resolve(__dirname, '..', 'serviceAccountKey.json');
  if (fs.existsSync(serviceAccountPath)) {
    return cert(serviceAccountPath);
  }

  console.warn('⚠️ No Firebase Admin credentials found! Please configure FIREBASE_SERVICE_ACCOUNT in Vercel.');
  return undefined;
}

// Initialize Firebase Admin SDK (only if not already initialized)
if (!getApps().length) {
  const credential = getFirebaseCredential();
  if (credential) {
    initializeApp({
      credential,
    });
  } else {
    initializeApp({
      projectId: process.env.FIREBASE_PROJECT_ID || 'atleta-v1',
    });
  }
}

// Export Firestore and Auth instances
export const db = getFirestore();
export const auth = getAuth();
