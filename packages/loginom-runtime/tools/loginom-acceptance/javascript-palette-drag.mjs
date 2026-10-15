// Loginom documents Alt during palette drag as disabling automatic linking.
// Keep Alt held until mouse-up; release both even after an uncertain response.
export async function dragJavascriptPalette(page,{from,to,deadline,record,validate,guard,admission}) {
  if(admission.dragDispatched)throw Error('Palette drag already admitted; no replay');
  admission.dragDispatched=true;
  const remaining=()=>{if(Date.now()>=deadline)throw Error('Original palette drag deadline expired');};
  if(![from.x,from.y,to.x,to.y].every(Number.isFinite))throw Error('Finite palette coordinates required');
  const release={mouse_attempted:false,mouse_released:false,alt_attempted:false,alt_released:false};
  let failure,steps=0;
  const cleanupErrors=[];
  try{
    remaining();await record({phase:'javascript_palette_drag_prepared',modifiers:['Alt'],from,to,deadline});
    await validate();remaining();await page.mouse.move(from.x,from.y);
    release.alt_attempted=true;admission.inputReleaseConfirmed=false;await page.keyboard.down('Alt');
    remaining();release.mouse_attempted=true;await page.mouse.down();
    for(let step=1;step<=24;step++){
      await guard();remaining();await page.mouse.move(from.x+(to.x-from.x)*step/24,from.y+(to.y-from.y)*step/24);steps=step;
    }
  }catch(error){failure=error;}
  finally{
    if(release.mouse_attempted){
      try{await page.mouse.up();release.mouse_released=true;}catch(error){cleanupErrors.push('mouse: '+String(error.message).slice(0,200));}
    }
    if(release.alt_attempted){
      try{await page.keyboard.up('Alt');release.alt_released=true;}catch(error){cleanupErrors.push('Alt: '+String(error.message).slice(0,200));}
    }
  }
  const proof={modifiers:['Alt'],automatic_link_suppression_requested:true,steps,...release,deadline,
    effect_possible:release.mouse_attempted,cleanup_complete:(!release.mouse_attempted||release.mouse_released)&&(!release.alt_attempted||release.alt_released)};
  admission.inputReleaseConfirmed=proof.cleanup_complete;
  if(failure||cleanupErrors.length||Date.now()>=deadline){
    await record({phase:'javascript_palette_drag_refused',...proof,reason:String(failure?.message??'Palette release or deadline unconfirmed').slice(0,300),cleanup_errors:cleanupErrors});
    throw failure??Error('Palette release or deadline unconfirmed; no replay');
  }
  await record({phase:'javascript_palette_drag_returned',...proof});
  // Key delivery is observed, not proof that this build honored Alt. The next
  // complete graph delta must independently show zero automatic links.
  return proof;
}
