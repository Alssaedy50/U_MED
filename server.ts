/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * UMED Local & Cloud Run Entry Server
 * Mounts Unified API Routes from ./api/index.ts + Vite Dev Middleware or Static Production Build
 */

import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { app } from './api/index.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const INITIAL_OWNER_EMAIL = (process.env.INITIAL_OWNER_EMAIL || 'alssaedy50@gmail.com, alssaedy500@gmail.com').trim().toLowerCase();

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
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
