import { OutputTable } from "builtIn/Data";
const until = Date.now() + 20000;
while (Date.now() < until) {}
OutputTable.Append();
OutputTable.Set("Value", 1);
