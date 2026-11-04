import { defineConfig } from 'vite';
import { handle } from './server/topmate.mjs';
import { attachRealtime } from './server/realtime.mjs';

/** Serves the Topmate profile proxy and the realtime (multiplayer) socket during dev and preview. */
const melaServer = () => {
  // Returning nothing matters: a value returned from configureServer is treated as a post hook.
  const mount = (server) => {
    server.middlewares.use('/api/topmate', (req, res) => handle(req, res));
    if (server.httpServer) attachRealtime(server.httpServer, '/ws');
  };
  return { name: 'mela-server', configureServer: mount, configurePreviewServer: mount };
};

// Testing links come through a Cloudflare quick tunnel; Vite refuses unknown hostnames otherwise.
const TUNNEL_HOSTS = ['.trycloudflare.com'];

export default defineConfig({
  plugins: [melaServer()],
  server: { allowedHosts: TUNNEL_HOSTS },
  preview: { allowedHosts: TUNNEL_HOSTS },
});
