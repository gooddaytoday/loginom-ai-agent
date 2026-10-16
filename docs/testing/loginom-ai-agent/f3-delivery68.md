# Row Filter F3 delivery boundary

The native 77b85 scenario imported golden.csv successfully (10 rows, 5 fields), but upstream schema preflight failed at its only delivered F3. The initial stale-epoch refusal sent no key. The next ElementHandle.press exhausted 15 seconds; its error text was discarded. Preview was visible in the later refusal observation. This does not prove navigation wait or native load failure.

The checked original graph output handle is focused once. Page.keyboard.press sends one F3 without ElementHandle's post-action navigation join. Trace records delivery start/return. Return proves only transport completion, not Preview schema/completion; the existing sorting-preflight observe still qualifies the original schema before node creation. No second F3 or replacement handle is used. Generic browser failures on this boundary retain original name/message in trace; the public refusal code and pending custody remain unchanged.

Targeted SOURCE: original checked-handle delivery, raw browser rejection/no replay, stale epoch/no dispatch, ordinary Enter and existing drag secret-redaction. Real Chromium fixture: delayed iframe Preview, one original key, no schema authority. The fixture is not native Loginom. Runtime source changed; use a new exact candidate for review. Historical filter-stage1-77 AMBIGUOUS/journal/resources remain unresolved and are never replayed.
