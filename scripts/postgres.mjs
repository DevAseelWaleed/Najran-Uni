import EmbeddedPostgres from 'embedded-postgres';
import { Client } from 'pg';
import { cp, mkdir, writeFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
// Native PostgreSQL on Windows cannot resolve some Unicode installation paths.
// Keep executable/share paths in an ASCII temporary directory; data stays persistent.
export default class Postgres {
  constructor(options) {
    this.options = options;
    if (process.platform !== 'win32') this.delegate = new EmbeddedPostgres(options);
  }
  async initialise() {
    if (this.delegate) return this.delegate.initialise();
    await this.prepare();
    const pw = resolve(tmpdir(), 'portal-pg-pw-' + randomUUID());
    await writeFile(pw, this.options.password + '\n', { mode: 0o600 });
    try {
      await promisify(execFile)(
        resolve(this.bin, 'initdb.exe'),
        [
          '-D',
          this.options.databaseDir,
          '-U',
          this.options.user,
          '--pwfile=' + pw,
          '--auth=scram-sha-256',
          '--encoding=UTF8',
          '--locale=C',
        ],
        { windowsHide: true },
      );
    } finally {
      await unlink(pw);
    }
  }
  async prepare() {
    if (this.bin) return;
    const { initdb } = await import('@embedded-postgres/windows-x64');
    const root = resolve(tmpdir(), 'portal-pg-native-18');
    await mkdir(root, { recursive: true });
    await cp(resolve(dirname(initdb), '..'), root, { recursive: true, force: false });
    this.bin = resolve(root, 'bin');
  }
  async start() {
    if (this.delegate) return this.delegate.start();
    await this.prepare();
    this.process = spawn(
      resolve(this.bin, 'postgres.exe'),
      ['-D', this.options.databaseDir, '-p', String(this.options.port), '-h', '127.0.0.1'],
      { windowsHide: true, stdio: 'ignore' },
    );
    for (let i = 0; i < 100; i++) {
      const c = this.getPgClient();
      try {
        await c.connect();
        await c.end();
        return;
      } catch {
        await c.end().catch(() => {});
        await new Promise((r) => setTimeout(r, 100));
      }
    }
    throw new Error('PostgreSQL did not start');
  }
  getPgClient() {
    if (this.delegate) return this.delegate.getPgClient();
    return new Client({
      host: '127.0.0.1',
      port: this.options.port,
      user: this.options.user,
      password: this.options.password,
      database: 'postgres',
    });
  }
  async createDatabase(name) {
    if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new Error('Unsafe database name');
    const c = this.getPgClient();
    await c.connect();
    try {
      await c.query(`CREATE DATABASE "${name}"`);
    } finally {
      await c.end();
    }
  }
  async stop() {
    if (this.delegate) return this.delegate.stop();
    if (this.bin && this.process)
      await promisify(execFile)(
        resolve(this.bin, 'pg_ctl.exe'),
        ['-D', this.options.databaseDir, 'stop', '-m', 'fast'],
        { windowsHide: true },
      );
  }
}
