import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { getAuth, Auth } from 'firebase-admin/auth';
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

  // 4. Check for local serviceAccountKey file (Local development)
  function findServiceAccountFile(filename: string): string | null {
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

  const customPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (customPath && fs.existsSync(customPath)) {
    return cert(customPath);
  }

  const serviceAccountPath = findServiceAccountFile('serviceAccountKey.json');
  if (serviceAccountPath) {
    return cert(serviceAccountPath);
  }

  // 5. Default embedded service account for atleta-v1
  try {
    return cert({
      projectId: 'atleta-v1',
      clientEmail: 'firebase-adminsdk-fbsvc@atleta-v1.iam.gserviceaccount.com',
      privateKey: "-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC3uUplDOcRtmgI\nSal38kCz4u/Zuq7RUIfi2TIgIgga6KmZObBbmIxVHSXluTeBXBho4+/BoW9csZ0l\nuIsnZx/uYe3rknZhP0K1k668PalrtVxiRM3hjUmrjNyXgjLyota0dtEj+lO5Pi8P\nH3XWL7XPhd2/tiVwbd1YE9dbll+HVdpkYnJgd86yHjQY2TCcXISnsFQZav6AyXhO\nm2+hn+9bdlxigtOkjHX4TUTzjSVtL5Pn4ECvt2aC5zRrABHUwiq+i35LxctPcmQG\nocoklMaV6eglp9UpaUBpQqckBpd9wmN96zPRPXzsGcvVzubVG4m3pZFCp0bmxq8G\nqsaCNxn1AgMBAAECggEAA0IZt+eN7II935HA2+Pzskz+wG9/XK5vLn54FVpNJv8D\nzPgZMNKogHTrIGMTwStLMocCUD6G7U+oEAxxCVKanh1l/QTErS5URkiXc3are8HE\nYOjD9vFMwmpV2ikAss1g/ePSiy8MD4+zAXNnIVSIxqSi3VzDVrZYE9EMQ29MA+gh\n7LYqCQ2Xt52F614Xn08Vnhw2EhsECXI1NY/YsFW5F3Ucnczuaww6cb7yel0UHNcz\ncvZoMWurKveRnRhevif7EWAGktPfXFa26+WbAys6iAEiFZYAth2S6Ph37CUiUF1x\nqvObFaV+1f2sVVkFzplP+1yEPYs4T+QGUmSMwr7GIQKBgQDev0QF+y/9PAuiS54K\na0aaZA1sEylQkZS88geHOOCgaJ4vC0UzbUJ4413DRFfVgDTdxBaIP1n6Wjmguq/+\nTE4KXRUgJqakEXOE+sVKvetj1oOuv9+5KRcToQ1cVugEnhSouG31kGe3c+3YGGgc\nWh0F9W8zQMafRz4cuFSIDpa4oQKBgQDTJqsr+d/ZkKvdUhoOlyG3HtXNW6TubLOf\ntt+DRM8SxveoirdwF96OrlEy30SgLJDr9TvyhBvf/K79p2VP7ygkRF38KRkqK0/Q\nwoILe4iT3rIHrh5jAoQPCW6/ymilYEFMVTSMcif8+oKNzw3hhrJlbyx88N76v3PR\n7Mn1QnH81QKBgBcXaOvd0GnGMcaPZEDcQiN7P9D2Y5AQp4S26oTgJpk6fzuNRY1B\nRGTX3T6C9UAS3GgpDdTuDFvhwpug/uGz81srryb4GspjbMBaZt2Ktr5Q3LHe/khp\ntBS623G5KLBh2u5qwCt23umrwPpn/VMDHIMjoHWFv5F/hzbe/RRlvsZBAoGBALsa\nY8mHFOW8PZ7TdsWBBF45E6lyUNb5Ob4IFU1Dtt5jsucFbIEGla8HJmqWzz/D3fNI\njoNarzyusv2PzMWlHYPtlP6yCFuGn6ZUBVpZb+/gAQ+vKbwAabbNW/bVTB9nCNW0\nFulw6qBP90njtOAoNIKPnfNkmaHF7sKROXB8HXe1AoGBAMgDm6QG65qdSh8eycpm\nGMFCNzMITf44HQdwsuBkM+CmAsnFojfznaxZTAAi0EIBjHa3B9puVJVud4EiidpB\nsqvb0Ss7+SIqdNzOkjJewqxupvbI6G3IKyKVPHgqZEIrae73KkWcw48gq7AL0axk\nxaBnYX+uoAqNq4f50UAkKNyn\n-----END PRIVATE KEY-----\n",
    });
  } catch (e: any) {
    console.warn('⚠️ Could not initialize default embedded service account:', e.message);
  }

  return undefined;
}

// Initialize Firebase Admin SDK (only if not already initialized)
if (!getApps().length) {
  try {
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
  } catch (err: any) {
    console.warn('⚠️ Firebase Admin initializeApp warning:', err?.message || err);
  }
}

let dbInstance: Firestore;
let authInstance: Auth;

try {
  const app = getApps()[0];
  const targetDatabaseId = process.env.FIRESTORE_DATABASE_ID || process.env.FIREBASE_DATABASE_ID || '(default)';
  
  try {
    if (app && targetDatabaseId && targetDatabaseId !== '(default)' && targetDatabaseId !== 'default') {
      dbInstance = getFirestore(app, targetDatabaseId);
    } else if (app) {
      dbInstance = getFirestore(app);
    } else {
      dbInstance = getFirestore();
    }
  } catch (errNamed: any) {
    console.warn(`⚠️ Named database '${targetDatabaseId}' connection note:`, errNamed?.message || errNamed);
    dbInstance = app ? getFirestore(app) : getFirestore();
  }
} catch (e: any) {
  console.warn('⚠️ Firestore initialization warning:', e?.message || e);
  dbInstance = {} as Firestore;
}

try {
  const app = getApps()[0];
  authInstance = app ? getAuth(app) : getAuth();
} catch (e: any) {
  console.warn('⚠️ Firebase Auth initialization warning:', e?.message || e);
  authInstance = {} as Auth;
}

// Export Firestore and Auth instances
export const db: Firestore = dbInstance;
export const auth: Auth = authInstance;

