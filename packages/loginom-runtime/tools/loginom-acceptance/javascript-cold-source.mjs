import {createJavascriptSourceAdmission} from '../../client/lib/javascript-source-admission.mjs';
import {javascriptSourceIdentity} from '../../client/lib/javascript-source-read.mjs';

// Cold-reader seam: the only source comes from the owned Loginom document.
// No source argument, fixture factory, mutation method or expected schema.
export function createJavascriptColdSource({owner, deadline, sourceAdapter, redactor, record}) {
  const identity = structuredClone(owner);
  let observed, receipt;
  const admission = createJavascriptSourceAdmission({kind: 'existing', owner: identity, deadline, redactor, record,
    sourceAdapter: async boundOwner => {
      const adapter = await sourceAdapter(boundOwner);
      return {
        open: args => adapter.open(args),
        read: async (handle, args) => {
          const value = structuredClone(await adapter.read(handle, args));
          // Keep an independent snapshot. It is not exposed until the actual
          // reader confirms its matching repeated reads and owned Close.
          observed = structuredClone(value);
          return value;
        },
        discard: (handle, args) => adapter.discard(handle, args),
      };
    }});
  return {
    get state() { return admission.state; },
    async read(...args) {
      if (args.length) throw Error('Cold source read accepts no source or settings');
      receipt = await admission.admit({});
      const metadata = javascriptSourceIdentity(observed.source);
      if (receipt.intent !== 'preserve' || Object.keys(metadata).some(key => metadata[key] !== receipt.effective_source[key]))
        throw Error('Cold observed source differs from admission');
      return {source_text: observed.source, ...metadata, settings: structuredClone(observed.settings),
        owner: structuredClone(identity), admission: structuredClone(receipt)};
    },
    async execute(perform) {
      if (!receipt || admission.state !== 'admitted' || typeof perform !== 'function')
        throw Error('Cold source requires completed read before Execute');
      return admission.withEffect({owner: identity, receipt}, perform);
    },
  };
}
