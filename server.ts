import dotenv from 'dotenv';
dotenv.config();

import app from './app';
import { db } from './utils/firebaseAdmin';

const PORT = Number(process.env.PORT) || 5000;

function startServer() {
  try {
    if (db) {
      console.log('Firebase Firestore connection verified.');
    }

    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on http://0.0.0.0:${PORT}`);
    });

    server.on('error', (err) => {
      console.error('Server error:', err);
    });

    return server;
  } catch (err) {
    console.error('Server initialization error:', err);
    process.exit(1);
  }
}

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

if (!process.env.VERCEL) {
  startServer();
}

export default app;
