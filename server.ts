/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * UMED Local & Cloud Run Entry Server
 * Mounts Unified API Routes from ./api/index.ts + Vite Dev Middleware or Static Production Build
 */

import express from 'express';
import type { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import fs from 'fs';
import { app } from './api/index.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const INITIAL_OWNER_EMAIL = (process.env.INITIAL_OWNER_EMAIL || 'alssaedy50@gmail.com, alssaedy500@gmail.com, doctoshi50@gmail.com').trim().toLowerCase();

async function startServer() {
  // Explicitly serve Service Worker with standard PWA and scope headers
  app.get('/sw.js', (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('Service-Worker-Allowed', '/');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    const swPath = path.resolve(__dirname, 'public', 'sw.js');
    if (fs.existsSync(swPath)) {
      res.sendFile(swPath);
    } else {
      res.status(404).end();
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        allowedHosts: true,
        hmr: process.env.DISABLE_HMR !== 'true',
        watch: process.env.DISABLE_HMR === 'true' ? null : {}
      },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[UMED Server] Running on http://localhost:${PORT}`);
    console.log(`[UMED Server] Initial Owner Email: ${INITIAL_OWNER_EMAIL}`);
  });
}

startServer();
