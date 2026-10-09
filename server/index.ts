import { loadEnvFile, readAppConfig } from './core/config';
import { UebApp, VERSION } from './core/app';
import { applyStoredSettings } from './core/settings';
import { createHttpServer } from './http';

loadEnvFile();
const cfg = applyStoredSettings(readAppConfig());
const app = new UebApp(cfg);
app.start();

const server = createHttpServer(app);
server.listen(cfg.port, () => {
  const prod = app.active?.config.name ?? '–';
  console.log(`
  ueBroadcast ${VERSION}
  Regie:      http://localhost:${cfg.port}
  Overlay:    ${cfg.publicUrl}/overlay.html?view=program
  Produktion: ${prod}
  OBS:        ${cfg.obsUrl ?? 'Simulation (OBS_URL nicht gesetzt)'}
`);
});

let stopping = false;
const shutdown = async () => {
  if (stopping) return;
  stopping = true;
  await app.stop();
  server.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
