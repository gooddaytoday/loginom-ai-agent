// Regenerate the local SVG illustration from the same workflow geometry as Canvas.
import { writeFile } from 'node:fs/promises';
import { WORKFLOW_NODES as nodes, WORKFLOW_EDGES as edges, flowPoint, workflowProjection } from './hero.mjs';
const project = workflowProjection(900, 800);
const colors = ['#e89a73','#d66d60','#ffe0b1','#84bfc0'];
const fmt = n => n.toFixed(1);
const polyline = (points, close=false) => points.map((p,i)=>(i?'L':'M')+fmt(p[0])+' '+fmt(p[1])).join(' ')+(close?' Z':'');
let out = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 800" fill="none">','<defs><radialGradient id="halo"><stop stop-color="#c47851" stop-opacity=".1"/><stop offset="1" stop-color="#c47851" stop-opacity="0"/></radialGradient>'];
colors.forEach((color,i)=>out.push(`<radialGradient id="light${i}"><stop stop-color="#fff0d3"/><stop offset=".12" stop-color="${color}"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient>`));
out.push('</defs><ellipse cx="450" cy="400" rx="410" ry="290" fill="url(#halo)"/>');
for(const [edgeIndex,edge] of edges.entries()) {
  const color = edge[0]<2 ? 3 : 0;
  for(let strand=0;strand<12;strand++) {
    const points=Array.from({length:61},(_,j)=>project(flowPoint(edge,j/60,strand/12*Math.PI*2)));
    out.push(`<path d="${polyline(points)}" stroke="${colors[color]}" stroke-width=".8" opacity=".3"/>`);
  }
  for(let i=0;i<160;i++) {
    const t=(i*.618033+edgeIndex*.17)%1;
    const p=project(flowPoint(edge,t,i*2.4));
    const radius = i%11===0 ? 5 : .6;
    out.push(`<circle cx="${fmt(p[0])}" cy="${fmt(p[1])}" r="${radius}" fill="${i%11===0 ? `url(#light${color})` : colors[color]}"/>`);
  }
  const a=project(flowPoint(edge,.66)),b=project(flowPoint(edge,.7));
  const angle=Math.atan2(b[1]-a[1],b[0]-a[0]),length=11;
  const path=polyline([[b[0]-Math.cos(angle-.55)*length,b[1]-Math.sin(angle-.55)*length],b,[b[0]-Math.cos(angle+.55)*length,b[1]-Math.sin(angle+.55)*length]]);
  out.push(`<path d="${path}" stroke="#171316" stroke-width="3.5"/><path d="${path}" stroke="#ffe3b7" stroke-width="1.4"/>`);
}
for(const [index,node] of nodes.entries()) {
  const at=(x,y,z=.16)=>project(node.position.map((v,i)=>v+[x,y,z][i]));
  const corners=[[-.25,-.25],[.25,-.25],[.25,.25],[-.25,.25]];
  const center=at(0,0);
  out.push(`<circle cx="${fmt(center[0])}" cy="${fmt(center[1])}" r="75" fill="url(#light${node.color})" opacity=".12"/>`);
  for(const z of [-.16,.16])out.push(`<path d="${polyline(corners.map(([x,y])=>at(x,y,z)),true)}" fill="#1d191d" stroke="${colors[node.color]}" stroke-opacity="${z<0?.3:.8}"/>`);
  for(const [x,y] of corners)out.push(`<path d="${polyline([at(x,y,-.16),at(x,y,.16)])}" stroke="${colors[node.color]}" opacity=".3"/>`);
  let glyphs;
  if(node.icon==='table')glyphs=[[[-.12,-.12],[.12,-.12],[.12,.12],[-.12,.12],[-.12,-.12]],[[-.12,-.035],[.12,-.035]],[[-.12,.045],[.12,.045]],[[-.035,-.12],[-.035,.12]]];
  else if(node.icon==='join')glyphs=[[[-.13,-.11],[-.05,-.11],[.06,0],[.15,0]],[[-.13,.11],[-.05,.11],[.06,0]]];
  else if(node.icon==='calculate')glyphs=[[[.12,-.13],[.06,-.15],[.015,-.1],[-.015,.1],[-.06,.15],[-.12,.13]],[[-.1,-.025],[.1,-.025]]];
  else glyphs=[[[-.13,-.025],[-.13,.12],[.14,.12]],[[-.04,-.085],[-.04,.12]],[[.06,-.15],[.06,.12]],[[.14,-.04],[.14,.12]]];
  for(const points of glyphs)out.push(`<path d="${polyline(points.map(([x,y])=>at(x,y,.18)))}" stroke="${colors[node.color]}" stroke-width="1.4"/>`);
  for(const direction of [edges.some(([,to])=>to===index)?-1:0,edges.some(([from])=>from===index)?1:0].filter(Boolean)) {
    const p=at(direction*.285,0,0);
    out.push(`<circle cx="${fmt(p[0])}" cy="${fmt(p[1])}" r="12" fill="url(#light${node.color})"/><circle cx="${fmt(p[0])}" cy="${fmt(p[1])}" r="1.8" fill="#ffe8ca"/>`);
  }
  const label=at(0,.43,0);
  out.push(`<text x="${fmt(label[0])}" y="${fmt(label[1])}" text-anchor="middle" fill="#dccbc5" font-family="sans-serif" font-size="13">${node.label}</text>`);
}
out.push('</svg>');
await writeFile(new URL('./assets/data-flow.svg', import.meta.url),out.join('\n')+'\n');
