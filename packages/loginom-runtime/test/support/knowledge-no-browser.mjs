import { registerHooks } from 'node:module';

if (process.env.LOGINOM_TEST_HELD_HELP_MANIFEST) {
  const { mock } = await import('node:test');
  const filesystem = await import('node:fs/promises');
  const gate = Promise.withResolvers();
  process.on('message', message => { if (message?.fixture_release_help === true) gate.resolve(); });
  mock.module('node:fs/promises', { defaultExport: filesystem.default, namedExports: {
    ...Object.fromEntries(Object.entries(filesystem).filter(([name]) => name !== 'default')),
    async readFile(path, ...options) {
      if (path === process.env.LOGINOM_TEST_HELD_HELP_MANIFEST) await gate.promise;
      return filesystem.readFile(path, ...options);
    },
  } });
}

registerHooks({ resolve(specifier, context, nextResolve) {
  if (/playwright|child_process|\/lib\/(?:session|bridge)\.mjs|connection-check\.mjs/.test(specifier))
    throw Error('Knowledge process imported a browser dependency');
  return nextResolve(specifier, context);
} });
