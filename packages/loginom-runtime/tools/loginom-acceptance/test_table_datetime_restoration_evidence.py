import copy
import unittest
from table_datetime_restoration_evidence import verify_default_datetime_restoration


class DefaultDateTimeRestorationTests(unittest.TestCase):
    def setUp(self):
        self.table=dict(view_guid='view',port_guid='port',table_tid='Table')
        self.field=dict(index=0,source_index=0,name_key='When',label='Дата',type='datetime',format_string='')
        self.settings=dict(formatting=True,custom=False,format_string='')
        self.proof=[dict(index=0,key='When',type='datetime',settings=self.settings,verified_after_apply=True)]
        modal='Table;ModalWindow_BrowseFormat'
        actions=[dict(verb='click',ref='open'),dict(verb='click',ref='field'),dict(verb='fill',ref='mask',text=''),
                 dict(verb='press',ref='mask',key='Tab'),dict(verb='click',ref='apply'),dict(verb='click',ref='open'),
                 dict(verb='click',ref='field'),dict(verb='click',ref='cancel')]
        tids={'open':'Table;btnDataGridFormat','field':modal+';BrowseFormat;field',
              'mask':modal+';BrowseFormat;mask','apply':modal+';btnApply','cancel':modal+';btnCancel'}
        self.observations=[];self.mutations=[]
        for i,a in enumerate(actions):
            step=110+i*10;verification=i>=5
            values=dict(self.settings,custom=not verification,format_string='' if i>=3 else 'yyyy-mm-dd hh:nn:ss.zzz')
            selected=dict(source_index=0,name_key='When',**{k:dict(status='observed',value=v,input_ref='mask' if k=='format_string' else k) for k,v in values.items()})
            e=dict(ref=a['ref'],tid=tids[a['ref']],allowed_actions=[a['verb']])
            if a['ref']=='field':e['table_field']=dict(source_index=0,name_key='When',type='datetime')
            state=dict(owned=True,dialog=i not in (0,5),ui=dict(elements=[e],dialogs=[] if i in (0,5) else ['format']),
                       table_settings=dict(format=dict(selected_datetime=selected)),
                       metadata=[dict(self.field,format_string='' if verification else 'yyyy-mm-dd hh:nn:ss.zzz')])
            self.observations.append((step-1,state));self.mutations.append((step,a,{}))
            if a['ref'] in ('apply','cancel'):
                self.observations.append((step+1,dict(owned=True,dialog=False,ui=dict(dialogs=[]))))
    def audit(self):
        before=lambda n:next(s for step,s in reversed(self.observations) if step<n)
        def control(n,a):
            return next((e for e in before(n)['ui']['elements'] if e['ref']==a['ref']),{})
        def selected(states,field):
            return [(n,{k:v['value'] for k,v in s['table_settings']['format']['selected_datetime'].items() if isinstance(v,dict)}) for n,s in states]
        return verify_default_datetime_restoration(self.observations,self.mutations,self.table,100,[self.field],
            [(self.field,self.settings)],self.proof,before=before,control=control,owned=lambda s:s.get('owned') is True,
            dialog=lambda s:s.get('owned') is True and s.get('dialog') is True,
            definitions=lambda states,latest:states[-1][1]['metadata'],selected=selected)
    def test_direct_apply_reopen_read_cancel(self):
        self.assertEqual(self.audit(),([],{n for n,_,_ in self.mutations}))
    def test_bad_evidence_cannot_be_replaced_by_checkpoint(self):
        for variant in ('owner','mask','selection','reopen','cancel','proof','definition','extra_edit','not_closed'):
            with self.subTest(variant=variant):
                self.setUp()
                if variant=='owner':self.observations[1][1]['owned']=False
                if variant=='mask':self.observations[-2][1]['table_settings']['format']['selected_datetime']['format_string']['value']='DD/MM/YYYY'
                if variant=='selection':self.observations[1][1]['ui']['elements'][0]['table_field']['source_index']=1
                if variant=='reopen':self.mutations.pop(5)
                if variant=='cancel':self.mutations[-1][1]['ref']='apply'
                if variant=='proof':self.proof[0]['verified_after_apply']=False
                if variant=='definition':self.observations[-2][1]['metadata'][0]['label']='Другая'
                if variant=='extra_edit':self.mutations[-2][1].update(verb='fill',text='x')
                if variant=='not_closed':self.observations.pop()
                self.assertTrue(self.audit()[0])

if __name__=='__main__':unittest.main()
