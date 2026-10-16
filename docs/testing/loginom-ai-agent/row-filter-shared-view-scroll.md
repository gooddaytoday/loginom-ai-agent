Native Row Filter continuation, 2026-10-15

The reviewer published bounded acceptance of `111b198b2a` and its cold header-only
before the reviewer process failed. The following Monkey run failed during
initialization, without starting native work. This continuation preserves the
published result rather than repeating that review.

On exact `0.0.0-dev-202610150047`, fresh document
`7f21d66e-e6de-4cbb-8371-ec804251c064` produced five complete cases:
Id equal 2/8, not equal 8/2, between 7/3, not between 3/7, not in 7/3.
Executions were `:180:2`, `:180:5`, `:180:8`, `:180:11`, `:180:14`.
Both ports matched the independent oracle by full schema and all cells.

`Id_not_null` is not a PASS. Its second output could not open because
`revealViewerCard` required an anchor inside the target port. The captured native
observation has visible first-port Table cards and an entirely offscreen second
port, all sharing one scroll owner with max_top 542. The offscreen add card has
no action. Cleanup confirmed package close and logout, packages 1 to 0, with
the reproducible draft discarded. No save or persistence is inferred.

The correction retains same-port anchors and additionally allows a visible Table
card bound by both view_guid and port_guid in the verified native output inventory
to reveal another port sharing that exact observed scroll owner. Target card
selection, native port binding, owner identity, observed hit point, epoch/stale
guards, scroll progress and original deadline remain required. No action is
granted to the offscreen card. Controls cover shared owner, foreign inventory,
different owner, an unobserved point and stalled scroll. Their channel/inventory
are doubles; the captured native failure remains separate evidence.

The remaining Id form, eleven Amount forms, additional-condition persistence and
later matrix families remain open pending native validation. Stage 1 is excluded.
