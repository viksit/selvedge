// playground/server.ts
// Bun server for Selvedge Playground
import { serve } from 'bun';
import { join } from 'path';

// Serve static files from playground/ui (no build step required for now)
const uiDir = join(import.meta.dir, 'ui');

// Simple static file server logic
async function serveStaticFile(req: Request): Promise<Response | undefined> {
  const url = new URL(req.url);
  let filePath = url.pathname === '/' ? '/index.html' : url.pathname;
  try {
    const file = Bun.file(join(uiDir, filePath));
    if (await file.exists()) {
      const contentType =
        filePath.endsWith('.js') ? 'application/javascript' :
        filePath.endsWith('.css') ? 'text/css' :
        filePath.endsWith('.json') ? 'application/json' :
        filePath.endsWith('.html') ? 'text/html' :
        'text/plain';
      return new Response(file, { headers: { 'Content-Type': contentType } });
    }
  } catch {}
  return undefined;
}

serve({
  port: 3000,
  async fetch(req) {
    const url = new URL(req.url);
    // API placeholder endpoints
    if (url.pathname.startsWith('/api/')) {
      if (url.pathname === '/api/generate' && req.method === 'POST') {
        // Placeholder: echo back the code
        const body = await req.json();
        return Response.json({ generated: '// Generated code placeholder', input: body.code });
      }
      if (url.pathname.startsWith('/api/generated/')) {
        // Placeholder: return dummy generated code
        return Response.json({ code: '// Loaded generated code placeholder' });
      }
      if (url.pathname === '/api/repl' && req.method === 'POST') {
        // Placeholder: echo back the REPL command
        const body = await req.json();
        return Response.json({ result: 'REPL output placeholder', input: body.command });
      }
      return new Response('Not found', { status: 404 });
    }
    // Static file serving
    const staticResp = await serveStaticFile(req);
    if (staticResp) return staticResp;
    // Fallback
    return new Response('Not found', { status: 404 });
  },
});

console.log('Selvedge Playground server running at http://localhost:3000');
