import { initializeApp, getApps, cert, applicationDefault, type App, type ServiceAccount } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { getAuth, Auth } from 'firebase-admin/auth';
import path from 'path';
import fs from 'fs';

function parseServiceAccount(rawVal?: string): ServiceAccount | null {
  if (!rawVal) return null;

  const raw = rawVal.trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf-8'));
  } catch {
    throw new Error('Firebase service account configuration must be valid JSON or base64-encoded JSON.');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Firebase service account configuration must contain a JSON object.');
  }

  const data = parsed as Record<string, unknown>;
  const projectId = typeof data.projectId === 'string'
    ? data.projectId
    : typeof data.project_id === 'string' ? data.project_id : undefined;
  const clientEmail = typeof data.clientEmail === 'string'
    ? data.clientEmail
    : typeof data.client_email === 'string' ? data.client_email : undefined;
  const privateKey = typeof data.privateKey === 'string'
    ? data.privateKey
    : typeof data.private_key === 'string' ? data.private_key : undefined;

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error('Firebase service account configuration is missing required fields.');
  }

  return {
    projectId,
    clientEmail,
    privateKey: privateKey.replace(/\\n/g, '\n'),
  };
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

function getCredential(
  serviceAccount: ServiceAccount | null,
  localKey: string | null,
  projectId: string,
) {
  const account = serviceAccount
    ?? (localKey ? parseServiceAccount(fs.readFileSync(localKey, 'utf8')) : null);

  if (!account) return applicationDefault();
  if (account.projectId !== projectId) {
    throw new Error(`Firebase service account must belong to ${projectId}.`);
  }
  return cert(account);
}

// -------------------------------------------------------------
// 1. Initialize Main App (atleta-v1) - Primary Firebase for Auth
// -------------------------------------------------------------
let mainApp: App;
const existingDefault = getApps().find(a => a.name === '[DEFAULT]');
if (existingDefault) {
  mainApp = existingDefault;
} else {
  const mainServiceAccount = parseServiceAccount(
    process.env.FIREBASE_SERVICE_ACCOUNT || process.env.FIREBASE_SERVICE_ACCOUNT_KEY,
  );
  const localMainKey = mainServiceAccount ? null : findLocalKey('serviceAccountKey.v1.json');
  const mainCredential = getCredential(mainServiceAccount, localMainKey, 'atleta-v1');

  mainApp = initializeApp({
    credential: mainCredential,
    projectId: 'atleta-v1',
  });
}

// -------------------------------------------------------------
// 2. Initialize Firestore App (atleta-v2) - Firestore Backup Store
// -------------------------------------------------------------
let firestoreApp: App;
const existingV2 = getApps().find(a => a.name === 'atleta-v2-firestore');
if (existingV2) {
  firestoreApp = existingV2;
} else {
  const v2ServiceAccount = parseServiceAccount(
    process.env.FIREBASE_SERVICE_ACCOUNT_V2 || process.env.FIREBASE_SERVICE_ACCOUNT_KEY_V2,
  );
  const localV2Key = v2ServiceAccount
    ? null
    : findLocalKey('serviceAccountKey.v2.json') || findLocalKey('serviceAccountKey.json');
  const v2Credential = getCredential(v2ServiceAccount, localV2Key, 'atleta-v2');

  firestoreApp = initializeApp({
    credential: v2Credential,
    projectId: 'atleta-v2',
  }, 'atleta-v2-firestore');
}

// -------------------------------------------------------------
// 3. Export Auth (connected to atleta-v1 Main Firebase)
// -------------------------------------------------------------
export const auth: Auth = getAuth(mainApp);

// -------------------------------------------------------------
// 4. Export Firestore db (connected to atleta-v2 Firestore)
// -------------------------------------------------------------
export const db: Firestore = getFirestore(firestoreApp);

// Specific named instances
export const dbV1: Firestore = getFirestore(mainApp);
export const dbV2: Firestore = getFirestore(firestoreApp);
export const authV1: Auth = getAuth(mainApp);
export const v1App: App = mainApp;
export const v2App: App = firestoreApp;
