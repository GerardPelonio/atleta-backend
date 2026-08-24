import dotenv from 'dotenv';
dotenv.config();

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import routes from './routes';

const app = express();

app.set('trust proxy', 1);

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'Idempotency-Key',
    'If-None-Match',
    'Cache-Control',
    'Pragma',
    'Accept',
    'X-Requested-With',
  ],
}));

app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

app.use('/api/v1', routes);

app.get(['/', '/api', '/api/v1'], (req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    message: 'Atleta Athletic Performance Monitoring & Scouting API',
    version: '1.0',
    platform: 'FERN Stack (Firebase, Express, React Native, Node.js)',
    documentation: '/api/v1',
  });
});


app.get(['/health', '/api/health', '/api/v1/health'], (req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    uptime: process.uptime(),
    status: 'healthy',
    timestamp: new Date().toISOString(),
  });
});

app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: `Route '${req.method} ${req.originalUrl}' was not found on this server.`,
  });
});

app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  if (err instanceof SyntaxError && 'status' in err && err.status === 400 && 'body' in err) {
    res.status(400).json({ error: 'Invalid JSON format in request body.' });
    return;
  }
  console.error('Unhandled server error:', err);
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Internal Server Error',
  });
});

export default app;
