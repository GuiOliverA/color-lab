'use strict';
const $ = id => document.getElementById(id);
const roles = {primary:'Primary · Principal',secondary:'Secondary · Secundária',accent:'Accent · Destaque',background:'Background · Fundo',surface:'Surface · Superfície',text:'Text · Texto',muted:'Muted · Suave'};
const defaultCategories = ['Tecnologia','Saúde','Educação','Alimentação','Corporativo','Minimalista','Criativo','Outros'];
const icons = {
 brand:'<circle cx="10" cy="10" r="6"/><circle cx="14" cy="14" r="6"/>',
 lab:'<path d="M9 3h6m-5 0v7l-5 8a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-8V3M8 15h8"/>',
 saved:'<rect x="4" y="7" width="16" height="13" rx="2"/><path d="M7 3h10m-8 8h6"/>',
 star:'<path d="m12 3 2.7 5.6 6.3.9-4.5 4.4 1 6.2-5.5-2.9-5.5 2.9 1-6.2L3 9.5l6.3-.9z"/>',
 settings:'<path d="M4 6h16M4 12h16M4 18h16"/><path d="M8 3v6m7 0v6m-6 0v6"/>',
 edit:'<path d="m4 16-1 5 5-1L20 8l-4-4zM13 7l4 4"/>',
 copy:'<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 4H6a2 2 0 0 0-2 2v10"/>',
 duplicate:'<rect x="5" y="5" width="14" height="14" rx="2"/><path d="M12 8v8m-4-4h8"/>',
 trash:'<path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7"/>',
 up:'<path d="M12 20V4m-6 6 6-6 6 6"/>',
 down:'<path d="M12 4v16m-6-6 6 6 6-6"/>'
};
function icon(name) {
 return '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">'+icons[name]+'</svg>';
}
document.querySelectorAll('[data-icon]').forEach(el => { el.innerHTML=icon(el.dataset.icon); });
const uid = () => globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
const makeColor = (hex,name='',role='') => ({id:uid(),hex,name,role});
const initial = () => [makeColor('#111111','Preto'),makeColor('#FFFFFF','Branco')];
const blankMap = () => ({light:{},dark:{}});
const key = 'color-lab.v1';
let state = {colors:initial(),library:[],categories:[...defaultCategories],maps:blankMap(),theme:'light',mode:'institutional',history:[],active:null,contrast:{}};
let page = 'lab';
let selected = '#111111';
let hsv = {h:0,s:0,v:17/255};
let editingColor, editingPalette, metadataOnly, toastTimer, storageError = false;
const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
function normalize(value) {
 if(typeof value !== 'string') return null;
 const hex = value.trim().replace(/^#/,'').toUpperCase();
 if(!/^(?:[0-9A-F]{3}|[0-9A-F]{6})$/.test(hex)) return null;
 return '#'+(hex.length===3 ? [...hex].map(c=>c+c).join('') : hex);
}
const rgb = hex => [1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
const hexOf = channels => '#'+channels.map(n=>Math.round(Math.min(255,Math.max(0,n))).toString(16).padStart(2,'0')).join('').toUpperCase();
function hueData(hex) {
 const [r,g,b]=rgb(hex).map(n=>n/255), max=Math.max(r,g,b), min=Math.min(r,g,b), d=max-min;
 const h = d===0 ? 0 : 60*(max===r ? ((g-b)/d+6)%6 : max===g ? (b-r)/d+2 : (r-g)/d+4);
 return {h,max,min,d};
}
function hslOf(hex) {
 const {h,max,min,d}=hueData(hex), l=(max+min)/2;
 return [h,d===0 ? 0 : d/(1-Math.abs(2*l-1))*100,l*100].map(n=>Number(n.toFixed(3)));
}
function hueHex(h,c,m) {
 const sector=h%360/60, x=c*(1-Math.abs(sector%2-1));
 const values=[[c,x,0],[x,c,0],[0,c,x],[0,x,c],[x,0,c],[c,0,x]][Math.floor(sector)];
 return hexOf(values.map(n=>(n+m)*255));
}
function luminance(hex) {
 return rgb(hex).map(n=>n/255).map(n=>n<=.04045 ? n/12.92 : ((n+.055)/1.055)**2.4)
  .reduce((sum,n,i)=>sum+n*[.2126,.7152,.0722][i],0);
}
function ratio(a,b) {
 const values=[luminance(a),luminance(b)].sort((x,y)=>y-x);
 return (values[0]+.05)/(values[1]+.05);
}
const ink = hex => ratio(hex,'#111111') >= ratio(hex,'#FFFFFF') ? '#111111' : '#FFFFFF';
function note(message) {
 clearTimeout(toastTimer);
 $('toast').textContent=message;
 toastTimer=setTimeout(()=>{$('toast').textContent='';},2800);
}
function persist() {
 try {localStorage.setItem(key,JSON.stringify(state)); $('persist').hidden=true; return true;}
 catch { $('persist').hidden=false; return false; }
}
try {
 const raw=localStorage.getItem(key);
 if(raw) {
  const data=JSON.parse(raw);
  if(!data || !Array.isArray(data.colors) || !Array.isArray(data.library) || !Array.isArray(data.categories)) throw Error();
  Object.assign(state,data);
 }
} catch { storageError=true; $('persist').hidden=false; }
function fmt(hex) {
 const [h,s,l]=hslOf(hex);
 return {rgb:rgb(hex).join(', '),hsl:h+'°, '+s+'%, '+l+'%'};
}
function drawWheel() {
 const canvas=$('wheel-art'), ctx=canvas.getContext('2d'), size=canvas.width, r=size/2;
 const pixels=ctx.createImageData(size,size);
 for(let y=0;y<size;y++) for(let x=0;x<size;x++) {
  const dx=(x+.5-r)/r, dy=(y+.5-r)/r, s=Math.hypot(dx,dy);
  if(s>1) continue;
  const h=(Math.atan2(dy,dx)*180/Math.PI+360)%360;
  const channels=rgb(hueHex(h,s,1-s)), start=(y*size+x)*4;
  pixels.data.set([...channels,255],start);
 }
 ctx.putImageData(pixels,0,0);
}
function reportField(message='',invalid=[]) {
 document.querySelectorAll('[aria-invalid=true]').forEach(el=>el.removeAttribute('aria-invalid'));
 invalid.forEach(el=>el.setAttribute('aria-invalid','true'));
 $('field-error').textContent=message;
 $('field-error').hidden=!message;
 $('add').disabled=Boolean(message);
 $('copy-current').disabled=Boolean(message);
}
function syncPicker(preserve) {
 const pos=hsv.h*Math.PI/180;
 $('marker').style.left=(50+Math.cos(pos)*hsv.s*48)+'%';
 $('marker').style.top=(50+Math.sin(pos)*hsv.s*48)+'%';
 $('current').style.backgroundColor=selected;
 $('brightness').value=hsv.v*100;
 if(preserve!=='hex') $('hex').value=selected;
 if(preserve!=='rgb') rgb(selected).forEach((n,i)=>{$('rgb'+i).value=n;});
 if(preserve!=='hsl') hslOf(selected).forEach((n,i)=>{$('hsl'+i).value=n;});
 reportField();
}
function selectColor(hex,preserve) {
 selected=hex;
 const {h,max,d}=hueData(hex);
 hsv={h,s:max===0 ? 0 : d/max,v:max};
 syncPicker(preserve);
}
function record(...hexes) {
 state.history=[...new Set([...hexes,...state.history])].slice(0,16);
 renderHistory();
 persist();
}
function renderHistory() {
 $('history').innerHTML=state.history.map(hex=>'<button data-hex="'+hex+'"><span class="dot" style="background:'+hex+'"></span><code>'+hex+'</code></button>').join('') || '<small>As últimas cores usadas aparecem aqui.</small>';
}
function setFromWheel() {
 const c=hsv.v*hsv.s;
 selected=hueHex(hsv.h,c,hsv.v-c);
 syncPicker();
}
function wheelPoint(event) {
 const rect=$('wheel').getBoundingClientRect(), x=(event.clientX-rect.left)/rect.width*2-1, y=(event.clientY-rect.top)/rect.height*2-1;
 hsv.h=(Math.atan2(y,x)*180/Math.PI+360)%360;
 hsv.s=Math.min(1,Math.hypot(x,y));
 if(hsv.v===0) hsv.v=1;
 setFromWheel();
}
$('wheel').addEventListener('pointerdown',event=>{
 if(event.button!==0) return;
 $('wheel').setPointerCapture(event.pointerId);
 wheelPoint(event);
});
$('wheel').addEventListener('pointermove',event=>{if($('wheel').hasPointerCapture(event.pointerId)) wheelPoint(event);});
$('wheel').addEventListener('pointerup',()=>record(selected));
$('wheel').addEventListener('keydown',event=>{
 const step=event.shiftKey?10:1;
 if(event.key==='ArrowLeft') hsv.h=(hsv.h+360-step)%360;
 else if(event.key==='ArrowRight') hsv.h=(hsv.h+step)%360;
 else if(event.key==='ArrowUp') hsv.s=Math.min(1,hsv.s+step/100);
 else if(event.key==='ArrowDown') hsv.s=Math.max(0,hsv.s-step/100);
 else return;
 event.preventDefault();
 setFromWheel();
 record(selected);
});
$('brightness').addEventListener('input',()=>{hsv.v=Number($('brightness').value)/100;setFromWheel();});
$('brightness').addEventListener('change',()=>record(selected));
function readFields(group) {
 if(group==='hex') {
  const hex=normalize($('hex').value);
  if(!hex) {reportField('Digite 3 ou 6 dígitos hexadecimais.',[$('hex')]);return false;}
  selectColor(hex,group);
  return true;
 }
 const fields=[0,1,2].map(i=>$(group+i));
 const bad=fields.filter(input=>input.value===''||!input.validity.valid);
 if(bad.length) {
  reportField(group==='rgb' ? 'Use números inteiros de 0 a 255 no RGB.' : 'Use 0 a 360° no matiz e 0 a 100% na saturação e luminosidade.',bad);
  return false;
 }
 const values=fields.map(input=>Number(input.value));
 if(group==='rgb') selectColor(hexOf(values),group);
 else {
  const [h,s,l]=values, light=l/100, c=(1-Math.abs(2*light-1))*s/100;
  selectColor(hueHex(h,c,light-c/2),group);
 }
 return true;
}
function bindPicker(input,group) {
 input.addEventListener('input',()=>readFields(group));
 input.addEventListener('change',()=>{if(readFields(group)) record(selected);});
 input.addEventListener('keydown',event=>{
  if(event.key==='Enter'&&readFields(group)) {syncPicker(); record(selected);}
  if(event.key==='Escape') syncPicker();
 });
}
for(const [group,labels,limits] of [['rgb',['Vermelho','Verde','Azul'],[255,255,255]],['hsl',['Matiz °','Saturação %','Luminosidade %'],[360,100,100]]]) {
 $(group+'-fields').innerHTML=labels.map((label,i)=>'<label>'+label+'<input aria-describedby="field-error" id="'+group+i+'" type="number" min="0" max="'+limits[i]+'" step="'+(group==='rgb'?'1':'any')+'"></label>').join('');
 labels.forEach((_,i)=>bindPicker($(group+i),group));
}
bindPicker($('hex'),'hex');
const option = (value,label) => '<option value="'+esc(value)+'">'+esc(label)+'</option>';
const colorLabel = color => [color.name || roles[color.role]?.split(' · ')[1],color.hex].filter(Boolean).join(' · ');
$('role-list').innerHTML=option('','Sem papel atribuído')+Object.entries(roles).map(([id,label])=>option(id,label)).join('');
function iconButton(action,label,id,disabled=false) {
 return '<button class="icon" data-action="'+action+'" data-id="'+esc(id)+'" aria-label="'+esc(label)+'" title="'+esc(label)+'"'+(disabled?' disabled':'')+'>'+icon(action)+'</button>';
}
function renderColors() {
 const count=state.colors.length;
 $('count').textContent=count===1 ? '1 cor na composição' : count+' cores na composição';
 $('strip').innerHTML=state.colors.map(c=>'<button class="tile" data-action="select" data-id="'+esc(c.id)+'" style="--tile:'+c.hex+';--ink:'+ink(c.hex)+'"><span>'+esc(c.name||roles[c.role]?.split(' · ')[1]||'Cor')+'</span><code>'+c.hex+'</code></button>').join('') || '<div class="empty">Adicione uma cor para começar.</div>';
 $('color-list').innerHTML=state.colors.map((c,i)=>{
  const info=fmt(c.hex);
  const title=[c.name,roles[c.role]].filter(Boolean).join(' / ');
  return '<div class="color-row"><span class="dot" style="background:'+c.hex+'"></span><div class="color-info"><code>'+c.hex+'</code> '+(title?'<small style="display:inline">'+esc(title)+'</small>':'')+'<small>RGB '+info.rgb+' · HSL '+info.hsl+'</small></div><div class="actions">'+
   [['edit','Editar'],['copy','Copiar HEX'],['duplicate','Duplicar'],['up','Mover para cima',i===0],['down','Mover para baixo',i===count-1],['trash','Excluir']].map(([action,label,disabled])=>iconButton(action,label+' '+c.hex,c.id,disabled)).join('')+'</div></div>';
 }).join('');
 for(const id of ['copy-all','copy-text','css','json','save']) $(id).disabled=!count;
}
function cleanMaps() {
 for(const map of Object.values(state.maps)) for(const role of Object.keys(map)) {
  if(!state.colors.some(c=>c.id===map[role])) delete map[role];
 }
}
function refreshColors() {
 cleanMaps();
 renderColors();
 renderMapping();
 renderSiteColors();
 renderContrastControls();
 persist();
}
const roleName = role => roles[role].split(' · ')[1];
function resolveSite() {
 const colors=state.colors, dark=state.theme==='dark';
 const sorted=[...colors].sort((a,b)=>luminance(a.hex)-luminance(b.hex));
 const darkColor=sorted[0]?.hex || '#111111', lightColor=sorted.at(-1)?.hex || '#FFFFFF';
 const base=dark ? darkColor : lightColor;
 const opposite=dark ? lightColor : darkColor;
 const choice = role => colors.find(c=>c.id===state.maps[state.theme][role])?.hex || colors.find(c=>c.role===role)?.hex;
 const assignedBackground=colors.find(c=>c.role==='background')?.hex;
 const assignedText=colors.find(c=>c.role==='text')?.hex;
 const reverse=dark && assignedBackground && luminance(assignedBackground)>luminance(assignedText||darkColor);
 const manual = role => colors.find(c=>c.id===state.maps[state.theme][role])?.hex;
 const background=manual('background')||(reverse?assignedText||base:assignedBackground||base);
 const contrastOrder=[...colors].sort((a,b)=>ratio(b.hex,background)-ratio(a.hex,background));
 const best=contrastOrder[0]?.hex || opposite;
 const foreground=best===background ? ink(background) : best;
 const expressive=colors.filter(c=>c.hex!==background && c.hex!==foreground);
 return {
  background,
  text:manual('text')||(reverse?assignedBackground:assignedText)||foreground,
  surface:choice('surface')||background,
  primary:choice('primary')||expressive[0]?.hex||foreground,
  secondary:choice('secondary')||expressive[1]?.hex||background,
  accent:choice('accent')||expressive[2]?.hex||expressive[0]?.hex||foreground,
  muted:choice('muted')||foreground
 };
}
function renderMapping() {
 const opts=option('','Automático')+state.colors.map(c=>option(c.id,colorLabel(c))).join('');
 $('mapping').innerHTML=Object.keys(roles).map(role=>'<label>'+roleName(role)+'<select data-role="'+role+'">'+opts+'</select></label>').join('');
 $('mapping').querySelectorAll('select').forEach(s=>{s.value=state.maps[state.theme][s.dataset.role]||'';});
}
function renderSiteColors() {
 const site=$('site');
 const values=resolveSite();
 for(const [role,hex] of Object.entries(values)) site.style.setProperty('--'+role,hex);
 for(const role of ['primary','secondary','accent']) {
  const a=values.background,b=values.text;
  const candidate=ratio(a,values[role])>=ratio(b,values[role])?a:b;
  site.style.setProperty('--'+role+'-ink',ratio(candidate,values[role])>=4.5?candidate:ink(values[role]));
 }
 renderContrast();
}
const modes = {
 institutional:{tag:'Design & estratégia',title:'Ideias que ganham forma.',desc:'Criamos identidades, produtos e experiências digitais com propósito.',cta:'Conheça nosso trabalho',alt:'Sobre o estúdio',section:'O que fazemos',cards:[['Estratégia','Clareza para cada decisão.'],['Identidade','Marcas com personalidade.'],['Experiência','Design que aproxima.']],content:'Um processo colaborativo do primeiro esboço à entrega.'},
 landing:{tag:'Organização criativa',title:'Menos ruído. Mais criação.',desc:'Organize ideias, referências e projetos em um só espaço.',cta:'Explorar recursos',alt:'Como funciona',section:'Feito para o seu fluxo',cards:[['Coleções','Referências sempre à mão.'],['Projetos','Tudo em seu lugar.'],['Equipe','Crie em colaboração.']],content:'Comece reunindo referências, convide sua equipe e acompanhe o progresso em um só lugar.'},
 dashboard:{tag:'Visão geral · últimos 30 dias',title:'Desempenho do estúdio',desc:'Acompanhe as métricas e a atividade dos seus projetos.',cta:'Ver indicadores',alt:'Atividade recente',section:'Indicadores',cards:[['1.284 visitas','↑ 12% no período'],['38 projetos','↑ 4 neste mês'],['96% satisfação','Avaliação da equipe']],content:'A coleção Identidades recebeu três novos arquivos nesta semana.'}
};
function renderSite() {
 const data=modes[state.mode];
 $('site').dataset.mode=state.mode;
 const chart='<path d="M18 84h164M18 59h164M18 34h164M18 9v75" stroke="var(--muted)" opacity=".35"/><path d="M18 73l28-16 24 8 28-29 27 10 26-23 30-10" stroke="var(--primary)" stroke-width="4" fill="none"/><circle cx="181" cy="13" r="5" fill="var(--accent)"/>';
 const shapes='<defs><pattern id="lines" width="8" height="8" patternUnits="userSpaceOnUse"><path d="M0 8 8 0" stroke="var(--muted)" opacity=".24"/></pattern></defs><rect width="200" height="100" fill="url(#lines)"/><circle cx="79" cy="50" r="37" fill="var(--primary)"/><path d="M102 14h48v72h-48z" fill="var(--secondary)" stroke="var(--text)"/><path d="m126 23 32 56H94z" fill="var(--accent)" stroke="var(--text)"/><circle cx="79" cy="50" r="20" fill="none" stroke="var(--primary-ink)"/>';
 $('site').innerHTML='<header><span class="site-logo"><b aria-hidden="true">◈</b> Estúdio Forma</span><nav aria-label="Menu do site simulado"><a href="#preview-home">Início</a><a href="#preview-section">Destaques</a><a href="#preview-content">Sobre</a></nav></header>'+
  '<section id="preview-home" class="hero"><div><small style="color:var(--muted)">'+data.tag+'</small><h3>'+data.title+'</h3><p>'+data.desc+'</p><div class="actions"><a class="cta" href="#preview-section">'+data.cta+'</a><a class="cta alt" href="#preview-content">'+data.alt+'</a></div></div><div class="hero-art"><svg viewBox="0 0 200 100" preserveAspectRatio="xMidYMid slice" aria-hidden="true">'+(state.mode==='dashboard'?chart:shapes)+'</svg></div></section>'+
  '<section id="preview-section" class="site-section"><h4>'+data.section+'</h4><div class="mini-grid">'+data.cards.map(([title,detail])=>'<article class="mini-card"><strong>'+title+'</strong><p>'+detail+'</p></article>').join('')+'</div></section>'+
  '<section class="site-section site-content" id="preview-content"><p>'+data.content+'</p></section><footer><strong>Estúdio Forma</strong><span>© Estúdio Forma · Site demonstrativo</span></footer>';
 renderSiteColors();
}
$('mapping').addEventListener('change',event=>{
 const {role}=event.target.dataset;
 if(!role) return;
 state.maps[state.theme][role]=event.target.value;
 renderSiteColors();
 persist();
});
$('mode').addEventListener('change',()=>{state.mode=$('mode').value; renderSite(); persist();});
$('theme').addEventListener('change',()=>{state.theme=$('theme').value; renderMapping(); renderSiteColors(); persist();});
function renderContrastControls() {
 const colors=state.colors.map(c=>option(c.id,colorLabel(c))).join('');
 for(const side of ['text','bg']) {
  const el=$('contrast-'+side);
  el.innerHTML=option('','Automático · simulador')+colors;
  el.value=state.colors.some(c=>c.id===state.contrast[side])?state.contrast[side]:'';
 }
 renderContrast();
}
function renderContrast() {
 const site=resolveSite();
 const find=side=>state.colors.find(c=>c.id===$('contrast-'+side).value)?.hex;
 const fg=find('text')||site.text, bg=find('bg')||site.background, value=ratio(fg,bg);
 $('sample').style.color=fg;
 $('sample').style.backgroundColor=bg;
 const scan=(target,label)=>label+' '+(value>=target?'✓ atende':'✕ falha');
 $('checks').innerHTML='<strong>'+value.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+':1</strong><br>Texto comum · '+scan(4.5,'AA')+' · '+scan(7,'AAA')+'<br>Texto grande · '+scan(3,'AA')+' · '+scan(4.5,'AAA');
}
for(const side of ['text','bg']) $('contrast-'+side).addEventListener('change',event=>{state.contrast[side]=event.target.value;renderContrast();persist();});
async function copy(text) {
 try {
  try {await navigator.clipboard.writeText(text);}
  catch {
   const field=document.createElement('textarea'), focus=document.activeElement;
   field.value=text;
   field.style.cssText='position:fixed;left:-9999px;top:0';
   document.body.append(field);
   field.select();
   try {if(!document.execCommand('copy')) throw Error();}
   finally {field.remove();focus?.focus();}
  }
  note('Copiado para a área de transferência.');
 } catch {note('Não foi possível copiar. Verifique as permissões do navegador.');}
}
function paletteText(colors) {
 return colors.map((color,index)=>{
  const name=color.name?.replace(/\s+/g,' ').trim() || 'Cor '+(index+1);
  return name+' '+color.hex;
 }).join('\n');
}
$('copy-current').onclick=()=>copy(selected);
$('copy-all').onclick=()=>copy(state.colors.map(c=>c.hex).join(', '));
$('copy-text').onclick=()=>copy(paletteText(state.colors));
$('history').onclick=event=>{
 const hex=event.target.closest('[data-hex]')?.dataset.hex;
 if(hex) selectColor(hex);
};
function openColor(color) {
 editingColor=color.id;
 const form=$('color-form');
 form.elements.hex.value=color.hex;
 form.elements.namedItem('name').value=color.name;
 form.elements.role.value=color.role;
 $('color-id').textContent='Identificador: '+color.id;
 $('color-dialog').showModal();
}
$('color-form').onsubmit=event=>{
 event.preventDefault();
 const fields=event.currentTarget.elements, hex=normalize(fields.hex.value);
 const color=state.colors.find(c=>c.id===editingColor);
 if(!color||!hex) return;
 Object.assign(color,{hex,name:fields.namedItem('name').value.trim(),role:fields.role.value});
 $('color-dialog').close();
 selectColor(hex);
 record(hex);
 refreshColors();
 [...$('color-list').querySelectorAll('[data-action=edit]')].find(button=>button.dataset.id===color.id)?.focus();
 note('Cor atualizada.');
};
function paletteAction(event) {
 const button=event.target.closest('[data-action]');
 if(!button) return;
 const {action,id}=button.dataset;
 const index=state.colors.findIndex(c=>c.id===id), color=state.colors[index];
 if(!color) return;
 if(action==='select') {selectColor(color.hex);record(color.hex);return;}
 if(action==='edit') {openColor(color);return;}
 if(action==='copy') {copy(color.hex);return;}
 let focusId=id;
 if(action==='trash') {
  state.colors.splice(index,1);
  focusId=state.colors[Math.min(index,state.colors.length-1)]?.id;
  note('Cor removida.');
 }
 if(action==='duplicate') {
  const clone=makeColor(color.hex,color.name,color.role);
  state.colors.splice(index+1,0,clone);
  focusId=clone.id;
  note('Cor duplicada.');
 }
 if(action==='up'||action==='down') {
  const dest=index+(action==='up'?-1:1);
  if(dest<0||dest>=state.colors.length) return;
  state.colors.splice(index,1);
  state.colors.splice(dest,0,color);
 }
 record(color.hex);
 refreshColors();
 const buttons=[...$('color-list').querySelectorAll('button')].filter(b=>b.dataset.id===focusId);
 (buttons.find(b=>b.dataset.action===action&&!b.disabled)||buttons[0]||$('add')).focus();
}
$('color-list').onclick=paletteAction;
$('strip').onclick=paletteAction;
$('add').onclick=()=>{
 state.colors.push(makeColor(selected));
 record(selected);
 refreshColors();
 note(selected+' adicionada à paleta.');
};
function replaceDraft(colors) {
 state.colors=colors;
 state.maps=blankMap();
 state.contrast={};
 state.active=null;
 selectColor(colors[0].hex);
 record(...colors.slice(0,16).map(c=>c.hex));
 refreshColors();
}
$('reset').onclick=()=>{
 if(confirm('Restaurar a paleta de trabalho para preto e branco?')) {replaceDraft(initial());note('Paleta inicial restaurada.');}
};
$('random').onclick=()=>{
 if(state.colors.length && !confirm('Substituir a paleta de trabalho por uma combinação aleatória?')) return;
 const h=Math.random()*360, offset=25+Math.random()*50;
 const picks=[[0,.65,.36,'Principal','primary'],[offset,.55,.47,'Secundária','secondary'],[180+offset,.72,.53,'Destaque','accent'],[0,.15,.96,'Fundo','background'],[offset,.3,.12,'Texto','text']];
 replaceDraft(picks.map(([shift,s,l,name,role])=>{
  const c=(1-Math.abs(2*l-1))*s;
  return makeColor(hueHex((h+shift)%360,c,l-c/2),name,role);
 }));
 note('Combinação aleatória criada.');
};
const pages={
 lab:['Laboratório','Laboratório de cores','Crie sua paleta e veja como as cores funcionam juntas na web.'],
 saved:['Minhas paletas','Minhas paletas','Organize suas combinações e reabra-as no laboratório.'],
 favorites:['Favoritos','Favoritos','Acesse rapidamente as paletas que você marcou com uma estrela.'],
 settings:['Configurações','Configurações','Personalize as categorias da sua biblioteca.']
};
function navigate(next,focus=true) {
 page=next;
 const [label,title,description]=pages[next];
 $('breadcrumb').textContent=label;
 $('heading').textContent=title;
 $('intro').textContent=description;
 $('lab').hidden=next!=='lab';
 $('gallery').hidden=next!=='saved'&&next!=='favorites';
 $('settings').hidden=next!=='settings';
 document.querySelectorAll('[data-page]').forEach(button=>{
  if(button.dataset.page===next) button.setAttribute('aria-current','page');
  else button.removeAttribute('aria-current');
 });
 if(next==='saved'||next==='favorites') renderLibrary();
 if(next==='settings') renderCategories();
 if(focus) {$('heading').focus({preventScroll:true});window.scrollTo(0,0);}
}
document.querySelectorAll('[data-page]').forEach(button=>{button.onclick=()=>navigate(button.dataset.page);});
const clone = value => JSON.parse(JSON.stringify(value));
function draft() {
 return clone({colors:state.colors,maps:state.maps,theme:state.theme,mode:state.mode});
}
function currentPalette() {
 return state.library.find(p=>p.id===state.active);
}
function openSave(palette,metadata=false) {
 if(!metadata&&!state.colors.length) return;
 editingPalette=palette?.id;
 metadataOnly=metadata;
 $('save-title').textContent=metadata?'Editar dados da paleta':palette?'Atualizar paleta':'Salvar paleta';
 $('save-copy').hidden=!palette||metadata;
 const fields=$('save-form').elements;
 fields.title.setCustomValidity('');
 for(const prop of ['title','description','notes']) {fields[prop].value=palette?.[prop]||'';}
 $('save-category').innerHTML=option('','Sem categoria')+state.categories.map(s=>option(s,s)).join('');
 fields.category.value=palette?.category||'';
 $('save-dialog').showModal();
}
$('save').onclick=()=>openSave(currentPalette());
$('save-form').onsubmit=event=>{
 event.preventDefault();
 const fields=event.currentTarget.elements, title=fields.title.value.trim();
 if(!title) {
  fields.title.setCustomValidity('Digite um nome para a paleta.');
  fields.title.reportValidity();
  return;
 }
 const target=event.submitter?.value==='copy'?null:state.library.find(p=>p.id===editingPalette);
 if(!metadataOnly&&!state.colors.length) return;
 const changes={title,category:fields.category.value,description:fields.description.value.trim(),notes:fields.notes.value.trim()};
 if(!metadataOnly) Object.assign(changes,draft());
 const palette=target||{id:uid(),favorite:false};
 Object.assign(palette,changes);
 if(!target) state.library.unshift(palette);
 if(!metadataOnly) state.active=palette.id;
 $('save-dialog').close();
 const saved=persist();
 if(!$('gallery').hidden) renderLibrary();
 note(saved?'Paleta salva.':'Paleta atualizada nesta sessão.');
};
$('save-form').elements.title.oninput=event=>event.target.setCustomValidity('');
document.querySelectorAll('[data-close]').forEach(btn=>{btn.onclick=()=>btn.closest('dialog').close();});
function renderLibrary() {
 const palettes=page==='favorites'?state.library.filter(p=>p.favorite):state.library;
 $('gallery').innerHTML=palettes.map(p=>'<article class="panel pad saved"><div class="strip" aria-label="'+esc(p.colors.map(c=>c.hex).join(', '))+'">'+p.colors.map(c=>'<span style="background:'+c.hex+'"></span>').join('')+'</div>'+
  '<div class="section-head"><h2>'+esc(p.title)+'</h2><button class="icon" data-lib="favorite" data-id="'+esc(p.id)+'" title="Favorita" aria-label="Paleta favorita" aria-pressed="'+p.favorite+'">'+(p.favorite?'★':icon('star'))+'</button></div>'+
  (p.category?'<span class="tag">'+esc(p.category)+'</span>':'')+
  (p.description?'<p>'+esc(p.description)+'</p>':'')+
  (p.notes?'<details class="spacer"><summary>Observações</summary><p>'+esc(p.notes)+'</p></details>':'')+
  '<div class="actions">'+[['load','Abrir no laboratório'],['copy-text','Copiar como texto'],['edit','Editar dados'],['duplicate','Duplicar'],['delete','Excluir']].map(([action,label])=>'<button '+(action==='load'?'class="solid" ':'')+'data-lib="'+action+'" data-id="'+esc(p.id)+'">'+label+'</button>').join('')+'</div></article>').join('') ||
  '<div class="panel empty">'+(page==='favorites'?'Você ainda não marcou nenhuma paleta como favorita.':'Você ainda não salvou nenhuma paleta.')+'</div>';
}
function loadPalette(palette) {
 const {colors,maps,theme,mode}=clone(palette);
 Object.assign(state,{colors,maps,theme,mode,active:palette.id,contrast:{}});
 $('mode').value=state.mode;
 $('theme').value=state.theme;
 selectColor(colors[0]?.hex||'#111111');
 renderSite();
 refreshColors();
 navigate('lab');
}
$('gallery').onclick=event=>{
 const button=event.target.closest('[data-lib]');
 if(!button) return;
 const {lib:action,id}=button.dataset, palette=state.library.find(p=>p.id===id);
 if(!palette) return;
 if(action==='copy-text') {copy(paletteText(palette.colors));return;}
 if(action==='load') {loadPalette(palette);note('Paleta aberta no laboratório.');return;}
 if(action==='edit') {openSave(palette,true);return;}
 let focusId=id;
 if(action==='favorite') palette.favorite=!palette.favorite;
 if(action==='duplicate') {
  const duplicate={...clone(palette),id:uid(),title:palette.title+' (cópia)',favorite:false};
  state.library.unshift(duplicate);
  focusId=duplicate.id;
 }
 if(action==='delete') {
  if(!confirm('Excluir a paleta “'+palette.title+'”?')) return;
  state.library=state.library.filter(p=>p.id!==id);
  if(state.active===id) state.active=null;
 }
 persist();
 renderLibrary();
 ([...$('gallery').querySelectorAll('[data-lib]')].find(b=>b.dataset.id===focusId && b.dataset.lib===action)||$('heading')).focus({preventScroll:true});
 note({favorite:palette.favorite?'Marcada como favorita.':'Removida dos favoritos.',duplicate:'Paleta duplicada.',delete:'Paleta excluída.'}[action]);
};
function renderCategories() {
 $('categories').innerHTML=state.categories.map(c=>'<span class="tag">'+esc(c)+'</span>').join('');
}
function addCategory(value) {
 const match=state.categories.find(c=>c.toLocaleLowerCase('pt-BR')===value.toLocaleLowerCase('pt-BR'));
 if(!match) state.categories.push(value);
 return match||value;
}
$('category-form').onsubmit=event=>{
 event.preventDefault();
 const field=event.currentTarget.elements.category, value=field.value.trim();
 if(!value) {note('Digite um nome para a categoria.');return;}
 const count=state.categories.length;
 addCategory(value);
 if(state.categories.length===count) {note('Esta categoria já existe.');return;}
 field.value='';
 renderCategories();
 note(persist()?'Categoria criada.':'Categoria criada nesta sessão.');
};
const slug = name => name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9_-]+/g,'-').replace(/^[-_]+|[-_]+$/g,'');
function cssExport() {
 const used=new Set();
 const lines=state.colors.map((color,index)=>{
  const base=slug(color.name)||color.role||'cor-'+(index+1);
  let unique=base;
  for(let suffix=2;used.has(unique);suffix++) unique=base+'-'+suffix;
  used.add(unique);
  return '  --color-'+unique+': '+color.hex+';';
 });
 return ':root {\n'+lines.join('\n')+'\n}\n';
}
function download(content,ext,mime) {
 try {
  const url=URL.createObjectURL(new Blob([content],{type:mime})), link=document.createElement('a');
  link.href=url;
  link.download=(slug(currentPalette()?.title||'paleta')||'paleta')+'.'+ext;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),3000);
  note('Arquivo '+ext.toUpperCase()+' gerado.');
 } catch {note('Não foi possível exportar o arquivo.');}
}
$('css').onclick=()=>download(cssExport(),'css','text/css;charset=utf-8');
$('json').onclick=()=>{
 const {title='Paleta importada',category='',description='',notes=''}=currentPalette()||{};
 const palette=draft();
 palette.colors=palette.colors.map(c=>({...c,rgb:rgb(c.hex),hsl:hslOf(c.hex)}));
 download(JSON.stringify({version:1,title,category,description,notes,...palette},null,2),'json','application/json');
};
function parseImport(data,filename) {
 const entries=Array.isArray(data)?data:data?.colors;
 if(!Array.isArray(entries)||!entries.length) throw Error('O JSON deve conter uma lista de cores.');
 const translated=new Map();
 const str=(value,max)=>typeof value==='string'?value.trim().slice(0,max):'';
 const colors=entries.map(entry=>{
  const hex=normalize(typeof entry==='string'?entry:entry?.hex);
  if(!hex) throw Error('O arquivo contém uma cor com HEX inválido.');
  const role=Object.hasOwn(roles,entry?.role)?entry.role:'';
  const color=makeColor(hex,str(entry?.name,80),role);
  if(typeof entry?.id==='string'&&!translated.has(entry.id)) translated.set(entry.id,color.id);
  return color;
 });
 const maps=blankMap();
 for(const theme of Object.keys(maps)) for(const role of Object.keys(roles)) {
  const id=translated.get(data?.maps?.[theme]?.[role]);
  if(id) maps[theme][role]=id;
 }
 return {id:uid(),favorite:false,colors,maps,mode:Object.hasOwn(modes,data?.mode)?data.mode:'institutional',
  theme:data?.theme==='dark'?'dark':'light', title:str(data?.title,100)||str(filename.replace(/\.json$/i,''),100)||'Paleta importada',
  category:str(data?.category,60),description:str(data?.description,1000),notes:str(data?.notes,2000)};
}
$('import').onclick=()=>$('file').click();
$('file').onchange=async event=>{
 const input=event.target, file=input.files[0];
 input.value='';
 if(!file) return;
 try {
  let data;
  try {data=JSON.parse((await file.text()).replace(/^\uFEFF/,''));}
  catch {throw Error('Não foi possível ler o arquivo como JSON.');}
  const palette=parseImport(data,file.name);
  if(palette.category) palette.category=addCategory(palette.category);
  state.library.unshift(palette);
  loadPalette(palette);
  note($('persist').hidden?'Paleta importada e salva.':'Paleta importada nesta sessão.');
 } catch(error) {note(error.message||'Não foi possível importar a paleta.');}
};
drawWheel();
selectColor(state.colors[0]?.hex||'#111111');
renderColors();
renderMapping();
renderContrastControls();
renderHistory();
$('mode').value=state.mode;
$('theme').value=state.theme;
renderSite();
navigate('lab',false);
if(storageError) note('Não foi possível ler os dados locais anteriores.');
