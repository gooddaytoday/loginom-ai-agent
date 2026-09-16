"""Independent graph-only audit. Does not trust node_target status or model prose."""
TYPES=dict(Source='importtextfile',Calc='calcdata',Union='uniondata',Fields='reformcolumns',Filter='filterdata',Group='groupdata',Sort='sorting',Join='joindata')
EDGES=sorted(['Source|Output_Data-0|'+target for target in ['Calc|Input_Data-0','Fields|Input_Data-0','Filter|Input_Data-0','Group|Input_Data-0','Union|Input_Data-0','Union|Input_Data-1','Union|Input_Data-3','Join|Input_Data-0','Join|Input_Data-1']]+['Filter|Output_Data-1|Sort|Input_Data-0'])
def audit(graph):
    nodes=graph.get('nodes',[])
    positions=[n.get('position',{}) for n in nodes]
    valid_positions=all(all(isinstance(p.get(k),(float,int)) for k in ['x','y','width','height']) and p['width']>0 and p['height']>0 for p in positions)
    nonoverlap=valid_positions and all(a['x']+a['width']<=b['x'] or b['x']+b['width']<=a['x'] or a['y']+a['height']<=b['y'] or b['y']+b['height']<=a['y'] for i,a in enumerate(positions) for b in positions[i+1:])
    checks={
      'nodes_do_not_overlap':nonoverlap,
      'system_node_retained':len(graph.get('system_nodes',[]))==1,
      'build':graph.get('build')=='7.4.2',
      'eight_exact_types_labels':len(nodes)==8 and {n.get('label'):n.get('type') for n in nodes}=={k:'bg-vendor-icon-'+v for k,v in TYPES.items()},
      'unique_node_identities':len({n.get('id') for n in nodes})==8 and all(n.get('id') for n in nodes),
      'native_labels_unambiguous':all(n.get('label')==n.get('tid') for n in nodes),
      'ten_exact_edges':sorted(graph.get('links',[]))==EDGES,
      'expanded_window':graph.get('window',{}).get('width',0)>=1400 and graph.get('window',{}).get('height',0)>=800,
    }
    return {'passed':all(checks.values()),'checks':checks}
