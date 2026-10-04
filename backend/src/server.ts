import path from 'path';
import fs from 'fs';
import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { Logger } from './utils/Logger';
import { createApiRouter } from './api/routes';

/**
 * Setup Express server for Codex backend
 */
export function setupServer(): Application {
  const app = express();
  const logger = new Logger('Server');

  app.use(cors({ origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'] }));
  app.options('*', cors());

  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  // Request logging
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      logger.info(`${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
    });
    next();
  });

  // Health check
  app.get('/health', (req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // API Routes
  app.use('/api', createApiRouter());

  // Serve static frontend files in production if available
  const frontendCandidates = [
    path.resolve(__dirname, '../../frontend/dist'),
    path.resolve(__dirname, '../frontend/dist'),
    path.resolve(process.cwd(), 'frontend/dist'),
    path.resolve(process.cwd(), '../frontend/dist'),
    '/opt/render/project/src/frontend/dist',
  ];
  const staticPath = frontendCandidates.find((p) => fs.existsSync(p));

  if (staticPath) {
    logger.info(`Serving static frontend from: ${staticPath}`);
    app.use(express.static(staticPath));
    app.get('*', (req: Request, res: Response) => {
      if (req.path.startsWith('/api') || req.path === '/health') {
        return res.status(404).json({ error: 'Not found' });
      }
      res.sendFile(path.join(staticPath, 'index.html'));
    });
  } else {
    logger.warn('Frontend dist directory not found. Static serving disabled.');
    // 404 handler
    app.use((req: Request, res: Response) => {
      res.status(404).json({ error: 'Not found' });
    });
  }

  // Error handler
  app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    logger.error('Unhandled error:', err);
    res.status(500).json({
      error: 'Internal server error',
      message: err.message,
    });
  });

  return app;
}

export default setupServer;
