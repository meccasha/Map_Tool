'use strict';
const $ = id => document.getElementById(id);
const canvas = $('map'), area = $('map-area'), ctx = canvas.getContext('2d');
const projection = d3.geoMercator().scale(1).translate([0, 0]);
const palette = ['#8454d1','#d54752','#df9024','#278667','#2c78ba','#24334b'];
const historicalDates = [1600,1650,1700,1722,1750,1800,1850,1900,1914,1925,1945,1979,2000,2024];
const presets = {
  'middle-east': { name:'Iran & greater Middle East', bounds:[23,13,83,51] },
  iran:{name:'Iran',bounds:[43,23,65,42]}, 'central-asia':{name:'Central Asia',bounds:[45,30,94,58]},
  europe:{name:'Europe',bounds:[-15,33,48,68]}, africa:{name:'Africa',bounds:[-20,-36,54,38]},
  asia:{name:'Asia',bounds:[24,-12,152,66]}, americas:{name:'Americas',bounds:[-172,-57,-30,73]}, world:{name:'World',bounds:[-180,-65,180,80]}
};
const icons = {
  brush:'<path d="m14 3 4 4-8 8-4-4zM6 11c-3 1-1 5-4 6 5 2 7-1 8-3"/>',
  fill:'<path d="m4 10 7-7 7 7-7 7zM3 18h15M7 2l7 7M19 13c-2 3-2 4 0 4s2-1 0-4"/>',
  arrow:'<path d="M3 18 18 3M8 3h10v10"/>',point:'<path d="M17 8c0 5-7 12-7 12S3 13 3 8a7 7 0 1 1 14 0z"/><circle cx="10" cy="8" r="2.5"/>',
  text:'<path d="M3 4h15M10.5 4v14M7 18h7M3 4v3M18 4v3"/>',eraser:'<path d="m3 13 9-10 7 7-9 10H8zM8 8l7 7M10 20h10"/>',
  hand:'<path d="M6 11V6a2 2 0 0 1 4 0v5-8a2 2 0 0 1 4 0v8-6a2 2 0 0 1 4 0v6-2a2 2 0 0 1 4 0v5c0 5-3 7-7 7h-2c-3 0-5-2-7-5l-3-4c-1-2 1-4 3-2l2 2"/>'
};
document.querySelectorAll('[data-icon]').forEach(el => el.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[el.dataset.icon]}</svg>`);
let countries=[], admin1=[], historicalTopology=null, historicalFeatures=[], sources={};
let countryByName = new Map(), visibleCountries=[], visibleAdmins=[], visibleHistorical=[], visibleImports=[];
let state = freshState(), tool='brush', width=0,height=0,ratio=1,ready=false,dirty=false,space=false,gesture=null,preview=null,hover=null;
let undoStack=[],redoStack=[],toastTimer,framePending=false,textPending=null,importPending=null;
let initialScale=1;
let revision=0,fileBusy=false;
function freshState(){return {version:1,title:'Iran research',region:'middle-east',country:'Iran',mode:'modern',year:1600,subregions:false,labels:true,view:{k:1,x:0,y:0},annotations:[],layers:[]};}
function id(){return crypto.randomUUID ? crypto.randomUUID() : `item-${Date.now()}-${Math.random().toString(16).slice(2)}`;}
function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,4200);}
function fail(error){console.error(error);toast(error.message || 'The action could not be completed.');}
function markDirty(value=true){dirty=value;if(value)revision++;window.desktop?.dirty({value,revision});$('save-status').textContent=value?'Unsaved changes':'Saved project';}
function snapshot(){return {annotations:structuredClone(state.annotations),layers:[...state.layers]};}
function checkpoint(){undoStack.push(snapshot());if(undoStack.length>80)undoStack.shift();redoStack=[];}
function changed(){markDirty();updateUI();scheduleRender();}
function undo(){if(!undoStack.length)return;redoStack.push(snapshot());const s=undoStack.pop();state.annotations=s.annotations;state.layers=s.layers;changed();}
function redo(){if(!redoStack.length)return;undoStack.push(snapshot());const s=redoStack.pop();state.annotations=s.annotations;state.layers=s.layers;changed();}
function addAnnotation(annotation){checkpoint();state.annotations.push(annotation);changed();}
function screen(geo){const p=projection(geo);return [p[0]*state.view.k+state.view.x,p[1]*state.view.k+state.view.y];}
function geographic(p){const geo=projection.invert([(p[0]-state.view.x)/state.view.k,(p[1]-state.view.y)/state.view.k]);return [Math.max(-180,Math.min(180,geo[0])),Math.max(-85,Math.min(85,geo[1]))];}
function pointer(event){const r=canvas.getBoundingClientRect();return [event.clientX-r.left,event.clientY-r.top];}
function normalizeFeature(feature){
  if(d3.geoArea(feature)>Math.PI*2){
    const geometry=feature.geometry;
    if(geometry.type==='Polygon')geometry.coordinates.forEach(r=>r.reverse());
    if(geometry.type==='MultiPolygon')geometry.coordinates.forEach(p=>p.forEach(r=>r.reverse()));
  }
  feature._bounds=d3.geoBounds(feature);return feature;
}
function isVisible(feature){
  const b=feature._bounds || d3.geoBounds(feature);
  if(b[0][0]>b[1][0])return true;
  const a=screen([b[0][0],Math.min(85,b[1][1])]),z=screen([b[1][0],Math.max(-85,b[0][1])]);
  return z[0]>=-50 && a[0]<=width+50 && z[1]>=-50 && a[1]<=height+50;
}
function currentLayers(){return state.layers.filter(l=>l.visible && state.subregions && state.mode==='historical' && state.year>=l.from && state.year<=l.to);}
function refreshHistorical(){
  if(!historicalTopology)return;
  const object=Object.values(historicalTopology.objects)[0];
  const geometries=object.geometries.filter(g=>g.properties.from<=state.year && g.properties.to>=state.year && !g.properties.components && g.properties.kind==='POLITY');
  historicalFeatures=topojson.feature(historicalTopology,{type:'GeometryCollection',geometries}).features.map(normalizeFeature);
}
function scheduleRender(){if(!ready||framePending)return;framePending=true;requestAnimationFrame(()=>{framePending=false;render();});}
function resize(){
  const rect=area.getBoundingClientRect(), oldW=width,oldH=height;width=Math.max(1,rect.width);height=Math.max(1,rect.height);ratio=Math.min(2,window.devicePixelRatio||1);
  canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);
  if(ready && oldW){state.view.x+=(width-oldW)/2;state.view.y+=(height-oldH)/2;scheduleRender();}
}
function fit(){
  let bounds=presets[state.region]?.bounds;
  if(state.region==='country'){
    const f=countryByName.get(state.country.toLowerCase());
    if(!f){toast('Choose a country from the list.');return;}
    const b=f._bounds;bounds=b[0][0]>b[1][0]?presets.world.bounds:[b[0][0],b[0][1],b[1][0],b[1][1]];
  }
  bounds ||= presets['middle-east'].bounds;
  const a=projection([bounds[0],bounds[3]]),b=projection([bounds[2],bounds[1]]);
  const k=Math.min((width-90)/Math.max(.04,b[0]-a[0]),(height-110)/Math.max(.04,b[1]-a[1]));
  state.view={k,x:width/2-k*(a[0]+b[0])/2,y:height/2-k*(a[1]+b[1])/2};initialScale=k;
  updateUI();scheduleRender();
}
function zoom(factor,center=[width/2,height/2]){
  const old=state.view.k,k=Math.max(40,Math.min(45000,old*factor));
  state.view.x=center[0]-(center[0]-state.view.x)*k/old;state.view.y=center[1]-(center[1]-state.view.y)*k/old;state.view.k=k;
  updateUI();scheduleRender();
}
function pathFor(context,feature){context.beginPath();d3.geoPath(projection).context(context)(feature);}
function mapTransform(context){context.translate(state.view.x,state.view.y);context.scale(state.view.k,state.view.k);}
function line(context,points){
  if(!points.length)return;context.beginPath();
  projectedSegments(points).forEach(([a,b])=>{context.moveTo(...a);context.lineTo(...b);});
  if(points.length===1){const p=screen(points[0]);context.moveTo(...p);context.lineTo(p[0]+.01,p[1]);}
  context.stroke();
}
function projectedSegments(points){
  const result=[],world=2*Math.PI*state.view.k;
  for(let i=1;i<points.length;i++){const a=screen(points[i-1]),b=screen(points[i]);if(Math.abs(b[0]-a[0])>world/2){const sign=a[0]>b[0]?1:-1;result.push([a,[b[0]+sign*world,b[1]]],[[a[0]-sign*world,a[1]],b]);}else result.push([a,b]);}return result;
}
function pointSymbol(context,p,color,opacity){
  context.save();context.globalAlpha=opacity;context.fillStyle=color;context.strokeStyle='#fff';context.lineWidth=2;
  context.beginPath();context.moveTo(p[0],p[1]);context.bezierCurveTo(p[0]-3,p[1]-4,p[0]-9,p[1]-9,p[0]-9,p[1]-15);context.arc(p[0],p[1]-15,9,Math.PI,0);context.bezierCurveTo(p[0]+9,p[1]-9,p[0]+3,p[1]-4,p[0],p[1]);context.closePath();context.fill();context.stroke();
  context.fillStyle='#fff';context.beginPath();context.arc(p[0],p[1]-15,3,0,Math.PI*2);context.fill();context.restore();
}
function textLayout(context,item){
  const p=screen(item.point),size=item.fontSize||18;context.font=`500 ${size}px "Segoe UI", sans-serif`;
  const lines=String(item.text||'').split('\n').flatMap(str=>{
    const words=str.split(' '),result=[];let current='';
    for(const word of words){if(context.measureText(`${current} ${word}`).width>320 && current){result.push(current);current=word;}else current=current?`${current} ${word}`:word;}
    result.push(current);return result;
  });
  const w=Math.max(12,...lines.map(l=>context.measureText(l).width))+18,h=lines.length*size*1.3+14;
  return {x:p[0]+(item.type==='point'?14:0),y:p[1]-(item.type==='point'?26:0),w,h,size,lines};
}
function drawText(context,item){
  const b=textLayout(context,item);context.save();context.globalAlpha=item.opacity;context.textBaseline='top';context.font=`500 ${b.size}px "Segoe UI", sans-serif`;
  if(item.background){context.fillStyle='rgba(255,255,255,.95)';context.strokeStyle='#d9dfe7';context.lineWidth=1;context.beginPath();context.roundRect(b.x,b.y,b.w,b.h,4);context.fill();context.stroke();}
  context.fillStyle=item.color;b.lines.forEach((l,i)=>context.fillText(l,b.x+9,b.y+7+i*b.size*1.3));context.restore();
}
function drawAnnotation(context,item){
  context.save();context.globalAlpha=item.opacity;context.strokeStyle=item.color;context.fillStyle=item.color;context.lineCap='round';context.lineJoin='round';
  if(item.type==='fill'){mapTransform(context);pathFor(context,item.feature);context.fill();}
  else if(item.type==='brush'){context.lineWidth=item.width*state.view.k;line(context,item.points);}
  else if(item.type==='arrow'){
    const b=screen(item.points[1]),segments=projectedSegments(item.points),[a,end]=segments.at(-1);context.lineWidth=Math.max(1,item.width*state.view.k);line(context,item.points);
    const angle=Math.atan2(end[1]-a[1],end[0]-a[0]),head=Math.max(12,context.lineWidth*2.8);
    context.beginPath();context.moveTo(...b);context.lineTo(b[0]-head*Math.cos(angle-.42),b[1]-head*Math.sin(angle-.42));context.lineTo(b[0]-head*Math.cos(angle+.42),b[1]-head*Math.sin(angle+.42));context.closePath();context.fill();
  } else if(item.type==='point'){pointSymbol(context,screen(item.point),item.color,item.opacity);if(item.text)drawText(context,item);}
  else if(item.type==='text')drawText(context,item);
  context.restore();
}
function drawBorders(context,features,color,lineWidth,dash=[]){
  context.save();mapTransform(context);context.strokeStyle=color;context.lineWidth=lineWidth/state.view.k;context.setLineDash(dash.map(n=>n/state.view.k));features.forEach(f=>{pathFor(context,f);context.stroke();});context.restore();
}
function drawLabels(context,features,isAdmin=false){
  const occupied=[];context.save();context.textAlign='center';context.textBaseline='middle';context.lineJoin='round';context.lineWidth=3;
  features.forEach(f=>{
    const geo=f.properties.label || d3.geoCentroid(f);if(!geo.every(Number.isFinite))return;
    const p=screen(geo);if(p[0]<35||p[0]>width-35||p[1]<25||p[1]>height-25)return;
    const name=f.properties.name || f.properties.Name || '';const size=isAdmin?11:12;
    context.font=`${isAdmin?400:550} ${size}px "Segoe UI", sans-serif`;const w=context.measureText(name).width;
    const b=f._bounds,span=b&&Math.abs(screen(b[1])[0]-screen(b[0])[0]);if(span<w+8 && state.region!=='world')return;
    const box=[p[0]-w/2-4,p[1]-size,p[0]+w/2+4,p[1]+size];
    if(occupied.some(o=>box[0]<o[2]&&box[2]>o[0]&&box[1]<o[3]&&box[3]>o[1]))return;
    occupied.push(box);context.strokeStyle='#f7f9fbe8';context.strokeText(name,...p);context.fillStyle=isAdmin?'#728095':'#56667c';context.fillText(name,...p);
  });context.restore();
}
function renderScene(context,{labels=state.labels}={}){
  context.fillStyle='#e7eef4';context.fillRect(0,0,width,height);
  visibleCountries=countries.filter(isVisible);visibleAdmins=state.mode==='modern'&&state.subregions?admin1.filter(isVisible):[];
  visibleHistorical=state.mode==='historical'?historicalFeatures.filter(isVisible):[];
  visibleImports=currentLayers().flatMap(layer=>layer.data.features.filter(isVisible).map(feature=>({layer,feature})));
  context.save();mapTransform(context);context.fillStyle='#f9fafc';visibleCountries.forEach(f=>{pathFor(context,f);context.fill();});context.restore();
  state.annotations.filter(a=>a.type==='fill').forEach(a=>drawAnnotation(context,a));
  if(state.mode==='modern')drawBorders(context,visibleCountries,'#8b99ad',.85);
  if(state.mode==='historical')drawBorders(context,visibleHistorical,'#566d88',1.1);
  if(visibleAdmins.length)drawBorders(context,visibleAdmins,'#b0bac8',.65);
  visibleImports.forEach(({layer,feature})=>drawBorders(context,[feature],layer.color||'#8e6ab8',1,[5,3]));
  if(labels){drawLabels(context,state.mode==='modern'?visibleCountries:visibleHistorical);if(state.subregions&&state.view.k>1500)drawLabels(context,visibleAdmins.length?visibleAdmins:visibleImports.map(i=>i.feature),true);}
  state.annotations.filter(a=>a.type!=='fill').forEach(a=>drawAnnotation(context,a));
}
function render(){
  ctx.setTransform(ratio,0,0,ratio,0,0);renderScene(ctx);
  if(preview)drawAnnotation(ctx,preview);
  if(hover && tool==='fill' && !gesture){ctx.save();mapTransform(ctx);pathFor(ctx,hover.feature);ctx.fillStyle='rgba(116,69,189,.10)';ctx.fill();ctx.strokeStyle='#7445bd';ctx.lineWidth=1.5/state.view.k;ctx.stroke();ctx.restore();}
}
function findFeature(geo){
  const imported=[...visibleImports].reverse().find(i=>d3.geoContains(i.feature,geo));if(imported)return imported;
  const list=state.mode==='historical'?visibleHistorical:(state.subregions?visibleAdmins:visibleCountries);
  let feature=[...list].reverse().find(f=>d3.geoContains(f,geo));
  if(!feature&&state.mode==='modern'&&state.subregions)feature=visibleCountries.find(f=>d3.geoContains(f,geo));
  return feature?{feature}:null;
}
function segmentDistance(p,a,b){const dx=b[0]-a[0],dy=b[1]-a[1],q=dx*dx+dy*dy,t=q?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/q)):0;return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);}
function hitAnnotation(item,p,geo,tolerance=8){
  if(item.type==='fill')return d3.geoContains(item.feature,geo);
  if(item.type==='text'||(item.type==='point'&&item.text)){const b=textLayout(ctx,item);if(p[0]>=b.x&&p[0]<=b.x+b.w&&p[1]>=b.y&&p[1]<=b.y+b.h)return true;}
  if(item.type==='point'){const q=screen(item.point);return Math.hypot(p[0]-q[0],p[1]-(q[1]-13))<17+tolerance;}
  if(item.points){const pts=item.points.map(screen),r=item.width*state.view.k/2+tolerance;if(pts.length===1)return Math.hypot(p[0]-pts[0][0],p[1]-pts[0][1])<r;return projectedSegments(item.points).some(([a,b])=>segmentDistance(p,a,b)<r);}
  return false;
}
function eraseAt(p){const geo=geographic(p);for(let i=state.annotations.length-1;i>=0;i--){if(hitAnnotation(state.annotations[i],p,geo,Number($('width').value)/2)){checkpoint();state.annotations.splice(i,1);changed();return;}}}
function settings(){return {color:$('color').value,opacity:Number($('opacity').value)/100,width:Number($('width').value)/state.view.k};}
function setTool(value){tool=value;document.querySelectorAll('[data-tool]').forEach(b=>{b.classList.toggle('active',b.dataset.tool===tool);b.setAttribute('aria-pressed',String(b.dataset.tool===tool));});
  const hints={brush:'Drag to paint. Use a lower opacity for highlighting.',fill:'Click a country or visible subregion to fill its boundary.',arrow:'Drag from the starting location to the destination.',point:'Click to place a point of interest with an optional label.',text:'Click to add a text box, or click an existing note to edit.',eraser:'Click a drawing or fill to remove the whole object.',hand:'Drag to move the map. Scroll to zoom.'};
  $('settings-heading').textContent=({hand:'Map navigation',fill:'Region fill',eraser:'Object eraser',text:'Text settings',point:'Point settings',arrow:'Arrow settings'})[tool]||'Brush settings';$('tool-hint').textContent=hints[tool];canvas.style.cursor=tool==='hand'?'grab':tool==='text'?'text':'crosshair';hover=null;scheduleRender();
}
canvas.addEventListener('pointerdown',event=>{
  if(!ready||event.button>1)return;event.preventDefault();canvas.focus();const p=pointer(event),geo=geographic(p);
  if(tool==='hand'||space||event.button===1){gesture={type:'pan',start:p,view:{...state.view},pointer:event.pointerId};canvas.setPointerCapture(event.pointerId);canvas.style.cursor='grabbing';return;}
  if(tool==='fill'){const hit=findFeature(geo);if(!hit){toast('No boundary region at this location.');return;}addAnnotation({id:id(),type:'fill',feature:structuredClone({type:'Feature',properties:{name:hit.feature.properties.name},geometry:hit.feature.geometry}),mapYear:state.mode==='historical'?state.year:null,...settings()});return;}
  if(tool==='eraser'){eraseAt(p);return;}
  if(tool==='text'||tool==='point'){
    let existing;if(tool==='text')existing=[...state.annotations].reverse().find(a=>(a.type==='text'||a.type==='point')&&hitAnnotation(a,p,geo,0));
    textPending=existing?{existing}:{type:tool,point:geo,settings:settings()};$('annotation-heading').textContent=existing?'Edit annotation':tool==='point'?'Add point of interest':'Add text annotation';$('annotation-text').value=existing?.text||'';$('font-size').value=existing?.fontSize||18;$('text-background').checked=existing?.background??true;$('text-dialog').showModal();$('annotation-text').focus();return;
  }
  gesture={type:tool,pointer:event.pointerId,start:p};preview={id:id(),type:tool,points:[geo],...settings()};if(tool==='arrow')preview.points.push(geo);canvas.setPointerCapture(event.pointerId);scheduleRender();
});
canvas.addEventListener('pointermove',event=>{
  if(!ready)return;const p=pointer(event),geo=geographic(p);
  $('cursor-location').textContent=`${Math.abs(geo[1]).toFixed(2)}° ${geo[1]>=0?'N':'S'}  ·  ${Math.abs(geo[0]).toFixed(2)}° ${geo[0]>=0?'E':'W'}`;
  if(gesture){
    if(gesture.type==='pan'){state.view.x=gesture.view.x+p[0]-gesture.start[0];state.view.y=gesture.view.y+p[1]-gesture.start[1];}
    else if(preview?.type==='brush'){const last=screen(preview.points.at(-1));if(Math.hypot(p[0]-last[0],p[1]-last[1])>=1.5)preview.points.push(geo);}
    else if(preview?.type==='arrow')preview.points[1]=geo;
    scheduleRender();return;
  }
  hover=findFeature(geo);$('feature-name').textContent=hover?.feature.properties.name||'';if(tool==='fill')scheduleRender();
});
function finishGesture(event,canceled=false){
  if(!gesture)return;
  if(!canceled&&preview){if(preview.type!=='arrow'||Math.hypot(...screen(preview.points[0]).map((n,i)=>n-screen(preview.points[1])[i]))>3)addAnnotation(preview);}
  preview=null;gesture=null;canvas.style.cursor=tool==='hand'?'grab':tool==='text'?'text':'crosshair';if(event&&canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);scheduleRender();
}
canvas.addEventListener('pointerup',event=>finishGesture(event));canvas.addEventListener('pointercancel',event=>finishGesture(event,true));
canvas.addEventListener('wheel',event=>{event.preventDefault();if(ready&&!gesture)zoom(Math.exp(-event.deltaY*.0015),pointer(event));},{passive:false});
canvas.addEventListener('pointerleave',()=>{if(!gesture){hover=null;$('feature-name').textContent='';scheduleRender();}});
$('text-dialog').addEventListener('close',()=>{
  if($('text-dialog').returnValue!=='save'||!textPending){textPending=null;return;}
  const text=$('annotation-text').value.trim();if(!text && textPending.type!=='point' && textPending.existing?.type!=='point'){toast('Enter some text to add a note.');textPending=null;return;}
  const props={text,fontSize:Number($('font-size').value),background:$('text-background').checked};
  if(textPending.existing){checkpoint();state.annotations=state.annotations.map(a=>a.id===textPending.existing.id?{...a,...props}:a);changed();}
  else addAnnotation({id:id(),type:textPending.type,point:textPending.point,...textPending.settings,...props});textPending=null;
});
function updateLayerList(){
  const container=$('layer-list');container.replaceChildren();
  if(!state.layers.length){const p=document.createElement('p');p.className='note';p.textContent='Add sourced GeoJSON for historical provinces or other regional boundaries.';container.append(p);return;}
  state.layers.forEach(layer=>{
    const item=document.createElement('div');item.className='layer-item';const row=document.createElement('div');row.className='layer-row';const check=document.createElement('input');check.type='checkbox';check.checked=layer.visible;check.id=`layer-${layer.id}`;
    check.addEventListener('change',()=>{checkpoint();state.layers=state.layers.map(l=>l.id===layer.id?{...l,visible:check.checked}:l);changed();});
    const label=document.createElement('label');label.htmlFor=check.id;label.textContent=layer.name;const remove=document.createElement('button');remove.textContent='×';remove.setAttribute('aria-label',`Remove ${layer.name}`);remove.addEventListener('click',()=>{checkpoint();state.layers=state.layers.filter(l=>l.id!==layer.id);changed();});
    row.append(check,label,remove);const meta=document.createElement('p');meta.className='layer-meta';meta.textContent=`${layer.from}–${layer.to} · ${layer.data.features.length} regions`;item.title=layer.source;item.append(row,meta);container.append(item);
  });
}
function updateUI(){
  $('undo').disabled=!undoStack.length;$('redo').disabled=!redoStack.length;$('annotation-count').textContent=`${state.annotations.length} annotation${state.annotations.length===1?'':'s'}`;
  $('zoom-value').textContent=`${Math.round(state.view.k/initialScale*100)}%`;
  $('map-caption').textContent=state.region==='country'?state.country:presets[state.region]?.name||'Map';
  $('boundary-caption').textContent=state.mode==='modern'?'Modern reference · Natural Earth':state.year<=2024?`${state.year} · dated historical outlines`:`${state.year} · imported boundaries`;
  $('historical-controls').hidden=state.mode!=='historical';$('subregion-note').hidden=state.mode!=='historical'||!state.subregions;
  $('country-picker').hidden=state.region!=='country';updateLayerList();
}
function syncControls(){
  $('project-name').value=state.title;$('region').value=state.region;$('country').value=state.country;$('boundary-mode').value=state.mode;
  const dates=[...new Set([...historicalDates,state.year,...state.layers.flatMap(l=>[l.from,l.to])])].sort((a,b)=>a-b);
  $('year-select').replaceChildren();dates.forEach(y=>{const option=document.createElement('option');option.value=y;option.textContent=historicalDates.includes(y)?`${y} · historical outline`:`${y} · imported layer date`;$('year-select').append(option);});$('year-select').value=state.year;
  $('subregions').checked=state.subregions;$('labels').checked=state.labels;updateUI();
}
$('tools').addEventListener('click',event=>{const b=event.target.closest('[data-tool]');if(b)setTool(b.dataset.tool);});
$('palette').addEventListener('click',event=>{const b=event.target.closest('[data-color]');if(b){$('color').value=b.dataset.color;document.querySelectorAll('.swatch').forEach(s=>s.classList.toggle('active',s===b));}});
$('color').addEventListener('input',()=>document.querySelectorAll('.swatch').forEach(s=>s.classList.toggle('active',s.dataset.color===$('color').value)));
$('width').addEventListener('input',()=>$('width-value').textContent=`${$('width').value} px`);$('opacity').addEventListener('input',()=>$('opacity-value').textContent=`${$('opacity').value}%`);
$('region').addEventListener('change',()=>{state.region=$('region').value;updateUI();if(state.region!=='country')fit();markDirty();});
$('show-country').addEventListener('click',()=>{const country=countryByName.get($('country').value.trim().toLowerCase());if(!country){toast('Choose a country from the list.');return;}state.country=country.properties.name;state.region='country';fit();markDirty();});
$('country').addEventListener('keydown',event=>{if(event.key==='Enter')$('show-country').click();});
$('boundary-mode').addEventListener('change',()=>{state.mode=$('boundary-mode').value;refreshHistorical();changed();});
function setYear(value){const year=Math.round(Number(value));if(!Number.isFinite(year)||year<1600||year>2100){toast('Choose a supported map date.');return;}state.year=year;refreshHistorical();changed();}
$('year-select').addEventListener('change',()=>setYear($('year-select').value));
$('subregions').addEventListener('change',()=>{state.subregions=$('subregions').checked;changed();});$('labels').addEventListener('change',()=>{state.labels=$('labels').checked;changed();});
$('project-name').addEventListener('input',()=>{state.title=$('project-name').value.trim()||'Untitled';markDirty();});
$('zoom-in').addEventListener('click',()=>zoom(1.3));$('zoom-out').addEventListener('click',()=>zoom(1/1.3));$('fit').addEventListener('click',fit);$('undo').addEventListener('click',undo);$('redo').addEventListener('click',redo);
function browserDownload(data,name,type){const link=document.createElement('a');const url=URL.createObjectURL(new Blob([data],{type}));link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function chooseBrowserFile(accept){return new Promise(resolve=>{const input=$('browser-file');input.value='';input.accept=accept;input.onchange=async()=>resolve(input.files[0]?{name:input.files[0].name,json:await input.files[0].text()}:null);input.oncancel=()=>resolve(null);input.click();});}
function plainProject(){return {...state,layers:state.layers.map(l=>({...l,data:{type:'FeatureCollection',features:l.data.features.map(f=>({type:'Feature',id:f.id,properties:f.properties,geometry:f.geometry}))}}))};}
async function saveProject(saveAs=false){
  if(fileBusy)return;fileBusy=true;const savedRevision=revision;
  try{const json=JSON.stringify(plainProject());if(window.desktop){const result=await window.desktop.saveProject({json,name:state.title,saveAs,revision:savedRevision});if(result.canceled)return;toast(result.current?`Saved ${result.name}`:'Saved snapshot; newer changes remain unsaved.');}else{browserDownload(json,`${state.title}.atlas`,'application/json');toast('Editable project downloaded.');}if(revision===savedRevision)markDirty(false);}catch(error){fail(error);}finally{fileBusy=false;}
}
function validateGeoJSON(data){
  if(!data||data.type!=='FeatureCollection'||!Array.isArray(data.features)||data.features.length<1||data.features.length>15000)throw new Error('Use a GeoJSON FeatureCollection with 1–15,000 polygon regions.');
  if(data.crs && !/CRS84|4326/.test(String(data.crs.properties?.name||'')))throw new Error('Reproject this layer to WGS 84 longitude / latitude before importing.');
  let coordinates=0;const walk=value=>{if(!Array.isArray(value))throw new Error('Invalid polygon coordinates.');if(typeof value[0]==='number'){coordinates++;if(value.length<2||!Number.isFinite(value[0])||!Number.isFinite(value[1])||value[0]<-180||value[0]>180||value[1]<-90||value[1]>90)throw new Error('Coordinates must be longitude / latitude in WGS 84.');}else value.forEach(walk);};
  data.features.forEach((f,i)=>{if(f.type!=='Feature'||!['Polygon','MultiPolygon'].includes(f.geometry?.type))throw new Error('Only Polygon and MultiPolygon features are supported.');
    const polygons=f.geometry.type==='Polygon'?[f.geometry.coordinates]:f.geometry.coordinates;
    if(!Array.isArray(polygons)||!polygons.length)throw new Error('Polygon geometry is empty.');
    polygons.forEach(p=>{if(!Array.isArray(p)||!p.length)throw new Error('Every polygon needs an exterior ring.');p.forEach(r=>{if(!Array.isArray(r)||r.length<4||r.some(v=>!Array.isArray(v)||v.length<2||typeof v[0]!=='number'||typeof v[1]!=='number'))throw new Error('Every ring needs at least four coordinate pairs.');if(r[0][0]!==r.at(-1)[0]||r[0][1]!==r.at(-1)[1])throw new Error('Polygon rings must be closed: repeat the first coordinate at the end.');});});
    walk(f.geometry.coordinates);f.properties={...f.properties,name:String(f.properties?.name||f.properties?.Name||f.properties?.NAME||`Region ${i+1}`).slice(0,200)};f.id=String(f.id||`import-${i}`);});
  if(coordinates>1000000)throw new Error('Simplify the layer to fewer than one million coordinates before importing.');return data;
}
function validateProject(input){
  if(!input||input.version!==1||!Array.isArray(input.annotations)||!Array.isArray(input.layers)||input.annotations.length>50000||input.layers.length>100)throw new Error('This is not a supported Atlas Ink project.');
  if(!['modern','historical'].includes(input.mode)||!Number.isInteger(input.year)||input.year<1600||input.year>2100||!['country',...Object.keys(presets)].includes(input.region))throw new Error('Invalid project map settings.');
  const v=input.view;if(!v||![v.k,v.x,v.y].every(Number.isFinite)||v.k<1||v.k>1000000)throw new Error('Invalid map view.');
  const validPoint=p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)&&Math.abs(p[0])<=180&&Math.abs(p[1])<=85;
  input.annotations.forEach(a=>{
    if(!['brush','arrow','point','text','fill'].includes(a.type)||!/^#[0-9a-f]{6}$/i.test(a.color)||!Number.isFinite(a.opacity)||a.opacity<0||a.opacity>1)throw new Error('Invalid drawing in project.');
    if(a.type==='brush'||a.type==='arrow'){if(!Array.isArray(a.points)||!a.points.length||a.points.length>1000000||!a.points.every(validPoint)||!Number.isFinite(a.width)||a.width<=0||a.width>10||(a.type==='arrow'&&a.points.length!==2))throw new Error('Invalid drawing coordinates.');}
    if(a.type==='text'||a.type==='point'){if(!validPoint(a.point)||typeof a.text!=='string'||a.text.length>1000||![14,18,24,32].includes(a.fontSize))throw new Error('Invalid annotation.');}
    if(a.type==='fill')a.feature=validateGeoJSON({type:'FeatureCollection',features:[a.feature]}).features[0];
  });
  input.layers.forEach(l=>{if(typeof l.name!=='string'||typeof l.source!=='string'||!Number.isInteger(l.from)||!Number.isInteger(l.to)||l.from<1600||l.to>2100||l.from>l.to)throw new Error('Invalid boundary layer.');l.data=validateGeoJSON(l.data);l.data.features.forEach(normalizeFeature);});
  input.title=String(input.title||'Untitled').slice(0,100);input.country=String(input.country||'Iran');return input;
}
async function openProject(){
  if(fileBusy)return;fileBusy=true;
  try{if(!window.desktop&&dirty&&!confirm('Discard unsaved changes and open another project?'))return;const result=window.desktop?await window.desktop.openProject():await chooseBrowserFile('.atlas');if(!result||result.canceled)return;
    const loaded=validateProject(JSON.parse(result.json));state=loaded;undoStack=[];redoStack=[];refreshHistorical();syncControls();scheduleRender();markDirty(false);if(window.desktop)await window.desktop.projectOpened();toast('Project opened.');
  }catch(error){fail(error);}finally{fileBusy=false;}
}
async function newProject(){if(fileBusy)return;fileBusy=true;try{if(window.desktop){if(!await window.desktop.newProject())return;}else if(dirty&&!confirm('Discard unsaved changes and start a new project?'))return;state=freshState();undoStack=[];redoStack=[];refreshHistorical();syncControls();fit();markDirty(false);$('save-status').textContent='New project';}catch(error){fail(error);}finally{fileBusy=false;}}
async function importBoundaries(){
  try{const result=window.desktop?await window.desktop.importBoundaries():await chooseBrowserFile('.geojson,.json');if(!result||result.canceled)return;const data=validateGeoJSON(JSON.parse(result.json));data.features.forEach(normalizeFeature);importPending={data};$('layer-name').value=result.name.replace(/\.(geo)?json$/i,'');$('layer-from').value=state.year;$('layer-to').value=state.year;$('layer-source').value='';$('import-dialog').showModal();}catch(error){fail(error);}
}
$('import-form').addEventListener('submit',event=>{if(event.submitter?.value==='save'&&Number($('layer-from').value)>Number($('layer-to').value)){event.preventDefault();$('layer-to').setCustomValidity('The end year must be on or after the start year.');$('layer-to').reportValidity();}});
$('layer-to').addEventListener('input',()=>$('layer-to').setCustomValidity(''));
$('import-dialog').addEventListener('close',()=>{if($('import-dialog').returnValue==='save'&&importPending){checkpoint();state.layers.push({id:id(),name:$('layer-name').value.trim(),from:Number($('layer-from').value),to:Number($('layer-to').value),source:$('layer-source').value.trim(),visible:true,color:'#8e6ab8',data:importPending.data});state.mode='historical';state.subregions=true;state.year=state.layers.at(-1).from;refreshHistorical();syncControls();changed();toast('Boundary layer added and saved with your project.');}importPending=null;});
function exportDialog(){if(!ready)return;$('export-labels').checked=state.labels;updateExportDimensions();$('export-dialog').showModal();}
function updateExportDimensions(){const scale=Number($('export-scale').value);$('export-dimensions').textContent=`${Math.round(width*scale)} × ${Math.round(height*scale)} pixels`;} $('export-scale').addEventListener('change',updateExportDimensions);
function makePNG(scale=2,{labels=state.labels,title=true,citation=true}={}){
  const output=document.createElement('canvas');output.width=Math.round(width*scale);output.height=Math.round(height*scale);if(output.width*output.height>80000000)throw new Error('Choose a lower resolution for this window size.');const context=output.getContext('2d');context.scale(scale,scale);renderScene(context,{labels});
  if(title){context.fillStyle='#ffffffed';context.fillRect(20,20,Math.min(width-40,context.measureText(state.title).width+380),55);context.font='600 20px "Segoe UI", sans-serif';context.fillStyle='#24334b';context.fillText(state.title,34,54);}
  if(citation){const modern='Base map: modern reference borders · Made with Natural Earth';const historical=state.year<=2024?`Base map: ${state.year} · Approximate dated outlines · Bennett et al., Cliopatria (CC BY 4.0)`:`Base map: ${state.year} · Imported boundaries (no bundled historical outlines)`;const layerNames=currentLayers().map(l=>`${l.name}: ${l.source}`).join(' | ');const text=`${state.mode==='modern'?modern:historical}${layerNames?' | '+layerNames:''}`;
    context.font='11px "Segoe UI", sans-serif';context.fillStyle='#ffffffed';context.fillRect(0,height-29,width,29);context.fillStyle='#52657d';let display=text;while(context.measureText(display).width>width-28&&display.length>3)display=display.slice(0,-4)+'…';context.fillText(display,14,height-11);}
  return output.toDataURL('image/png');
}
$('export-dialog').addEventListener('close',async()=>{if($('export-dialog').returnValue!=='export')return;try{const data=makePNG(Number($('export-scale').value),{labels:$('export-labels').checked,title:$('export-title').checked,citation:$('export-citation').checked});if(window.desktop){const result=await window.desktop.exportPNG({data,name:state.title});if(result.canceled)return;toast(`Exported ${result.name}`);}else{const link=document.createElement('a');link.href=data;link.download=`${state.title}.png`;link.click();toast('PNG exported.');}}catch(error){fail(error);}});
function showHelp(){$('help-dialog').showModal();} $('help').addEventListener('click',showHelp);$('sources').addEventListener('click',showHelp);$('close-help').addEventListener('click',()=>$('help-dialog').close());
const actions={new:newProject,open:openProject,save:()=>saveProject(false),'save-as':()=>saveProject(true),export:exportDialog,undo,redo,fit,import:importBoundaries,help:showHelp};
function handleAction(action){const typing=['INPUT','TEXTAREA'].includes(document.activeElement?.tagName),modal=document.querySelector('dialog[open]');if((action==='undo'||action==='redo')&&typing){if(window.desktop)window.desktop.editText(action);else document.execCommand(action);return;}if(modal){toast('Finish or close the current dialog first.');return;}actions[action]?.();}
$('open-project').addEventListener('click',openProject);$('save-project').addEventListener('click',()=>saveProject(false));$('export').addEventListener('click',exportDialog);$('import').addEventListener('click',importBoundaries);window.desktop?.onAction(handleAction);
document.addEventListener('keydown',event=>{
  const typing=['INPUT','TEXTAREA','SELECT'].includes(event.target.tagName),modal=document.querySelector('dialog[open]');
  if(event.code==='Space'&&!typing&&!modal){event.preventDefault();space=true;canvas.style.cursor='grab';return;}
  if(typing||modal)return;const key=event.key.toLowerCase(),modifier=event.ctrlKey||event.metaKey;
  if(modifier){if(window.desktop)return;const action=key==='z'?(event.shiftKey?'redo':'undo'):({s:event.shiftKey?'save-as':'save',o:'open',n:'new',e:'export','0':'fit'})[key];if(action){event.preventDefault();actions[action]();}return;}
  const next=({b:'brush',f:'fill',a:'arrow',p:'point',t:'text',e:'eraser',h:'hand'})[key];if(next){event.preventDefault();setTool(next);}if(key==='escape')finishGesture(null,true);
});
document.addEventListener('keyup',event=>{if(event.code==='Space'){space=false;canvas.style.cursor=tool==='hand'?'grab':tool==='text'?'text':'crosshair';}});
window.addEventListener('blur',()=>{space=false;finishGesture(null,true);});
async function readData(name){if(window.desktop)return window.desktop.readData(name);const response=await fetch(`data/${name}`);if(!response.ok)throw new Error(`Could not load ${name}`);return response.json();}
function sourceDetails(){const container=$('source-details');container.replaceChildren();const entries=[
  {text:'Modern reference: Natural Earth, 1:10m country and first-level subdivision data, release 5.2 series. Bundled shapes simplified at 2 km. Public domain. Includes 31 Iranian provinces. Some administrative units are dated; disputed territories follow the source.',url:'https://www.naturalearthdata.com/'},
  {text:'Historical: Bennett et al. (2025), Cliopatria, Scientific Data 12, 247; dataset v0.2.1, Seshat. CC BY 4.0. Selected maps use time-ranged polity outlines from 1600–2024. Source geography is sampled and approximate (about 40 km² per pixel); a shape can be held across several years. Source dynasty date conventions can differ from standard chronologies. No interpolation is used and data gaps remain gaps. Changes: 1600-onward subset, normalized metadata, shared-arc encoding with submeter coordinate quantization; no deliberate outline simplification.',url:'https://github.com/Seshat-Global-History-Databank/cliopatria'},
  {text:'Data license: Creative Commons Attribution 4.0 International.',url:'https://creativecommons.org/licenses/by/4.0/'},
  {text:'Historical overlays can overlap, and unrecorded areas have no state outlines. Historical coastlines are not reconstructed; physical land is the modern Natural Earth reference. Imported layers retain their own citation and time range.',url:null}
];entries.forEach(entry=>{const p=document.createElement('p');p.textContent=entry.text;if(entry.url){p.append(' ');const link=document.createElement('a');link.href=entry.url;link.target='_blank';link.rel='noreferrer';link.textContent='Source';p.append(link);}container.append(p);});}
async function start(){
  try{resize();const data=await Promise.all([readData('countries.json'),readData('admin1.json'),readData('historical.json'),readData('sources.json')]);countries=data[0].features.map(normalizeFeature);admin1=data[1].features.map(normalizeFeature);historicalTopology=data[2];sources=data[3];
    countries.forEach(f=>countryByName.set(f.properties.name.toLowerCase(),f));[...countryByName.values()].sort((a,b)=>a.properties.name.localeCompare(b.properties.name)).forEach(f=>{const option=document.createElement('option');option.value=f.properties.name;$('country-list').append(option);});
    refreshHistorical();sourceDetails();ready=true;$('map-loading').hidden=true;syncControls();fit();setTool('brush');$('save-status').textContent='New project';
  }catch(error){$('map-loading').textContent=`Map library could not load. ${error.message}`;fail(error);}
}
new ResizeObserver(resize).observe(area);start();
