## Exact capture contract obstacle

Question: can the same two b7 stores provide the explicit negative buffering bit
required by the unchanged fixed capture, without defaults, class inference,
coercion, mutation, or weakening its predicates?

Result: no such bit is exposed on the inspected supported route. This is a
contract obstacle, not an applicable reader fix and not capture PASS. Stop this
investigation here; another lookup/binding/native repetition cannot manufacture
the missing fact.

### Evidence and limits

- Product source `6ec2e6f51275d799ad4286c6f312fdc063805ad1` requires an
  explicit boolean in `available` and false in the cache predicate. The private
  reader already searches the first data descriptor through eight prototypes.
- Accepted native b7 evidence has absent own/inherited descriptors, null values,
  and a chain ending at null for both stores. Its class tag is inherited
  `Ext.data.Store`; that class string is not a negative buffering proof.
- A read-only GET of the application's currently served
  [framework asset](https://app.loginom.ai/app/ext/build/ext-all-debug.js)
  identifies Ext JS 5.1.2.748, SHA256
  `5b8f534947c4396d72aa6f264721ab8e5bf190b3284969baf8aad9785798e2c5`.
  AST inspection found no `isBufferedStore` data/config or getter declaration in
  Store, ProxyStore, AbstractStore, or LocalStore. Its only data declaration of
  that name is boolean true in BufferedStore (line 61829). The framework's
  [documented positive tag](https://docs.sencha.com/ext/5.1.0/api/Ext.data.BufferedStore.html#property-isBufferedStore)
  agrees with this asymmetric contract.
- The application's inspected Ext overrides do not supply a negative data
  declaration. `bg.ext.CollectionProxy` also declares no buffering bit or getter.
  Source hashes, URLs, class ranges and bounded AST findings are in the evidence.
- These are current static assets, not the bytes loaded by old b7. No new Page
  or store was created, and no old native result is backfilled. The static source
  does not prove that no other future custom API can expose a witness; it proves
  why this descriptor-only route has no supported negative value on the observed
  ordinary-store shape. b7 itself remains the direct evidence of missing values.

### Minimal missing condition and proposed proof

An applicable fix needs either an actual supported API returning explicit
negative buffering evidence for the pinned same store, or an agreed positive
complete-cache witness in the capture contract. Neither is available in the
current saved inputs. `enablePaging:false` alone is not that witness; neither are
class name, missing tag, or matching local counts.

A proposed positive witness would bind the same Page/document/wizard/store/proxy
and original source collection, require a confirmed fully cached native source,
read its authoritative full count, and bijectively match its records/indices to
both store memberships and all rendered rows, with no pending operation, filter,
sort, paging window or identity change. It must reject equal-size but disjoint
records, partial source caches, sparse pages and pending reads. Missing source
cache/completeness/count facts must remain unknown. This proposal is not an
assertion that b7 supplies those facts or that they prove literal
`isBufferedStore === false`; it is a proposed explicit contract for the original
complete-window purpose, requiring review before implementation/native capture.
Do not project it into the native buffering flag.

No production predicate or reader is changed here. In particular available,
cache/rows, CACHED_WINDOW, identity, pending/UNKNOWN, cleanup and budgets remain
byte-identical. Six targeted offline controls use the exact saved window pair
and the production sanitizer/validator; their surrounding identity/DOM/record
envelope is explicitly a double. Four unaccepted substitutes remain refusals.
Previously accepted 202/42 source suites and binding are not repeated.

The owner requires applicable capture before the business scenario. The latter's
business-only task and CSV can be prepared without starting a host/model; model
selection remains openai/gpt-6-luna, variant high, one original 7200-second bound.
Do not silently bypass this capture obstacle or restart old UNKNOWN operations.
