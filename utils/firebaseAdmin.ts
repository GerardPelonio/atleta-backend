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

// 2. Embedded Credentials for atleta-v2 (Firestore Database Backup / Active Store)
const ATLETA_V2_CREDENTIAL = {
  projectId: 'atleta-v2',
  clientEmail: 'firebase-adminsdk-fbsvc@atleta-v2.iam.gserviceaccount.com',
  privateKey: "-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDC91+3ZSpGEPKc\nyxR0+KZrYsYMrPO5JuTIkiq1/r2o39itIkqGfdrOsltWjuvZfsNJL2kRSobawzgb\nCiuMTwkWm0IB0FsBxQ4PfW83OZAU4KbTps/TPpaY7DaFT1aMg5x2YUONPM7A2PYP\nqUVpt6SW4zknIdCngsjycYOqnS2/LCy4YVJTg0GV/3kdxNkSKYVOmoM4am1lTYz9\n2cwYHX+wMpP8XSYIfjCo8DDBMqyHscjeV7ztnjC9bYX8Zx0E9v9sS3HpdWy2iFtu\n820N40bXav8imQD2iO+BkoAK3dVFpehFf2miDC50+qTlczl5vuj859o2H5OX0OD+\npFCdtfzVAgMBAAECggEAFZEKp/1LV1PRmpGGUkgdFJzo/ob1MOKCBUPR8K7cqP0V\n+VTlPIpYdWvaWbFWmokArixN6Yk+cJ2Oq8MMvSkS/squ2weCwafcHc+IyWmXLBAL\ntDbsH1h5jTH39/gmQUXfvWKV994lmsSFN4dIc+DKFpzM+iyt6ZG4i8UNxQY9BLv7\nBX6dejmKy2gpuZfokh8PEEd1Pu+HsXq4EqTVPKwESfSXjtCePjKl6YSm6xxa0NjO\ncS04Q2z9XmchgPZdRgqPRtraLz3aqnc2iqPeT/aT2ijEugh9XcEocpa/lvri4N2z\nEDHBKIXxZDnVH/zonvZ4Vr0PlkFYcEx9WpgRoDnnowKBgQD4I9KPulu/rcX8k9pt\n37xyDIw3A5U1e+WF+bs9kncSbb/rDTNqAxNkKlLC2DvmVefjqqxtaXNQ7RDtEWKg\nVA1r5wxvrtx0aVhjFCKV/qzGb3C5qOtNxCazSJOqNeyVQlOt7Z0fOCqWzpReDqe0\nHS5FUH3ciK8kLtlRXQ3gnIbyDwKBgQDJJF03oWYv3BQV6SZJJ4cKjySURA+D5443\nYbyjeuNuVmvlo+M6/qicJUDyiRkHula/b3c1bsJNf8utTtDsDaHKsyFqStcNlXWS\nRUu68FFvIT3qw4cNv3CVLzl7xrHMSLnI/jas/0AuQMdx8dNkUDhPukcgL0BZmWsv\n90bevC522wKBgAnc+qil4rG6yYzhn6QQaaAq6YPiS5MFqrjplUy8Pqln3WINc0a6\nepHXsNR33eGo9n+xMAtlTqUf1zVlJIN089efJnpl+/NQoKfHjBxkNB/rHBL1KO09\nZ8BmmSAB5raEHWljcYRlKiQ2b+VRNc9N/aHZsjcK49NPXWoDheKwthh3AoGBAIlQ\n9waUfBOuVlQDAG0uvAVcZaeGs2TkfvWWFtcwfPWFsFFsyiMrWWaIFEe/isP41WIJ\nscNbovCPjzf4t65/O/YKxoQvJZOTdlluT14G1EFe20tbQucCy9Q9EixLIHSLLbJm\nwmLmOyWYedBzPFKeZWMgk5AIUhEZKNDtKofCxqHDAoGBALT5gyHny250/mzIHOaH\nTy2/S7Xb8xq+SxF0J1DqHGPuLWMxrZtFUdBNLLzFz/Zv8vh9OlPhNZ2OeSih4Kmb\nhowxOwI0toJmTGKyRErIfhKBldQAqrzm6IsFkkToMgoBhh3eBK+90PfNvfW+vhGy\nTq6gaCZOpfd/j8l/tlIluWhf\n-----END PRIVATE KEY-----\n",
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
// 1. Initialize Main App (atleta-v1) - Primary Firebase for Auth
// -------------------------------------------------------------
let mainApp: App;
const existingDefault = getApps().find(a => a.name === '[DEFAULT]');
if (existingDefault) {
  mainApp = existingDefault;
} else {
  let mainCredential = cert(ATLETA_V1_CREDENTIAL);
  const envVal = process.env.FIREBASE_SERVICE_ACCOUNT || process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  const parsedEnv = parseServiceAccount(envVal);
  if (parsedEnv) {
    if (parsedEnv.private_key) parsedEnv.private_key = parsedEnv.private_key.replace(/\\n/g, '\n');
    mainCredential = cert(parsedEnv);
  } else {
    const localKey = findLocalKey('serviceAccountKey.v1.json');
    if (localKey) mainCredential = cert(localKey);
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
// 2. Initialize Firestore App (atleta-v2) - Firestore Backup Store
// -------------------------------------------------------------
let firestoreApp: App;
const existingV2 = getApps().find(a => a.name === 'atleta-v2-firestore');
if (existingV2) {
  firestoreApp = existingV2;
} else {
  let v2Credential = cert(ATLETA_V2_CREDENTIAL);
  const localV2Key = findLocalKey('serviceAccountKey.v2.json') || findLocalKey('serviceAccountKey.json');
  if (localV2Key) {
    try {
      const parsed = JSON.parse(fs.readFileSync(localV2Key, 'utf8'));
      if (parsed.project_id === 'atleta-v2') {
        v2Credential = cert(localV2Key);
      }
    } catch {
      // fallback to embedded ATLETA_V2_CREDENTIAL
    }
  }

  try {
    firestoreApp = initializeApp({
      credential: v2Credential,
      projectId: 'atleta-v2',
    }, 'atleta-v2-firestore');
  } catch (err: any) {
    console.warn('⚠️ Firestore App (atleta-v2) initialization warning:', err?.message || err);
    firestoreApp = mainApp;
  }
}

// -------------------------------------------------------------
// 3. Export Auth (connected to atleta-v1 Main Firebase)
// -------------------------------------------------------------
export const auth: Auth = getAuth(mainApp);

// -------------------------------------------------------------
// 4. Export Firestore db (connected to atleta-v1 Main Firebase)
// -------------------------------------------------------------
const targetFirestoreProject = process.env.FIRESTORE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || 'atleta-v1';
export const db: Firestore = (targetFirestoreProject === 'atleta-v2' && firestoreApp)
  ? getFirestore(firestoreApp)
  : getFirestore(mainApp);

// Specific named instances
export const dbV1: Firestore = getFirestore(mainApp);
export const dbV2: Firestore = getFirestore(firestoreApp);
export const authV1: Auth = getAuth(mainApp);
export const v1App: App = mainApp;
export const v2App: App = firestoreApp;
