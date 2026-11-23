## Boolean train/test flag

Owner decision **logreg-c6-boolean-split**, LAB-1796, 16.11.2026:
Split is Boolean, false trains and true tests. The native column picker does
not admit Integer Split. Evidence attached to LAB-1796:
`execution-events.jsonl:20,26,49,51,63,64`.

The CSV uses false/true; all other source cells are unchanged. The independent
oracle fits only false rows from the original diagnostic fixture. Predictions,
coefficients, row count, field set and tolerances stay unchanged. Port 0 ends
with Note,Fold,Split, as observed in Loginom; cold order remains exact.
TrainClsErrorPercentage remains outside acceptance.
