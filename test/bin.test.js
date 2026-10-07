import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

// npm runs package bins through a symlink (node_modules/.bin/continente-mcp).
test('server starts when launched through a bin symlink', { skip: process.platform === 'win32' && 'symlinks need privileges on Windows' }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'continente-bin-test-'));
  try {
    const bin = join(dir, 'continente-mcp');
    symlinkSync(fileURLToPath(new URL('../src/index.js', import.meta.url)), bin);
    const child = spawn(process.execPath, [bin], { env: { ...process.env, HOME: dir, CONTINENTE_STATE_DIR: dir } });
    const reply = new Promise((resolve, reject) => {
      let out = '';
      child.stdout.on('data', chunk => { out += chunk; if (out.includes('\n')) resolve(JSON.parse(out.split('\n')[0])); });
      child.on('exit', code => reject(new Error(`server exited (${code}) without replying`)));
    });
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {
      protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } } }) + '\n');
    try {
      assert.equal((await reply).result.serverInfo.name, 'continente-mcp');
    } finally {
      child.kill();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
