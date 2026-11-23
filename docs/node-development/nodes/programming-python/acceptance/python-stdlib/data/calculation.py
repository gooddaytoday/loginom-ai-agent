from builtin_data import InputTable, OutputTable

FACTOR = 3

for row in range(InputTable.RowCount):
    amount = InputTable.Get(row, "Amount")
    OutputTable.Append()
    OutputTable.Set("Id", InputTable.Get(row, "Id"))
    OutputTable.Set("Amount", amount)
    OutputTable.Set("AmountScaled", None if amount is None else amount * FACTOR)
    OutputTable.Set("Text", InputTable.Get(row, "Text"))
    OutputTable.Set("Flag", InputTable.Get(row, "Flag"))
    OutputTable.Set("Date", InputTable.Get(row, "Date"))
