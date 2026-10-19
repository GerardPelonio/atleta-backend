import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { getAuth, Auth } from 'firebase-admin/auth';
import path from 'path';
import fs from 'fs';

function parseServiceAccount(rawVal?: string): any {
  if (!rawVal) return null;
  try {
    const raw = rawVal.trim();
    if (raw.startsWith('{')) {
      return JSON.parse(raw);
    }
    const decoded = Buffer.from(raw, 'base64').toString('utf-8');
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

function findLocalKey(filename: string): string | null {
  const candidates = [
    path.resolve(process.cwd(), filename),
    path.resolve(process.cwd(), 'Backend', filename),
    path.resolve(__dirname, '..', filename),
    path.resolve(__dirname, '../..', filename),
    path.resolve(__dirname, '../../..', filename),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

function getFirebaseAdminCredential() {
  const envVal = process.env.FIREBASE_SERVICE_ACCOUNT_V1 || process.env.FIREBASE_SERVICE_ACCOUNT || process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  const parsedEnv = parseServiceAccount(envVal);
  if (parsedEnv && (parsedEnv.project_id === 'atleta-v1' || !parsedEnv.project_id)) {
    if (parsedEnv.private_key) parsedEnv.private_key = parsedEnv.private_key.replace(/\\n/g, '\n');
    return cert(parsedEnv);
  }

  const localKey = findLocalKey('serviceAccountKey.v1.json') || findLocalKey('serviceAccountKey.json');
  if (localKey) {
    try {
      const parsed = JSON.parse(fs.readFileSync(localKey, 'utf8'));
      if (parsed.project_id === 'atleta-v1') {
        return cert(localKey);
      }
    } catch {
      // Continue to next fallback
    }
  }

  if (process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL) {
    return cert({
      projectId: process.env.FIREBASE_PROJECT_ID || 'atleta-v1',
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    });
  }

  return undefined;
}

// -------------------------------------------------------------
// 1. Initialize Main App (atleta-v1) - Primary Firebase for Auth & Firestore
// -------------------------------------------------------------
let mainApp: App;
const existingDefault = getApps().find(a => a.name === '[DEFAULT]');
if (existingDefault) {
  mainApp = existingDefault;
} else {
  const mainCredential = getFirebaseAdminCredential();

  const defaultProjectId = process.env.FIREBASE_PROJECT_ID || 'atleta-v1';
  try {
    mainApp = initializeApp({
      ...(mainCredential ? { credential: mainCredential } : {}),
      projectId: defaultProjectId,
    });
  } catch (err: any) {
    console.warn('⚠️ Main Firebase App initialization warning:', err?.message || err);
    mainApp = getApps()[0] || initializeApp({ projectId: defaultProjectId });
  }
}

// -------------------------------------------------------------
// 2. All Database Handles strictly use atleta-v1
// -------------------------------------------------------------
let firestoreApp: App = mainApp;

// -------------------------------------------------------------
// 3. Export Auth (connected to atleta-v1 Main Firebase)
// -------------------------------------------------------------
export const auth: Auth = getAuth(mainApp);
export const authV1: Auth = getAuth(mainApp);

// -------------------------------------------------------------
// 4. Export Firestore db (exclusively connected to atleta-v1)
// -------------------------------------------------------------
export const db: Firestore = getFirestore(mainApp);

// Specific named instances all point to atleta-v1 for 100% consistency
export const dbV1: Firestore = getFirestore(mainApp); // Primary Main Store (atleta-v1)
export const dbV2: Firestore = getFirestore(mainApp); // atleta-v1
export const dbBackup: Firestore = getFirestore(mainApp); // atleta-v1
export const v1App: App = mainApp;
export const v2App: App = mainApp;

