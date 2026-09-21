import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { privateDirectory } from '../lib/platform.mjs';

test('Windows ACL tools do not depend on PATH', { skip: process.platform !== 'win32' }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'loginom-platform-windows-'));
  const previous = process.env.PATH;
  try {
    process.env.PATH = '';
    await privateDirectory(directory);
    assert.ok(true);
  } finally {
    if (previous === undefined) delete process.env.PATH;
    else process.env.PATH = previous;
    await rm(directory, { recursive: true, force: true });
  }
});
