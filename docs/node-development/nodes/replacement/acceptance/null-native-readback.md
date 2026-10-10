NULL native readback diagnostic fix

Base: 8798ece62f330e0d5d1fba5e56234a8e8aa6518a, PR55 -> shared-oauth.

The retained main/backup packages both serialize the Missing pair as the string
Null, without IsNull=true. Retained Typed row 3 has NULL -> NULL and replaced=true
under the NULL fallback. The old transcript remains FAIL. Original ZIP/XML
files are unchanged.

A regression reproduces the previous false verification with a cached NULL and
a native string Null on either pair side. The reader now requires native
DataType, IsNull and Value to agree with the bound materialized cache, and
refuses read failures, inconsistent values or changed inventory/selection.
Before commit, the actual owned editor controllers must expose the requested
typed pair; display labels cannot establish NULL. Read-only property access
uses the native IBGValue properties documented by the deployed 7.4.2 client.
No remote setters, Clear calls or guard bypass are introduced.

This fixes false verification; the exact step producing string Null has not
been proven. There is no claim that successful NULL -> Missing persistence has
been demonstrated. Live not verified: original writer 3425, dirty-state and
runtime/document binding remain unknown, with historical Save As
AMBIGUOUS/pending and the download session without cleanup retained. No full
model run, new saved diagnostic package or node acceptance was performed.
Common writer/navigation/Save As work stays in LAB-67/PR54.

Tests cover NULL, empty string, Null and null on both sides, native/cache
disagreement, native read failure, identity changes, editor-controller proof,
remaining keep/null/value policies, and the existing Int64/Real/add/replace
checks. Review this local verification fix independently; diagnose successful
NULL mutation and saved-package proof only after resource recovery.
