"""Reproducible synthetic TXT bytes and independent Python CSV/date/Decimal oracle.
No product parser, runtime, or model output participates in expectations.
"""
import csv,io,json,hashlib,datetime,decimal
from pathlib import Path
BASE=Path(__file__).resolve().parent/'matrix'
CASES=[
 ('comma_utf8',',','"','utf-8',False,False,True,0,'.',None),
 ('semicolon_cp1251_decimal',';','"','cp1251',False,False,True,0,',',None),
 ('tab_utf16le','\t','"','utf-16-le',True,False,True,0,'.',None),
 ('tab_utf16be','\t','"','utf-16-be',True,False,True,0,'.',None),
 ('space',' ','"','utf-8',False,False,True,0,'.',None),
 ('pipe_multiline','|','"','utf-8',False,False,True,0,'.','\r\n'),
 ('merge_on',';','"','utf-8',False,True,True,0,'.',None),
 ('merge_off',';','"','utf-8',False,False,True,0,'.',None),
 ('single_quote',';','\'','utf-8',False,False,True,0,'.',None),
 ('backtick_quote','|','`','utf-8',False,False,True,0,'.',None),
 ('no_quote',',','','utf-8',False,False,True,0,'.',None),
 ('no_header',';','"','utf-8',False,False,False,0,'.',None),
 ('skip_header',',','"','utf-8',False,False,True,2,'.',None),
 ('no_header_skip','|','"','utf-8',False,False,False,2,'.',None),
 ('utf8_bom',',','"','utf-8',True,False,True,0,'.',None),
 ('cp1252',';','"','cp1252',False,False,True,0,'.',None),
 ('multiline_crlf',',','"','utf-8',False,False,True,0,'.','\r\n'),
 ('multiline_lf',',','"','utf-8',False,False,True,0,'.','\n'),
]
SCHEMA=[{'name':n,'label':l,'type':t,'data_kind':k,'used':True} for n,l,t,k in [('Id','Идентификатор','string','Дискретный'),('Name','Название','string','Дискретный'),('Amount','Сумма','real','Непрерывный'),('Date','Дата','datetime','Дискретный'),('Note','Текст','string','Дискретный')]]
def prepare():
 BASE.mkdir(exist_ok=True);(BASE/'fixtures').mkdir(exist_ok=True)
 result=[]
 for case,delimiter,quote,encoding,bom,merge,header,skip,dec,multiline in CASES:
  western=encoding=='cp1252';labels=[c['label'] for c in SCHEMA] if not western else ['Reference','Libelle','Montant','Date','Texte']
  rows=[['0001','café' if western else 'Привет','12'+dec+'25','2026-10-05',''],['0002','garçon' if western else 'Мир','0','2026-10-06','?'],['0003','naïve' if western else 'Юникод','-2'+dec+'5','2026-10-07','end']]
  if merge:rows[0][-1]='first'
  if case=='merge_off':rows[0][1]=''
  if quote:rows[2][-1]='left'+delimiter+'right '+quote+'quoted'+quote
  if not quote:rows[2][-1]='literal"quote'
  if multiline:rows[2][-1]='first'+multiline+'second'+delimiter+' '+quote+'quoted'+quote
  stream=io.StringIO(newline='');writer=csv.writer(stream,delimiter=delimiter,quotechar=quote or None,quoting=csv.QUOTE_MINIMAL if quote else csv.QUOTE_NONE,lineterminator='\r\n')
  if header:writer.writerow(labels)
  writer.writerows(rows);text=stream.getvalue()
  if merge:text=text.replace(delimiter,delimiter*2)
  text=('SERVICE LINE\r\n'*skip)+text
  prefix={'utf-8':b'\xef\xbb\xbf','utf-16-le':b'\xff\xfe','utf-16-be':b'\xfe\xff'}.get(encoding,b'') if bom else b''
  raw=prefix+text.encode(encoding);path=BASE/'fixtures'/(case+'.txt');path.write_bytes(raw)
  # Independently parse pinned bytes, respecting physical preamble and logical CSV records.
  decoded=raw[len(prefix):].decode(encoding,errors='strict');decoded=decoded.split('\r\n',skip)[-1] if skip else decoded
  parsed=list(csv.reader(io.StringIO(decoded,newline=''),delimiter=delimiter,quotechar=quote or None,quoting=csv.QUOTE_MINIMAL if quote else csv.QUOTE_NONE,strict=True))
  if merge:parsed=[[v for v in r if v!=''] for r in parsed]
  if header:assert parsed.pop(0)==labels
  assert all(len(r)==5 for r in parsed)
  expected=[]
  for r in parsed:
   amount=str(decimal.Decimal(r[2].replace(dec,'.')));date=datetime.datetime.strptime(r[3],'%Y-%m-%d').isoformat(timespec='milliseconds')
   expected.append([r[0],r[1],amount,date,None if r[4]=='?' else r[4]])
  native={'utf-8':65001,'cp1251':1251,'cp1252':1252,'utf-16-le':1200,'utf-16-be':1201}[encoding]
  result.append({'case_id':case,'source':{'name':path.name,'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest(),'encoding':encoding,'bom':bom},'settings':{'source':{'encoding':str(native),'rows_to_skip':skip,'first_line_as_title':header},'format':{'delimiter':delimiter,'text_qualifier':quote,'decimal_separator':dec,'null_marker':'?','multiple_delimiters':merge,'date_format':'yyyy/mm/dd','date_separator':'-'}},'source_headers':labels if header else None,'columns':SCHEMA,'expected_rows':expected,'row_count':len(expected),'status':'NOT_RUN'})
 # Negative bytes have separate expectations: never accept a complete, correct table from them.
 negatives=[('unclosed_quote',b'Id,Name\r\n001,"unfinished\r\n002,next\r\n','documented warning; incomplete logical table must not pass'),('wrong_encoding','Id,Name\r\n001,Привет\r\n'.encode('cp1251'),'UTF-8 settings must not certify CP1251 source'),('wrong_delimiter',b'Id|Name\r\n001|value\r\n','comma settings must not certify two columns'),('ambiguous_headers',b'Name,Name\r\nleft,right\r\n','duplicate source labels must refuse ambiguous binding')]
 for case,raw,rule in negatives:
  p=BASE/'fixtures'/(case+'.txt');p.write_bytes(raw);result.append({'case_id':case,'negative':True,'source':{'name':p.name,'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest()},'expected_outcome':rule,'status':'NOT_RUN'})
 (BASE/'manifest.json').write_text(json.dumps({'generator':'matrix-fixtures.py','cases':result},ensure_ascii=False,indent=2)+'\n')
 print(json.dumps({'positive_cases':len(CASES),'negative_cases':len(negatives),'manifest_sha256':hashlib.sha256((BASE/'manifest.json').read_bytes()).hexdigest()}))
if __name__=='__main__':prepare()
