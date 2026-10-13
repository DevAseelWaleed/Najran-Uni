import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const api = resolve(root, 'apps/api');
const require = createRequire(resolve(root, 'package.json'));
let child;
let stopping = false;
for (const signal of ['SIGTERM', 'SIGINT'])
  process.on(signal, () => {
    stopping = true;
    if (child) child.kill(signal);
    else process.exit(0);
  });
function run(file, args = []) {
  if (stopping) return Promise.reject(new Error('Shutdown requested'));
  return new Promise((resolveRun, reject) => {
    child = spawn(process.execPath, [file, ...args], {
      cwd: api,
      env: process.env,
      stdio: 'inherit',
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      child = undefined;
      if (stopping) process.exit(0);
      code === 0 ? resolveRun() : reject(new Error('Cloud startup step failed'));
    });
  });
}
try {
  // Session pooler (5432), not transaction pooler, supports Prisma migrations.
  await run(require.resolve('prisma/build/index.js'), ['migrate', 'deploy']);
  await run(resolve(api, 'dist/init.js'));
  await run(resolve(api, 'dist/main.js'));
} catch {
  console.error('Cloud startup failed. Check database, migration and environment settings.');
  process.exitCode = 1;
}
