import express, { Express } from 'express';
import { resolve, extname } from 'node:path';
import { existsSync } from 'node:fs';
import { db } from './db';

export function mountWeb(app: Express, directory = resolve(__dirname, '../../web/dist')) {
  const index = resolve(directory, 'index.html');
  if (!existsSync(index)) throw new Error('Built web frontend is missing');
  app.get('/healthz', async (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      await db.$queryRaw`SELECT 1`;
      res.json({ status: 'ok' });
    } catch {
      res.status(503).json({ status: 'unavailable' });
    }
  });
  const files = express.static(directory, { dotfiles: 'deny', index: false });
  app.use((req, res, next) => {
    if (
      req.path === '/api' ||
      req.path.startsWith('/api/') ||
      !['GET', 'HEAD'].includes(req.method)
    )
      return next();
    files(req, res, (error) => {
      if (error) return next(error);
      if (extname(req.path)) return res.sendStatus(404);
      res.setHeader('Cache-Control', 'no-store');
      res.sendFile(index);
    });
  });
}
