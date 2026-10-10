from pathlib import Path
import sys,datetime,json,hashlib,zipfile,os
root=Path(__file__).parent
import xlsxwriter,openpyxl
import argparse
parser=argparse.ArgumentParser();parser.add_argument('--output',type=Path,required=True);args=parser.parse_args()
out=args.output;out.mkdir(parents=True,exist_ok=True)
def close(w,p):
 w.close()
 with zipfile.ZipFile(p) as z:entries={n:z.read(n) for n in z.namelist()}
 with zipfile.ZipFile(p,'w') as z:
  for n,v in sorted(entries.items()):
   i=zipfile.ZipInfo(n,(2026,1,1,0,0,0));i.compress_type=zipfile.ZIP_DEFLATED;i.external_attr=0o600<<16;z.writestr(i,v)
def new(n):
 p=out/n;w=xlsxwriter.Workbook(p);w.set_properties({'created':datetime.datetime(2026,1,1)});return w,p
w,p=new('workbook.xlsx');s=w.add_worksheet('Data');s.write_row('B3',['Id','Text','Amount']);s.write_row('B4',[1,'А',10]);s.write_row('B6',[2,'Б',20]);s.write_row('B7',[3,'В',30]);t=w.add_worksheet('Other');t.write_row('A1',['Id','Text','Amount']);t.write_row('A2',[99,'Other',990]);w.define_name('FixtureRange','=Data!$B$3:$D$6');close(w,p)
w,p=new('large.xlsx');s=w.add_worksheet('Data');s.write_row(0,0,['Id','Text','Amount','Occurred','Active']);fmt=w.add_format({'num_format':'yyyy-mm-dd hh:mm:ss'})
for i in range(1,20790):
 s.write_number(i,0,i)
 if i%97:s.write_string(i,1,'row-'+str(i))
 s.write_number(i,2,i/4)
 s.write_datetime(i,3,datetime.datetime(2026,1,1)+datetime.timedelta(seconds=i),fmt)
 s.write_boolean(i,4,bool(i%2))
close(w,p)
for n,shift in [('book-a.xlsx',0),('book-b.xlsx',10)]:
 w,p=new(n);s=w.add_worksheet('Data');s.write_row(0,0,['Id','Text','Amount'])
 for i in range(1,4):s.write_row(i,0,[i,'v'+str(i+shift),(i+shift)*10])
 close(w,p)
w,p=new('two-headers.xlsx');s=w.add_worksheet('Data');s.write_row(0,0,['Id','Text','Amount']);s.write_row(1,0,['Identifier','Caption','Total']);s.write_row(2,0,[1,'А',10]);close(w,p)
w,p=new('late-type.xlsx');s=w.add_worksheet('Data');s.write_row(0,0,['Id','Amount'])
for i in range(1,201):s.write_row(i,0,[i,i])
s.write_row(201,0,[201,'late-text']);close(w,p)
w,p=new('empty.xlsx');w.add_worksheet('Data');close(w,p)
w,p=new('irregular.xlsx');s=w.add_worksheet('Data');s.write_row(0,0,['Id','Text','Amount','Occurred','Active','Formula']);fmt=w.add_format({'num_format':'yyyy-mm-dd hh:mm:ss'})
s.write_row(1,0,[1,'nonempty',0]);s.write_datetime(1,3,datetime.datetime(2026,1,2,3,4,5),fmt);s.write_boolean(1,4,False);s.write_formula(1,5,'=1+2',None,3)
s.write_number(2,0,2);s.write_string(2,1,'');s.write_boolean(2,4,True);s.write_formula(2,5,'=1+2',None,0)
s.write_number(3,0,3);s.write_formula(3,5,'=1/0',None,'#DIV/0!');s.merge_range('B5:C5','merged');s.write_number(4,0,4)
close(w,p)
# Distinct no-cache formula: remove only the cached result element, preserving formula.
with zipfile.ZipFile(p) as z:entries={n:z.read(n) for n in z.namelist()}
entries['xl/worksheets/sheet1.xml']=entries['xl/worksheets/sheet1.xml'].replace(b'<f>1+2</f><v>0</v>',b'<f>1+2</f>')
with zipfile.ZipFile(p,'w') as z:
 for n,v in sorted(entries.items()):
  i=zipfile.ZipInfo(n,(2026,1,1,0,0,0));i.compress_type=zipfile.ZIP_DEFLATED;i.external_attr=0o600<<16;z.writestr(i,v)
(out/'corrupt.xlsx').write_bytes(b'Not a ZIP workbook\n')
manifest={'format':1,'writer':'XlsxWriter 3.2.9','independent_reader':'OpenPyXL 3.1.5','seed':'integer sequence 1..20789; source values fixed before Loginom','files':[]}
for f in sorted(out.glob('*.xlsx')):
 b=f.read_bytes();assert len(b)<=16*1024*1024
 item={'name':f.name,'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()}
 if f.name not in ['corrupt.xlsx','protected.xlsx']:
  book=openpyxl.load_workbook(f,data_only=True);item['sheets']=[{'name':s.title,'rows':s.max_row,'columns':s.max_column} for s in book]
 manifest['files'].append(item)
(out/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps(manifest))
