// Compatibility only; supported fork entry is the synchronous CommonJS bootstrap.
const implementation=await import('./managed-entry.cjs');
await implementation.default;
