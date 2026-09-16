// Standard ECMAScript JSON serialization only; no client or handler imports.
// Python's JSON encoder uses different exponent thresholds for the same number.
import {createHash} from 'node:crypto';
import {createInterface} from 'node:readline';
for await(const line of createInterface({input:process.stdin,crlfDelay:Infinity})){
 try{process.stdout.write(createHash('sha256').update(JSON.stringify(JSON.parse(line))).digest('hex')+'\n');}
 catch{process.stdout.write('invalid-json\n');}
}
