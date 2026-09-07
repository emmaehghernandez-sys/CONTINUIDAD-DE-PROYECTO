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
  finanzas: { semanal:7000, cats: DEFAULT_CATS.map(c=>({...c})), movs:[] },
  comida: { registros:[], vasosAgua:{} },
  gym: { rutina:{lunes:'',martes:'',miércoles:'',jueves:'',viernes:'',sábado:'',domingo:''},
         entrenos:[], suplementos:[], tomas:[] },
  uni: { tareas:[] },
  recordatorios: [],
  ajustes: { apiKey:'', modelo:'claude-haiku-4-5-20251001', notifOk:false },
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
const TITULOS = {inicio:'Inicio', dinero:'Dinero', comida:'Comida', gym:'Gym', uni:'Universidad'};
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
  el.innerHTML = ({inicio:viewInicio, dinero:viewDinero, comida:viewComida, gym:viewGym, uni:viewUni}[vista])();
  el.className = 'view';
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
  const entrenoHoy = S.gym.rutina[diaHoy];
  const yaEntreno = S.gym.entrenos.some(e=>e.fecha===hoy());

  let avisos = generarAvisos();

  return `
  ${avisos.map(a=>`<div class="banner ${a.tipo}">${a.html}</div>`).join('')}

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
      ${entrenoHoy? `<button class="btn sm ${yaEntreno?'sec':''}" onclick="${yaEntreno?'':'sheetEntreno()'}">${yaEntreno?'✓ Hecho':'Registrar'}</button>`:''}
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
      ${proxTarea.fecha? `<span class="tag" style="background:${diasRestantes(proxTarea.fecha)<=1?'rgba(255,92,92,.2)':'rgba(255,176,32,.18)'};color:${diasRestantes(proxTarea.fecha)<=1?'#ff9b9b':'#ffd98a'}">${diasRestantes(proxTarea.fecha)<=0?'¡hoy!':diasRestantes(proxTarea.fecha)+'d'}</span>`:''}
    </div>
  </div>`:''}

  <div class="sectitle"><h2>Registrar rápido</h2></div>
  <div class="grid2">
    <button class="btn sec" onclick="sheetGasto()">💸 Gasto</button>
    <button class="btn sec" onclick="sheetComida()">🍽️ Comida</button>
    <button class="btn sec" onclick="sheetEntreno()">🏋️ Entreno</button>
    <button class="btn sec" onclick="sheetTarea()">🎓 Tarea</button>
  </div>

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
  if(S.gym.rutina[diaHoy] && !S.gym.entrenos.some(e=>e.fecha===hoy()) && hora>=16 && hora<22){
    out.push({tipo:'info', html:`<b>🏋️ ${S.perfil.nombre}, es buena hora de gym.</b> Hoy toca: ${esc(S.gym.rutina[diaHoy])}. ¡Y no olvides tu creatina! 💪`});
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

  <div class="banner info" style="margin-top:4px">
    <b>Reparto sugerido</b> de tus ${money(rep.total)}: primero tus fijos (${money(rep.fijos)}), y del resto libre (${money(rep.libre)}):
    🛒 ${money(rep.plan.mandado)} mandado · 📈 ${money(rep.plan.inversion)} ahorro/inversión · 🐜 máx ${money(rep.plan.hormiga)} hormiga · ✨ ${money(rep.plan.otros)} libre.
    <div style="margin-top:8px"><button class="btn sm" onclick="aplicarReparto()">Aplicar este reparto</button></div>
  </div>

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
        <span class="tag" style="background:rgba(255,138,76,.16);color:#ffb98a">${por.cal} kcal</span>
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

/* ---------- GYM ---------- */
function viewGym(){
  const diaHoy = DIAS[new Date().getDay()];
  const entrenosSemana = S.gym.entrenos.filter(e=>enSemanaActual(e.fecha));
  const p = S.perfil;

  const rutinaRows = DIAS.slice(1).concat('domingo').map(d=>{
    const val = S.gym.rutina[d]||'';
    return `<div class="row">
      <div class="ic" style="background:var(--gym)22;color:#fff;text-transform:capitalize;font-size:12px;font-weight:800">${d.slice(0,3)}</div>
      <div class="mid"><div class="t" style="${val?'':'color:var(--mut);font-weight:500'}">${val? esc(val):'Descanso — toca para asignar'}</div></div>
      <button class="addbtn" onclick="sheetRutina('${d}')">✎</button>
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
  <div class="grid2">
    <div class="stat"><div class="lbl">🏋️ Entrenos</div><div class="val">${entrenosSemana.length}<span style="font-size:13px;color:var(--mut)"> esta semana</span></div></div>
    <div class="stat"><div class="lbl">⏱️ Tiempo</div><div class="val">${Math.round(entrenosSemana.reduce((a,e)=>a+(e.duracion||0),0)/60*10)/10}<span style="font-size:13px;color:var(--mut)"> h</span></div></div>
  </div>

  <div class="card">
    <div class="kpi" style="justify-content:space-between">
      <div><div class="lbl muted small">Hoy (${diaHoy})</div>
      <div style="font-weight:700;margin-top:3px">${S.gym.rutina[diaHoy]? esc(S.gym.rutina[diaHoy]):'Descanso'}</div></div>
      ${S.gym.rutina[diaHoy]? `<button class="btn sm" onclick="sheetEntreno()">Registrar</button>`:''}
    </div>
  </div>

  <div class="sectitle"><h2>Mi rutina semanal</h2></div>
  <div class="card">${rutinaRows}</div>
  <div class="hint">Tú defines los ejercicios de cada día. El Coach ✦ te dice cuánto tiempo y cómo progresar según tu meta (${p.objetivo==='subir'?'subir a '+(p.pesoMeta||'?')+'kg':'tu objetivo'}).</div>

  <div class="sectitle"><h2>Suplementos</h2><button class="addbtn" onclick="sheetSup()">+</button></div>
  <div class="card">${supRows}</div>

  <div class="sectitle"><h2>Últimos entrenos</h2></div>
  <div class="card">
    ${entrenosSemana.length? entrenosSemana.sort((a,b)=>b.ts-a.ts).map(e=>`<div class="row">
      <div class="ic" style="background:var(--gym)22">🔥</div>
      <div class="mid"><div class="t">${esc(e.nota||'Entreno')}</div><div class="s">${fechaBonita(e.fecha)} · ${e.duracion} min · ${esc(e.intensidad||'')}</div></div>
      <button class="addbtn" onclick="borrarEntreno('${e.id}')">×</button>
    </div>`).join('') : `<div class="empty"><div class="big">💪</div>Aún no registras entrenos esta semana.</div>`}
  </div>
  `;
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
   SHEETS (formularios emergentes)
   ============================================================ */
function openSheet(html){
  $('#sheetRoot').innerHTML = `<div class="sheet-bg" onclick="if(event.target===this)closeSheet()">
    <div class="sheet"><div class="grip"></div>${html}</div></div>`;
}
function closeSheet(){ $('#sheetRoot').innerHTML=''; }

function sheetSemanal(){
  openSheet(`<h3>Dinero de la semana</h3>
    <label class="f">¿Cuánto dinero manejas por semana?</label>
    <input class="in" id="fSem" type="number" inputmode="numeric" value="${S.finanzas.semanal||''}" placeholder="7000">
    <div style="margin-top:16px"><button class="btn" onclick="guardarSemanal()">Guardar</button></div>`);
  setTimeout(()=>$('#fSem').focus(),100);
}
function guardarSemanal(){ S.finanzas.semanal = Number($('#fSem').value)||0; save(); closeSheet(); render(); }

function sheetGasto(){
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
    <div style="margin-top:16px"><button class="btn" onclick="guardarGasto()">Guardar gasto</button></div>`);
  setTimeout(()=>$('#gMonto').focus(),100);
}
function selChip(el, cont){ $$(`#${cont} .chip`).forEach(c=>c.classList.remove('on')); el.classList.add('on'); }
function guardarGasto(){
  const monto = Number($('#gMonto').value);
  if(!monto){ $('#gMonto').focus(); return; }
  const cat = $('#gCats .chip.on')?.dataset.cat || 'otros';
  S.finanzas.movs.push({id:uid(), monto, cat, nota:$('#gNota').value.trim(), fecha:hoy(), ts:Date.now()});
  save(); closeSheet(); render();
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

function sheetComida(){
  openSheet(`<h3>Registrar comida</h3>
    <label class="f">¿Cuál comida?</label>
    <div class="seg" id="cComida">
      <button class="on" data-c="desayuno" onclick="selSeg(this,'cComida')">🌅 Desayuno</button>
      <button data-c="almuerzo" onclick="selSeg(this,'cComida')">☀️ Almuerzo</button>
      <button data-c="cena" onclick="selSeg(this,'cComida')">🌙 Cena</button>
    </div>
    <label class="f">¿Qué comiste? (opcional)</label>
    <input class="in" id="cTexto" placeholder="ej. pechuga con arroz y ensalada">
    <div style="margin-top:16px"><button class="btn" onclick="guardarComidaLibre()">Guardar</button></div>`);
}
function selSeg(el,cont){ $$(`#${cont} button`).forEach(b=>b.classList.remove('on')); el.classList.add('on'); }
function guardarComidaLibre(){
  const comida = $('#cComida .on').dataset.c;
  S.comida.registros.push({id:uid(), comida, texto:$('#cTexto').value.trim(), fecha:hoy(), ts:Date.now()});
  save(); closeSheet(); render();
}
function registrarComida(comida, nombre){
  S.comida.registros.push({id:uid(), comida, texto:nombre, fecha:hoy(), ts:Date.now()});
  save(); render();
}
function borrarComida(id){ S.comida.registros = S.comida.registros.filter(r=>r.id!==id); save(); render(); }
function agua(d){
  const k = hoy(); S.comida.vasosAgua[k] = Math.max(0,(S.comida.vasosAgua[k]||0)+d); save(); render();
}

function sheetEntreno(){
  const diaHoy = DIAS[new Date().getDay()];
  openSheet(`<h3>Registrar entreno</h3>
    <label class="f">¿Qué entrenaste?</label>
    <input class="in" id="eNota" value="${esc(S.gym.rutina[diaHoy]||'')}" placeholder="ej. Pecho, tríceps y bíceps">
    <label class="f">Duración (minutos)</label>
    <input class="in" id="eDur" type="number" inputmode="numeric" value="90" placeholder="90">
    <label class="f">Intensidad</label>
    <div class="seg" id="eInt">
      <button data-i="suave" onclick="selSeg(this,'eInt')">Suave</button>
      <button class="on" data-i="normal" onclick="selSeg(this,'eInt')">Normal</button>
      <button data-i="fuerte" onclick="selSeg(this,'eInt')">Fuerte 🔥</button>
    </div>
    <div style="margin-top:16px"><button class="btn" onclick="guardarEntreno()">Guardar entreno</button></div>`);
}
function guardarEntreno(){
  const nota = $('#eNota').value.trim();
  const dur = Number($('#eDur').value)||0;
  const intensidad = $('#eInt .on').dataset.i;
  const existe = S.gym.entrenos.find(e=>e.fecha===hoy());
  if(existe) Object.assign(existe,{nota,duracion:dur,intensidad});
  else S.gym.entrenos.push({id:uid(), fecha:hoy(), nota, duracion:dur, intensidad, ts:Date.now()});
  save(); closeSheet(); render();
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

function sheetTarea(){
  openSheet(`<h3>Nueva tarea</h3>
    <label class="f">Título</label>
    <input class="in" id="tTit" placeholder="ej. Ensayo de historia">
    <label class="f">Materia</label>
    <input class="in" id="tMat" placeholder="ej. Historia">
    <label class="f">Fecha límite</label>
    <input class="in" id="tFec" type="date" value="${hoy()}">
    <div style="margin-top:16px"><button class="btn" onclick="guardarTarea()">Agregar tarea</button></div>`);
  setTimeout(()=>$('#tTit').focus(),100);
}
function guardarTarea(){
  const titulo = $('#tTit').value.trim(); if(!titulo) return;
  S.uni.tareas.push({id:uid(), titulo, materia:$('#tMat').value.trim(), fecha:$('#tFec').value, estado:'pend', ts:Date.now()});
  save(); closeSheet(); render();
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
      <option value="claude-haiku-4-5-20251001" ${S.ajustes.modelo==='claude-haiku-4-5-20251001'?'selected':''}>Haiku (rápido y barato)</option>
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
  p.pesoActual = Number($('#pPeso').value)||null;
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
  return `Perfil de ${p.nombre}: sexo ${p.sexo==='h'?'hombre':'mujer'}, ${p.edad} años, ${p.altura}cm, pesa ${p.pesoActual}kg, meta ${p.pesoMeta}kg (objetivo: ${p.objetivo}), actividad ${p.actividad}.
Nutrición calculada hoy: ${nut?`${nut.cal} kcal, ${nut.prot}g proteína, ${nut.carbs}g carbos, ${nut.grasa}g grasa. TDEE ~${nut.tdee}.`:'perfil incompleto'}
Entreno de hoy (${diaHoy}): ${S.gym.rutina[diaHoy]||'descanso'}. ${entrenoFuerteHoy()?'Ya entrenó fuerte hoy.':''}
Suplementos: ${S.gym.suplementos.map(s=>s.nombre).join(', ')||'ninguno'}.
DINERO — semanal ${money(S.finanzas.semanal)}, gastado esta semana ${money(gastoTotalSemana())}, le queda ${money(restanteSemana())}. Gastos hormiga semana: ${money(gastosSemana('hormiga'))}. Reparto sugerido: mandado ${money(rep.plan.mandado)}, inversión ${money(rep.plan.inversion)}, hormiga máx ${money(rep.plan.hormiga)}.
Gastos de hoy: ${gastosHoy.map(m=>`${money(m.monto)} (${m.nota||m.cat})`).join(', ')||'ninguno aún'}.
UNIVERSIDAD — tareas pendientes: ${pend.map(t=>`"${t.titulo}"${t.materia?' de '+t.materia:''}${t.fecha?' vence '+t.fecha:''}`).join('; ')||'ninguna'}.`;
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
  openSheet(`<h3>✦ Coach</h3>
    <p class="hint">Pregúntame lo que quieras sobre tu dinero, comida, gym o tareas. Ya conozco tus datos de hoy.</p>
    <div class="chips" style="margin:6px 0 12px">
      ${sugerencias.map(s=>`<button class="chip" onclick="usarSug(this)">${esc(s)}</button>`).join('')}
    </div>
    <textarea class="in" id="ckMsg" placeholder="Escribe tu pregunta…"></textarea>
    <div style="margin-top:12px"><button class="btn" id="ckSend" onclick="enviarCoach()">Preguntar ✦</button></div>
    <div id="ckResp" style="margin-top:16px"></div>`);
  setTimeout(()=>$('#ckMsg')?.focus(),100);
}
function guardarKeyCoach(){
  const k = $('#ckKey').value.trim();
  if(!k.startsWith('sk-ant')){ toast('Esa key no parece válida'); return; }
  S.ajustes.apiKey = k; save(); closeSheet(); openCoach();
}
function usarSug(el){ $('#ckMsg').value = el.textContent; $('#ckMsg').focus(); }

async function enviarCoach(){
  const msg = $('#ckMsg').value.trim(); if(!msg) return;
  const resp = $('#ckResp'); const btn = $('#ckSend');
  btn.disabled = true; btn.innerHTML = '<span class="spin"></span>';
  resp.innerHTML = `<div class="card"><span class="spin"></span> <span class="muted">El coach está pensando…</span></div>`;
  try{
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method:'POST',
      headers:{
        'content-type':'application/json',
        'x-api-key':S.ajustes.apiKey,
        'anthropic-version':'2023-06-01',
        'anthropic-dangerous-direct-browser-access':'true'
      },
      body: JSON.stringify({
        model: S.ajustes.modelo || 'claude-haiku-4-5-20251001',
        max_tokens: 900,
        system: `Eres el coach personal de ${S.perfil.nombre}, en su app de vida diaria. Hablas español mexicano, cercano y directo, lo tratas por su nombre. Das consejos concretos y accionables sobre dinero, comida/porciones, gym y tareas de la universidad, SIEMPRE usando los datos reales que te paso. Sé breve (máx ~180 palabras), con pasos claros y números concretos. No des consejo médico serio; si algo es de salud delicada, sugiere ver a un profesional.\n\nDATOS DE HOY:\n${contextoParaCoach()}`,
        messages:[{role:'user', content: msg}]
      })
    });
    const data = await r.json();
    if(data.error){ resp.innerHTML = `<div class="banner warn">Error: ${esc(data.error.message||'algo falló')}. Revisa tu API key en Ajustes.</div>`; }
    else {
      const txt = (data.content||[]).map(c=>c.text||'').join('\n').trim();
      resp.innerHTML = `<div class="card coachmsg">✦ ${esc(txt)}</div>`;
    }
  }catch(err){
    resp.innerHTML = `<div class="banner warn">No pude conectar. Revisa tu internet y tu API key. (${esc(String(err.message||err))})</div>`;
  }
  btn.disabled = false; btn.innerHTML = 'Preguntar ✦';
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

if('serviceWorker' in navigator){
  navigator.serviceWorker.register('sw.js').catch(()=>{});
}
render();
