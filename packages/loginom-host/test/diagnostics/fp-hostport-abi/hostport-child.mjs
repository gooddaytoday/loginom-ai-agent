// Host/runtime/owner services are labelled doubles; the HostPort module and Node IPC/FS are real.
import {EventEmitter} from 'node:events';
import {appendFile} from 'node:fs/promises';
import {loginomHostPort} from './selected-host-port.mjs';
const events=new EventEmitter(),counts={read:0,mutation:0,release:0,runtime:0};
const ledger=process.env.FPABI_LEDGER;
const runtime={async readPreReady(){counts.read++;throw Error('should not reach read')},async request(operation,input){counts.runtime++;await appendFile(ledger,JSON.stringify({operation,input})+'\n');return {result:{kind:'labelled-read-only-double'},recoveryPending:false}},async close(){throw Error('native close forbidden')}};
const service={recoveries:new Map(),acquire:()=>({generation:7,holdRecovery(){},reconciled(){},release(){counts.release++}}),async retireRuntime(){},resetRestarts(){},bindCapture(){},authorizeCapture:()=>false,journal:{pending:()=>[],async begin(){await appendFile(ledger,'{"journal":"begin"}\n');return 'entry'},async settle(){await appendFile(ledger,'{"journal":"settle"}\n')}},async runtime(){return runtime},markRuntimeStale(){}};
loginomHostPort({postMessage:v=>process.send(v),on:(event,fn)=>events.on(event,fn),start(){}},service);
process.on('message',(m)=>{if(m.fixture==='snapshot')process.send({id:m.id,result:counts});else if(m.fixture==='exit')process.send({id:m.id,result:true},()=>process.exit(0));else events.emit('message',{data:m})});
