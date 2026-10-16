import { OutputTable } from "builtIn/Data";
const until = Date.now() + 5000;
for (let count = 0; count < 100000000 && Date.now() < until; count++) {}
OutputTable.Append();
OutputTable.Set("Value", 1);
