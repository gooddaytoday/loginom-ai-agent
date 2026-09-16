// Serialized, owner-only DOM scroll. This is part of the acknowledged graph
// mutation, never a read-only preflight or a replacement for drag hit testing.
export function exportPaletteScroll(owner,args){
 const need=(v,m)=>{if(!v)throw Error('Export palette: '+m);};
 const exact=t=>[...document.querySelectorAll('[data-tid='+JSON.stringify(t)+']')];
 const owners=exact(args.owner_tid),items=exact(args.item_tid),rows=exact(args.item_tid.replace(/;TreeText$/,''));
 need(owners.length===1&&owners[0]===owner&&owner.isConnected&&items.length===1&&rows.length===1,'ambiguous owner or item');
 const item=items[0],row=rows[0];
 need(owner.contains(row)&&row.contains(item)&&row.querySelectorAll('.bg-vendor-icon-exporttextfile').length===1&&item.textContent.trim()==='Текстовый файл','item owner or icon');
 need(owner.checkVisibility({checkVisibilityCSS:true})&&item.checkVisibility({checkVisibilityCSS:true})&&!item.closest('.x-item-disabled,.x-grid-row-disabled'),'hidden or disabled');
 const o=owner.getBoundingClientRect(),b=item.getBoundingClientRect(),x=b.x+b.width/2,y=b.y+b.height/2;
 need(o.width>0&&o.height>0&&o.x>=0&&o.y>=0&&o.right<=innerWidth&&o.bottom<=innerHeight&&b.width>0&&b.height>0&&x>o.x&&x<o.right,'owner viewport');
 const hit=(x,y)=>{const e=document.elementFromPoint(x,y);return !!e&&(e===owner||owner.contains(e));};
 need(hit(o.x+o.width/2,o.y+o.height/2),'owner covered');
 const visible=y>=o.y&&y<o.bottom;
 if(visible){const e=document.elementFromPoint(x,y);need(e===item||item.contains(e),'item covered');}
 const from=owner.scrollTop,max=owner.scrollHeight-owner.clientHeight;
 need(Number.isSafeInteger(from)&&Number.isSafeInteger(max)&&max>=0&&max<=20000&&from>=0&&from<=max,'scroll range');
 const to=visible?from:Math.max(0,Math.min(max,Math.round(from+y-(o.y+o.height/2))));
 need(visible||to!==from&&Math.abs(to-from)<=4096,'bounded scroll unavailable');
 const plan={owner_tid:args.owner_tid,item_tid:args.item_tid,from,to,max,visible,owner_box:{x:o.x,y:o.y,width:o.width,height:o.height},item_box:{x:b.x,y:b.y,width:b.width,height:b.height}};
 if(!args.apply)return plan;
 need(!visible&&JSON.stringify(plan)===JSON.stringify(args.before),'scroll context changed');
 owner.scrollTop=to;
 return {...plan,applied:true,after:owner.scrollTop};
}
