## Independent CSV pin

`expected.json` now includes one `static_sources` fixture for `data/sales.csv`: 230 bytes, SHA256 `f628434c20873f7dd9a8ee142c17af7c0b99f447114fcf60e983f6ed6b357eb3`.

Canonical format: delimiter `;`, decimal separator `.`, null marker `\N`, text qualifier `"`. These expectations come from the unchanged task and original CSV, not from Loginom UI. The source schema is Id/integer, Region/string, Quantity/integer, UnitPrice/real, Comment/string; source labels equal their names. Result columns and rows are unchanged.

Run the offline pin check with the exact candidate's bundled Node:

```sh
<candidate>/resources/loginom/bin/node docs/node-development/nodes/calculator/acceptance/verify-static-fixtures.mjs
```

It verifies the actual assigned fixture and rejects wrong parser options, incomplete or ambiguous pins and altered bytes of the same length. Shared checker tests additionally cover readonly observation, native download provenance, schema and repeated-source verification.

The applied shared fix is `5430915edcfdc91f215a53852360e596ba38fbd0` from LAB-67/PR54, independently reviewed there. Only its three changed files are imported. No other PR54 changes are included.

This is an offline integration check. A live cold-read still requires a safe accepted saved result, fresh owned-resource verification and confirmed cleanup. It does not repair output mapping or establish full Calculator acceptance. CSV, task and oracle are unchanged; do not regenerate expected.json with oracle.py alone because the separate source pin is additional acceptance metadata.
