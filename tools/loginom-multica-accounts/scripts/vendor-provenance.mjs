import {createHash} from 'node:crypto';

// Exact retained source used to design the audited native lifetime. Observe
// responses in a new OWN page only; do not fetch scripts or alter owner tabs.
export const vendorSources = Object.freeze({
  Application: '1b922bfff58f5d71ab08bc25b3198da17ae2a4d2a7ce4c034265aca9de15bc78',
  ServerConnection: '4c8203aa04050c45f55f2dfec76ef65d93b056a9cbe092419a9bbea821e0c5a6',
  CustomClient: 'feb12b9040f155e581531b9796066de0c2fc65d23cfaa19fcbb7028af27e58de',
  Model: 'd3ab87a3aca82985d41a8b9d4b3502c9d8d662204c67c07fb3ff2156d802407a',
  RPC: '53d043e4a7ee9dcc8006aa8915ca43d83a1df427fa0d73d8ea403357ec61a28f',
});
const hash = value => createHash('sha256').update(value).digest('hex');

export function trackVendorSources(page) {
  const pending = [], seen = new Set(), failures = [];
  page.on('response', response => {
    if (!/javascript|ecmascript/i.test(response.headers()['content-type'] || '')
      && !new URL(response.url()).pathname.endsWith('.js')) return;
    pending.push((async () => {
      try {
        if (response.status() !== 200) throw Error('VENDOR_RESPONSE_INCOMPLETE');
        const bytes = await response.body();
        const digest = hash(bytes);
        if (Object.values(vendorSources).includes(digest)) seen.add(digest);
      } catch (error) {failures.push(error.name);}
    })());
  });
  return async () => {
    // All prerequisite classes are loaded before this boundary. Lazy later
    // assets do not substitute for any required exact source response.
    await Promise.all(pending);
    if (failures.length || Object.values(vendorSources).some(digest => !seen.has(digest)))
      throw Error('NATIVE_VENDOR_BYTES_NOT_QUALIFIED');
    return {schema: 'lab53-loaded-vendor-v1', files: vendorSources, count: seen.size};
  };
}
