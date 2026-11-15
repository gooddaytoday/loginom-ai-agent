from builtin_data import InputTable, OutputTable
from builtin_pandas_utils import to_data_frame, prepare_compatible_table, fill_table

frame = to_data_frame(InputTable, True)
# A Boolean column without NULL arrives as int8 (numpy dtype "b"); keep it logical.
frame["Flag"] = frame["Flag"].astype("boolean")
frame = frame[frame["Flag"].fillna(False).astype(bool)].copy()
frame["AmountScaled"] = frame["Amount"] * 3
prepare_compatible_table(OutputTable, frame, with_index=False)
fill_table(OutputTable, frame, with_index=False)
