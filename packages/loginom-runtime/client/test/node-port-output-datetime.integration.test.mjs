import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {decodePortCell} from '../lib/node-port-output.mjs';

// Independent fixed observations: the 44-case FromOADate/AddBias investigation.
// The fixture recreates transport decoding only; expected values are literal data.
const matrix={
 "Africa/Bissau":[
  {"serial":-689576.0013888889,"expectedCivil":"0012-01-01T23:59:40.000","ambiguous":true}
 ],
 "Africa/Monrovia":[
  {"serial":26305.01388888889,"expectedCivil":"1972-01-07T01:04:30.000","ambiguous":true},
  {"serial":26305.06180554398,"expectedCivil":"1972-01-07T01:28:59.999","ambiguous":true},
  {"serial":26305.061805555557,"expectedCivil":"1972-01-07T01:29:00.000","ambiguous":false}
 ],
 "UTC":[
  {"serial":45351.99997827546,"expectedCivil":"2024-02-29T23:59:58.123","ambiguous":false},
  {"serial":-1.25,"expectedCivil":"1899-12-29T06:00:00.000","ambiguous":false},
  {"serial":0.25,"expectedCivil":"1899-12-30T06:00:00.000","ambiguous":false},
  {"serial":-675545.5,"expectedCivil":"0050-06-01T12:00:00.000","ambiguous":false},
  {"serial":-693959.0000000115,"expectedCivil":"0000-01-01T00:00:00.001","ambiguous":false},
  {"serial":-657435.9999999885,"expectedCivil":"0099-12-31T23:59:59.999","ambiguous":false}
 ],
 "Europe/Moscow":[
  {"serial":45351.99997827546,"expectedCivil":"2024-02-29T23:59:58.123","ambiguous":false},
  {"serial":40265.08333332176,"expectedCivil":"2010-03-28T01:59:59.999","ambiguous":false},
  {"serial":40265.083333333336,"expectedCivil":"2010-03-28T03:00:00.000","ambiguous":true},
  {"serial":40265.104166666664,"expectedCivil":"2010-03-28T03:30:00.000","ambiguous":true},
  {"serial":40265.166666655095,"expectedCivil":"2010-03-28T03:59:59.999","ambiguous":true},
  {"serial":40265.166666666664,"expectedCivil":"2010-03-28T04:00:00.000","ambiguous":false},
  {"serial":40629.09375,"expectedCivil":"2011-03-27T03:15:00.000","ambiguous":true},
  {"serial":-1.25,"expectedCivil":"1899-12-29T06:00:00.000","ambiguous":false},
  {"serial":-675545.5,"expectedCivil":"0050-06-01T12:00:00.000","ambiguous":false}
 ],
 "Europe/Berlin":[
  {"serial":46110.08333332176,"expectedCivil":"2026-03-29T01:59:59.999","ambiguous":false},
  {"serial":46110.083333333336,"expectedCivil":"2026-03-29T03:00:00.000","ambiguous":true},
  {"serial":46110.104166666664,"expectedCivil":"2026-03-29T03:30:00.000","ambiguous":true},
  {"serial":46110.124999988424,"expectedCivil":"2026-03-29T03:59:59.999","ambiguous":true},
  {"serial":46110.125,"expectedCivil":"2026-03-29T03:00:00.000","ambiguous":true},
  {"serial":46110.166666655095,"expectedCivil":"2026-03-29T03:59:59.999","ambiguous":true},
  {"serial":46110.166666666664,"expectedCivil":"2026-03-29T04:00:00.000","ambiguous":false},
  {"serial":-675545.5,"expectedCivil":"0050-06-01T12:00:00.000","ambiguous":false},
  {"serial":-657712.8958333334,"expectedCivil":"0099-03-29T20:30:00.000","ambiguous":true}
 ],
 "Australia/Lord_Howe":[
  {"serial":46299.08333332176,"expectedCivil":"2026-10-04T01:59:59.999","ambiguous":false},
  {"serial":46299.083333333336,"expectedCivil":"2026-10-04T02:30:00.000","ambiguous":true},
  {"serial":46299.09375,"expectedCivil":"2026-10-04T02:45:00.000","ambiguous":true},
  {"serial":46299.104166655095,"expectedCivil":"2026-10-04T02:59:59.999","ambiguous":true},
  {"serial":46299.104166666664,"expectedCivil":"2026-10-04T02:30:00.000","ambiguous":true},
  {"serial":46299.124999988424,"expectedCivil":"2026-10-04T02:59:59.999","ambiguous":true},
  {"serial":46299.125,"expectedCivil":"2026-10-04T03:00:00.000","ambiguous":false},
  {"serial":-675545.5,"expectedCivil":"0050-06-01T12:00:00.000","ambiguous":false}
 ],
 "Pacific/Apia":[
  {"serial":40906.999999988424,"expectedCivil":"2011-12-29T23:59:59.999","ambiguous":false},
  {"serial":40907,"expectedCivil":"2011-12-31T00:00:00.000","ambiguous":true},
  {"serial":40907.5,"expectedCivil":"2011-12-31T12:00:00.000","ambiguous":true},
  {"serial":40907.999999988424,"expectedCivil":"2011-12-31T23:59:59.999","ambiguous":true},
  {"serial":40908,"expectedCivil":"2011-12-31T00:00:00.000","ambiguous":true},
  {"serial":40908.999999988424,"expectedCivil":"2011-12-31T23:59:59.999","ambiguous":true},
  {"serial":40909,"expectedCivil":"2012-01-01T00:00:00.000","ambiguous":false},
  {"serial":-675545.5,"expectedCivil":"0050-06-01T12:00:00.000","ambiguous":false}
 ]
};

test('civil_dates_use_bounded_transition_scan',async()=>{
 assert.ok(process.env.LOGINOM_DOCK_TEST_BROWSER,'LOGINOM_DOCK_TEST_BROWSER must name the pinned Chromium executable');
 const browser=await chromium.launch({executablePath:process.env.LOGINOM_DOCK_TEST_BROWSER,headless:true,chromiumSandbox:true,args:['--no-proxy-server']});
 try{
  let count=0;
  for(const [timezoneId,cases] of Object.entries(matrix)){
   const context=await browser.newContext({timezoneId});
   try{
    const page=await context.newPage();
    const actual=await page.evaluate(({cases,decoder})=>{
     const decode=eval('('+decoder+')');
     return cases.map(({serial})=>{
      // Loginom's transport uses linear milliseconds, then local construction.
      const linear=new Date(Math.round((serial-25569)*86400000));
      const year=linear.getUTCFullYear(),month=linear.getUTCMonth(),day=linear.getUTCDate();
      const raw=new Date(year,month,day,linear.getUTCHours(),linear.getUTCMinutes(),linear.getUTCSeconds(),linear.getUTCMilliseconds());
      if(year>=0&&year<100)raw.setFullYear(year,month,day);
      return {datetime:decode(raw,'datetime'),variant:decode(raw,'variant')};
     });
    },{cases,decoder:decodePortCell.toString()});
    cases.forEach((expected,index)=>{
     const result=actual[index],message=timezoneId+' '+expected.expectedCivil;
     const cell=result.datetime.cell;
     assert.equal(cell.is_null,false,message);
     assert.equal(cell.value??cell.display_text,expected.expectedCivil,message);
     assert.equal(cell.precision,expected.ambiguous?'unverified':'millisecond',message);
     assert.equal(cell.representation,expected.ambiguous?'formatted_display':'local_datetime',message);
     assert.deepEqual(result.datetime.limitations,expected.ambiguous?['datetime_display_precision']:[],message);
     if(!expected.ambiguous){assert.equal(cell.timezone,'unspecified',message);assert.equal(Object.hasOwn(cell,'display_text'),false,message);}
     assert.equal(result.variant.cell.display_text,expected.expectedCivil,message);
     assert.equal(result.variant.cell.precision,'unverified',message);
     assert.deepEqual(result.variant.limitations,expected.ambiguous?['variant_display_precision','datetime_display_precision']:['variant_display_precision'],message);
     count++;
    });
   }finally{await context.close();}
  }
  for(const timezoneId of ['Europe/Berlin','Europe/Moscow']){
   const context=await browser.newContext({timezoneId});
   try{
    const page=await context.newPage();
    const result=await page.evaluate(decoder=>{
     const decode=eval('('+decoder+')'),original=Temporal.ZonedDateTime.prototype.getTimeZoneTransition;
     let previousCalls=0;
     Temporal.ZonedDateTime.prototype.getTimeZoneTransition=function(direction){if(direction==='previous')previousCalls++;return original.call(this,direction);};
     try{return {decoded:decode(new Date(9999,11,31,23,59,59,999),'datetime'),previousCalls};}
     finally{Temporal.ZonedDateTime.prototype.getTimeZoneTransition=original;}
    },decodePortCell.toString());
    assert.equal(result.decoded.cell.value,'9999-12-31T23:59:59.999',timezoneId);
    assert.equal(result.decoded.cell.precision,'millisecond',timezoneId);
    assert.deepEqual(result.decoded.limitations,[],timezoneId);
    assert.ok(result.previousCalls<=2,'48-hour cutoff must bound the transition scan: '+timezoneId+' '+result.previousCalls);
   }finally{await context.close();}
  }
  assert.equal(count,44);
 }finally{await browser.close();}
});
