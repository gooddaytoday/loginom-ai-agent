"""Small independent fixtures whose entire output fits the public ten-row read."""
import csv
import hashlib
import io


def duplicates_fixtures():
    main = [dict(Id=i, Key=k, Sub=s, Value=v, Amount=a) for i,k,s,v,a in [
        (1,'A',1,'x',10),(2,'A',1,'x',10),(3,'A',1,'y',10),
        (4,'B',1,'z',20),(5,'B',1,'z',20),(6,'B',1,'z',20),
        (7,'A',2,'x',10),(8,'C',1,'solo',30),(9,'D',1,'',40),(10,'D',1,'',40)]]
    nulls = [dict(Id=i,Key=k,Value=v) for i,k,v in [
        (1,'A',None),(2,'A',None),(3,'A',''),(4,'A','null'),
        (5,'B',''),(6,'B',''),(7,'C','null'),(8,'C','null')]]
    definitions = [
        ('main10', main, [('Id','integer'),('Key','string'),('Sub','integer'),('Value','string'),('Amount','integer')], ['Key','Sub'], ['Value','Amount'], [[1,2],[4,5,6],[9,10]], [[1,2,3]]),
        ('null8', nulls, [('Id','integer'),('Key','string'),('Value','string')], ['Key'], ['Value'], [[1,2],[5,6],[7,8]], [[1,2,3,4]]),
        ('empty', [], [('Id','integer'),('Key','string'),('Value','string')], ['Key'], ['Value'], [], []),
    ]
    fixtures = {}
    for key,rows,fields,inputs,outputs,duplicates,contradictions in definitions:
        stream=io.StringIO(newline='');writer=csv.writer(stream,delimiter=';',lineterminator='\n')
        writer.writerow([name for name,_ in fields])
        writer.writerows([['__NULL__' if row[name] is None else row[name] for name,_ in fields] for row in rows])
        data=stream.getvalue().encode()
        fixtures[key]=dict(name='Node12-'+key+'.csv',data=data,bytes=len(data),sha256=hashlib.sha256(data).hexdigest(),
            rows=rows,columns=[dict(name=name,label=name,type=kind,data_kind='Дискретный' if kind=='string' else 'Непрерывный') for name,kind in fields],
            parameters=dict(input_fields=inputs,output_fields=outputs),duplicate_groups=duplicates,contradiction_groups=contradictions)
    return fixtures
