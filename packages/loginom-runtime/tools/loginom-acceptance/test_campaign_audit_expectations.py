import csv
from decimal import Decimal
from pathlib import Path
import tempfile
import unittest
from portfolio_audit_expectations import build_campaign_expectations


class CampaignExpectationsTests(unittest.TestCase):
    def test_roi_uses_aggregated_amounts_and_keeps_all_source_rows(self):
        names=['campaign_id','channel','budget','impressions','clicks','conversions','revenue','target_audience','duration_days','ctr','conversion_rate','roi']
        fields=[dict(source_name=n,name=n,type='string' if n in ('channel','target_audience') else 'real') for n in names]
        group=dict(group_by=[dict(name='channel')],measures=[dict(field=dict(name=source),function='sum',name=name) for source,name in [('budget','Budget'),('revenue','Revenue')]])
        formula=dict(expressions=[dict(target=dict(kind='new'),name='Return',type='real',replace=False,formula='IF(Budget > 0, (Revenue - Budget) / Budget * 100, 0)')])
        schema=lambda cols:[dict(name=n,type=t) for n,t in cols]
        plan=dict(task=19,operator_reviewed=True,run_id='fixture',expected_graph=dict(nodes=[dict(id=n,type=t) for n,t in [('i','imports.text'),('g','transform.group_data'),('c','transform.calculator')]],links=[dict(source='i',target='g',input=0,output=0),dict(source='g',target='c',input=0,output=0)]),
            model_operations_for_review=[dict(node_id=n,parameters=p,mappings=[]) for n,p in [('i',dict(settings=dict(columns=fields))),('g',group),('c',formula)]],
            outputs=[dict(name='source',node_id='i',port=0,schema=fields),dict(name='group',node_id='g',port=0,schema=schema([('channel','string'),('Budget','real'),('Revenue','real')])),dict(name='ratio',node_id='c',port=0,schema=schema([('channel','string'),('Budget','real'),('Revenue','real'),('Return','real')]))])
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'data.csv'
            with path.open('w',newline='') as stream:
                writer=csv.DictWriter(stream,fieldnames=names);writer.writeheader()
                for i in range(500):
                    row={n:1 for n in names};row.update(campaign_id=i+1,channel='A' if i<250 else 'B',target_audience='Audience',budget=1 if i==0 else 100 if i<250 else 10,revenue=100 if i==0 else 0 if i<250 else 20)
                    writer.writerow(row)
            result=build_campaign_expectations(path,plan)
            for field in fields:
                field.pop('source_name')
            self.assertEqual(build_campaign_expectations(path,plan),result)
            # Explicit rename still reads the original CSV column, even when
            # every other source_name uses the public default.
            fields[0].update(source_name='campaign_id',name='CampaignId')
            renamed=build_campaign_expectations(path,plan)
            self.assertEqual(renamed['tables']['source']['keys'],['CampaignId'])
            self.assertEqual(renamed['tables']['source']['rows'][0]['CampaignId'],'1')
        self.assertEqual(len(result['tables']['source']['rows']),500)
        a,b=result['tables']['ratio']['rows']
        self.assertEqual(a['Budget'],'24901');self.assertEqual(a['Revenue'],'100')
        self.assertAlmostEqual(float(a['Return']),-99.5984097024,places=8)
        self.assertNotEqual(Decimal(a['Return']),Decimal(-60))
        self.assertEqual(Decimal(b['Return']),Decimal(100))
        self.assertFalse(result['operator_reviewed'])


if __name__=='__main__':unittest.main()
