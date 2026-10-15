Row Filter Table-add settlement, 2026-10-15

Exact `0.0.0-dev-202610150128` / `0443966320` produced a complete native
`Text_compare_0_case` result 5/5 on document
`1b313588-317e-4256-a270-700d41a292fa`, execution `:184:2`.
Both ports, the full schema and all cells matched the independent oracle.

`Text_compare_1_case` is not a PASS. Its add click `n76` succeeded. The new Table
card was already present and the first identity sample was satisfied after
199.84 ms, but the next read exceeded the ordinary 15-second observation window.
The wait failed before its required second confirmation. No add was repeated.
Cleanup confirmed package close and logout, packages 1 to 0; the reproducible
unsaved draft was discarded. The original package and diagnostics are retained.

This correction grants a one-use, read-only settlement only after a successful,
gesture-attested click of the exact add card with a selected Table vendor and
verified native port inventory. It resets on the next gesture. The fixed output
handler consumes it to confirm the new card twice under the original parent
deadline, without the ordinary 15-second or 80-sample ceiling. A new Table on a
foreign port or more than one new Table is refused. Prepared node, epoch, masks,
native ownership, confirmation identity and cancellation checks remain active.
The add click, parent deadline and ordinary observation limits are unchanged.

Controls cover delayed appearance, a pause between confirmations, parent expiry,
foreign output, missing or consumed receipt, unrelated gesture, wrong vendor or
port inventory, missing gesture trace and transport loss. The channel, native
inventory and clock in these controls are doubles. The previous module fails the
same new control. Source procedure and output suites pass 124/124.

The remaining nine Text case forms and other 44 forms are still open before
native validation of the correction; no stage 1, merge or release is included.
