"""Independent complete-table/format and delivery audit for LAB-15 small TXT cases."""
import json,decimal
from pathlib import Path
# Avoid deriving expected values from any runtime receipt.
def require(condition,message):
 if not condition:raise ValueError(message)
def compare(case,port):
 schema=[{k:c[k] for k in ['name','label','type','data_kind']} for c in case['columns']]
 actual=[{k:c.get(k) for k in ['name','label','type','data_kind']} for c in port['schema']]
 require(actual==schema,'schema/type/label/order differs: '+case['case_id'])
 require(port['row_count']==case['row_count'] and port['sample_rows']==case['row_count'] and len(port['sample'])==case['row_count'] and port['sample_complete'] is True,'incomplete full readback')
 require(port['fresh'] is True and port['execution_id'],'fresh execution missing')
 for i,(cells,expected) in enumerate(zip(port['sample'],case['expected_rows'])):
  require(len(cells)==len(expected),'missing cell')
  for j,(cell,wanted) in enumerate(zip(cells,expected)):
   require(cell['type']==case['columns'][j]['type'],'cell type differs')
   require(cell['is_null']==(wanted is None),'NULL changed')
   if wanted is None:continue
   value=cell.get('value')
   if cell['type']=='real':require(decimal.Decimal(cell.get('decimal',str(value)))==decimal.Decimal(wanted),'exact real differs')
   else:require(value==wanted,'exact string/date differs at '+str((i,j)))
 return {'status':'PASS','rows':case['row_count'],'fields':len(schema),'all_values_compared':True,'ordered_rows_compared':True}
def settings(case,actual,path):
 source=actual['source'];require(source['source_path']==path,'persisted source differs');require(source['connection']=='Локальное','source is not local')
 expected=case['settings']['source'];require(source['encoding']==expected['encoding'] or '('+expected['encoding']+')' in source['encoding'],'native code page differs')
 require(int(source['rows_to_skip'])==expected['rows_to_skip'] and source['first_line_as_title'] is expected['first_line_as_title'],'source structure differs')
 aliases={'delimiter':{',':'Запятая',';':'Точка с запятой','\t':'Символ табуляции',' ':'Пробел'},'text_qualifier':{'"':'Двойная кавычка (")',"'":"Одинарная кавычка (')",'`':'Обратная кавычка (`)','':'Нет'},'decimal_separator':{'.':'Точка (.)',',':'Запятая (,)'},'date_separator':{'.':'Точка (.)','/':'Слэш (/)','\\':'Обратный слэш (\\)','-':'Дефис (-)'}}
 for k,wanted in case['settings']['format'].items():
  value=actual['format'].get(k);require(type(value)==type(wanted),'format type differs '+k)
  require(value==wanted or value==aliases.get(k,{}).get(wanted),'format differs '+k)
 fields=actual['columns'];require(len(fields)==len(case['columns']),'configured schema incomplete')
 require(all(all(f.get(k)==c[k] for k in ['name','label','type','data_kind','used']) for f,c in zip(fields,case['columns'])),'configured schema differs')
 return True
