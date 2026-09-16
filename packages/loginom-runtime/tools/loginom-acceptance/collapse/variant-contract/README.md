# Diagnostic exact-variant contract proposal

Authorized phase: node16:variant-contract-design:1:dc93af3f.
See docs/loginom-dock/node16-variant-contract-design-2026-09-13.md.

adapter.mjs is pure: saved native bytes → proposed exact cell/read/user-v1 fields.
No public wiring, RPC, browser, transport hooks, or authority creation.
Observed fixtures contain 38 cells from three SHA-bound prior diagnostic artifacts.
Only tags1/5/7/8/11/20 are admitted; padding/unused slots are never exported.
Native date remains a serial with no timezone/civil/epoch claim.

adaptRead requires trusted host context, not caller-supplied assertions. Current
raw-read output still needs a bound read_id for future integration. Whole-table
unit fixtures use synthetic envelopes/projection and do not prove a live full read.
proposedUserPort is a proposal, not the installed compactNodeResult.

Run adapter.test.mjs with the pinned Node24 runtime. replay.mjs OUTPUT verifies
original private evidence SHA and writes serialized cells. Then audit.py OUTPUT
independently checks native values with Python struct/UTF-8. No live RPC occurs.

observed.json zeros unused Null/string/boolean slots before committing fixtures.
Replay verifies the original private SHA and compares the same normalization;
all significant tag/scalar bytes remain original. Transport leftovers stay private.
