import {runJavascriptOperator} from './javascript-live.mjs';
const args=process.argv.slice(2),index=args.indexOf('--case');
if(args.includes('--help'))console.log('node javascript-public-policy-live.mjs --case code|declared --config PRIVATE --profile NEW --browser ABS --evidence NEW\nFixed J26 public apply/refused sources/source-bound output reread. Ordinary headed, no Save.');
else{
 if(index<0||args.lastIndexOf('--case')!==index||!['code','declared'].includes(args[index+1]))throw Error('Fixed public policy mode required');
 const mode=args[index+1],paths=args.filter((_,i)=>i!==index&&i!==index+1);
 if(paths.some((arg,i)=>i%2===0&&!['--config','--profile','--browser','--evidence'].includes(arg)))throw Error('Only assigned public policy paths permitted');
 await runJavascriptOperator([...paths,'--execution-case',mode+'-table-execute','--verify-public-'+mode+'-lifecycle'],{publicPolicyMode:mode});
}
