import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express from 'express';
import {join} from 'node:path';

const browserDistFolder = join(import.meta.dirname, '../browser');

const app = express();
app.use(express.json());

const angularApp = new AngularNodeAppEngine({
  allowedHosts: [
    'localhost',
    '127.0.0.1',
    '0.0.0.0',
    '*.run.app',
    '*.google.com',
    '*.aistudio.google.com',
    '*.web.app',
    '*.firebaseapp.com'
  ]
});

/**
 * Example Express Rest API endpoints can be defined here.
 * Uncomment and define endpoints as necessary.
 *
 * Example:
 * ```ts
 * app.get('/api/{*splat}', (req, res) => {
 *   // Handle API request
 * });
 * ```
 */

// Health check endpoints for Cloud Run, Kubernetes, and uptime probes
app.get(['/health', '/api/health', '/_healthz', '/ready', '/livez'], (_req, res) => {
  res.status(200).send('OK');
});

// Middleware to handle Google Cloud Run probes and sanitize internal IP Host headers
// preventing Angular SSR 400 Bad Request / SSRF rejection on Cloud Run health checks
app.use((req, res, next) => {
  const userAgent = req.headers['user-agent'] || '';
  if (typeof userAgent === 'string' && (userAgent.includes('GoogleHC') || userAgent.includes('kube-probe'))) {
    res.status(200).send('OK');
    return;
  }

  const rawHost = req.headers.host || '';
  const hostname = rawHost.split(':')[0].toLowerCase();
  const isAllowedDomain =
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '0.0.0.0' ||
    hostname.endsWith('.run.app') ||
    hostname.endsWith('.google.com') ||
    hostname.endsWith('.aistudio.google.com') ||
    hostname.endsWith('.web.app') ||
    hostname.endsWith('.firebaseapp.com');

  if (!isAllowedDomain) {
    const portPart = rawHost.includes(':') ? `:${rawHost.split(':')[1]}` : '';
    req.headers.host = `localhost${portPart}`;
  }
  next();
});

/**
 * Serve static files from /browser
 */
app.use(
  express.static(browserDistFolder, {
    maxAge: '1y',
    index: false,
    redirect: false,
  }),
);

/**
 * Handle all other requests by rendering the Angular application.
 */
app.use((req, res, next) => {
  angularApp
    .handle(req)
    .then((response) =>
      response ? writeResponseToNodeResponse(response, res) : next(),
    )
    .catch(next);
});

/**
 * Start the server if this module is the main entry point, or it is ran via PM2 / container runner.
 * The server listens on the port defined by the `PORT` environment variable (defaults to 3000),
 * explicitly binding to 0.0.0.0 for Cloud Run container environments.
 */
if (isMainModule(import.meta.url) || process.env['pm_id']) {
  const port = Number(process.env['PORT']) || 3000;
  app.listen(port, '0.0.0.0', () => {
    console.log(`Node Express server listening on http://0.0.0.0:${port}`);
  });
}

/**
 * Request handler used by the Angular CLI (for dev-server and during build) or Firebase Cloud Functions.
 */
export const reqHandler = createNodeRequestHandler(app);
