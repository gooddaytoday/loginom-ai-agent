# Logistic regression (`datamining.log_regression`)

<!-- mode: enter forward backward stepwise apply -->
## Training and predictions

`loginom_dock_node_apply`, `target.type:"datamining.log_regression"`,
`mode:"enter"`, `parameters:{logistic:{input_fields:[...],target_field:"...",event:"...",threshold:...}}`.
Target: two String classes; event iff p >= threshold. input_fields are numeric
predictors; other fields pass through without a role. `finish:"execute"` trains
on the current input and predicts; `read.ports:[0]` reads predictions/originals.
Intercept, epsilon=1e-10. No variable bindings. Request `parameter_schema`.

## K-fold validation

Enter: `logistic.validation:{method:"kfold",folds:3,sampling:"sequential"}`.
Explicit integer folds >=2, all rows training; omit partition and weight_field.
Fold remains informational unless listed in input_fields. Execute trains and
predicts; readback reports saved folds/sampling and training.validation with
native executed fold count and samples_per_fold, tied to the Teach execution.
Port 2/full summary and its quality metrics remain unsupported. Read table 0,
export technical names, Save; after reopen apply with the saved validation
parameters without Teach. Omitted validation requires no saved validation.

## Sequential partition

Enter: `logistic.partition:{method:"sequential",train_percent:50,test_percent:50}`.
Both >0, sum 100. First rows train, next rows test; predictions cover all rows.
Split/Fold are not predictors unless listed in input_fields. Omit partition for
100% training. Readback reports percentages and train/test/total row counts;
port 2 is unsupported. Save; reopen with the same partition in apply, without Teach.

## Real frequency weights

Enter: `logistic.weight_field:"Weight"`, positive Real frequency weights.
Exclude it from input_fields; retain it in predictions, without normalization.
Integer refuses before role edits, without conversion. After reopen, apply with
the saved weight_field verifies its role without Teach.

## Factor selection

Modes forward/backward/stepwise; `logistic.selection.criterion`:
deviance/aic/aicc/bic/hqic. Deviance requires entry_significance for Forward,
removal_significance for Backward, both for Stepwise: 0 < entry < removal < 1.
Other criteria forbid cutoffs. Omitted selection: Deviance 0.05/0.1.
input_fields lists candidates; excluded factors remain in output.

## Apply saved Enter

`mode:"apply"`: trained Enter with none/standardize. Save, replace the same
Import's source with the same schema and execute Import. On the same model:
`target.kind:"existing"`, fresh target.ref, inputs:[], mappings:[], saved logistic
parameters, finish:"execute", read.ports:[0]. Apply verifies settings; mismatch
refuses. It closes the draft without Save/Teach. Train with enter.
NULL Target gives NULL ActualEvent. After Save/reopen, refresh graph refs and
apply without reconfiguration.

## Coefficients

Enter, saved parameters, finish:"execute", read.ports:[1] or [0,1],
read.require_exact_numbers:true. Port 1: Name, DisplayName, UniqueValues, then
target-prefixed _coefficients, _stdError, _wald, _waldPValue, _oddsRatio,
_lowerBound, _upperBound (95%). Preserve NULL, precision and order.
CSV: exports.text, output:1, technical names. After Save/reopen, apply with saved
parameters and read.ports:[1], without Teach.

## Normalization

`logistic.normalization:"standardize"` standardizes predictors; "none" disables it.
First enter/none, Execute/read.ports:[0]; then the same existing target/ref,
standardize, Execute/read.ports:[0,1], preserving other settings. Coefficients
use normalized predictor units. Omission on existing preserves normalization.
After Save/reopen, apply verifies the saved normalizer without Teach.
<!-- /mode -->

<!-- mode: ridge lasso elastic_net -->
## Ridge / LASSO / Elastic Net

ridge: `logistic.regularization:{lambda_ridge:1}`;
lasso: `{lambda_lasso:1}`; elastic_net: `{lambda_lasso:1,lambda_ridge:1}`.
Separate manual lambdas >0, no alpha/automatic tuning, no selection.
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
