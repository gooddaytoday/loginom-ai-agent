# Logistic regression (`datamining.log_regression`)

<!-- mode: enter forward backward stepwise apply -->
## Training and predictions

`loginom_dock_node_apply`, `target.type:"datamining.log_regression"`,
`mode:"enter"`, `parameters:{logistic:{input_fields:[...],target_field:"...",event:"...",threshold:...}}`.
Two String target classes; numeric input_fields, other fields pass through.
Event iff p >= threshold. finish:"execute" trains/predicts; read.ports:[0].
Intercept, epsilon=1e-10; no bindings. Request parameter_schema.

## K-fold validation

Enter: `logistic.validation:{method:"kfold",folds:3,sampling:"sequential"}`.
Integer folds >=2; all train, no partition/weights. Fold informational.
Readback proves Teach folds/samples. Table 0, technical CSV, Save; no port 2.
Reopen/apply: saved validation, no Teach; omission requires none saved.

## Train/test partition

Enter: `logistic.partition:{method:"sequential",train_percent:50,test_percent:50}`.
Both >0, sum 100; first rows train, next test; predict all rows. Split/Fold
are informational. Omit: all train. Readback: percentages and row counts.
Column: `logistic.partition:{method:"column",field:"Split"}`; Boolean flag,
false trains, true tests. Exclude it from input_fields; retain it in output.
No percentages/validation. Reopen/apply verifies saved partition, no Teach.
After reopened Execute/read, Save again before finishing.

## Real frequency weights

Enter: `logistic.weight_field:"Weight"`, positive Real frequency weights.
Exclude it from input_fields; retain it in predictions, without normalization.
Integer refuses without conversion. Reopen/apply with saved weight_field, no Teach.

## Factor selection

Modes forward/backward/stepwise; `logistic.selection.criterion`:
deviance/aic/aicc/bic/hqic. Deviance requires entry_significance for Forward,
removal_significance for Backward, both for Stepwise: 0 < entry < removal < 1.
Other criteria forbid cutoffs. Omitted selection: Deviance 0.05/0.1.
input_fields lists candidates; excluded factors pass through.

## Apply saved Enter

`mode:"apply"`: saved Enter, none/standardize. Replace the same Import source
with the same schema; execute Import. On the same model:
`target.kind:"existing"`, fresh target.ref, inputs:[], mappings:[], saved logistic
parameters, finish:"execute", read.ports:[0]. Mismatch refuses; draft closes
without Save/Teach. NULL Target → NULL ActualEvent. Refresh refs after reopen.

## Coefficients

Enter, saved parameters, finish:"execute", read.ports:[1] or [0,1],
read.require_exact_numbers:true. Port 1: Name, DisplayName, UniqueValues, then
target-prefixed _coefficients, _stdError, _wald, _waldPValue, _oddsRatio,
_lowerBound, _upperBound (95%). Preserve NULL, precision and order.
Export output:1, technical names; apply saved parameters, read.ports:[1], no Teach.

## Normalization

`logistic.normalization:"standardize"` standardizes predictors; "none" disables it.
Enter/none, Execute/read [0]; same ref, standardize, Execute/read [0,1].
Coefficients: normalized units. Existing omission preserves; apply verifies, no Teach.
<!-- /mode -->

<!-- mode: ridge lasso elastic_net -->
## Ridge / LASSO / Elastic Net

ridge: `logistic.regularization:{lambda_ridge:1}`;
lasso: `{lambda_lasso:1}`; elastic_net: `{lambda_lasso:1,lambda_ridge:1}`.
Manual lambdas >0; no alpha, automatic tuning or selection.
input_fields, target_field, event, threshold remain required; read.ports:[0]
reads all predictions. normalization none/standardize affects predictors;
omission on existing preserves it. Intercept is unpenalized.
Execute trains and predicts. Repeat on the same existing target/ref with inputs:[]
and saved parameters. Save separately; refresh graph refs after reopen.
Apply supports Enter only. After reopen use the saved ridge/lasso/elastic_net
mode and parameters on the same node, inputs:[], mappings:[], finish:"done",
read.ports:[], without Teach. For reopened CSV create a new exports.text from
output:0, Execute with technical names and saved order; check CSV and Save.
<!-- /mode -->
