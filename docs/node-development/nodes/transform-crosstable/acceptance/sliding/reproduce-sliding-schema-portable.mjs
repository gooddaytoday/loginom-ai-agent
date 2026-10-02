import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
if (!process.argv[2]) throw new Error("Usage: node reproduce-sliding-schema-portable.mjs /absolute/path/to/checkout");
const { alignReadSchema } = await import(pathToFileURL(resolve(process.argv[2], "packages/loginom-runtime/client/lib/node-read-contract.mjs")).href);
function schema(categories) {
  return [{index:0,name:"Region",label:"Region",type:"string"},
    ...categories.flatMap((category,i) => ["Amount","Quantity"].map((fact,j) => ({
      index:1+i*2+j,name:`C_${i+1}_${fact}_Sum`,label:`${category}|${fact}|Сумма`,type:"real"
    })))];
}
function reproduce(title,actual,expected,message) {
  try { alignReadSchema(actual,expected); }
  catch (error) {
    if (error.message !== message) throw error;
    console.log(`${title}: confirmed rejection: ${error.message}`);
    return;
  }
  throw new Error(`${title}: expected rejection was not reproduced`);
}
reproduce("Sliding 9 → 7 columns", schema(["A","B","D"]), schema(["<...>","A","B","C"]),
  "Output schema changed since the source operation");
reproduce("Same count, category C → D", schema(["A","B","D"]), schema(["A","B","C"]),
  "Output field identity changed since the source operation");
