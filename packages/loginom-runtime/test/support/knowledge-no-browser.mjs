import { registerHooks } from 'node:module';

registerHooks({ resolve(specifier, context, nextResolve) {
  if (/playwright|child_process|\/lib\/(?:session|bridge)\.mjs|connection-check\.mjs/.test(specifier))
    throw Error('Knowledge process imported a browser dependency');
  return nextResolve(specifier, context);
} });
