# Разгруппировка

<!-- mode: shares -->
Type `transform.ungroup_data`, `mode:"shares"`: to distribute totals over ready-made fractional shares choose this node via `dock_node_apply`. Input 0 = group totals, input 1 = support items with shares; execute both sources before configuring. For support weights use mode computed; for a time series with seasonality use mode seasonal.

On a `dock_node_apply` refusal read its reason and fix the confirmed setting. Never substitute a `transform.calculator`, `transform.join_data` or `programming.javascript` chain: it bypasses the native settings. If you cannot continue, report the refusal; resolve an unknown effect via the issued `next_step` of the original operation first.

New node: complete `parameters.ungroup` with `keys` (`total`/`support` links), `value_field`, `item_field`, `share_field`, `rounding`, `balance`; exact names from each input schema. Choose the user's policy explicitly: `rounding.format` `none`, `precision` (`value` = decimals) or `multiple` (`value` = positive integer step); `balance` `none`, `last`, `proportional` or `equal`. Existing node: `parameters:{}`, `inputs:[]`, `finish:"execute"` recomputes current sources with saved settings. Verify links of both inputs and keys.

Read port 0 fully for small data. `<value_field>_Rounded` repeats per item; never sum it as the distributed value. With `last` the remainder goes to the last item in input order, not the max name. Save the package; no training. Shares does not read port 1.
<!-- /mode -->

<!-- mode: computed -->
`mode:"computed"`: for support weights choose `transform.ungroup_data` via `dock_node_apply`, never Calculator/JS. Input 0 = totals, input 1 = support. Pass complete `parameters.ungroup`, e.g. `keys:[{total:"Zone",support:"Zone"}]`, `value_field:"Amount"`, `item_field:"Product"`, `share_field:"Units"`, `rounding:{format:"none"}`, `balance:"none"`; use actual schema names. The weight is the native role «Поле с долями».
Order: totals groups, then first appearance of an item in support. An integer total with indivisible shares loses the fraction in the integer native output.
Use `read.ports:[0,1]`; port 1 is expected empty (item, then support keys), not a share table. Export both ports to CSV. Re-Execute: same node, `mode:"computed"`, `parameters:{}`, `inputs:[]`, `mappings:[]`; settings are kept. Save the package. Rounding and balancing are out of scope for this mode.
<!-- /mode -->

<!-- mode: seasonal -->
`mode:"seasonal"` (native «С учётом временных колебаний и сезонности опорных данных»): to distribute a forecast of group totals over items by the seasonality of support history choose `transform.ungroup_data` via `dock_node_apply`, never Calculator/JS. Input 0 = totals per group and date, input 1 = support history per group, date and item. `keys` = group links only; the datetime field of each input goes to `seasonality.total_order_field`/`support_order_field` (role «Порядковое поле»), never into `keys`. `value_field`/`share_field` are continuous integers; `rounding:{format:"none"}`, `balance:"none"`.
Pass every `seasonality` value explicitly, e.g. `{total_order_field:"Period",support_order_field:"Period",period:"year",multiplier:1,index_count:12,rare_density:0.25,absent_periods:1,novelty_periods:1,max_history_periods:0}`.
Port 0: totals fields, `<value_field>_Rounded`, item, `OutputValue`, then `ConfidenceBandUpper`/`Lower`, `OutputTrend`, `OutputSI`, `OutputVT`, `OutputVTDesc`. Port 1: item, support keys, `UngroupQuality`, `SeasonalIndex1..N`. Use `read.ports:[0,1]` and export each port with its own `exports.text`. Drop the confidence-band fields only when asked, via output mapping 0 `fields` with `excluded:true`; keep the rest. Re-Execute: same node, `mode:"seasonal"`, `parameters:{}`, `inputs:[]`, `mappings:[]`; settings are kept.
<!-- /mode -->
