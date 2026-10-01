// Fixed long-source public writer. Cold reading uses its separate path-only process.
import {runJavascriptOperator} from './javascript-live.mjs';
const args=process.argv.slice(2);
if(args.includes('--help'))console.log('node javascript-public-fidelity-live.mjs --config PRIVATE --profile NEW --browser ABS --evidence NEW\nFixed Code32768bytes/1024LF-lines public apply/chunk read/owned Save. Ordinary headed; separate path-only cold reader.');
else{
  const allowed=['--config','--profile','--browser','--evidence'];
  if(args.length!==8||allowed.some(key=>args.filter(value=>value===key).length!==1)
    ||args.some((value,index)=>index%2===0?!allowed.includes(value):!value||value.startsWith('--')))
    throw Error('Only four assigned public fidelity paths permitted');
  await runJavascriptOperator([...args,'--execution-case','code-table-execute','--verify-public-code-lifecycle','--verify-public-code-save'],
    {publicFidelitySave:true});
}
