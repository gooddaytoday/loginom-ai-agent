// Names and values observed in the native CodePage picker and E2E textimport.ts.
const encodings=[
 {code:'65001',label:'UTF-8 (65001)',aliases:['UTF-8']},
 {code:'1251',label:'Кириллическая (1251)',aliases:['Windows-1251','CP1251']},
 {code:'1252',label:'Западноевропейская (1252)',aliases:['Windows-1252','CP1252']},
 {code:'1200',label:'UTF-16 LE (1200)',aliases:['UTF-16 LE','UTF-16LE']},
 {code:'1201',label:'UTF-16 BE (1201)',aliases:['UTF-16 BE','UTF-16BE']},
];
export function resolveTextImportEncoding(value) {
 const match=encodings.find(e=>[e.code,e.label,...e.aliases].includes(value));
 if(!match)throw Error('Unsupported text import encoding; use an explicit supported code page');
 return {code:match.code,label:match.label};
}
