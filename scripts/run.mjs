import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { homedir } from 'node:os';
import { createRequire } from 'node:module';
import { config } from 'dotenv';
// Decode directory names, including Arabic and spaces, from the file URL.
import { fileURLToPath } from 'node:url';
const workspace = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const api = resolve(workspace, 'apps/api'),
  web = resolve(workspace, 'apps/web');
const req = createRequire(resolve(workspace, 'package.json'));
const apiReq = createRequire(resolve(api, 'package.json'));
let node = process.execPath;
if (Number(process.versions.node.split('.')[0]) < 22) {
  const bundled = resolve(
    homedir(),
    '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe',
  );
  if (process.platform === 'win32' && existsSync(bundled)) node = bundled;
  else throw new Error('Install Node.js 22.12+ before running this project');
}
config({ path: resolve(workspace, '.env') });
function cli(name, path, r = req) {
  return resolve(dirname(r.resolve(name + '/package.json')), path);
}
const commands = {
  build: [
    [cli('typescript', 'bin/tsc'), ['-p', 'apps/api/tsconfig.json'], workspace],
    [cli('typescript', 'bin/tsc'), ['-p', 'apps/web/tsconfig.json'], workspace],
    [cli('vite', 'bin/vite.js'), ['build'], web],
  ],
  test: [[cli('vitest', 'vitest.mjs', apiReq), ['run'], api]],
  'test:e2e': [[cli('@playwright/test', 'cli.js'), ['test'], workspace]],
  'db:generate': [[cli('prisma', 'build/index.js'), ['generate'], api]],
  'db:migrate': [[cli('prisma', 'build/index.js'), ['migrate', 'deploy'], api]],
  'db:init': [[cli('tsx', 'dist/cli.mjs'), ['src/init.ts'], api]],
  'db:references': [[cli('tsx', 'dist/cli.mjs'), ['src/init.ts', '--references'], api]],
  'mail:verify': [[cli('tsx', 'dist/cli.mjs'), ['src/check-mail.ts'], api]],
  'dev:services': [[resolve(workspace, 'scripts/dev-services.mjs'), [], workspace]],
  dev: [
    [cli('tsx', 'dist/cli.mjs'), ['watch', 'src/main.ts'], api],
    [cli('vite', 'bin/vite.js'), ['--host', '127.0.0.1'], web],
  ],
};
const command = process.argv[2];
const tasks = commands[command];
if (!tasks) throw new Error('Unknown command');
if (command === 'build') process.env.NODE_ENV = 'production';
const children = new Set();
const run = ([file, args, cwd]) =>
  new Promise((resolveRun, reject) => {
    const child = spawn(node, [file, ...args], {
      cwd,
      env: process.env,
      stdio: 'inherit',
      windowsHide: true,
    });
    children.add(child);
    child.on('error', reject);
    child.on('exit', (code) => {
      children.delete(child);
      code === 0 ? resolveRun() : reject(new Error('Command failed with exit ' + code));
    });
  });
function stop() {
  for (const child of children) child.kill();
}
process.on('SIGINT', () => {
  stop();
  process.exit(130);
});
process.on('SIGTERM', () => {
  stop();
  process.exit(143);
});
try {
  if (command === 'dev') await Promise.all(tasks.map(run));
  else for (const task of tasks) await run(task);
} catch (error) {
  console.error(error.message);
  stop();
  process.exitCode = 1;
}
