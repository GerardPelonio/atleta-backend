import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { getAuth, Auth } from 'firebase-admin/auth';
import path from 'path';
import fs from 'fs';

// 1. Embedded Credentials for atleta-v1 (Main Firebase)
const ATLETA_V1_CREDENTIAL = {
  projectId: 'atleta-v1',
  clientEmail: 'firebase-adminsdk-fbsvc@atleta-v1.iam.gserviceaccount.com',
  privateKey: "-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC3uUplDOcRtmgI\nSal38kCz4u/Zuq7RUIfi2TIgIgga6KmZObBbmIxVHSXluTeBXBho4+/BoW9csZ0l\nuIsnZx/uYe3rknZhP0K1k668PalrtVxiRM3hjUmrjNyXgjLyota0dtEj+lO5Pi8P\nH3XWL7XPhd2/tiVwbd1YE9dbll+HVdpkYnJgd86yHjQY2TCcXISnsFQZav6AyXhO\nm2+hn+9bdlxigtOkjHX4TUTzjSVtL5Pn4ECvt2aC5zRrABHUwiq+i35LxctPcmQG\nocoklMaV6eglp9UpaUBpQqckBpd9wmN96zPRPXzsGcvVzubVG4m3pZFCp0bmxq8G\nqsaCNxn1AgMBAAECggEAA0IZt+eN7II935HA2+Pzskz+wG9/XK5vLn54FVpNJv8D\nzPgZMNKogHTrIGMTwStLMocCUD6G7U+oEAxxCVKanh1l/QTErS5URkiXc3are8HE\nYOjD9vFMwmpV2ikAss1g/ePSiy8MD4+zAXNnIVSIxqSi3VzDVrZYE9EMQ29MA+gh\n7LYqCQ2Xt52F614Xn08Vnhw2EhsECXI1NY/YsFW5F3Ucnczuaww6cb7yel0UHNcz\ncvZoMWurKveRnRhevif7EWAGktPfXFa26+WbAys6iAEiFZYAth2S6Ph37CUiUF1x\nqvObFaV+1f2sVVkFzplP+1yEPYs4T+QGUmSMwr7GIQKBgQDev0QF+y/9PAuiS54K\na0aaZA1sEylQkZS88geHOOCgaJ4vC0UzbUJ4413DRFfVgDTdxBaIP1n6Wjmguq/+\nTE4KXRUgJqakEXOE+sVKvetj1oOuv9+5KRcToQ1cVugEnhSouG31kGe3c+3YGGgc\nWh0F9W8zQMafRz4cuFSIDpa4oQKBgQDTJqsr+d/ZkKvdUhoOlyG3HtXNW6TubLOf\ntt+DRM8SxveoirdwF96OrlEy30SgLJDr9TvyhBvf/K79p2VP7ygkRF38KRkqK0/Q\nwoILe4iT3rIHrh5jAoQPCW6/ymilYEFMVTSMcif8+oKNzw3hhrJlbyx88N76v3PR\n7Mn1QnH81QKBgBcXaOvd0GnGMcaPZEDcQiN7P9D2Y5AQp4S26oTgJpk6fzuNRY1B\nRGTX3T6C9UAS3GgpDdTuDFvhwpug/uGz81srryb4GspjbMBaZt2Ktr5Q3LHe/khp\ntBS623G5KLBh2u5qwCt23umrwPpn/VMDHIMjoHWFv5F/hzbe/RRlvsZBAoGBALsa\nY8mHFOW8PZ7TdsWBBF45E6lyUNb5Ob4IFU1Dtt5jsucFbIEGla8HJmqWzz/D3fNI\njoNarzyusv2PzMWlHYPtlP6yCFuGn6ZUBVpZb+/gAQ+vKbwAabbNW/bVTB9nCNW0\nFulw6qBP90njtOAoNIKPnfNkmaHF7sKROXB8HXe1AoGBAMgDm6QG65qdSh8eycpm\nGMFCNzMITf44HQdwsuBkM+CmAsnFojfznaxZTAAi0EIBjHa3B9puVJVud4EiidpB\nsqvb0Ss7+SIqdNzOkjJewqxupvbI6G3IKyKVPHgqZEIrae73KkWcw48gq7AL0axk\nxaBnYX+uoAqNq4f50UAkKNyn\n-----END PRIVATE KEY-----\n",
};



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

// -------------------------------------------------------------
// 1. Initialize Main App (atleta-v1) - Primary Firebase for Auth & Firestore
// -------------------------------------------------------------
let mainApp: App;
const existingDefault = getApps().find(a => a.name === '[DEFAULT]');
if (existingDefault) {
  mainApp = existingDefault;
} else {
  let mainCredential = cert(ATLETA_V1_CREDENTIAL);
  const envVal = process.env.FIREBASE_SERVICE_ACCOUNT_V1 || process.env.FIREBASE_SERVICE_ACCOUNT || process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  const parsedEnv = parseServiceAccount(envVal);
  if (parsedEnv && (parsedEnv.project_id === 'atleta-v1' || !parsedEnv.project_id)) {
    if (parsedEnv.private_key) parsedEnv.private_key = parsedEnv.private_key.replace(/\\n/g, '\n');
    mainCredential = cert(parsedEnv);
  } else {
    const localKey = findLocalKey('serviceAccountKey.v1.json') || findLocalKey('serviceAccountKey.json');
    if (localKey) {
      try {
        const parsed = JSON.parse(fs.readFileSync(localKey, 'utf8'));
        if (parsed.project_id === 'atleta-v1') {
          mainCredential = cert(localKey);
        }
      } catch {
        // fallback to ATLETA_V1_CREDENTIAL
      }
    }
  }

  try {
    mainApp = initializeApp({
      credential: mainCredential,
      projectId: 'atleta-v1',
    });
  } catch (err: any) {
    console.warn('⚠️ Main Firebase App (atleta-v1) initialization warning:', err?.message || err);
    mainApp = getApps()[0] || initializeApp({ projectId: 'atleta-v1' });
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

