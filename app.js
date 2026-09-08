/* ============================================================
   Mi Vida — app personal de Emmanuel
   Todo se guarda en tu teléfono (localStorage). Sin cuentas, sin servidor.
   ============================================================ */

'use strict';

/* ---------- Utilidades ---------- */
const $ = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => [...r.querySelectorAll(s)];
const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);
const hoy = () => new Date().toISOString().slice(0, 10);
const esc = (s='') => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money = n => '$' + Math.round(Number(n)||0).toLocaleString('es-MX');
const clamp = (n,a,b) => Math.max(a, Math.min(b, n));
const DIAS = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
const DIAS_CORTO = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const isoDe = (y,m,d) => `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;

function inicioSemana(d = new Date()){            // lunes como inicio
  const x = new Date(d); const day = (x.getDay()+6)%7;
  x.setDate(x.getDate()-day); x.setHours(0,0,0,0); return x;
}
function enSemanaActual(fechaISO){
  const f = new Date(fechaISO+'T12:00:00');
  const ini = inicioSemana(); const fin = new Date(ini); fin.setDate(fin.getDate()+7);
  return f >= ini && f < fin;
}
function fechaBonita(iso){
  const f = new Date(iso+'T12:00:00');
  return f.toLocaleDateString('es-MX',{weekday:'short', day:'numeric', month:'short'});
}
function diasRestantes(iso){
  const f = new Date(iso+'T23:59:59'); const now = new Date();
  return Math.ceil((f - now)/86400000);
}

/* ---------- Estado ---------- */
const DEFAULT_CATS = [
  {id:'mandado',   nombre:'Mandado / Alimentos', icono:'🛒', tipo:'variable', presupuesto:0, color:'#2ec16b'},
  {id:'hormiga',   nombre:'Gastos hormiga',      icono:'🐜', tipo:'variable', presupuesto:0, color:'#ff5c5c'},
  {id:'inversion', nombre:'Inversiones',         icono:'📈', tipo:'ahorro',   presupuesto:0, color:'#7c5cff'},
  {id:'deudas',    nombre:'Deudas',              icono:'💳', tipo:'fijo',     presupuesto:0, color:'#ffb020'},
  {id:'psicologo', nombre:'Psicólogo',           icono:'🧠', tipo:'fijo',     presupuesto:0, color:'#28c3d7'},
  {id:'subs',      nombre:'Suscripciones',       icono:'📺', tipo:'fijo',     presupuesto:0, color:'#4f8cff'},
  {id:'otros',     nombre:'Otros / Libre',       icono:'✨', tipo:'variable', presupuesto:0, color:'#8b98a9'},
];

const DEFAULT = {
  v: 1,
  perfil: { nombre:'Emmanuel', sexo:'', edad:null, altura:null, pesoActual:null, pesoMeta:null, actividad:'moderado', objetivo:'subir' },
  finanzas: { semanal:7000, cats: DEFAULT_CATS.map(c=>({...c})), movs:[], metas:[], favoritos:[], deudas:[] },
  comida: { registros:[], vasosAgua:{} },
  gym: { rutina:{lunes:'',martes:'',miércoles:'',jueves:'',viernes:'',sábado:'',domingo:''},
         plan:{lunes:[],martes:[],miércoles:[],jueves:[],viernes:[],sábado:[],domingo:[]},
         entrenos:[], suplementos:[], tomas:[] },
  uni: { tareas:[] },
  progreso: { pesos:[] },
  recordatorios: [],
  ajustes: { apiKey:'', modelo:'claude-haiku-4-5', notifOk:false, webBuscar:true },
  onboarded:false,
};

let S = load();
function load(){
  try{
    const raw = localStorage.getItem('mividav1');
    if(!raw) return structuredClone(DEFAULT);
    const d = JSON.parse(raw);
    return deepMerge(structuredClone(DEFAULT), d);
  }catch(e){ return structuredClone(DEFAULT); }
}
function deepMerge(base, ext){
  for(const k in ext){
    if(ext[k] && typeof ext[k]==='object' && !Array.isArray(ext[k]) && base[k] && typeof base[k]==='object' && !Array.isArray(base[k]))
      deepMerge(base[k], ext[k]);
    else base[k] = ext[k];
  }
  return base;
}
function save(){ localStorage.setItem('mividav1', JSON.stringify(S)); }

/* ============================================================
   CÁLCULOS — Dinero
   ============================================================ */
function gastosSemana(catId=null){
  return S.finanzas.movs.filter(m => enSemanaActual(m.fecha) && (!catId || m.cat===catId))
    .reduce((a,m)=>a+m.monto, 0);
}
function gastoTotalSemana(){ return gastosSemana(); }
function restanteSemana(){ return S.finanzas.semanal - gastoTotalSemana(); }

// Reparto sugerido del dinero semanal
function repartoSugerido(){
  const total = S.finanzas.semanal || 0;
  const cats = S.finanzas.cats;
  // Fijos: se respetan tal cual (presupuesto ya definido por el usuario)
  const fijos = cats.filter(c=>c.tipo==='fijo').reduce((a,c)=>a+(c.presupuesto||0),0);
  let libre = Math.max(0, total - fijos);
  // Del dinero libre: 55% mandado, 20% ahorro/inversión, 10% hormiga (tope), 15% otros
  const plan = {};
  plan.mandado   = Math.round(libre*0.55);
  plan.inversion = Math.round(libre*0.20);
  plan.hormiga   = Math.round(libre*0.10);
  plan.otros     = libre - plan.mandado - plan.inversion - plan.hormiga;
  return {total, fijos, libre, plan};
}

/* ============================================================
   CÁLCULOS — Nutrición (Mifflin-St Jeor) → porciones caseras
   ============================================================ */
const FACTOR = { sedentario:1.2, ligero:1.375, moderado:1.55, fuerte:1.725, atleta:1.9 };
function tienenPerfil(){ const p=S.perfil; return p.edad&&p.altura&&p.pesoActual&&p.sexo; }
function calcNutricion(entrenoFuerteHoy=false){
  const p = S.perfil;
  if(!tienenPerfil()) return null;
  let bmr = 10*p.pesoActual + 6.25*p.altura - 5*p.edad + (p.sexo==='h' ? 5 : -161);
  let tdee = bmr * (FACTOR[p.actividad]||1.55);
  // objetivo
  let cal = tdee;
  if(p.objetivo==='subir') cal = tdee + 400;
  else if(p.objetivo==='bajar') cal = tdee - 400;
  if(entrenoFuerteHoy && p.objetivo==='subir') cal += 150; // repone desgaste
  cal = Math.round(cal/10)*10;
  // macros
  const prot = Math.round(p.pesoActual * (p.objetivo==='subir'?2.0:1.8));
  const grasa = Math.round(p.pesoActual * 0.9);
  const kcalPG = prot*4 + grasa*9;
  const carbs = Math.max(0, Math.round((cal - kcalPG)/4));
  return {cal, prot, grasa, carbs, tdee:Math.round(tdee)};
}
// reparte por comida y traduce a porciones caseras
function porcionesComida(nut, comida){
  const share = comida==='desayuno'?0.30 : comida==='almuerzo'?0.40 : 0.30;
  const cal = Math.round(nut.cal*share);
  const prot = Math.round(nut.prot*share);
  const carbs = Math.round(nut.carbs*share);
  // referencia casera:
  // pechuga: 1 palma ≈ 100g ≈ 31g proteína
  // arroz cocido: 1 taza ≈ 200 kcal ≈ 45g carbos
  const palmas = Math.max(0.5, Math.round((prot/31)*2)/2);
  const tazasArroz = Math.max(0.5, Math.round((carbs/45)*2)/2);
  return {cal, prot, carbs, palmas, tazasArroz, share};
}
function nfmt(x){ return Number.isInteger(x)? x : x.toFixed(1).replace('.0',''); }

/* ============================================================
   Universidad — auto-agenda de huecos
   ============================================================ */
function tareasPendientes(){
  return S.uni.tareas.filter(t=>t.estado!=='hecha').sort((a,b)=> (a.fecha||'9999').localeCompare(b.fecha||'9999'));
}
// sugiere día para hacer cada tarea (reparte antes de su fecha límite)
function agendaSugerida(){
  const pend = tareasPendientes();
  const out = [];
  pend.forEach(t=>{
    const dr = t.fecha ? diasRestantes(t.fecha) : null;
    let cuando, motivo;
    if(dr===null){ cuando='Sin fecha'; motivo='ponle fecha límite para agendarla'; }
    else if(dr<=0){ cuando='HOY, urgente'; motivo='ya venció o vence hoy'; }
    else if(dr===1){ cuando='Hoy o mañana'; motivo='vence mañana'; }
    else if(dr<=3){ cuando='En los próximos 2 días'; motivo=`quedan ${dr} días`; }
    else { const d=new Date(); d.setDate(d.getDate()+Math.max(1,dr-2));
           cuando= d.toLocaleDateString('es-MX',{weekday:'long'}); motivo=`hazla ~2 días antes (vence en ${dr})`; }
    out.push({t, cuando, motivo, dr});
  });
  return out;
}

/* ============================================================
   Router / Vistas
   ============================================================ */
let vista = 'inicio';
const TITULOS = {inicio:'Inicio', calendario:'Calendario', dinero:'Dinero', comida:'Comida', gym:'Gym', uni:'Universidad'};
function go(v){
  vista = v;
  $$('#nav button').forEach(b=>b.classList.toggle('on', b.dataset.view===v));
  $('#headerTitle').textContent = TITULOS[v];
  render();
  window.scrollTo(0,0);
}
function render(){
  if(!S.onboarded){ renderOnboard(); return; }
  const saludo = (()=>{ const h=new Date().getHours(); return h<12?'Buenos días':h<19?'Buenas tardes':'Buenas noches'; })();
  $('#greeting').textContent = `${saludo}, ${S.perfil.nombre||'Emmanuel'}`;
  const el = $('#app');
  el.innerHTML = ({inicio:viewInicio, calendario:viewCalendario, dinero:viewDinero, comida:viewComida, gym:viewGym, uni:viewUni}[vista])();
  el.className = 'view';
  const fab = $('#coachFab'); if(fab) fab.hidden = !S.onboarded;
}

/* ---------- INICIO / Dashboard ---------- */
function viewInicio(){
  const rest = restanteSemana();
  const gast = gastoTotalSemana();
  const sem = S.finanzas.semanal||0;
  const pctGast = sem? clamp(gast/sem*100,0,100):0;
  const nut = calcNutricion(entrenoFuerteHoy());
  const supHoy = suplementosPendientesHoy();
  const pend = tareasPendientes();
  const proxTarea = pend[0];
  const diaHoy = DIAS[new Date().getDay()];
  const entrenoHoy = resumenDiaTxt(diaHoy);
  const yaEntreno = S.gym.entrenos.some(e=>e.fecha===hoy());

  let avisos = generarAvisos();
  const ins = insightsHoy();
  const rGym = rachaGym();
  const rActivo = rachaDias(activoDia);
  const rAgua = rachaDias(iso=>(S.comida.vasosAgua[iso]||0)>=6);

  return `
  ${avisos.map(a=>`<div class="banner ${a.tipo}">${a.html}</div>`).join('')}

  <div class="card">
    <div class="lbl muted" style="font-size:12px;margin-bottom:10px">🔥 Tus rachas</div>
    <div style="text-align:center;padding:2px 0 12px;border-bottom:1px solid var(--line2)">
      <div style="font-size:46px;font-weight:800;line-height:1;color:var(--gym)">${rGym}</div>
      <div class="sm muted" style="margin-top:6px">🏋️ entrenos en racha</div>
    </div>
    <div class="grid2" style="gap:10px;margin-top:12px">
      <div style="text-align:center"><div style="font-size:24px;font-weight:800;line-height:1">${rActivo}</div><div class="sm muted" style="margin-top:3px">activo 🔥</div></div>
      <div style="text-align:center"><div style="font-size:24px;font-weight:800;line-height:1">${rAgua}</div><div class="sm muted" style="margin-top:3px">agua ≥6 💧</div></div>
    </div>
    ${rGym>=2
      ? `<div class="banner ok" style="margin:12px 0 0">🔥 ¡${rGym} entrenos en racha, ${esc(S.perfil.nombre)}! No dejes pasar más de 3 días. 💪</div>`
      : `<div class="hint" style="margin-top:11px">La racha de gym aguanta huecos de hasta 3 días (por si llueve 🌧️). Solo se rompe si dejas pasar más de 3 días sin entrenar.</div>`}
  </div>

  ${ins.slice(0,2).map(a=>`<div class="banner ${a.tipo}">${a.html}</div>`).join('')}

  <div class="grid2">
    <div class="stat">
      <div class="lbl">💰 Te queda esta semana</div>
      <div class="val" style="color:${rest<0?'var(--bad)':'var(--money)'}">${money(rest)}</div>
      <div class="sm">de ${money(sem)} · gastado ${money(gast)}</div>
      <div class="bar"><span style="width:${pctGast}%;background:${pctGast>90?'var(--bad)':'var(--money)'}"></span></div>
    </div>
    <div class="stat">
      <div class="lbl">🍽️ Meta de hoy</div>
      <div class="val" style="color:var(--food)">${nut? nut.cal : '—'}<span style="font-size:13px;color:var(--mut)"> kcal</span></div>
      <div class="sm">${nut? `${nut.prot}g proteína · ${nut.carbs}g carbos` : 'completa tu perfil'}</div>
    </div>
  </div>

  <div class="card">
    <div class="kpi" style="justify-content:space-between">
      <div>
        <div class="lbl muted" style="font-size:12px">🏋️ Entrenamiento de hoy</div>
        <div style="font-weight:700;margin-top:4px">${entrenoHoy? esc(entrenoHoy) : 'Día de descanso'}</div>
      </div>
      ${entrenoHoy? `<button class="btn sm ${yaEntreno?'sec':''}" onclick="iniciarEntreno()">${yaEntreno?'✓ Hecho':'Entrenar'}</button>`:''}
    </div>
  </div>

  ${supHoy.length? `<div class="card">
    <div class="lbl muted" style="font-size:12px;margin-bottom:8px">💊 Suplementos de hoy</div>
    ${supHoy.map(s=>`<div class="row" style="padding:9px 0">
      <div class="ic">${s.tomado?'✅':'⚪'}</div>
      <div class="mid"><div class="t">${esc(s.nombre)}</div><div class="s">${esc(s.hora||'')}</div></div>
      <button class="btn sm ${s.tomado?'sec':''}" onclick="toggleToma('${s.id}')">${s.tomado?'Tomado':'Marcar'}</button>
    </div>`).join('')}
  </div>`:''}

  ${proxTarea? `<div class="card tap" onclick="go('uni')">
    <div class="lbl muted" style="font-size:12px;margin-bottom:6px">🎓 Próxima tarea</div>
    <div class="row" style="padding:0;border:none">
      <div class="ic" style="background:rgba(40,195,215,.15)">📌</div>
      <div class="mid"><div class="t">${esc(proxTarea.titulo)}</div>
        <div class="s">${esc(proxTarea.materia||'')} · ${proxTarea.fecha? 'vence '+fechaBonita(proxTarea.fecha):'sin fecha'}</div></div>
      ${proxTarea.fecha? `<span class="tag" style="background:${diasRestantes(proxTarea.fecha)<=1?'rgba(214,72,72,.14)':'rgba(198,138,28,.16)'};color:${diasRestantes(proxTarea.fecha)<=1?'#b23b3b':'#8a6412'}">${diasRestantes(proxTarea.fecha)<=0?'¡hoy!':diasRestantes(proxTarea.fecha)+'d'}</span>`:''}
    </div>
  </div>`:''}

  <div class="sectitle"><h2>Registrar rápido</h2></div>
  <div class="grid2">
    <button class="btn sec" onclick="sheetGasto()">💸 Gasto</button>
    <button class="btn sec" onclick="sheetComida()">🍽️ Comida</button>
    <button class="btn sec" onclick="sheetEntreno()">🏋️ Entreno</button>
    <button class="btn sec" onclick="sheetTarea()">🎓 Tarea</button>
  </div>
  ${(S.finanzas.favoritos||[]).length? `<div class="chips" style="margin-top:10px">
    ${S.finanzas.favoritos.map(f=>`<button class="chip" onclick="gastoRapido('${f.id}')">⚡ ${esc(f.nombre)} · ${money(f.monto)}</button>`).join('')}
  </div>`:''}

  <div style="margin-top:14px"><button class="btn ghost" onclick="openAjustes()">⚙️ Ajustes y perfil</button></div>
  <div class="center small muted" style="margin:18px 0 4px">Tus datos viven solo en este teléfono 🔒</div>
  `;
}

function entrenoFuerteHoy(){
  const e = S.gym.entrenos.find(e=>e.fecha===hoy());
  return e ? (e.duracion>=75 || e.intensidad==='fuerte') : false;
}
function suplementosPendientesHoy(){
  return S.gym.suplementos.map(s=>({
    ...s, tomado: S.gym.tomas.some(t=>t.fecha===hoy() && t.sup===s.id)
  }));
}

/* ---------- Avisos inteligentes (sin IA, con reglas) ---------- */
function generarAvisos(){
  const out = [];
  // Dinero
  const rest = restanteSemana(), sem=S.finanzas.semanal||0;
  const diasQuedan = 7 - ((new Date().getDay()+6)%7);
  if(sem>0 && rest<0){
    out.push({tipo:'warn', html:`<b>Ojo con el dinero.</b> Ya te pasaste ${money(-rest)} de tu presupuesto semanal. Frena los gastos hormiga estos ${diasQuedan} días.`});
  } else if(sem>0 && rest>0 && diasQuedan>0){
    const porDia = Math.floor(rest/diasQuedan);
    out.push({tipo:'info', html:`<b>Ritmo del dinero:</b> te quedan ${money(rest)} para ${diasQuedan} día(s) → puedes gastar ~<b>${money(porDia)}/día</b> sin pasarte.`});
  }
  // Gastos hormiga
  const horm = gastosSemana('hormiga');
  const rep = repartoSugerido();
  if(horm > 0 && rep.plan.hormiga>0 && horm > rep.plan.hormiga){
    out.push({tipo:'warn', html:`<b>🐜 Gastos hormiga altos:</b> llevas ${money(horm)} esta semana (tu tope sano era ~${money(rep.plan.hormiga)}). Esos pequeños suman.`});
  }
  // Gym
  const diaHoy = DIAS[new Date().getDay()];
  const hora = new Date().getHours();
  const rutHoy = resumenDiaTxt(diaHoy);
  if(rutHoy && !S.gym.entrenos.some(e=>e.fecha===hoy()) && hora>=16 && hora<22){
    out.push({tipo:'info', html:`<b>🏋️ ${S.perfil.nombre}, es buena hora de gym.</b> Hoy toca: ${esc(rutHoy)}. ¡Y no olvides tu creatina! 💪`});
  }
  // Universidad urgente
  const urg = tareasPendientes().filter(t=>t.fecha && diasRestantes(t.fecha)<=1);
  if(urg.length){
    out.push({tipo:'warn', html:`<b>🎓 Tarea urgente:</b> «${esc(urg[0].titulo)}»${urg[0].materia?' de '+esc(urg[0].materia):''} ${diasRestantes(urg[0].fecha)<=0?'vence hoy':'vence mañana'}. Hazle un hueco ya.`});
  }
  return out;
}

/* ---------- DINERO ---------- */
function viewDinero(){
  const sem = S.finanzas.semanal||0;
  const gast = gastoTotalSemana();
  const rest = sem - gast;
  const rep = repartoSugerido();
  const cats = S.finanzas.cats;

  const catRows = cats.map(c=>{
    const g = gastosSemana(c.id);
    const budget = c.presupuesto || (rep.plan[c.id]||0);
    const pct = budget? clamp(g/budget*100,0,100) : (g>0?100:0);
    return `<div class="card tap" onclick="verCategoria('${c.id}')">
      <div class="row" style="padding:0;border:none">
        <div class="ic" style="background:${c.color}22">${c.icono}</div>
        <div class="mid">
          <div class="t">${esc(c.nombre)}</div>
          <div class="s">${budget? money(g)+' de '+money(budget) : money(g)+' gastado'}</div>
        </div>
        <div class="amt" style="color:${pct>=100&&budget?'var(--bad)':'var(--txt)'}">${money(g)}</div>
      </div>
      ${budget? `<div class="bar"><span style="width:${pct}%;background:${pct>=100?'var(--bad)':c.color}"></span></div>`:''}
    </div>`;
  }).join('');

  const movs = S.finanzas.movs.filter(m=>enSemanaActual(m.fecha)).sort((a,b)=>b.ts-a.ts).slice(0,10);

  return `
  <div class="card">
    <div class="kpi" style="justify-content:space-between;align-items:flex-start">
      <div>
        <div class="lbl muted small">Presupuesto semanal</div>
        <div class="val" style="font-size:26px;font-weight:800;margin-top:4px">${money(sem)}</div>
      </div>
      <button class="btn sm sec" onclick="sheetSemanal()">Editar</button>
    </div>
    <div class="divider"></div>
    <div class="grid2" style="gap:10px">
      <div><div class="lbl muted small">Gastado</div><div style="font-weight:800;font-size:18px">${money(gast)}</div></div>
      <div><div class="lbl muted small">Te queda</div><div style="font-weight:800;font-size:18px;color:${rest<0?'var(--bad)':'var(--money)'}">${money(rest)}</div></div>
    </div>
  </div>

  ${favoritosHtml()}

  <div class="banner info" style="margin-top:4px">
    <b>Reparto sugerido</b> de tus ${money(rep.total)}: primero tus fijos (${money(rep.fijos)}), y del resto libre (${money(rep.libre)}):
    🛒 ${money(rep.plan.mandado)} mandado · 📈 ${money(rep.plan.inversion)} ahorro/inversión · 🐜 máx ${money(rep.plan.hormiga)} hormiga · ✨ ${money(rep.plan.otros)} libre.
    <div style="margin-top:8px"><button class="btn sm" onclick="aplicarReparto()">Aplicar este reparto</button></div>
  </div>

  ${metasAhorroHtml()}

  ${deudasHtml()}

  ${graficaGastos()}

  <div class="sectitle"><h2>Categorías</h2><button class="addbtn" onclick="sheetCategoria()">+</button></div>
  ${catRows}

  <div class="sectitle"><h2>Movimientos de la semana</h2></div>
  <div class="card">
    ${movs.length? movs.map(m=>{
      const c = cats.find(x=>x.id===m.cat)||{icono:'💸',nombre:'Gasto',color:'#8b98a9'};
      return `<div class="row">
        <div class="ic" style="background:${c.color}22">${c.icono}</div>
        <div class="mid"><div class="t">${esc(m.nota||c.nombre)}</div><div class="s">${esc(c.nombre)} · ${fechaBonita(m.fecha)}</div></div>
        <div class="amt" style="color:var(--bad)">-${money(m.monto)}</div>
        <button class="addbtn" style="margin-left:6px" onclick="borrarMov('${m.id}')">×</button>
      </div>`;
    }).join('') : `<div class="empty"><div class="big">🧾</div>Sin gastos esta semana.<br>Toca el botón para registrar el primero.</div>`}
  </div>
  <button class="btn" onclick="sheetGasto()" style="margin-top:4px">＋ Registrar gasto</button>
  `;
}

/* ---------- COMIDA ---------- */
function viewComida(){
  if(!tienenPerfil()){
    return `<div class="banner warn">Para calcular tus porciones necesito tu <b>peso, altura, edad y sexo</b>.
      <div style="margin-top:8px"><button class="btn sm" onclick="openAjustes()">Completar perfil</button></div></div>`;
  }
  const nut = calcNutricion(entrenoFuerteHoy());
  const p = S.perfil;
  const dif = p.pesoMeta && p.pesoActual ? (p.pesoMeta - p.pesoActual) : 0;
  const regsHoy = S.comida.registros.filter(r=>r.fecha===hoy());
  const vasos = S.comida.vasosAgua[hoy()]||0;

  const comidaCard = (comida, emoji, nombre) => {
    const por = porcionesComida(nut, comida);
    const hecho = regsHoy.find(r=>r.comida===comida);
    return `<div class="card">
      <div class="kpi" style="justify-content:space-between">
        <div style="font-weight:700">${emoji} ${nombre}</div>
        <span class="tag" style="background:rgba(197,106,52,.14);color:#a5521f">${por.cal} kcal</span>
      </div>
      <div class="hint" style="margin-top:8px;color:var(--txt)">
        Aprox: <b>${nfmt(por.palmas)} palma(s)</b> de pechuga/proteína ·
        <b>${nfmt(por.tazasArroz)} taza(s)</b> de arroz/carbo · más verduras a gusto.
      </div>
      <div class="hint">${por.prot}g proteína · ${por.carbs}g carbos en esta comida.</div>
      <div style="margin-top:10px">
        ${hecho? `<button class="btn sm sec" onclick="borrarComida('${hecho.id}')">✓ Registrada — quitar</button>`
               : `<button class="btn sm" onclick="registrarComida('${comida}','${nombre}')">Marcar como comida</button>`}
      </div>
    </div>`;
  };

  return `
  <div class="card">
    <div class="grid2">
      <div><div class="lbl muted small">Peso actual</div><div style="font-weight:800;font-size:20px">${p.pesoActual} kg</div></div>
      <div><div class="lbl muted small">Meta</div><div style="font-weight:800;font-size:20px">${p.pesoMeta||'—'} kg</div></div>
    </div>
    ${dif? `<div class="banner ${dif>0?'ok':'info'}" style="margin:12px 0 0">
      ${dif>0? `Quieres <b>subir ${dif} kg</b>. Vas en superávit: come completo, sobre todo en días de entreno fuerte. 💪`
             : `Quieres <b>bajar ${Math.abs(dif)} kg</b>. Vas en déficit controlado: cuida las porciones y la proteína.`}
    </div>`:''}
  </div>

  ${graficaPeso()}

  <div class="banner info">
    <b>Meta de hoy:</b> ${nut.cal} kcal · ${nut.prot}g proteína · ${nut.carbs}g carbos · ${nut.grasa}g grasa.
    ${entrenoFuerteHoy()? '<br>🔥 Detecté entreno fuerte hoy → subí un poco las porciones para que no te desgastes.' : ''}
  </div>

  ${comidaCard('desayuno','🌅','Desayuno')}
  ${comidaCard('almuerzo','☀️','Almuerzo')}
  ${comidaCard('cena','🌙','Cena')}

  <div class="card">
    <div class="kpi" style="justify-content:space-between">
      <div style="font-weight:700">💧 Agua de hoy</div>
      <div style="font-weight:800">${vasos} vasos</div>
    </div>
    <div class="chips" style="margin-top:10px">
      <button class="chip" onclick="agua(-1)">−</button>
      <button class="chip on" onclick="agua(1)">＋ vaso</button>
      <span class="chip" style="background:none;border:none;color:var(--mut)">meta ~8</span>
    </div>
  </div>
  <div class="hint center">Las porciones son una guía calculada con tu perfil. Pídele detalle al Coach ✦ si quieres afinar.</div>
  `;
}

/* ============================================================
   GYM — Biblioteca de ejercicios, armador de rutina y sesión
   ============================================================ */
const GRUPOS = [
  {id:'pecho',   nombre:'Pecho',   color:'#c56a34'},
  {id:'espalda', nombre:'Espalda', color:'#3a7d4d'},
  {id:'hombro',  nombre:'Hombro',  color:'#1f97a8'},
  {id:'biceps',  nombre:'Bíceps',  color:'#6a4fd0'},
  {id:'triceps', nombre:'Tríceps', color:'#8a5cd0'},
  {id:'pierna',  nombre:'Pierna',  color:'#c68a1c'},
  {id:'gluteo',  nombre:'Glúteo',  color:'#d64848'},
  {id:'abdomen', nombre:'Abdomen', color:'#2b8fb0'},
];
const grupoPorId = id => GRUPOS.find(g=>g.id===id);
const nombreGrupo= id => (grupoPorId(id)||{}).nombre || '';
const grupoColor = id => (grupoPorId(id)||{}).color || '#6a4fd0';

// Dibujo simple (guía) de una figura con el músculo trabajado resaltado
function figuraSVG(grupo){
  const c = grupoColor(grupo);
  const hi = {
    pecho:'<ellipse cx="60" cy="50" rx="17" ry="9"/>',
    espalda:'<rect x="44" y="42" width="32" height="20" rx="6"/>',
    hombro:'<circle cx="43" cy="42" r="8"/><circle cx="77" cy="42" r="8"/>',
    biceps:'<rect x="30" y="46" width="10" height="19" rx="5"/><rect x="80" y="46" width="10" height="19" rx="5"/>',
    triceps:'<rect x="30" y="47" width="10" height="22" rx="5"/><rect x="80" y="47" width="10" height="22" rx="5"/>',
    pierna:'<rect x="48" y="92" width="11" height="40" rx="5"/><rect x="61" y="92" width="11" height="40" rx="5"/>',
    gluteo:'<ellipse cx="60" cy="90" rx="19" ry="9"/>',
    abdomen:'<rect x="50" y="62" width="20" height="22" rx="5"/>',
  }[grupo] || '';
  return `<svg viewBox="0 0 120 150" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
    <g fill="#e5ddcd" stroke="#c9beac" stroke-width="1.5">
      <circle cx="60" cy="19" r="12"/>
      <rect x="44" y="33" width="32" height="52" rx="13"/>
      <rect x="30" y="41" width="11" height="45" rx="5"/>
      <rect x="79" y="41" width="11" height="45" rx="5"/>
      <rect x="47" y="85" width="12" height="52" rx="6"/>
      <rect x="61" y="85" width="12" height="52" rx="6"/>
    </g>
    <g fill="${c}" opacity="0.85">${hi}</g>
  </svg>`;
}

// Texto-resumen de un día = músculos a entrenar
function resumenDiaTxt(dia){
  const plan = (S.gym.plan && S.gym.plan[dia]) || [];
  if(plan.length) return plan.map(g=>nombreGrupo(g)||g).filter(Boolean).join(', ');
  return (S.gym.rutina && S.gym.rutina[dia]) ? S.gym.rutina[dia] : '';
}
const planDiaResumen = resumenDiaTxt;

/* ---------- Armador de rutina por día = elegir MÚSCULOS ---------- */
function sheetPlanDia(dia){
  const plan = (S.gym.plan && S.gym.plan[dia]) || [];
  const lista = plan.length ? plan.map((g,i)=>`<div class="row">
      <div class="ic" style="background:${grupoColor(g)}22;color:${grupoColor(g)};font-size:11px;font-weight:800;text-transform:uppercase">${(nombreGrupo(g)||g).slice(0,3)}</div>
      <div class="mid"><div class="t">${esc(nombreGrupo(g)||g)}</div></div>
      <button class="addbtn" style="margin-left:6px" onclick="quitarMusculo('${dia}',${i})">×</button></div>`).join('')
    : `<div class="empty small">Aún sin músculos. Toca abajo los que entrenas este día.</div>`;
  const chips = GRUPOS.map(g=>{
    const on = plan.includes(g.id);
    return `<button class="chip ${on?'on':''}" onclick="toggleMusculo('${dia}','${g.id}')">${esc(g.nombre)}${on?' ✓':''}</button>`;
  }).join('');
  openSheet(`<h3 style="text-transform:capitalize">${dia}</h3>
    <div class="lbl muted small" style="margin:2px 2px 6px">Músculos de este día</div>
    <div class="card" style="margin-bottom:12px">${lista}</div>
    <div class="lbl muted small" style="margin:4px 2px 6px">Toca los músculos que entrenas este día</div>
    <div class="chips">${chips}</div>
    <button class="btn" style="margin-top:16px" onclick="cerrarPlan()">Listo</button>`);
}
function cerrarPlan(){ closeSheet(); render(); }
function toggleMusculo(dia,g){
  if(!S.gym.plan) S.gym.plan={};
  if(!S.gym.plan[dia]) S.gym.plan[dia]=[];
  const arr = S.gym.plan[dia], i = arr.indexOf(g);
  if(i>=0) arr.splice(i,1); else arr.push(g);
  save(); sheetPlanDia(dia);
}
function quitarMusculo(dia,i){ S.gym.plan[dia].splice(i,1); save(); sheetPlanDia(dia); }

/* ---------- Sesión: "Entrenar hoy" (por músculo, agregas ejercicios y series) ---------- */
let sesionActual = null;
function ultimaSerieDe(nombre){
  if(!nombre || !nombre.trim()) return null;
  const n = nombre.trim().toLowerCase();
  const conDet = S.gym.entrenos.filter(e=>Array.isArray(e.detalle)).sort((a,b)=>b.ts-a.ts);
  for(const e of conDet){ const it=(e.detalle||[]).find(d=>(d.nombre||'').trim().toLowerCase()===n); if(it && it.series && it.series.length) return it.series; }
  return null;
}
function iniciarEntreno(){
  const dia = DIAS[new Date().getDay()];
  const plan = (S.gym.plan && S.gym.plan[dia]) || [];
  if(!plan.length){
    openSheet(`<h3>Entrenar hoy</h3>
      <div class="empty"><div class="big">🏋️</div>Hoy (${dia}) no tienes músculos en tu rutina.</div>
      <button class="btn" onclick="sheetPlanDia('${dia}')">Armar rutina de hoy</button>
      <button class="btn sec" style="margin-top:8px" onclick="closeSheet()">Cerrar</button>`);
    return;
  }
  sesionActual = { fecha:hoy(), dia, items: plan.map(g=>({ grupo:g, nombre:'', series:[{peso:'',reps:'',rir:''}] })) };
  renderEntreno();
}
function capturarSesion(){
  if(!sesionActual) return;
  $$('#sheetRoot [data-f]').forEach(inp=>{
    const i=+inp.dataset.i, f=inp.dataset.f, it=sesionActual.items[i];
    if(!it) return;
    if(f==='nombre'){ it.nombre=inp.value; return; }
    const j=+inp.dataset.j; if(!it.series[j]) return;
    it.series[j][f]=inp.value;
  });
}
function renderEntreno(){
  const s = sesionActual; if(!s) return;
  const rirOpts = v => ['','al fallo','RIR 1','RIR 2','RIR 3','RIR 4+'].map(o=>`<option value="${o}" ${o===v?'selected':''}>${o||'esfuerzo…'}</option>`).join('');
  const orden = (S.gym.plan[s.dia]||[]).filter((g,idx,self)=>self.indexOf(g)===idx);
  const cards = orden.map(g=>{
    const demo = `<div style="width:50px;height:64px;flex:none;background:var(--card2);border-radius:10px;padding:4px">${figuraSVG(g)}</div>`;
    const ejs = s.items.map((it,i)=>({it,i})).filter(x=>x.it.grupo===g);
    const ejHtml = ejs.map(({it,i})=>{
      const prev = ultimaSerieDe(it.nombre);
      const prevTxt = prev ? `Última vez: ${prev.map(x=>`${x.peso||'?'}×${x.reps||'?'}`).join(', ')}` : '';
      const series = it.series.map((se,j)=>`<div class="kpi" style="gap:6px;margin-top:6px">
        <span class="sm muted" style="width:16px;text-align:center">${j+1}</span>
        <input class="in" data-f="peso" data-i="${i}" data-j="${j}" type="number" inputmode="decimal" value="${se.peso}" placeholder="kg" style="padding:9px;text-align:center">
        <input class="in" data-f="reps" data-i="${i}" data-j="${j}" type="number" inputmode="numeric" value="${se.reps}" placeholder="reps" style="padding:9px;text-align:center">
        <select class="in" data-f="rir" data-i="${i}" data-j="${j}" style="padding:9px;font-size:12.5px">${rirOpts(se.rir)}</select>
        <button class="addbtn" onclick="delSerie(${i},${j})">×</button>
      </div>`).join('');
      return `<div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--line2)">
        <div class="kpi" style="gap:6px">
          <input class="in" data-f="nombre" data-i="${i}" value="${esc(it.nombre)}" placeholder="Ejercicio (ej. Press inclinado con mancuerna)" style="padding:9px;font-weight:600">
          <button class="addbtn" onclick="delEjercicio(${i})">×</button>
        </div>
        ${prevTxt?`<div class="hint" style="margin:5px 0 0">${esc(prevTxt)}</div>`:''}
        ${series}
        <button class="btn sm sec" style="margin-top:8px" onclick="addSerie(${i})">＋ serie</button>
      </div>`;
    }).join('');
    return `<div class="card">
      <div class="kpi" style="gap:10px;align-items:center">
        ${demo}<div style="font-weight:700;font-size:17px;color:${grupoColor(g)}">${esc(nombreGrupo(g)||g)}</div>
      </div>
      ${ejHtml}
      <button class="btn sm" style="margin-top:10px" onclick="addEjercicio('${g}')">＋ ejercicio</button>
    </div>`;
  }).join('');
  openSheet(`<h3 style="text-transform:capitalize">Entrenar — ${s.dia}</h3>
    <p class="hint">Por cada músculo, agrega los ejercicios que hiciste y apunta tus series: <b>peso</b>, <b>reps</b> y esfuerzo (RIR).</p>
    ${cards}
    <button class="btn" style="margin-top:10px" onclick="terminarEntreno()">✓ Terminar entreno</button>
    <button class="btn sec" style="margin-top:8px" onclick="cancelarEntreno()">Cancelar</button>`);
}
function addEjercicio(g){ capturarSesion(); sesionActual.items.push({grupo:g, nombre:'', series:[{peso:'',reps:'',rir:''}]}); renderEntreno(); }
function delEjercicio(i){ capturarSesion(); sesionActual.items.splice(i,1); renderEntreno(); }
function addSerie(i){ capturarSesion(); sesionActual.items[i].series.push({peso:'',reps:'',rir:''}); renderEntreno(); }
function delSerie(i,j){ capturarSesion(); sesionActual.items[i].series.splice(j,1); if(!sesionActual.items[i].series.length) sesionActual.items[i].series.push({peso:'',reps:'',rir:''}); renderEntreno(); }
function cancelarEntreno(){ sesionActual=null; closeSheet(); }
function terminarEntreno(){
  capturarSesion();
  const s = sesionActual;
  const detalle = s.items.map(it=>({
    grupo:it.grupo, nombre:(it.nombre||'').trim()||nombreGrupo(it.grupo)||'Ejercicio', variante:'',
    series: it.series.filter(x=>x.peso||x.reps).map(x=>({peso:Number(x.peso)||0, reps:Number(x.reps)||0, rir:x.rir||''}))
  })).filter(it=>it.series.length);
  if(!detalle.length){ toast('Apunta al menos una serie'); return; }
  const grupos = [...new Set(detalle.map(d=>nombreGrupo(d.grupo)).filter(Boolean))].join(', ');
  const totalSeries = detalle.reduce((a,d)=>a+d.series.length,0);
  const ex = S.gym.entrenos.find(e=>e.fecha===s.fecha);
  const datos = { fecha:s.fecha, nota:grupos||'Entreno', detalle, duracion:(ex&&ex.duracion)||0, intensidad:(ex&&ex.intensidad)||'normal' };
  if(ex) Object.assign(ex, datos); else S.gym.entrenos.push({id:uid(), ts:Date.now(), ...datos});
  sesionActual=null; save(); closeSheet(); render(); toast(`Entreno guardado · ${totalSeries} series 💪`);
}

/* ---------- GYM ---------- */
function viewGym(){
  const diaHoy = DIAS[new Date().getDay()];
  const entrenosSemana = S.gym.entrenos.filter(e=>enSemanaActual(e.fecha));
  const p = S.perfil;

  const rGym = rachaGym();
  const rutinaRows = DIAS.slice(1).concat('domingo').map(d=>{
    const resumen = resumenDiaTxt(d);
    const nM = ((S.gym.plan&&S.gym.plan[d])||[]).length;
    return `<div class="row">
      <div class="ic" style="background:rgba(106,79,208,.14);color:var(--gym);text-transform:capitalize;font-size:12px;font-weight:800">${d.slice(0,3)}</div>
      <div class="mid"><div class="t" style="${resumen?'':'color:var(--mut);font-weight:500'}">${resumen? esc(resumen):'Descanso — toca para armar'}</div>${nM?`<div class="s">${nM} músculo(s)</div>`:''}</div>
      <button class="addbtn" onclick="sheetPlanDia('${d}')">✎</button>
    </div>`;
  }).join('');

  const supRows = S.gym.suplementos.length? S.gym.suplementos.map(s=>{
    const tomado = S.gym.tomas.some(t=>t.fecha===hoy() && t.sup===s.id);
    return `<div class="row">
      <div class="ic">💊</div>
      <div class="mid"><div class="t">${esc(s.nombre)}</div><div class="s">${esc(s.hora||'a diario')}</div></div>
      <button class="btn sm ${tomado?'sec':''}" onclick="toggleToma('${s.id}')">${tomado?'✓ Hoy':'Marcar'}</button>
      <button class="addbtn" style="margin-left:6px" onclick="borrarSup('${s.id}')">×</button>
    </div>`;
  }).join('') : `<div class="empty small">Agrega tu creatina, omega 3, proteína…</div>`;

  return `
  <div class="card" style="text-align:center">
    <div class="lbl muted small">🔥 Racha de gym</div>
    <div style="font-size:42px;font-weight:800;color:var(--gym);line-height:1;margin:7px 0 3px">${rGym}</div>
    <div class="sm muted">entrenos en racha · aguanta hasta 3 días sin ir (lluvia 🌧️)</div>
  </div>
  <div class="grid2">
    <div class="stat"><div class="lbl">🏋️ Entrenos</div><div class="val">${entrenosSemana.length}<span style="font-size:13px;color:var(--mut)"> esta semana</span></div></div>
    <div class="stat"><div class="lbl">⏱️ Tiempo</div><div class="val">${Math.round(entrenosSemana.reduce((a,e)=>a+(e.duracion||0),0)/60*10)/10}<span style="font-size:13px;color:var(--mut)"> h</span></div></div>
  </div>

  <div class="card">
    <div class="kpi" style="justify-content:space-between">
      <div><div class="lbl muted small">Hoy (${diaHoy})</div>
      <div style="font-weight:700;margin-top:3px">${resumenDiaTxt(diaHoy)||'Descanso'}</div></div>
    </div>
    ${((S.gym.plan&&S.gym.plan[diaHoy])||[]).length
      ? `<button class="btn" style="margin-top:11px" onclick="iniciarEntreno()">▶️ Entrenar hoy</button>`
      : `<button class="btn sec" style="margin-top:11px" onclick="sheetPlanDia('${diaHoy}')">Armar rutina de hoy</button>`}
  </div>

  <div class="sectitle"><h2>Mi rutina semanal</h2></div>
  <div class="card">${rutinaRows}</div>
  <div class="hint">Toca ✎ en un día para elegir los ejercicios por grupo muscular y su variante (mancuerna, barra, polea…). Luego usa <b>▶️ Entrenar hoy</b> para apuntar tus series.</div>

  <div class="sectitle"><h2>Suplementos</h2><button class="addbtn" onclick="sheetSup()">+</button></div>
  <div class="card">${supRows}</div>

  <div class="sectitle"><h2>Últimos entrenos</h2></div>
  <div class="card">
    ${entrenosSemana.length? entrenosSemana.sort((a,b)=>b.ts-a.ts).map(e=>`<div class="row ${e.detalle?'tap':''}" ${e.detalle?`onclick="verEntreno('${e.id}')"`:''}>
      <div class="ic" style="background:rgba(106,79,208,.14)">🔥</div>
      <div class="mid"><div class="t">${esc(e.nota||'Entreno')}</div><div class="s">${fechaBonita(e.fecha)}${e.detalle?` · ${e.detalle.length} ejercicios · ${e.detalle.reduce((a,d)=>a+(d.series?d.series.length:0),0)} series`:(e.duracion?` · ${e.duracion} min`:'')}${e.intensidad?' · '+esc(e.intensidad):''}</div></div>
      <button class="addbtn" onclick="event.stopPropagation();borrarEntreno('${e.id}')">×</button>
    </div>`).join('') : `<div class="empty"><div class="big">💪</div>Aún no registras entrenos esta semana.</div>`}
  </div>
  `;
}
function verEntreno(id){
  const e = S.gym.entrenos.find(x=>x.id===id); if(!e || !e.detalle) return;
  const cuerpo = e.detalle.map(d=>`<div class="card" style="margin-bottom:8px">
    <div style="font-weight:700">${esc(d.nombre)} ${d.variante?`<span class="tag" style="background:var(--card2);color:var(--mut);font-weight:600">${esc(d.variante)}</span>`:''}</div>
    ${(d.series||[]).map((x,k)=>`<div class="kpi" style="justify-content:space-between;margin-top:5px"><span class="sm muted">Serie ${k+1}</span><span class="sm"><b>${x.peso||0}kg × ${x.reps||0}</b>${x.rir?` · ${esc(x.rir)}`:''}</span></div>`).join('')}
  </div>`).join('');
  openSheet(`<h3 style="text-transform:capitalize">${fechaBonita(e.fecha)}</h3>
    <div class="lbl muted small" style="margin-bottom:8px">${esc(e.nota||'Entreno')}</div>
    ${cuerpo}
    <button class="btn sec" style="margin-top:6px" onclick="closeSheet()">Cerrar</button>`);
}

/* ---------- UNIVERSIDAD ---------- */
function viewUni(){
  const ag = agendaSugerida();
  const hechas = S.uni.tareas.filter(t=>t.estado==='hecha');
  return `
  <div class="banner info">
    Dime tus tareas con <b>materia + fecha límite</b> y te armo cuándo hacer cada una. Te aviso cuando estén cerca.
  </div>
  <div class="sectitle"><h2>Por hacer</h2><button class="addbtn" onclick="sheetTarea()">+</button></div>
  ${ag.length? ag.map(({t,cuando,motivo,dr})=>`<div class="card">
    <div class="row" style="padding:0;border:none">
      <div class="ic" style="background:${dr!==null&&dr<=1?'rgba(255,92,92,.18)':'rgba(40,195,215,.15)'}">${dr!==null&&dr<=1?'🔴':'📘'}</div>
      <div class="mid">
        <div class="t">${esc(t.titulo)}</div>
        <div class="s">${esc(t.materia||'')}${t.fecha?' · vence '+fechaBonita(t.fecha):''}</div>
      </div>
      <button class="btn sm" onclick="tareaHecha('${t.id}')">✓</button>
      <button class="addbtn" style="margin-left:6px" onclick="borrarTarea('${t.id}')">×</button>
    </div>
    <div class="banner ${dr!==null&&dr<=1?'warn':'ok'}" style="margin:11px 0 0;padding:10px 12px">
      🗓️ <b>${cuando}</b> — ${motivo}.
    </div>
  </div>`).join('') : `<div class="card"><div class="empty"><div class="big">🎓</div>Sin tareas pendientes. ¡Vas al día!</div></div>`}

  ${hechas.length? `<div class="sectitle"><h2>Hechas (${hechas.length})</h2><button class="btn sm sec" onclick="limpiarHechas()">Limpiar</button></div>
  <div class="card">${hechas.slice(-6).reverse().map(t=>`<div class="row">
    <div class="ic">✅</div><div class="mid"><div class="t" style="color:var(--mut);text-decoration:line-through">${esc(t.titulo)}</div><div class="s">${esc(t.materia||'')}</div></div>
  </div>`).join('')}</div>`:''}
  `;
}

/* ============================================================
   CALENDARIO — resumen día a día de todo
   ============================================================ */
let calRef = new Date(); calRef.setDate(1); calRef.setHours(0,0,0,0);
function calNav(delta){ calRef.setMonth(calRef.getMonth()+delta); render(); }
function calHoy(){ const n=new Date(); calRef=new Date(n.getFullYear(),n.getMonth(),1); render(); }

// Junta TODO lo que pasó en un día (dinero, comida, gym, uni)
function datosDelDia(iso){
  const gastos = S.finanzas.movs.filter(m=>m.fecha===iso);
  const gastoTotal = gastos.reduce((a,m)=>a+m.monto,0);
  const comidas = S.comida.registros.filter(r=>r.fecha===iso);
  const agua = S.comida.vasosAgua[iso]||0;
  const entreno = S.gym.entrenos.find(e=>e.fecha===iso)||null;
  const tomas = S.gym.tomas.filter(t=>t.fecha===iso);
  const tareas = S.uni.tareas.filter(t=>t.fecha===iso);
  return {gastos, gastoTotal, comidas, agua, entreno, tomas, tareas};
}

function viewCalendario(){
  const y = calRef.getFullYear(), m = calRef.getMonth();
  const primero = new Date(y, m, 1);
  const offset = (primero.getDay()+6)%7;              // lunes = 0
  const dias = new Date(y, m+1, 0).getDate();
  const hoyISO = hoy();
  const mesKey = `${y}-${String(m+1).padStart(2,'0')}`;
  const enMes = iso => iso && iso.slice(0,7)===mesKey;

  const gastoMes = S.finanzas.movs.filter(x=>enMes(x.fecha)).reduce((a,x)=>a+x.monto,0);
  const entrenosMes = S.gym.entrenos.filter(x=>enMes(x.fecha)).length;

  const dow = ['L','M','X','J','V','S','D'];
  let cells = '';
  for(let i=0;i<offset;i++) cells += `<div class="cal-cell out"></div>`;
  for(let d=1; d<=dias; d++){
    const iso = isoDe(y,m,d);
    const dd = datosDelDia(iso);
    const dots = [];
    if(dd.gastos.length)  dots.push('var(--money)');
    if(dd.comidas.length||dd.agua>0) dots.push('var(--food)');
    if(dd.entreno)        dots.push('var(--gym)');
    if(dd.tareas.length)  dots.push('var(--uni)');
    const has = dots.length>0;
    cells += `<div class="cal-cell ${iso===hoyISO?'today':''} ${has?'has':''}"${has?` onclick="sheetDia('${iso}')"`:''}>
      <div class="cal-num">${d}</div>
      <div class="cal-dots">${dots.map(c=>`<span class="cal-dot" style="background:${c}"></span>`).join('')}</div>
      ${dd.gastoTotal>0?`<div class="cal-spend">${money(dd.gastoTotal)}</div>`:''}
    </div>`;
  }

  return `
  <div class="cal-head">
    <div class="cal-nav"><button onclick="calNav(-1)">‹</button></div>
    <h2>${MESES[m]} ${y}</h2>
    <div class="cal-nav"><button onclick="calNav(1)">›</button></div>
  </div>

  <div class="grid2" style="margin-bottom:6px">
    <div class="stat"><div class="lbl">💰 Gastado en el mes</div><div class="val" style="color:var(--money);font-size:22px">${money(gastoMes)}</div></div>
    <div class="stat"><div class="lbl">🏋️ Entrenos</div><div class="val" style="font-size:22px">${entrenosMes}<span style="font-size:13px;color:var(--mut)"> este mes</span></div></div>
  </div>

  <button class="btn" onclick="analizarMes()" style="margin-bottom:12px">✦ Analizar mi mes con el Coach</button>

  <div class="card" style="padding:14px 11px">
    <div class="cal-grid" style="margin-bottom:8px">${dow.map(d=>`<div class="cal-dow">${d}</div>`).join('')}</div>
    <div class="cal-grid">${cells}</div>
    <div class="cal-legend">
      <span><i style="background:var(--money)"></i>Dinero</span>
      <span><i style="background:var(--food)"></i>Comida</span>
      <span><i style="background:var(--gym)"></i>Gym</span>
      <span><i style="background:var(--uni)"></i>Uni</span>
    </div>
  </div>
  <div style="margin-bottom:12px"><button class="btn sm sec" onclick="calHoy()">Ir a hoy</button></div>
  <div class="hint center">Toca un día con puntitos para ver todo lo que pasó ese día. 📅</div>
  `;
}

function sheetDia(iso){
  const dd = datosDelDia(iso);
  const cats = S.finanzas.cats;
  const f = new Date(iso+'T12:00:00');
  const titulo = f.toLocaleDateString('es-MX',{weekday:'long',day:'numeric',month:'long'});
  const nombreComida = {desayuno:'🌅 Desayuno', almuerzo:'☀️ Almuerzo', cena:'🌙 Cena'};

  const dineroHtml = dd.gastos.length ? `
    <div class="row" style="padding:6px 0;border-bottom:1px solid var(--line2)"><div class="mid"><b>Total del día</b></div><div class="amt" style="color:var(--bad)">-${money(dd.gastoTotal)}</div></div>
    ${dd.gastos.slice().sort((a,b)=>b.ts-a.ts).map(mv=>{
      const c = cats.find(x=>x.id===mv.cat)||{icono:'💸',nombre:'Gasto',color:'#8b98a9'};
      return `<div class="row"><div class="ic" style="background:${c.color}22">${c.icono}</div>
        <div class="mid"><div class="t">${esc(mv.nota||c.nombre)}</div><div class="s">${esc(c.nombre)}</div></div>
        <div class="amt" style="color:var(--bad)">-${money(mv.monto)}</div>
        <button class="addbtn" style="margin-left:6px" onclick="borrarDelDia('gasto','${mv.id}','${iso}')">×</button></div>`;
    }).join('')}` : `<div class="empty small">Sin gastos este día.</div>`;

  const comidaHtml = (dd.comidas.length||dd.agua) ? `
    ${dd.comidas.map(r=>`<div class="row"><div class="ic" style="background:rgba(197,106,52,.14)">🍽️</div>
      <div class="mid"><div class="t">${esc(r.texto||nombreComida[r.comida]||'Comida')}</div><div class="s">${nombreComida[r.comida]||''}</div></div>
      <button class="addbtn" style="margin-left:6px" onclick="borrarDelDia('comida','${r.id}','${iso}')">×</button></div>`).join('')}
    ${dd.agua?`<div class="row"><div class="ic" style="background:rgba(31,151,168,.14)">💧</div><div class="mid"><div class="t">${dd.agua} vaso(s) de agua</div></div></div>`:''}
  ` : `<div class="empty small">Sin comidas registradas.</div>`;

  const supNombres = dd.tomas.map(t=>{ const s=S.gym.suplementos.find(x=>x.id===t.sup); return s?s.nombre:null; }).filter(Boolean);
  const gymHtml = (dd.entreno||supNombres.length) ? `
    ${dd.entreno?`<div class="row"><div class="ic" style="background:rgba(106,79,208,.14)">🔥</div>
      <div class="mid"><div class="t">${esc(dd.entreno.nota||'Entreno')}</div><div class="s">${dd.entreno.duracion||0} min · ${esc(dd.entreno.intensidad||'')}</div></div>
      <button class="addbtn" style="margin-left:6px" onclick="borrarDelDia('entreno','${dd.entreno.id}','${iso}')">×</button></div>`:''}
    ${supNombres.length?`<div class="row"><div class="ic" style="background:rgba(106,79,208,.14)">💊</div><div class="mid"><div class="t">${esc(supNombres.join(', '))}</div><div class="s">suplementos tomados</div></div></div>`:''}
  ` : `<div class="empty small">Sin entreno este día.</div>`;

  const uniHtml = dd.tareas.length ? dd.tareas.map(t=>`<div class="row"><div class="ic" style="background:rgba(31,151,168,.14)">${t.estado==='hecha'?'✅':'📌'}</div>
    <div class="mid"><div class="t" style="${t.estado==='hecha'?'text-decoration:line-through;color:var(--mut)':''}">${esc(t.titulo)}</div><div class="s">${esc(t.materia||'')} · vence este día</div></div></div>`).join('')
    : `<div class="empty small">Sin tareas para este día.</div>`;

  openSheet(`<h3 style="text-transform:capitalize;font-size:21px">${titulo}</h3>
    <div class="grid2" style="margin:4px 0 8px">
      <button class="btn sm sec" onclick="sheetGasto('${iso}',true)">💸 Gasto</button>
      <button class="btn sm sec" onclick="sheetComida('${iso}',true)">🍽️ Comida</button>
      <button class="btn sm sec" onclick="sheetEntreno('${iso}',true)">🏋️ Entreno</button>
      <button class="btn sm sec" onclick="sheetTarea('${iso}',true)">🎓 Tarea</button>
    </div>
    <div class="card" style="margin-bottom:6px;padding:13px 14px">
      <div class="kpi" style="justify-content:space-between">
        <div style="font-weight:700">💧 Agua: ${dd.agua} vaso(s)</div>
        <div class="chips"><button class="chip" onclick="aguaDia(-1,'${iso}')">−</button><button class="chip on" onclick="aguaDia(1,'${iso}')">＋ vaso</button></div>
      </div>
    </div>
    <div class="sectitle" style="margin:12px 2px 6px"><h2 style="font-size:16px;color:var(--money)">💰 Dinero</h2></div>
    <div class="card" style="margin-bottom:6px">${dineroHtml}</div>
    <div class="sectitle" style="margin:12px 2px 6px"><h2 style="font-size:16px;color:var(--food)">🍽️ Comida</h2></div>
    <div class="card" style="margin-bottom:6px">${comidaHtml}</div>
    <div class="sectitle" style="margin:12px 2px 6px"><h2 style="font-size:16px;color:var(--gym)">🏋️ Gym</h2></div>
    <div class="card" style="margin-bottom:6px">${gymHtml}</div>
    <div class="sectitle" style="margin:12px 2px 6px"><h2 style="font-size:16px;color:var(--uni)">🎓 Universidad</h2></div>
    <div class="card" style="margin-bottom:6px">${uniHtml}</div>
    <button class="btn sec" onclick="closeSheet()" style="margin-top:8px">Cerrar</button>`);
}
function borrarDelDia(tipo, id, iso){
  if(tipo==='gasto')   S.finanzas.movs = S.finanzas.movs.filter(m=>m.id!==id);
  else if(tipo==='comida')  S.comida.registros = S.comida.registros.filter(r=>r.id!==id);
  else if(tipo==='entreno') S.gym.entrenos = S.gym.entrenos.filter(e=>e.id!==id);
  save(); render(); sheetDia(iso);
}
function aguaDia(d, iso){
  S.comida.vasosAgua[iso] = Math.max(0,(S.comida.vasosAgua[iso]||0)+d);
  save(); render(); sheetDia(iso);
}

/* ---------- Análisis del mes con el Coach (IA) ---------- */
function resumenMesParaCoach(ref = calRef){
  const y = ref.getFullYear(), m = ref.getMonth();
  const mesKey = `${y}-${String(m+1).padStart(2,'0')}`;
  const enMes = iso => iso && iso.slice(0,7)===mesKey;
  const cats = S.finanzas.cats;

  // Dinero del mes por categoría
  const movsMes = S.finanzas.movs.filter(x=>enMes(x.fecha));
  const gastoMes = movsMes.reduce((a,x)=>a+x.monto,0);
  const porCat = {};
  movsMes.forEach(mv=>{ porCat[mv.cat]=(porCat[mv.cat]||0)+mv.monto; });
  const catTxt = Object.entries(porCat).sort((a,b)=>b[1]-a[1])
    .map(([id,v])=>`${(cats.find(c=>c.id===id)||{nombre:id}).nombre}: ${money(v)}`).join(', ')||'sin gastos';
  const presupuestoMes = (S.finanzas.semanal||0)*4.33;

  // Top gastos individuales
  const topGastos = movsMes.slice().sort((a,b)=>b.monto-a.monto).slice(0,6)
    .map(mv=>`${money(mv.monto)} en ${mv.nota||(cats.find(c=>c.id===mv.cat)||{}).nombre||'gasto'}`).join('; ')||'—';

  // Gym
  const entrenosMes = S.gym.entrenos.filter(x=>enMes(x.fecha));
  const minsGym = entrenosMes.reduce((a,e)=>a+(e.duracion||0),0);

  // Comida y agua
  const comidasMes = S.comida.registros.filter(x=>enMes(x.fecha)).length;
  const diasConAgua = Object.keys(S.comida.vasosAgua).filter(enMes).length;

  // Uni
  const tareasMes = S.uni.tareas.filter(x=>enMes(x.fecha));
  const hechas = tareasMes.filter(t=>t.estado==='hecha').length;
  const pend = tareasMes.filter(t=>t.estado!=='hecha').length;

  const p = S.perfil;
  return `Análisis del mes de ${MESES[m]} ${y} para ${p.nombre}.
PERFIL: ${p.edad||'?'} años, ${p.pesoActual||'?'}kg, meta ${p.pesoMeta||'?'}kg, objetivo ${p.objetivo}.
DINERO — presupuesto ~${money(presupuestoMes)}/mes (${money(S.finanzas.semanal)}/semana). Gastado en el mes: ${money(gastoMes)}. Por categoría: ${catTxt}. Gastos más grandes: ${topGastos}.
GYM — ${entrenosMes.length} entrenos, ${Math.round(minsGym/60*10)/10} horas totales en el mes.
COMIDA — ${comidasMes} comidas registradas, ${diasConAgua} días con registro de agua.
UNIVERSIDAD — ${tareasMes.length} tareas (${hechas} hechas, ${pend} pendientes).`;
}

async function analizarMes(){
  if(!S.ajustes.apiKey){ openCoach(); return; }   // manda a activar la key
  const mesNom = `${MESES[calRef.getMonth()]} ${calRef.getFullYear()}`;
  openSheet(`<h3>✦ Análisis de ${esc(mesNom)}</h3>
    <p class="hint">El Coach está revisando tu dinero, comida, gym y uni de este mes para decirte en qué vas bien, en qué cuidarte y cuánto podrías ahorrar.</p>
    <div id="amResp"><div class="card"><span class="spin"></span> <span class="muted">Analizando tu mes…</span></div></div>
    <button class="btn sec" onclick="closeSheet()" style="margin-top:12px">Cerrar</button>`);

  const resp = $('#amResp');
  const system = `Eres el coach personal de ${S.perfil.nombre} en su app de vida. Hablas español mexicano, cercano y directo, lo tratas por su nombre. Te paso el resumen REAL de su mes (dinero, comida, gym, universidad). Dale un análisis honesto y accionable con esta estructura, usando encabezados cortos:
1) ✅ En qué va bien.
2) ⚠️ En qué está fallando o debe cuidarse (sé específico con el dinero: categorías donde se le va de más, gastos hormiga).
3) 💰 Ahorro: dile un monto concreto y realista que podría ahorrar al mes y de dónde recortar.
4) 🚫 Qué es mejor NO hacer.
5) 🎯 3 acciones claras para el próximo mes.
Usa números concretos de los datos. Máx ~230 palabras. No des consejo médico serio.`;

  const body = {
    model: S.ajustes.modelo || 'claude-haiku-4-5',
    max_tokens: 1200,
    system,
    messages: [{ role:'user', content: 'Analiza mi mes con estos datos:\n\n'+resumenMesParaCoach() }]
  };

  try{
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method:'POST',
      headers:{'content-type':'application/json','x-api-key':S.ajustes.apiKey,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},
      body: JSON.stringify(body)
    });
    const data = await r.json();
    if(data.error){
      resp.innerHTML = `<div class="banner warn">Error: ${esc(data.error.message||'algo falló')}. Revisa tu API key en Ajustes.</div>`;
    } else {
      const txt = (data.content||[]).map(c=>c.text||'').join('\n').trim() || 'No obtuve respuesta, intenta de nuevo.';
      resp.innerHTML = `<div class="card coachmsg">✦ ${esc(txt)}</div>`;
    }
  }catch(err){
    resp.innerHTML = `<div class="banner warn">No pude conectar. Revisa tu internet y tu API key. (${esc(String(err.message||err))})</div>`;
  }
}

/* ============================================================
   GRÁFICAS DE PROGRESO (peso y gastos) — SVG en línea, sin librerías
   ============================================================ */
function svgLinea(vals, {h=120, color='var(--gym)', meta=null}={}){
  const w=320, pad=12, iw=w-pad*2, ih=h-pad*2;
  let min=Math.min(...vals), max=Math.max(...vals);
  if(meta!=null){ min=Math.min(min,meta); max=Math.max(max,meta); }
  if(min===max){ min-=1; max+=1; }
  const X=i=> vals.length>1 ? pad+i/(vals.length-1)*iw : pad+iw/2;
  const Y=v=> pad+ih-(v-min)/(max-min)*ih;
  const d=vals.map((v,i)=>`${i?'L':'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(' ');
  const dots=vals.map((v,i)=>`<circle cx="${X(i).toFixed(1)}" cy="${Y(v).toFixed(1)}" r="3.2" fill="${color}"/>`).join('');
  const metaLine = meta!=null ? `<line x1="${pad}" y1="${Y(meta).toFixed(1)}" x2="${w-pad}" y2="${Y(meta).toFixed(1)}" stroke="var(--ok)" stroke-dasharray="4 4" stroke-width="1.2"/>` : '';
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" preserveAspectRatio="none">
    ${metaLine}<path d="${d}" fill="none" stroke="${color}" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"/>${dots}</svg>`;
}
function svgBarras(items, {h=140, color='var(--money)'}={}){
  const w=320, pad=6, gap=8, n=items.length||1;
  const max=Math.max(1, ...items.map(i=>i.v));
  const bw=(w-pad*2-gap*(n-1))/n, ih=h-22;
  const bars=items.map((it,i)=>{
    const bh=Math.max(2, it.v/max*ih);
    const x=pad+i*(bw+gap), y=ih-bh+2;
    return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" rx="4" fill="${color}"/>
      <text x="${(x+bw/2).toFixed(1)}" y="${(h-6)}" font-size="9" text-anchor="middle" fill="var(--mut)" font-family="var(--serif)">${esc(it.label)}</text>`;
  }).join('');
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}">${bars}</svg>`;
}

function graficaPeso(){
  const ps = ((S.progreso&&S.progreso.pesos)||[]).slice().sort((a,b)=>a.fecha.localeCompare(b.fecha));
  const meta = S.perfil.pesoMeta||null;
  const cuerpo = ps.length>=2
    ? svgLinea(ps.map(p=>p.peso),{color:'var(--gym)',meta}) +
      `<div class="hint" style="margin-top:8px">De <b>${ps[0].peso}kg</b> a <b>${ps[ps.length-1].peso}kg</b>${meta?` · meta ${meta}kg (línea punteada)`:''}.</div>`
    : `<div class="empty small">Registra tu peso al menos 2 veces (en días distintos) para ver tu avance. 📈</div>`;
  return `<div class="card">
    <div class="kpi" style="justify-content:space-between;margin-bottom:10px">
      <div class="lbl muted small">⚖️ Progreso de peso</div>
      <button class="btn sm sec" onclick="sheetPeso()">Registrar peso</button>
    </div>
    ${cuerpo}
  </div>`;
}
/* ---------- Metas de ahorro (barra de progreso) ---------- */
function metasAhorroHtml(){
  const metas = S.finanzas.metas || [];
  const cards = metas.map(m=>{
    const pct = m.objetivo ? clamp(m.ahorrado/m.objetivo*100,0,100) : 0;
    const done = m.objetivo && m.ahorrado>=m.objetivo;
    return `<div class="card">
      <div class="kpi" style="justify-content:space-between;align-items:flex-start">
        <div style="flex:1;min-width:0">
          <div class="t" style="font-weight:700;font-size:16px">${done?'🎉 ':'🎯 '}${esc(m.nombre)}</div>
          <div class="s muted" style="margin-top:2px">${money(m.ahorrado)} de ${money(m.objetivo)}${m.fecha?` · para ${fechaBonita(m.fecha)}`:''}</div>
        </div>
        <button class="addbtn" onclick="sheetMeta('${m.id}')">✎</button>
      </div>
      <div class="bar" style="margin-top:11px;height:12px"><span style="width:${pct}%;background:${done?'var(--ok)':'var(--money)'}"></span></div>
      <div class="kpi" style="justify-content:space-between;margin-top:10px">
        <div class="sm" style="font-weight:800;color:${done?'var(--ok)':'var(--money)'}">${Math.round(pct)}%${done?' ¡logrado!':''}</div>
        <button class="btn sm" style="width:auto" onclick="sheetAbonar('${m.id}')">＋ Abonar</button>
      </div>
      ${!done && m.objetivo? `<div class="hint" style="margin-top:7px">Te faltan <b>${money(m.objetivo-m.ahorrado)}</b>.</div>`:''}
    </div>`;
  }).join('');
  return `<div class="sectitle"><h2>Metas de ahorro</h2><button class="addbtn" onclick="sheetMeta()">+</button></div>
    ${metas.length? cards : `<div class="card"><div class="empty"><div class="big">🎯</div>Crea tu primera meta (ej. «Moto $20,000») y ve tu avance.</div></div>`}`;
}
function sheetMeta(id){
  const m = (S.finanzas.metas||[]).find(x=>x.id===id) || {nombre:'',objetivo:'',ahorrado:0,fecha:''};
  const editando = !!id;
  openSheet(`<h3>${editando?'Editar meta':'Nueva meta de ahorro'}</h3>
    <label class="f">¿Para qué ahorras?</label>
    <input class="in" id="mNom" value="${esc(m.nombre)}" placeholder="ej. Moto, viaje, fondo de emergencia">
    <label class="f">Monto meta ($)</label>
    <input class="in" id="mObj" type="number" inputmode="numeric" value="${m.objetivo||''}" placeholder="20000">
    <label class="f">Ya llevas ahorrado ($) — opcional</label>
    <input class="in" id="mYa" type="number" inputmode="numeric" value="${m.ahorrado||''}" placeholder="0">
    <label class="f">Fecha meta (opcional)</label>
    <input class="in" id="mFec" type="date" value="${m.fecha||''}">
    <div style="margin-top:16px"><button class="btn" onclick="guardarMeta('${id||''}')">Guardar</button></div>
    ${editando?`<button class="btn danger" style="margin-top:10px" onclick="borrarMeta('${id}')">Borrar meta</button>`:''}`);
  setTimeout(()=>$('#mNom').focus(),100);
}
function guardarMeta(id){
  const nombre = $('#mNom').value.trim(); if(!nombre) return;
  const objetivo = Number($('#mObj').value)||0;
  const ahorrado = Math.max(0, Number($('#mYa').value)||0);
  const fecha = $('#mFec').value||'';
  if(!S.finanzas.metas) S.finanzas.metas=[];
  if(id){ const m=S.finanzas.metas.find(x=>x.id===id); if(m) Object.assign(m,{nombre,objetivo,ahorrado,fecha}); }
  else S.finanzas.metas.push({id:uid(), nombre, objetivo, ahorrado, fecha, ts:Date.now()});
  save(); closeSheet(); render();
}
function borrarMeta(id){
  if(!confirm('¿Borrar esta meta de ahorro?')) return;
  S.finanzas.metas = (S.finanzas.metas||[]).filter(x=>x.id!==id); save(); closeSheet(); render();
}
function sheetAbonar(id){
  const m = (S.finanzas.metas||[]).find(x=>x.id===id); if(!m) return;
  openSheet(`<h3>Abonar a «${esc(m.nombre)}»</h3>
    <div class="banner info">Llevas <b>${money(m.ahorrado)}</b> de ${money(m.objetivo)}.</div>
    <label class="f">¿Cuánto agregas?</label>
    <input class="in" id="abMonto" type="number" inputmode="decimal" placeholder="500">
    <div class="hint">Tip: pon un número negativo (ej. -200) si necesitas sacar dinero de aquí.</div>
    <div style="margin-top:16px"><button class="btn" onclick="guardarAbono('${id}')">Guardar</button></div>`);
  setTimeout(()=>$('#abMonto').focus(),100);
}
function guardarAbono(id){
  const m = (S.finanzas.metas||[]).find(x=>x.id===id); if(!m) return;
  const delta = Number($('#abMonto').value); if(!delta) return;
  const antes = m.objetivo && m.ahorrado>=m.objetivo;
  m.ahorrado = Math.max(0, (m.ahorrado||0)+delta);
  save(); closeSheet(); render();
  if(m.objetivo && m.ahorrado>=m.objetivo && !antes) toast('🎉 ¡Meta lograda!'); else toast('Abono guardado ✓');
}

/* ---------- Gastos rápidos (favoritos de 1 toque) ---------- */
function favoritosHtml(){
  const favs = S.finanzas.favoritos || [];
  return `<div class="sectitle"><h2>⚡ Gastos rápidos</h2><button class="addbtn" onclick="sheetFavorito()">+</button></div>
    ${favs.length ? `<div class="chips" style="margin:0 0 6px">
      ${favs.map(f=>`<span style="display:inline-flex;align-items:center;border:1px solid var(--line);border-radius:999px;overflow:hidden;background:var(--card)">
        <button class="chip" style="border:none;border-radius:0;box-shadow:none;background:transparent" onclick="gastoRapido('${f.id}')">${esc(f.nombre)} · ${money(f.monto)}</button>
        <button class="chip" style="border:none;border-radius:0;box-shadow:none;background:transparent;color:var(--mut);padding:9px 11px" onclick="borrarFavorito('${f.id}')">×</button>
      </span>`).join('')}
    </div>` : `<div class="hint" style="margin:0 4px 8px">Crea botones para tus gastos de siempre (café, camión…) y regístralos con un solo toque. 👆</div>`}`;
}
function gastoRapido(id){
  const f = (S.finanzas.favoritos||[]).find(x=>x.id===id); if(!f) return;
  S.finanzas.movs.push({id:uid(), monto:f.monto, cat:f.cat, nota:f.nombre, fecha:hoy(), ts:Date.now()});
  save(); render(); toast(`${f.nombre} · ${money(f.monto)} ✓`);
}
function sheetFavorito(id){
  const f = (S.finanzas.favoritos||[]).find(x=>x.id===id) || {nombre:'',monto:'',cat:'hormiga'};
  const cats = S.finanzas.cats;
  openSheet(`<h3>${id?'Editar':'Nuevo'} gasto rápido</h3>
    <label class="f">Nombre</label>
    <input class="in" id="fvNom" value="${esc(f.nombre)}" placeholder="ej. Café">
    <label class="f">Monto</label>
    <input class="in" id="fvMonto" type="number" inputmode="decimal" value="${f.monto||''}" placeholder="80">
    <label class="f">Categoría</label>
    <div class="chips" id="fvCats">
      ${cats.map(c=>`<button class="chip ${c.id===f.cat?'on':''}" data-cat="${c.id}" onclick="selChip(this,'fvCats')">${c.icono} ${esc(c.nombre)}</button>`).join('')}
    </div>
    <div style="margin-top:16px"><button class="btn" onclick="guardarFavorito('${id||''}')">Guardar</button></div>`);
  setTimeout(()=>$('#fvNom').focus(),100);
}
function guardarFavorito(id){
  const nombre = $('#fvNom').value.trim(); if(!nombre) return;
  const monto = Number($('#fvMonto').value)||0; if(!monto) return;
  const cat = $('#fvCats .chip.on')?.dataset.cat || 'otros';
  if(!S.finanzas.favoritos) S.finanzas.favoritos=[];
  if(id){ const f=S.finanzas.favoritos.find(x=>x.id===id); if(f) Object.assign(f,{nombre,monto,cat}); }
  else S.finanzas.favoritos.push({id:uid(), nombre, monto, cat});
  save(); closeSheet(); render();
}
function borrarFavorito(id){ S.finanzas.favoritos=(S.finanzas.favoritos||[]).filter(x=>x.id!==id); save(); render(); }

/* ---------- Deudas con seguimiento ---------- */
function deudasHtml(){
  const deudas = S.finanzas.deudas || [];
  const cards = deudas.map(d=>{
    const pct = d.total ? clamp(d.pagado/d.total*100,0,100) : 0;
    const done = d.total && d.pagado>=d.total;
    return `<div class="card">
      <div class="kpi" style="justify-content:space-between;align-items:flex-start">
        <div style="flex:1;min-width:0">
          <div class="t" style="font-weight:700;font-size:16px">${done?'✅ ':'💳 '}${esc(d.nombre)}</div>
          <div class="s muted" style="margin-top:2px">Pagado ${money(d.pagado)} de ${money(d.total)}${d.fecha?` · límite ${fechaBonita(d.fecha)}`:''}</div>
        </div>
        <button class="addbtn" onclick="sheetDeuda('${d.id}')">✎</button>
      </div>
      <div class="bar" style="margin-top:11px;height:12px"><span style="width:${pct}%;background:${done?'var(--ok)':'var(--warn)'}"></span></div>
      <div class="kpi" style="justify-content:space-between;margin-top:10px">
        <div class="sm" style="font-weight:800;color:${done?'var(--ok)':'var(--warn)'}">${done?'¡Pagada! 🎉':'Te falta '+money(d.total-d.pagado)}</div>
        ${done?'':`<button class="btn sm" style="width:auto" onclick="sheetPagar('${d.id}')">＋ Abonar pago</button>`}
      </div>
    </div>`;
  }).join('');
  return `<div class="sectitle"><h2>Deudas</h2><button class="addbtn" onclick="sheetDeuda()">+</button></div>
    ${deudas.length? cards : `<div class="card"><div class="empty"><div class="big">💳</div>Registra lo que debes y ve cómo baja conforme pagas.</div></div>`}`;
}
function sheetDeuda(id){
  const d = (S.finanzas.deudas||[]).find(x=>x.id===id) || {nombre:'',total:'',pagado:0,fecha:''};
  const editando = !!id;
  openSheet(`<h3>${editando?'Editar deuda':'Nueva deuda'}</h3>
    <label class="f">¿A quién o qué debes?</label>
    <input class="in" id="dNom" value="${esc(d.nombre)}" placeholder="ej. Tarjeta, préstamo a papá">
    <label class="f">Monto total ($)</label>
    <input class="in" id="dTot" type="number" inputmode="numeric" value="${d.total||''}" placeholder="5000">
    <label class="f">Ya pagado ($) — opcional</label>
    <input class="in" id="dPag" type="number" inputmode="numeric" value="${d.pagado||''}" placeholder="0">
    <label class="f">Fecha límite (opcional)</label>
    <input class="in" id="dFec" type="date" value="${d.fecha||''}">
    <div style="margin-top:16px"><button class="btn" onclick="guardarDeuda('${id||''}')">Guardar</button></div>
    ${editando?`<button class="btn danger" style="margin-top:10px" onclick="borrarDeuda('${id}')">Borrar deuda</button>`:''}`);
  setTimeout(()=>$('#dNom').focus(),100);
}
function guardarDeuda(id){
  const nombre = $('#dNom').value.trim(); if(!nombre) return;
  const total = Number($('#dTot').value)||0;
  const pagado = Math.max(0, Number($('#dPag').value)||0);
  const fecha = $('#dFec').value||'';
  if(!S.finanzas.deudas) S.finanzas.deudas=[];
  if(id){ const d=S.finanzas.deudas.find(x=>x.id===id); if(d) Object.assign(d,{nombre,total,pagado,fecha}); }
  else S.finanzas.deudas.push({id:uid(), nombre, total, pagado, fecha, ts:Date.now()});
  save(); closeSheet(); render();
}
function borrarDeuda(id){
  if(!confirm('¿Borrar esta deuda?')) return;
  S.finanzas.deudas=(S.finanzas.deudas||[]).filter(x=>x.id!==id); save(); closeSheet(); render();
}
function sheetPagar(id){
  const d = (S.finanzas.deudas||[]).find(x=>x.id===id); if(!d) return;
  openSheet(`<h3>Abonar a «${esc(d.nombre)}»</h3>
    <div class="banner info">Pagado <b>${money(d.pagado)}</b> de ${money(d.total)}. Falta ${money(Math.max(0,d.total-d.pagado))}.</div>
    <label class="f">¿Cuánto pagaste?</label>
    <input class="in" id="pgMonto" type="number" inputmode="decimal" placeholder="500">
    <div style="margin-top:16px"><button class="btn" onclick="guardarPago('${id}')">Guardar pago</button></div>`);
  setTimeout(()=>$('#pgMonto').focus(),100);
}
function guardarPago(id){
  const d = (S.finanzas.deudas||[]).find(x=>x.id===id); if(!d) return;
  const delta = Number($('#pgMonto').value); if(!delta) return;
  const antes = d.total && d.pagado>=d.total;
  d.pagado = Math.max(0, (d.pagado||0)+delta);
  save(); closeSheet(); render();
  if(d.total && d.pagado>=d.total && !antes) toast('🎉 ¡Deuda pagada!'); else toast('Pago registrado ✓');
}

/* ---------- Comparativas automáticas ---------- */
function insightsHoy(){
  const out = [];
  const now = new Date();
  const iniEsta = inicioSemana(now);
  const iniPasada = new Date(iniEsta); iniPasada.setDate(iniPasada.getDate()-7);
  const finEsta = new Date(iniEsta); finEsta.setDate(finEsta.getDate()+7);
  const sumRango = (a,b) => S.finanzas.movs.filter(m=>{ const f=new Date(m.fecha+'T12:00:00'); return f>=a && f<b; }).reduce((s,m)=>s+m.monto,0);
  const gEsta = sumRango(iniEsta,finEsta), gPasada = sumRango(iniPasada,iniEsta);
  if(gPasada>0){
    const dif = Math.round((gEsta-gPasada)/gPasada*100);
    if(dif<=-5) out.push({tipo:'ok', html:`💸 Vas gastando <b>${Math.abs(dif)}% menos</b> que la semana pasada. ¡Así se hace!`});
    else if(dif>=10) out.push({tipo:'warn', html:`💸 Vas gastando <b>${dif}% más</b> que la semana pasada (${money(gEsta)} vs ${money(gPasada)}). Aguanta el ritmo.`});
  }
  const key = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
  const kEste = key(now), kPrev = key(new Date(now.getFullYear(), now.getMonth()-1, 1));
  const gymEste = S.gym.entrenos.filter(e=>e.fecha && e.fecha.slice(0,7)===kEste).length;
  const gymPrev = S.gym.entrenos.filter(e=>e.fecha && e.fecha.slice(0,7)===kPrev).length;
  if((gymEste||gymPrev) && gymEste>gymPrev) out.push({tipo:'ok', html:`🏋️ Llevas <b>${gymEste} entrenos</b> este mes (el pasado ${gymPrev}). ¡Vas mejor!`});
  else if(gymPrev>0 && gymPrev>gymEste) out.push({tipo:'info', html:`🏋️ Este mes llevas ${gymEste} entrenos; el pasado fueron ${gymPrev}. A alcanzarlo. 💪`});
  return out;
}

function graficaGastos(){
  const now=new Date(); const items=[];
  for(let k=5;k>=0;k--){
    const d=new Date(now.getFullYear(), now.getMonth()-k, 1);
    const key=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    const total=S.finanzas.movs.filter(m=>m.fecha && m.fecha.slice(0,7)===key).reduce((a,m)=>a+m.monto,0);
    items.push({label:MESES[d.getMonth()].slice(0,3), v:total});
  }
  const hay=items.some(i=>i.v>0);
  return `<div class="card">
    <div class="lbl muted small" style="margin-bottom:10px">📊 Gastos por mes (últimos 6)</div>
    ${hay? svgBarras(items,{color:'var(--money)'}) : `<div class="empty small">Registra gastos para ver tu tendencia por mes.</div>`}
  </div>`;
}
function sheetPeso(){
  volverADia = null;
  openSheet(`<h3>Registrar peso</h3>
    <label class="f">¿Cuánto pesas? (kg)</label>
    <input class="in" id="wPeso" type="number" inputmode="decimal" value="${S.perfil.pesoActual||''}" placeholder="70">
    <label class="f">Fecha</label>
    <input class="in" id="wFecha" type="date" value="${hoy()}">
    <div style="margin-top:16px"><button class="btn" onclick="guardarPeso()">Guardar peso</button></div>`);
  setTimeout(()=>$('#wPeso').focus(),100);
}
function guardarPeso(){
  const peso = Number($('#wPeso').value); if(!peso) return;
  const fecha = $('#wFecha').value||hoy();
  if(!S.progreso) S.progreso={pesos:[]};
  const i = S.progreso.pesos.findIndex(x=>x.fecha===fecha);
  if(i>=0) S.progreso.pesos[i].peso=peso; else S.progreso.pesos.push({fecha, peso, ts:Date.now()});
  // el peso actual = el registro más reciente por fecha
  const ult = S.progreso.pesos.slice().sort((a,b)=>a.fecha.localeCompare(b.fecha)).pop();
  if(ult) S.perfil.pesoActual = ult.peso;
  save(); closeSheet(); render(); toast('Peso guardado ✓');
}

/* ============================================================
   RACHAS / MOTIVACIÓN
   ============================================================ */
function activoDia(iso){
  return S.finanzas.movs.some(m=>m.fecha===iso)
    || S.comida.registros.some(r=>r.fecha===iso)
    || S.gym.entrenos.some(e=>e.fecha===iso)
    || (S.comida.vasosAgua[iso]||0)>0
    || S.gym.tomas.some(t=>t.fecha===iso);
}
function rachaDias(cumple){
  let streak=0; const d=new Date();
  for(let i=0;i<400;i++){
    const iso=isoDe(d.getFullYear(), d.getMonth(), d.getDate());
    if(cumple(iso)) streak++;
    else if(i>0) break;          // que hoy aún no cuente no rompe la racha
    d.setDate(d.getDate()-1);
  }
  return streak;
}
// Racha de GYM: cuenta tus entrenos seguidos. Aguanta huecos de hasta 3 días
// (ej. días de lluvia); solo se rompe si dejas pasar MÁS de 3 días sin entrenar.
const TOLERANCIA_GYM = 3;
function difDias(a, b){ return Math.round((new Date(b+'T12:00:00') - new Date(a+'T12:00:00'))/86400000); }
function rachaGym(){
  const fechas = [...new Set(S.gym.entrenos.map(e=>e.fecha))].sort();  // ascendente
  if(!fechas.length) return 0;
  // Si ya pasaron más de 3 días desde el último entreno, la racha se rompió.
  if(difDias(fechas[fechas.length-1], hoy()) > TOLERANCIA_GYM) return 0;
  let streak = 1;
  for(let i=fechas.length-1; i>0; i--){
    if(difDias(fechas[i-1], fechas[i]) <= TOLERANCIA_GYM) streak++;
    else break;
  }
  return streak;
}

/* ============================================================
   SHEETS (formularios emergentes)
   ============================================================ */
function openSheet(html){
  $('#sheetRoot').innerHTML = `<div class="sheet-bg" onclick="if(event.target===this)closeSheet()">
    <div class="sheet"><div class="grip"></div>${html}</div></div>`;
}
function closeSheet(){ $('#sheetRoot').innerHTML=''; }

// Si un formulario se abrió desde un día del calendario, al guardar volvemos a ese día.
let volverADia = null;
function finSheet(){
  if(volverADia){ const d=volverADia; volverADia=null; render(); sheetDia(d); }
  else { closeSheet(); render(); }
}

function sheetSemanal(){
  openSheet(`<h3>Dinero de la semana</h3>
    <label class="f">¿Cuánto dinero manejas por semana?</label>
    <input class="in" id="fSem" type="number" inputmode="numeric" value="${S.finanzas.semanal||''}" placeholder="7000">
    <div style="margin-top:16px"><button class="btn" onclick="guardarSemanal()">Guardar</button></div>`);
  setTimeout(()=>$('#fSem').focus(),100);
}
function guardarSemanal(){ S.finanzas.semanal = Number($('#fSem').value)||0; save(); closeSheet(); render(); }

function sheetGasto(fecha=hoy(), volver=false){
  volverADia = volver ? fecha : null;
  const cats = S.finanzas.cats;
  openSheet(`<h3>Registrar gasto</h3>
    <label class="f">Monto</label>
    <input class="in" id="gMonto" type="number" inputmode="decimal" placeholder="0">
    <label class="f">Categoría</label>
    <div class="chips" id="gCats">
      ${cats.map((c,i)=>`<button class="chip ${i===0?'on':''}" data-cat="${c.id}" onclick="selChip(this,'gCats')">${c.icono} ${esc(c.nombre)}</button>`).join('')}
    </div>
    <label class="f">Nota (opcional)</label>
    <input class="in" id="gNota" placeholder="ej. café, taxi, super…">
    <label class="f">Fecha</label>
    <input class="in" id="gFecha" type="date" value="${fecha}">
    <div style="margin-top:16px"><button class="btn" onclick="guardarGasto()">Guardar gasto</button></div>`);
  setTimeout(()=>$('#gMonto').focus(),100);
}
function selChip(el, cont){ $$(`#${cont} .chip`).forEach(c=>c.classList.remove('on')); el.classList.add('on'); }
function guardarGasto(){
  const monto = Number($('#gMonto').value);
  if(!monto){ $('#gMonto').focus(); return; }
  const cat = $('#gCats .chip.on')?.dataset.cat || 'otros';
  const fecha = $('#gFecha')?.value || hoy();
  S.finanzas.movs.push({id:uid(), monto, cat, nota:$('#gNota').value.trim(), fecha, ts:Date.now()});
  save(); finSheet();
}

function sheetCategoria(){
  openSheet(`<h3>Ajustar presupuestos</h3>
    <p class="hint">Ponle un tope semanal a cada categoría (deja 0 para usar el reparto automático).</p>
    ${S.finanzas.cats.map(c=>`<label class="f">${c.icono} ${esc(c.nombre)}</label>
      <input class="in" type="number" inputmode="numeric" data-cat="${c.id}" value="${c.presupuesto||''}" placeholder="0">`).join('')}
    <div style="margin-top:16px"><button class="btn" onclick="guardarCats()">Guardar</button></div>`);
}
function guardarCats(){
  $$('#sheetRoot input[data-cat]').forEach(inp=>{
    const c = S.finanzas.cats.find(x=>x.id===inp.dataset.cat);
    if(c) c.presupuesto = Number(inp.value)||0;
  });
  save(); closeSheet(); render();
}
function aplicarReparto(){
  const rep = repartoSugerido();
  const map = {mandado:rep.plan.mandado, inversion:rep.plan.inversion, hormiga:rep.plan.hormiga, otros:rep.plan.otros};
  S.finanzas.cats.forEach(c=>{ if(map[c.id]!=null) c.presupuesto = map[c.id]; });
  save(); render();
  toast('Reparto aplicado ✓');
}
function verCategoria(id){
  const c = S.finanzas.cats.find(x=>x.id===id);
  const movs = S.finanzas.movs.filter(m=>m.cat===id && enSemanaActual(m.fecha)).sort((a,b)=>b.ts-a.ts);
  const total = movs.reduce((a,m)=>a+m.monto,0);
  openSheet(`<h3>${c.icono} ${esc(c.nombre)}</h3>
    <div class="banner info">Esta semana: <b>${money(total)}</b>${c.presupuesto?` de ${money(c.presupuesto)}`:''}.</div>
    ${movs.length? movs.map(m=>`<div class="row"><div class="ic">${c.icono}</div>
      <div class="mid"><div class="t">${esc(m.nota||c.nombre)}</div><div class="s">${fechaBonita(m.fecha)}</div></div>
      <div class="amt" style="color:var(--bad)">-${money(m.monto)}</div>
      <button class="addbtn" style="margin-left:6px" onclick="borrarMov('${m.id}',true)">×</button></div>`).join('')
      : `<div class="empty">Sin movimientos aquí esta semana.</div>`}
    <div style="margin-top:14px"><button class="btn sec" onclick="closeSheet()">Cerrar</button></div>`);
}
function borrarMov(id, reopen){
  S.finanzas.movs = S.finanzas.movs.filter(m=>m.id!==id); save();
  if(reopen) closeSheet(); render();
}

function sheetComida(fecha=hoy(), volver=false){
  volverADia = volver ? fecha : null;
  openSheet(`<h3>Registrar comida</h3>
    <label class="f">¿Cuál comida?</label>
    <div class="seg" id="cComida">
      <button class="on" data-c="desayuno" onclick="selSeg(this,'cComida')">🌅 Desayuno</button>
      <button data-c="almuerzo" onclick="selSeg(this,'cComida')">☀️ Almuerzo</button>
      <button data-c="cena" onclick="selSeg(this,'cComida')">🌙 Cena</button>
    </div>
    <label class="f">¿Qué comiste? (opcional)</label>
    <input class="in" id="cTexto" placeholder="ej. pechuga con arroz y ensalada">
    <label class="f">Fecha</label>
    <input class="in" id="cFecha" type="date" value="${fecha}">
    <div style="margin-top:16px"><button class="btn" onclick="guardarComidaLibre()">Guardar</button></div>`);
}
function selSeg(el,cont){ $$(`#${cont} button`).forEach(b=>b.classList.remove('on')); el.classList.add('on'); }
function guardarComidaLibre(){
  const comida = $('#cComida .on').dataset.c;
  const fecha = $('#cFecha')?.value || hoy();
  S.comida.registros.push({id:uid(), comida, texto:$('#cTexto').value.trim(), fecha, ts:Date.now()});
  save(); finSheet();
}
function registrarComida(comida, nombre){
  S.comida.registros.push({id:uid(), comida, texto:nombre, fecha:hoy(), ts:Date.now()});
  save(); render();
}
function borrarComida(id){ S.comida.registros = S.comida.registros.filter(r=>r.id!==id); save(); render(); }
function agua(d){
  const k = hoy(); S.comida.vasosAgua[k] = Math.max(0,(S.comida.vasosAgua[k]||0)+d); save(); render();
}

function sheetEntreno(fecha=hoy(), volver=false){
  volverADia = volver ? fecha : null;
  const diaSem = DIAS[new Date(fecha+'T12:00:00').getDay()];
  openSheet(`<h3>Registrar entreno</h3>
    <label class="f">¿Qué entrenaste?</label>
    <input class="in" id="eNota" value="${esc(resumenDiaTxt(diaSem)||'')}" placeholder="ej. Pecho, tríceps y bíceps">
    <label class="f">Duración (minutos)</label>
    <input class="in" id="eDur" type="number" inputmode="numeric" value="90" placeholder="90">
    <label class="f">Intensidad</label>
    <div class="seg" id="eInt">
      <button data-i="suave" onclick="selSeg(this,'eInt')">Suave</button>
      <button class="on" data-i="normal" onclick="selSeg(this,'eInt')">Normal</button>
      <button data-i="fuerte" onclick="selSeg(this,'eInt')">Fuerte 🔥</button>
    </div>
    <label class="f">Fecha</label>
    <input class="in" id="eFecha" type="date" value="${fecha}">
    <div style="margin-top:16px"><button class="btn" onclick="guardarEntreno()">Guardar entreno</button></div>`);
}
function guardarEntreno(){
  const fecha = $('#eFecha')?.value || hoy();
  const nota = $('#eNota').value.trim();
  const dur = Number($('#eDur').value)||0;
  const intensidad = $('#eInt .on').dataset.i;
  const existe = S.gym.entrenos.find(e=>e.fecha===fecha);
  if(existe) Object.assign(existe,{nota,duracion:dur,intensidad});
  else S.gym.entrenos.push({id:uid(), fecha, nota, duracion:dur, intensidad, ts:Date.now()});
  save(); finSheet();
}
function borrarEntreno(id){ S.gym.entrenos = S.gym.entrenos.filter(e=>e.id!==id); save(); render(); }

function sheetRutina(dia){
  openSheet(`<h3 style="text-transform:capitalize">${dia}</h3>
    <label class="f">¿Qué toca este día? (déjalo vacío = descanso)</label>
    <input class="in" id="rVal" value="${esc(S.gym.rutina[dia]||'')}" placeholder="ej. Pierna y glúteo">
    <div style="margin-top:16px"><button class="btn" onclick="guardarRutina('${dia}')">Guardar</button></div>`);
  setTimeout(()=>$('#rVal').focus(),100);
}
function guardarRutina(dia){ S.gym.rutina[dia] = $('#rVal').value.trim(); save(); closeSheet(); render(); }

function sheetSup(){
  openSheet(`<h3>Nuevo suplemento</h3>
    <label class="f">Nombre</label>
    <input class="in" id="sNom" placeholder="ej. Creatina">
    <label class="f">¿A qué hora? (opcional)</label>
    <input class="in" id="sHora" placeholder="ej. después del gym">
    <div style="margin-top:16px"><button class="btn" onclick="guardarSup()">Agregar</button></div>`);
  setTimeout(()=>$('#sNom').focus(),100);
}
function guardarSup(){
  const nombre = $('#sNom').value.trim(); if(!nombre) return;
  S.gym.suplementos.push({id:uid(), nombre, hora:$('#sHora').value.trim()});
  save(); closeSheet(); render();
}
function borrarSup(id){ S.gym.suplementos = S.gym.suplementos.filter(s=>s.id!==id); S.gym.tomas = S.gym.tomas.filter(t=>t.sup!==id); save(); render(); }
function toggleToma(id){
  const i = S.gym.tomas.findIndex(t=>t.fecha===hoy() && t.sup===id);
  if(i>=0) S.gym.tomas.splice(i,1); else S.gym.tomas.push({fecha:hoy(), sup:id});
  save(); render();
}

function sheetTarea(fecha=hoy(), volver=false){
  volverADia = volver ? fecha : null;
  openSheet(`<h3>Nueva tarea</h3>
    <label class="f">Título</label>
    <input class="in" id="tTit" placeholder="ej. Ensayo de historia">
    <label class="f">Materia</label>
    <input class="in" id="tMat" placeholder="ej. Historia">
    <label class="f">Fecha límite</label>
    <input class="in" id="tFec" type="date" value="${fecha}">
    <div style="margin-top:16px"><button class="btn" onclick="guardarTarea()">Agregar tarea</button></div>`);
  setTimeout(()=>$('#tTit').focus(),100);
}
function guardarTarea(){
  const titulo = $('#tTit').value.trim(); if(!titulo) return;
  S.uni.tareas.push({id:uid(), titulo, materia:$('#tMat').value.trim(), fecha:$('#tFec').value, estado:'pend', ts:Date.now()});
  save(); finSheet();
}
function tareaHecha(id){ const t=S.uni.tareas.find(x=>x.id===id); if(t)t.estado='hecha'; save(); render(); }
function borrarTarea(id){ S.uni.tareas = S.uni.tareas.filter(t=>t.id!==id); save(); render(); }
function limpiarHechas(){ S.uni.tareas = S.uni.tareas.filter(t=>t.estado!=='hecha'); save(); render(); }

/* ============================================================
   AJUSTES / PERFIL / API KEY / BACKUP
   ============================================================ */
function openAjustes(){
  const p = S.perfil;
  openSheet(`<h3>⚙️ Ajustes y perfil</h3>
    <label class="f">Tu nombre</label>
    <input class="in" id="pNom" value="${esc(p.nombre||'')}" placeholder="Emmanuel">
    <div class="two">
      <div><label class="f">Sexo</label>
        <div class="seg" id="pSexo">
          <button class="${p.sexo==='h'?'on':''}" data-s="h" onclick="selSeg(this,'pSexo')">Hombre</button>
          <button class="${p.sexo==='m'?'on':''}" data-s="m" onclick="selSeg(this,'pSexo')">Mujer</button>
        </div></div>
      <div><label class="f">Edad</label><input class="in" id="pEdad" type="number" inputmode="numeric" value="${p.edad||''}" placeholder="22"></div>
    </div>
    <div class="two">
      <div><label class="f">Altura (cm)</label><input class="in" id="pAlt" type="number" inputmode="numeric" value="${p.altura||''}" placeholder="175"></div>
      <div><label class="f">Peso actual (kg)</label><input class="in" id="pPeso" type="number" inputmode="decimal" value="${p.pesoActual||''}" placeholder="70"></div>
    </div>
    <div class="two">
      <div><label class="f">Peso meta (kg)</label><input class="in" id="pMeta" type="number" inputmode="decimal" value="${p.pesoMeta||''}" placeholder="75"></div>
      <div><label class="f">Objetivo</label>
        <select class="in" id="pObj">
          <option value="subir" ${p.objetivo==='subir'?'selected':''}>Subir de peso</option>
          <option value="mantener" ${p.objetivo==='mantener'?'selected':''}>Mantener</option>
          <option value="bajar" ${p.objetivo==='bajar'?'selected':''}>Bajar de peso</option>
        </select></div>
    </div>
    <label class="f">Nivel de actividad</label>
    <select class="in" id="pAct">
      <option value="sedentario" ${p.actividad==='sedentario'?'selected':''}>Sedentario</option>
      <option value="ligero" ${p.actividad==='ligero'?'selected':''}>Ligero (1-2 días gym)</option>
      <option value="moderado" ${p.actividad==='moderado'?'selected':''}>Moderado (3-4 días)</option>
      <option value="fuerte" ${p.actividad==='fuerte'?'selected':''}>Intenso (5-6 días)</option>
      <option value="atleta" ${p.actividad==='atleta'?'selected':''}>Atleta (2 sesiones/día)</option>
    </select>

    <div class="divider"></div>
    <h4 style="margin-bottom:4px">✦ Coach con IA</h4>
    <p class="hint">Pega tu API key de Anthropic para activar el coach que te habla. Se guarda solo en este teléfono y solo se usa para hablar con Claude.</p>
    <label class="f">API Key (empieza con sk-ant-…)</label>
    <input class="in" id="pKey" type="password" value="${esc(S.ajustes.apiKey||'')}" placeholder="sk-ant-...">
    <label class="f">Modelo</label>
    <select class="in" id="pModelo">
      <option value="claude-haiku-4-5" ${S.ajustes.modelo==='claude-haiku-4-5'?'selected':''}>Haiku (rápido y barato)</option>
      <option value="claude-sonnet-5" ${S.ajustes.modelo==='claude-sonnet-5'?'selected':''}>Sonnet (más listo)</option>
      <option value="claude-opus-5" ${S.ajustes.modelo==='claude-opus-5'?'selected':''}>Opus (el más potente)</option>
    </select>
    <p class="hint"><a class="link" href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener">¿Cómo saco mi API key? →</a></p>

    <div class="divider"></div>
    <button class="btn" onclick="guardarAjustes()">Guardar todo</button>
    <div class="two" style="margin-top:10px">
      <button class="btn sec" onclick="exportar()">⬇️ Respaldar datos</button>
      <button class="btn sec" onclick="$('#impFile').click()">⬆️ Restaurar</button>
    </div>
    <input type="file" id="impFile" accept="application/json" class="hide" onchange="importar(event)">
    <button class="btn danger" style="margin-top:10px" onclick="borrarTodo()">Borrar todos mis datos</button>
  `);
}
function guardarAjustes(){
  const p = S.perfil;
  p.nombre = $('#pNom').value.trim()||'Emmanuel';
  p.sexo = $('#pSexo .on')?.dataset.s || p.sexo;
  p.edad = Number($('#pEdad').value)||null;
  p.altura = Number($('#pAlt').value)||null;
  const nuevoPeso = Number($('#pPeso').value)||null;
  if(nuevoPeso && nuevoPeso!==p.pesoActual){
    if(!S.progreso) S.progreso={pesos:[]};
    const i=S.progreso.pesos.findIndex(x=>x.fecha===hoy());
    if(i>=0) S.progreso.pesos[i].peso=nuevoPeso; else S.progreso.pesos.push({fecha:hoy(), peso:nuevoPeso, ts:Date.now()});
  }
  p.pesoActual = nuevoPeso;
  p.pesoMeta = Number($('#pMeta').value)||null;
  p.objetivo = $('#pObj').value;
  p.actividad = $('#pAct').value;
  S.ajustes.apiKey = $('#pKey').value.trim();
  S.ajustes.modelo = $('#pModelo').value;
  save(); closeSheet(); render();
  toast('Guardado ✓');
}
function exportar(){
  const blob = new Blob([JSON.stringify(S,null,2)],{type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `mividav1-respaldo-${hoy()}.json`; a.click();
}
function importar(e){
  const f = e.target.files[0]; if(!f) return;
  const rd = new FileReader();
  rd.onload = () => { try{ S = deepMerge(structuredClone(DEFAULT), JSON.parse(rd.result)); save(); closeSheet(); render(); toast('Restaurado ✓'); }catch(_){ toast('Archivo no válido'); } };
  rd.readAsText(f);
}
function borrarTodo(){
  if(confirm('¿Seguro? Se borra TODO lo registrado en este teléfono.')){
    localStorage.removeItem('mividav1'); S = structuredClone(DEFAULT); save(); closeSheet(); go('inicio');
  }
}

/* ============================================================
   ONBOARDING
   ============================================================ */
function renderOnboard(){
  $('#greeting').textContent = 'Bienvenido';
  $('#headerTitle').textContent = 'Configuremos tu app';
  $('#app').innerHTML = `
  <div class="card">
    <h2 style="font-size:22px;margin-bottom:6px">¡Hola! 👋 Soy tu app de vida diaria</h2>
    <p class="muted">Antes de empezar, dime lo básico para calcular tus porciones y tu dinero. Todo se queda en tu teléfono.</p>
  </div>
  <div class="card">
    <label class="f">¿Cómo te llamo?</label>
    <input class="in" id="oNom" value="Emmanuel">
    <div class="two">
      <div><label class="f">Sexo</label>
        <div class="seg" id="oSexo"><button class="on" data-s="h" onclick="selSeg(this,'oSexo')">Hombre</button><button data-s="m" onclick="selSeg(this,'oSexo')">Mujer</button></div></div>
      <div><label class="f">Edad</label><input class="in" id="oEdad" type="number" inputmode="numeric" placeholder="22"></div>
    </div>
    <div class="two">
      <div><label class="f">Altura (cm)</label><input class="in" id="oAlt" type="number" inputmode="numeric" placeholder="175"></div>
      <div><label class="f">Peso actual (kg)</label><input class="in" id="oPeso" type="number" inputmode="decimal" placeholder="70"></div>
    </div>
    <div class="two">
      <div><label class="f">Peso meta (kg)</label><input class="in" id="oMeta" type="number" inputmode="decimal" placeholder="75"></div>
      <div><label class="f">Actividad</label><select class="in" id="oAct">
        <option value="ligero">Ligero</option><option value="moderado" selected>Moderado</option><option value="fuerte">Intenso</option></select></div>
    </div>
    <label class="f">¿Cuánto dinero manejas por semana?</label>
    <input class="in" id="oSem" type="number" inputmode="numeric" value="7000">
  </div>
  <button class="btn" onclick="terminarOnboard()">Empezar 🚀</button>
  <p class="hint center">Podrás cambiar todo esto luego en Ajustes.</p>
  `;
}
function terminarOnboard(){
  const p = S.perfil;
  p.nombre = $('#oNom').value.trim()||'Emmanuel';
  p.sexo = $('#oSexo .on').dataset.s;
  p.edad = Number($('#oEdad').value)||null;
  p.altura = Number($('#oAlt').value)||null;
  p.pesoActual = Number($('#oPeso').value)||null;
  if(p.pesoActual){ if(!S.progreso) S.progreso={pesos:[]}; S.progreso.pesos.push({fecha:hoy(), peso:p.pesoActual, ts:Date.now()}); }
  p.pesoMeta = Number($('#oMeta').value)||null;
  p.actividad = $('#oAct').value;
  p.objetivo = (p.pesoMeta&&p.pesoActual)? (p.pesoMeta>p.pesoActual?'subir':p.pesoMeta<p.pesoActual?'bajar':'mantener') : 'subir';
  S.finanzas.semanal = Number($('#oSem').value)||7000;
  S.onboarded = true;
  save(); go('inicio');
}

/* ============================================================
   COACH IA (Claude)
   ============================================================ */
function contextoParaCoach(){
  const p = S.perfil;
  const nut = calcNutricion(entrenoFuerteHoy());
  const rep = repartoSugerido();
  const diaHoy = DIAS[new Date().getDay()];
  const gastosHoy = S.finanzas.movs.filter(m=>m.fecha===hoy());
  const pend = tareasPendientes().slice(0,8);
  const rutinaSemana = DIAS.slice(1).concat('domingo').map(d=>`${d}: ${resumenDiaTxt(d)||'descanso'}`).join('; ');
  const ultimos = S.gym.entrenos.slice().sort((a,b)=>b.ts-a.ts).slice(0,6).map(e=>{
    const ejs = (e.detalle||[]).map(d=>`${d.nombre}${d.series&&d.series.length?` (${d.series.map(x=>`${x.peso}x${x.reps}`).join('/')})`:''}`).join(', ');
    return `${e.fecha} [${e.nota||'entreno'}]${ejs?`: ${ejs}`:''}`;
  }).join(' | ');
  const porCat = S.finanzas.cats.map(c=>{ const g=gastosSemana(c.id); return g>0?`${c.nombre} ${money(g)}`:null; }).filter(Boolean).join(', ');
  const deudas = (S.finanzas.deudas||[]).map(d=>`${d.nombre}: pagado ${money(d.pagado)} de ${money(d.total)} (falta ${money(Math.max(0,d.total-d.pagado))})`).join('; ');
  const metas = (S.finanzas.metas||[]).map(m=>`${m.nombre}: ${money(m.ahorrado)} de ${money(m.objetivo)}${m.fecha?` para ${m.fecha}`:''}`).join('; ');
  const hechas = S.uni.tareas.filter(t=>t.estado==='hecha').length;
  return `Perfil de ${p.nombre}: sexo ${p.sexo==='h'?'hombre':'mujer'}, ${p.edad} años, ${p.altura}cm, pesa ${p.pesoActual}kg, meta ${p.pesoMeta}kg (objetivo: ${p.objetivo}), actividad ${p.actividad}.
Nutrición calculada hoy: ${nut?`${nut.cal} kcal, ${nut.prot}g proteína, ${nut.carbs}g carbos, ${nut.grasa}g grasa. TDEE ~${nut.tdee}.`:'perfil incompleto'}
GYM — hoy es ${diaHoy}. RUTINA SEMANAL COMPLETA (músculos por día): ${rutinaSemana}.
GYM — últimos entrenos registrados: ${ultimos||'ninguno registrado aún'}.
Suplementos: ${S.gym.suplementos.map(s=>s.nombre).join(', ')||'ninguno'}.
DINERO — presupuesto semanal ${money(S.finanzas.semanal)}, gastado esta semana ${money(gastoTotalSemana())}, le queda ${money(restanteSemana())}. Gastos hormiga semana: ${money(gastosSemana('hormiga'))}. Reparto sugerido: mandado ${money(rep.plan.mandado)}, inversión ${money(rep.plan.inversion)}, hormiga máx ${money(rep.plan.hormiga)}.
DINERO — gasto por categoría esta semana: ${porCat||'sin gastos'}. Gastos de hoy: ${gastosHoy.map(m=>`${money(m.monto)} (${m.nota||m.cat})`).join(', ')||'ninguno aún'}.
DEUDAS: ${deudas||'ninguna registrada'}.
METAS DE AHORRO: ${metas||'ninguna registrada'}.
UNIVERSIDAD — tareas pendientes: ${pend.map(t=>`"${t.titulo}"${t.materia?' de '+t.materia:''}${t.fecha?' vence '+t.fecha:''}`).join('; ')||'ninguna'}. Tareas ya hechas: ${hechas}.
${resumenHistorialCoach()}`;
}
// Historial para que el Coach responda del pasado y compare mes vs mes (con topes)
function resumenHistorialCoach(){
  const now = new Date();
  const meses = [];
  for(let k=0;k<3;k++){
    const d = new Date(now.getFullYear(), now.getMonth()-k, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    const movs = S.finanzas.movs.filter(m=>m.fecha && m.fecha.slice(0,7)===key);
    const total = movs.reduce((a,m)=>a+m.monto,0);
    const porCat = {}; movs.forEach(m=>porCat[m.cat]=(porCat[m.cat]||0)+m.monto);
    const catTxt = Object.entries(porCat).sort((a,b)=>b[1]-a[1]).slice(0,4)
      .map(([id,v])=>`${(S.finanzas.cats.find(c=>c.id===id)||{nombre:id}).nombre} ${money(v)}`).join(', ');
    const ent = S.gym.entrenos.filter(e=>e.fecha && e.fecha.slice(0,7)===key).length;
    const com = S.comida.registros.filter(r=>r.fecha && r.fecha.slice(0,7)===key).length;
    if(total||ent||com) meses.push(`${MESES[d.getMonth()]} ${d.getFullYear()}: gasto ${money(total)}${catTxt?` (${catTxt})`:''}, ${ent} entrenos, ${com} comidas registradas`);
  }
  const comidas = S.comida.registros.slice().sort((a,b)=>(b.ts||0)-(a.ts||0)).slice(0,30)
    .map(r=>`${r.fecha} ${r.comida}: ${r.texto||'—'}`).join(' | ');
  const hechas = S.uni.tareas.filter(t=>t.estado==='hecha').slice(-20)
    .map(t=>`${t.titulo}${t.materia?' ('+t.materia+')':''}${t.fecha?' '+t.fecha:''}`).join('; ');
  const pesos = ((S.progreso&&S.progreso.pesos)||[]).slice().sort((a,b)=>a.fecha.localeCompare(b.fecha))
    .map(x=>`${x.fecha}:${x.peso}kg`).join(', ');
  return `HISTORIAL (para preguntas del pasado y comparar mes vs mes):
Resumen por mes (últimos 3 meses): ${meses.join(' || ')||'sin datos aún'}.
Comidas registradas (últimas 30): ${comidas||'ninguna'}.
Tareas ya hechas: ${hechas||'ninguna'}.
Peso histórico: ${pesos||'sin registros'}.`;
}

function openCoach(){
  if(!S.ajustes.apiKey){
    openSheet(`<h3>✦ Activa tu Coach</h3>
      <p class="muted">El coach es Claude, y necesita tu API key de Anthropic para hablarte. Se guarda solo en tu teléfono.</p>
      <ol class="hint" style="line-height:1.8">
        <li>Entra a <a class="link" href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener">console.anthropic.com</a></li>
        <li>Crea una API key (empieza con <b>sk-ant-</b>)</li>
        <li>Pégala aquí abajo</li>
      </ol>
      <label class="f">API Key</label>
      <input class="in" id="ckKey" type="password" placeholder="sk-ant-...">
      <div style="margin-top:14px"><button class="btn" onclick="guardarKeyCoach()">Activar coach ✦</button></div>`);
    return;
  }
  const sugerencias = [
    'Con lo que gasté esta semana, ¿cómo reparto mejor mi dinero?',
    '¿Qué debería comer hoy según mi entreno?',
    '¿Cuánto tiempo de gym me recomiendas para subir a mi meta?',
    'Organízame la semana con mis tareas pendientes',
  ];
  openSheet(`<div class="kpi" style="justify-content:space-between;margin-bottom:6px">
      <h3 style="margin:0">✦ Coach</h3>
      ${coachChat.length?`<button class="btn sm sec" style="width:auto;padding:7px 12px" onclick="nuevoCoach()">🗑️ Nuevo</button>`:''}
    </div>
    ${coachChat.length? '' : `<p class="hint">Pregúntame lo que quieras sobre tu dinero, comida, gym o tareas. Ya conozco tus datos de hoy y me acuerdo de lo que vamos platicando.</p>
    <div class="chips" style="margin:6px 0 6px">
      ${sugerencias.map(s=>`<button class="chip" onclick="usarSug(this)">${esc(s)}</button>`).join('')}
    </div>`}
    <div id="ckThread" style="max-height:44vh;overflow:auto;margin:8px 0"></div>
    <textarea class="in" id="ckMsg" placeholder="${coachChat.length?'Sigue preguntando…':'Escribe tu pregunta…'}"></textarea>
    <label style="display:flex;align-items:center;gap:9px;margin-top:10px;font-size:14px;color:var(--txt)">
      <input type="checkbox" id="ckWeb" ${S.ajustes.webBuscar!==false?'checked':''} onchange="S.ajustes.webBuscar=this.checked;save()" style="width:20px;height:20px;accent-color:var(--acc)">
      🌐 Dejar que busque en internet si hace falta
    </label>
    <div style="margin-top:12px"><button class="btn" id="ckSend" onclick="enviarCoach()">Preguntar ✦</button></div>`);
  renderCoachThread(false);
  setTimeout(()=>$('#ckMsg')?.focus(),100);
}
function guardarKeyCoach(){
  const k = $('#ckKey').value.trim();
  if(!k.startsWith('sk-ant')){ toast('Esa key no parece válida'); return; }
  S.ajustes.apiKey = k; save(); closeSheet(); openCoach();
}
function usarSug(el){ $('#ckMsg').value = el.textContent; $('#ckMsg').focus(); }
function nuevoCoach(){ coachChat = []; openCoach(); }

// Historial de la charla con el Coach (vive mientras la sesión está abierta)
let coachChat = [];
function renderCoachThread(pensando){
  const cont = $('#ckThread'); if(!cont) return;
  const burbujas = coachChat.map(m=>{
    if(m.role==='user')
      return `<div style="display:flex;justify-content:flex-end;margin:7px 0"><div style="background:var(--acc);color:#f3eee4;padding:10px 13px;border-radius:16px 16px 4px 16px;max-width:85%;white-space:pre-wrap">${esc(m.content)}</div></div>`;
    return `<div style="display:flex;margin:7px 0"><div class="coachmsg" style="background:var(--card);border:1px solid var(--line2);padding:11px 13px;border-radius:16px 16px 16px 4px;max-width:90%">✦ ${esc(m.content)}${m.buscó?'<div class="hint" style="margin-top:5px">🌐 buscó en internet</div>':''}</div></div>`;
  }).join('');
  const cargando = pensando ? `<div style="display:flex;margin:7px 0"><div style="background:var(--card);border:1px solid var(--line2);padding:11px 14px;border-radius:16px"><span class="spin"></span></div></div>` : '';
  cont.innerHTML = burbujas + cargando;
  cont.scrollTop = cont.scrollHeight;
}

async function enviarCoach(){
  const inp = $('#ckMsg'); const msg = inp.value.trim(); if(!msg) return;
  const btn = $('#ckSend');
  const usaWeb = S.ajustes.webBuscar !== false;
  coachChat.push({ role:'user', content: msg });
  inp.value = '';
  renderCoachThread(true);
  // ocultar sugerencias/hint tras el primer mensaje
  $$('#sheetRoot .chips').forEach(c=>{ if(c.querySelector('[onclick^="usarSug"]')) c.remove(); });
  btn.disabled = true; btn.innerHTML = '<span class="spin"></span>';

  const system = `Eres el coach personal de ${S.perfil.nombre}, en su app de vida diaria. Hablas español mexicano, cercano y directo, lo tratas por su nombre. Recuerdas lo que van platicando en esta conversación y le das seguimiento. Das consejos concretos y accionables sobre dinero, comida/porciones, gym y tareas de la universidad, SIEMPRE usando los datos reales que te paso. IMPORTANTE: en DATOS DE HOY ya tienes TODA su info real de la app: dinero (presupuesto, gasto por categoría, gastos de hoy), DEUDAS, METAS DE AHORRO, su RUTINA SEMANAL COMPLETA con últimos entrenos y series, y sus TAREAS de la escuela. Úsalos directamente y NUNCA digas que no tienes acceso ni le pidas que te repita datos que ya están ahí; si algo específico no aparece es porque aún no lo ha registrado (dilo así y sugiere registrarlo). También tienes un HISTORIAL de los últimos 3 meses (resumen por mes de gastos/entrenos/comidas, comidas recientes, tareas hechas y peso histórico): úsalo para responder qué pasó en meses pasados. Si te pregunta si va MEJOR o PEOR que el mes pasado, haz el análisis comparando este mes contra el anterior (dinero, gym, comida, peso) y dile claramente en qué va mejor y en qué va peor, con números concretos y 1-2 consejos. Sé breve (máx ~180 palabras), con pasos claros y números concretos. No des consejo médico serio; si algo es de salud delicada, sugiere ver a un profesional.${usaWeb? ' Tienes una herramienta de búsqueda web: úsala SOLO cuando necesites datos actuales o que no conoces (precio o tipo de cambio del dólar, precios de productos, noticias o info reciente). Para consejos con los datos del usuario NO la necesitas. Si buscas, cita brevemente la fuente.' : ''}\n\nDATOS DE HOY:\n${contextoParaCoach()}`;

  const body = {
    model: S.ajustes.modelo || 'claude-haiku-4-5',
    max_tokens: 1000,
    system,
    messages: coachChat.map(m=>({ role:m.role, content:m.content }))
  };
  if(usaWeb) body.tools = [{ type:'web_search_20250305', name:'web_search', max_uses:3 }];

  try{
    let data, guard = 0, buscó = false;
    while(true){
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method:'POST',
        headers:{
          'content-type':'application/json',
          'x-api-key':S.ajustes.apiKey,
          'anthropic-version':'2023-06-01',
          'anthropic-dangerous-direct-browser-access':'true'
        },
        body: JSON.stringify(body)
      });
      data = await r.json();
      if(data.error) break;
      if(Array.isArray(data.content) && data.content.some(c=>c.type==='server_tool_use'||c.type==='web_search_tool_result')) buscó = true;
      // La búsqueda web puede pausar el turno: reanudar reenviando la respuesta
      if(data.stop_reason === 'pause_turn' && guard++ < 4){
        body.messages.push({ role:'assistant', content:data.content });
        continue;
      }
      break;
    }
    if(data.error){
      coachChat.push({ role:'assistant', content:`⚠️ Error: ${data.error.message||'algo falló'}. Revisa tu API key en Ajustes.` });
    } else {
      const txt = (data.content||[]).map(c=>c.text||'').join('\n').trim() || 'No obtuve respuesta, intenta de nuevo.';
      coachChat.push({ role:'assistant', content:txt, buscó });
    }
  }catch(err){
    coachChat.push({ role:'assistant', content:'⚠️ No pude conectar. Revisa tu internet y tu API key.' });
  }
  btn.disabled = false; btn.innerHTML = 'Preguntar ✦';
  renderCoachThread(false);
  setTimeout(()=>$('#ckMsg')?.focus(),50);
}

/* ============================================================
   Toast + arranque
   ============================================================ */
let toastT;
function toast(msg){
  let t = $('#toast');
  if(!t){ t = document.createElement('div'); t.id='toast';
    t.style.cssText='position:fixed;left:50%;bottom:100px;transform:translateX(-50%);background:var(--card2);border:1px solid var(--line);color:var(--txt);padding:11px 18px;border-radius:999px;z-index:99;font-weight:600;font-size:14px;box-shadow:var(--sh);transition:opacity .3s';
    document.body.appendChild(t); }
  t.textContent = msg; t.style.opacity='1';
  clearTimeout(toastT); toastT = setTimeout(()=>t.style.opacity='0', 1800);
}

/* ---------- Burbuja flotante del Coach (arrastrable, estilo Messenger) ---------- */
function setupCoachFab(){
  const fab = document.getElementById('coachFab');
  if(!fab) return;
  // restaurar la última posición donde la dejó el usuario
  try{
    const p = JSON.parse(localStorage.getItem('coachFabPos')||'null');
    if(p){ fab.style.left=p.left+'px'; fab.style.top=p.top+'px'; fab.style.right='auto'; fab.style.bottom='auto'; }
  }catch(_){}

  let dragging=false, moved=false, ox=0, oy=0, sx=0, sy=0;
  fab.addEventListener('pointerdown', e=>{
    dragging=true; moved=false; fab.classList.add('dragging');
    try{ fab.setPointerCapture(e.pointerId); }catch(_){}
    const r=fab.getBoundingClientRect();
    ox=e.clientX-r.left; oy=e.clientY-r.top; sx=e.clientX; sy=e.clientY;
  });
  fab.addEventListener('pointermove', e=>{
    if(!dragging) return;
    if(Math.abs(e.clientX-sx)+Math.abs(e.clientY-sy)>6) moved=true;
    const w=fab.offsetWidth, h=fab.offsetHeight;
    const x=clamp(e.clientX-ox, 6, window.innerWidth-w-6);
    const y=clamp(e.clientY-oy, 50, window.innerHeight-h-70);
    fab.style.left=x+'px'; fab.style.top=y+'px'; fab.style.right='auto'; fab.style.bottom='auto';
  });
  const soltar = () => {
    if(!dragging) return; dragging=false; fab.classList.remove('dragging');
    if(!moved){ openCoach(); return; }                 // fue un toque → abrir Coach
    const r=fab.getBoundingClientRect(), w=fab.offsetWidth;
    const left=(r.left+w/2 < window.innerWidth/2) ? 8 : window.innerWidth-w-8;   // se pega a la orilla
    const top=clamp(r.top, 50, window.innerHeight-w-70);
    fab.style.left=left+'px'; fab.style.top=top+'px';
    try{ localStorage.setItem('coachFabPos', JSON.stringify({left, top})); }catch(_){}
  };
  fab.addEventListener('pointerup', soltar);
  fab.addEventListener('pointercancel', ()=>{ dragging=false; fab.classList.remove('dragging'); });
}

if('serviceWorker' in navigator){
  navigator.serviceWorker.register('sw.js').catch(()=>{});
}
render();
setupCoachFab();
