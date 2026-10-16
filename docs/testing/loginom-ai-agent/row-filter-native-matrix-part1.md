Row Filter stage 0: native operator matrix, first bounded portion.

On Product `45eeeb47765abaa0672ba7b425a6f4e088ec455b` (exact
`0.0.0-dev-202610141954`), a new owned copy of the accepted package produced:

- `Id in [2,6]`: 3/7, execution `6440f767-f21a-4621-875f-7c4d49510f63:174:2`.
- `Amount not_between [-0.00001,8.76543]`: 3/7, execution
  `6440f767-f21a-4621-875f-7c4d49510f63:174:5`.

Both ports were independently checked against the original CSV oracle, including
complete schemas and cell multisets, NULL, empty strings, duplicate Id 6, and
binary64 values. These are real Loginom/Chromium executions through the selected
production runtime modules; no model was invoked for this diagnostic matrix.
The accepted main model, warm and cold scenarios were not repeated.

`When between` completed execution and port 0 read, then failed before opening
port 1: `Owned viewer scroll anchor unavailable`. The retained observation has
visible native-bound cards with a shared scroll owner, but their action lists
only contain `enter_table`; the add card for port 1 is outside the viewport.
`revealViewerCard` requires an observed same-port/panel scroll anchor. Its old
procedure fixture supplied `scroll`, while the real observation did not.

The correction advertises `scroll` only alongside the existing qualified viewer
control, observed scroll owner, enabled state and painted point. It does not
change scrolling execution, epoch checks, deadlines or port ownership. Addressed
controls cover bound add/enter cards, outside-viewport refusal and stale scroll
refusal; existing foreign-panel/card/vendor controls remain.

The diagnostic session closed its package and logged out with a confirmed
receipt; temporary edits were explicitly discarded. Preparation failures and
addressed recovery receipts are retained separately in the evidence archive.
Historical UNKNOWN operations and originals were not replayed or removed.

Only these two operator cases have complete native two-port PASS here. The
remaining matrix, header-only input, empty output schemas, and persistence of
the additional operator configurations remain open. The scroll correction has
its own SOURCE/INSTALLED boundary; old native results do not qualify a new
runtime candidate. No stage 1, merge, Done or release acceptance is asserted.
