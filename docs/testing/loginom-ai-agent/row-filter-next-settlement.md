Row Filter Next settlement

Native exact 0.0.0-dev-202610150315, document f072eb88-6994-44ea-a9de-7483a14f48c2:
Text_compare_2_case was configured, but outputs were not read and this is not PASS.
Next n44 succeeded, with ui_gesture_applied and wizard_step_verified row_filter→done.
Observation n45 found the requested done stage at 204.336 ms; durable journal I/O
then exceeded the ordinary 15-second window. The observation timed out, without
another gesture. Cleanup refused DIAGNOSTIC_SAVE_PROMPT_CHANGED. The own broken
test session was later closed through addressed Dispatcher recovery; native
logout of the original session is not claimed.

The fixed filter handler now consumes a one-use settlement receipt after exact
Next from a verified row_filter inventory. Both ui_gesture_applied and matching
wizard_step_verified are required. A subsequent gesture clears the receipt.
Settlement preserves wizard root_tid/root_ref and the prepared node context,
accepts only row_filter/done, and waits to the original operation deadline.
The normal 15-second window, journal durability, epoch checks and all action
guards remain unchanged. No Next is replayed and no public API is extended.

Procedure/output/filter suites pass 164/164. Tests cover slow readiness beyond
80 samples, a 21-second journal pause, original parent expiry, changed wizard,
missing/wrong/replaced gesture receipts, transport uncertainty and cancellation.
Channel, clock and inventory in these controls are doubles. Native success and
persistence require separate evidence on the resulting clean candidate.
