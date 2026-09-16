import copy,unittest
from node_procedure_evidence import bound_missing_values_dialog,bound_wizard_close_confirmation
class MissingDialogEvidence(unittest.TestCase):
 def value_dialog(self):
  node=dict(verified=True,document_id='document',workflow_id='workflow',node_id='node',surface='wizard')
  def control(tid,label,**signature):return dict(tid=tid,label=label,scope='dialog',signature=dict(dialog_ref='dialog',**signature),allowed_actions=['click','fill'])
  return dict(prepared_node_context=node,wizard=dict(status='observed',stage='missing_values'),node_missing_values=dict(verified=True,inventory_complete=True,node_context=node,method_context=dict(record_id='555',field_name='Note'),fields=[dict(record_id='555',name='Note',used=True,method='constant',type='string',data_kind='Дискретный')]),ui=dict(masks=[],dialogs=[dict(ref='dialog',title='Редактирование значения замены для пропусков',text='Редактирование значения замены для пропусков Значение для замены пропусков: OK Отмена')],elements=[control(None,'',role='textbox',value_truncated=False),control('msgbox;tlb;ok','OK'),control('msgbox;tlb;cancel','Отмена')]))
 def test_value_dialog_requires_exact_owner_field_and_dialog(self):
  original=self.value_dialog();self.assertTrue(bound_missing_values_dialog(original))
  for fault in ['foreign_node','wrong_field','disabled','numeric','foreign_dialog','mask','extra_control','truncated']:
   s=copy.deepcopy(original)
   if fault=='foreign_node':s['node_missing_values']['node_context']=dict(s['prepared_node_context'],node_id='other')
   elif fault=='wrong_field':s['node_missing_values']['method_context']['record_id']='other'
   elif fault=='disabled':s['node_missing_values']['fields'][0]['used']=False
   elif fault=='numeric':s['node_missing_values']['fields'][0]['type']='integer'
   elif fault=='foreign_dialog':s['ui']['dialogs'][0]['title']='Other'
   elif fault=='mask':s['ui']['masks']=[{}]
   elif fault=='extra_control':s['ui']['elements'].append(copy.deepcopy(s['ui']['elements'][0]))
   else:s['ui']['elements'][0]['signature']['value_truncated']=True
   self.assertFalse(bound_missing_values_dialog(s),fault)
 def test_output_close_requires_native_port_binding(self):
  port=dict(direction='output',port=0,native_index=0,port_guid='port-guid',opening_operation_id='opening');node=dict(verified=True,document_id='d',workflow_id='w',node_id='n',surface='wizard',output_port=port)
  s=dict(prepared_node_context=node,node_wizard_confirmation=dict(kind='close',root_ref='root',root_tid='wizard',stage='output_mapping',owner=dict(output_port=port),node={k:node[k] for k in ['document_id','workflow_id','node_id']}),wizard=dict(status='observed',root_ref='root',root_tid='wizard',stage='output_mapping'),ui=dict(masks=[dict(kind='modal_background',ref='root')],dialogs=[dict(ref='dialog',title='Подтвердить',text='Подтвердить Вы действительно хотите закрыть мастер настройки? Да Нет')],elements=[dict(tid='msgbox;tlb;'+tid,label=label,signature=dict(dialog_ref='dialog'),allowed_actions=['click']) for tid,label in [('yes','Да'),('no','Нет')]]))
  context=dict(status='observed',kind='output_data',node=dict(ref='node-ref'),port=dict(ref='port-ref'))
  s['wizard']['port_context']=copy.deepcopy(context);s['node_wizard_confirmation']['owner']['port_context']=copy.deepcopy(context)
  self.assertTrue(bound_wizard_close_confirmation(s))
  for fault in ['port','node','stage','opening']:
   c=copy.deepcopy(s)
   if fault=='port':c['prepared_node_context']['output_port']=dict(port,port_guid='foreign')
   elif fault=='node':c['node_wizard_confirmation']['node']['node_id']='foreign'
   elif fault=='stage':c['wizard']['stage']='input_mapping'
   else:c['node_wizard_confirmation']['owner']['output_port']['opening_operation_id']=''
   self.assertFalse(bound_wizard_close_confirmation(c),fault)
if __name__=='__main__':unittest.main()
