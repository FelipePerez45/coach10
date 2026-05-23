// App principal Nutrición Coach10.

const D = window.NUTRICION_DATA;

const STATE = {
  tab: 'registro',
  tabla: { grupo: null, comida: null, query: '' },
  combo: { tipo_comida: 'desayuno', hidrato: '', proteina: '', grasa: '', vegetal: '' },
  combosFilter: null,
  combosSubtab: 'mis',
  sugerenciaComida: 'desayuno',
  compra: { start: null, end: null, bought: [] },
  sugerencias: [],
  editingComboKey: null,
  editingComboDraft: null,
  registroFecha: hoyISO(),
  registro: { agua_ml: 0, notas: '', meals: {}, dailyId: null },
  editingPlan: null,
  chartRangeDias: 14,
  chartActivo: null,
  chartInstance: null,
};

const $  = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));

// ============= Helpers ===========================================

// Devuelve la fecha local YYYY-MM-DD sin pasar por UTC para evitar saltos por zona horaria.
function hoyISO() {
  const d = new Date();
  return localISO(d);
}

function localISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function shiftDayISO(iso, delta) {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + delta);
  return localISO(date);
}

function formatFecha(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function formatFechaLarga(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  return new Intl.DateTimeFormat('es-ES', {
    weekday: 'long',
    day:     'numeric',
    month:   'long',
    year:    'numeric',
  }).format(d);
}

function alimentoById(id) {
  return D.ALIMENTOS.find(a => a.id === id);
}

function toast(msg, kind = 'ok') {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast' + (kind === 'error' ? ' error' : '');
  setTimeout(() => t.classList.add('hidden'), 2400);
}

function alimentosGrupo(grupo) {
  return D.ALIMENTOS.filter(a => a.grupo === grupo);
}

function comboKcal(combo) {
  if (!combo) return 0;
  let total = 0;
  for (const k of ['hidrato_id', 'proteina_id', 'grasa_id', 'vegetal_id']) {
    if (combo[k]) {
      const a = alimentoById(combo[k]);
      if (a && a.kcal) total += a.kcal;
    }
  }
  return total;
}

function comboMacros(combo) {
  const out = { p: 0, c: 0, f: 0 };
  if (!combo) return out;
  for (const k of ['hidrato_id', 'proteina_id', 'grasa_id', 'vegetal_id']) {
    if (combo[k]) {
      const a = alimentoById(combo[k]);
      if (a) { out.p += a.p_g || 0; out.c += a.c_g || 0; out.f += a.f_g || 0; }
    }
  }
  return out;
}

function fruitsKcal(n) { return (n || 0) * D.NORMAS_DIARIAS.kcal_por_pieza_fruta; }
function fruitsMacros(n) {
  return {
    p: (n || 0) * D.NORMAS_DIARIAS.p_por_pieza_fruta,
    c: (n || 0) * D.NORMAS_DIARIAS.c_por_pieza_fruta,
    f: (n || 0) * D.NORMAS_DIARIAS.f_por_pieza_fruta,
  };
}

function mealMacros(meal) {
  // Si "comí otra cosa" con alimentos seleccionados, sumamos esos
  if (meal.comido_segun_plan === 0 && Array.isArray(meal.alternativa_foods) && meal.alternativa_foods.length) {
    const out = { p: 0, c: 0, f: 0 };
    for (const fid of meal.alternativa_foods) {
      const a = alimentoById(fid);
      if (a) { out.p += a.p_g || 0; out.c += a.c_g || 0; out.f += a.f_g || 0; }
    }
    const fm = fruitsMacros(meal.frutas_ud);
    return { p: out.p + fm.p, c: out.c + fm.c, f: out.f + fm.f };
  }
  let base = meal.snapshot || null;
  if (!base && meal.combo_id) base = DB.listCombos().find(c => c.id == meal.combo_id) || null;
  const m = comboMacros(base);
  const fm = fruitsMacros(meal.frutas_ud);
  return { p: m.p + fm.p, c: m.c + fm.c, f: m.f + fm.f };
}

// Para el cálculo de calorías de una comida ya registrada:
//   - si "comí otra cosa" con alimentos elegidos: suma esos alimentos + frutas
//   - si no, prioriza snapshot guardado (lo que realmente comiste)
//   - si no, usa el combo actual referenciado por combo_id
//   - siempre suma las kcal medias de las piezas de fruta
function mealAutoKcal(meal) {
  if (meal.comido_segun_plan === 0 && Array.isArray(meal.alternativa_foods) && meal.alternativa_foods.length) {
    const k = meal.alternativa_foods.reduce((sum, fid) => {
      const a = alimentoById(fid);
      return sum + (a?.kcal || 0);
    }, 0);
    return k + fruitsKcal(meal.frutas_ud);
  }
  let base = meal.snapshot || null;
  if (!base && meal.combo_id) {
    base = DB.listCombos().find(c => c.id == meal.combo_id) || null;
  }
  return comboKcal(base) + fruitsKcal(meal.frutas_ud);
}

// Calcula totales del día sumando los meal_logs reales (más fiable que el cache).
// Si una meal no tiene kcal_estimadas explícitas, computa al vuelo desde snapshot/combo/frutas.
function dayTotals(dailyLog) {
  const meals = DB.listMealLogs(dailyLog.id).map(m => {
    let snapshot = null;
    if (m.combo_snapshot) { try { snapshot = JSON.parse(m.combo_snapshot); } catch (e) {} }
    return { ...m, snapshot };
  });
  let kcal = 0, frutas = 0, p = 0, c = 0, f = 0;
  for (const m of meals) {
    frutas += m.frutas_ud || 0;
    const k = m.kcal_estimadas != null ? m.kcal_estimadas : mealAutoKcal(m);
    kcal += k;
    const macros = mealMacros(m);
    p += macros.p; c += macros.c; f += macros.f;
  }
  return {
    agua_ml:   dailyLog.agua_ml || 0,
    frutas_ud: frutas,
    kcal,
    p: Math.round(p),
    c: Math.round(c),
    f: Math.round(f),
  };
}

function renderComboPreview(combo) {
  if (!combo) return '';
  const items = [combo.hidrato_id, combo.proteina_id, combo.grasa_id, combo.vegetal_id]
    .filter(Boolean).map(alimentoById).filter(Boolean);
  if (!items.length) return '';
  const k = comboKcal(combo);
  const m = comboMacros(combo);
  return `
    <div class="combo-preview">
      <div class="snap-label">Contiene · 🔥 ${k} kcal · P${m.p} C${m.c} F${m.f}</div>
      <ul class="snap-items">
        ${items.map(a => `<li><span>${a.nombre}</span><span class="qty">${a.cantidad}${a.unidad}</span></li>`).join('')}
      </ul>
    </div>
  `;
}

function buildSnapshot(combo) {
  if (!combo) return null;
  return {
    nombre:      combo.nombre || null,
    tipo_comida: combo.tipo_comida,
    hidrato_id:  combo.hidrato_id || null,
    proteina_id: combo.proteina_id || null,
    grasa_id:    combo.grasa_id || null,
    vegetal_id:  combo.vegetal_id || null,
  };
}

// ============= Tabs ==============================================

function goTab(tab) {
  STATE.tab = tab;
  $$('.tab-panel').forEach(p => p.classList.toggle('hidden', p.dataset.tab !== tab));
  $$('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.go === tab));
  window.scrollTo({ top: 0, behavior: 'instant' });

  // Botón Guardar flotante visible sólo en Registro
  $('#btn-guardar-dia').classList.toggle('hidden', tab !== 'registro');

  if (tab === 'tabla')       renderTabla();
  if (tab === 'combos')      renderCombos();
  if (tab === 'registro')    renderRegistro();
  if (tab === 'historial')   renderHistorial();
  if (tab === 'semana')      renderSemana();
  if (tab === 'compra')      renderCompra();
}

// ============= TABLA =============================================

function renderTablaChips() {
  const gWrap = $('#chips-grupo');
  gWrap.innerHTML = '';
  gWrap.appendChild(chipEl('Todos', null, 'grupo', STATE.tabla.grupo === null));
  D.GRUPOS.forEach(g => {
    const c = chipEl(`${g.icono} ${g.nombre}`, g.id, 'grupo', STATE.tabla.grupo === g.id);
    c.dataset.grupo = g.id;
    gWrap.appendChild(c);
  });
  gWrap.onclick = e => {
    const c = e.target.closest('.chip');
    if (!c) return;
    STATE.tabla.grupo = c.dataset.value || null;
    renderTabla();
  };

  const cWrap = $('#chips-comida');
  cWrap.innerHTML = '';
  cWrap.appendChild(chipEl('Todas las comidas', null, 'comida', STATE.tabla.comida === null));
  D.COMIDAS.forEach(c => {
    cWrap.appendChild(chipEl(`${c.icono} ${c.nombre}`, c.id, 'comida', STATE.tabla.comida === c.id));
  });
  cWrap.onclick = e => {
    const c = e.target.closest('.chip');
    if (!c) return;
    STATE.tabla.comida = c.dataset.value || null;
    renderTabla();
  };
}

function chipEl(label, value, kind, active) {
  const b = document.createElement('button');
  b.className = 'chip' + (active ? ' active' : '');
  b.textContent = label;
  if (value) b.dataset.value = value;
  b.dataset.kind = kind;
  return b;
}

function expandQueryToIds(query) {
  if (!query) return null;
  const q = query.toLowerCase().trim();
  if (!q) return null;
  const ids = new Set();
  let grupoForzado = null;

  for (const [k, v] of Object.entries(D.SINONIMOS)) {
    if (q.includes(k)) {
      if (typeof v === 'string' && v.startsWith('grupo:')) {
        grupoForzado = v.split(':')[1];
      } else if (Array.isArray(v)) {
        v.forEach(id => ids.add(id));
      }
    }
  }
  return { ids, grupoForzado, q };
}

function filtrarAlimentos() {
  const { grupo, comida, query } = STATE.tabla;
  let lista = D.ALIMENTOS;

  if (comida === 'desayuno' || comida === 'merienda') {
    lista = lista.filter(a => a.grupo !== 'vegetal');
  }

  const expanded = expandQueryToIds(query);
  if (expanded) {
    const { ids, grupoForzado, q } = expanded;
    lista = lista.filter(a => {
      if (grupoForzado && a.grupo === grupoForzado) return true;
      if (ids.size && ids.has(a.id)) return true;
      if (a.nombre.toLowerCase().includes(q)) return true;
      if (a.tags && a.tags.some(t => t.includes(q))) return true;
      return false;
    });
  }

  if (grupo) lista = lista.filter(a => a.grupo === grupo);

  return lista;
}

function tablaTieneFiltro() {
  const t = STATE.tabla;
  return !!(t.grupo || t.comida || (t.query && t.query.trim()));
}

function renderTabla() {
  renderTablaChips();
  const cont = $('#food-list');
  cont.innerHTML = '';

  if (!tablaTieneFiltro()) {
    $('#results-count').textContent = '';
    cont.innerHTML = `<div class="tabla-empty-hint">
      🔍 Pulsa un grupo, una comida o escribe para ver el listado.<br>
      Mientras tanto, abajo tienes <strong>recomendaciones, FAQs, equivalencias y frecuencias</strong>.
    </div>`;
  } else {
    const lista = filtrarAlimentos();
    $('#results-count').textContent = `${lista.length} alimento${lista.length === 1 ? '' : 's'}`;
    if (!lista.length) {
      cont.innerHTML = '<div class="empty-state">Sin resultados.<br>Prueba con: <em>pescado</em>, <em>fruta</em>, <em>rápido</em>…</div>';
    } else {
      const ordenGrupo = { hidrato: 1, proteina: 2, grasa: 3, vegetal: 4, fruta: 5 };
      lista.sort((a, b) => ordenGrupo[a.grupo] - ordenGrupo[b.grupo]);
      lista.forEach(a => cont.appendChild(foodCard(a)));
    }
  }

  renderTablaInfoBlocks();
}

function foodCard(a) {
  const card = document.createElement('div');
  card.className = 'food-card';
  const hasMacros = a.p_g != null || a.c_g != null || a.f_g != null;
  card.innerHTML = `
    <div class="food-qty">${a.cantidad}<small>${a.unidad}</small></div>
    <div class="food-meta">
      <div class="food-name">${a.nombre}</div>
      <span class="food-group-tag tag-${a.grupo}">${D.GRUPOS.find(g => g.id === a.grupo).nombre}</span>
      ${a.kcal ? `<span class="food-group-tag" style="background:rgba(255,149,0,.16);color:var(--warn);margin-left:6px;">~${a.kcal} kcal</span>` : ''}
      ${hasMacros ? `<div class="food-macros"><span><span class="pp">${a.p_g}g</span> P</span><span><span class="cc">${a.c_g}g</span> C</span><span><span class="ff">${a.f_g}g</span> F</span></div>` : ''}
      ${a.extra ? `<div class="food-extra">${a.extra}</div>` : ''}
    </div>
  `;
  return card;
}

function renderTablaInfoBlocks() {
  $('#info-equivalencias').innerHTML = `
    <table>
      <thead><tr><th>Alimento</th><th>En seco</th><th>Cocido</th></tr></thead>
      <tbody>${D.EQUIVALENCIAS_COCIDO.map(e =>
        `<tr><td>${e.alimento}</td><td>${e.seco}</td><td>${e.cocido}</td></tr>`).join('')}
      </tbody>
    </table>`;

  $('#info-legumbres').innerHTML = D.LEGUMBRES.map(l => `
    <div style="margin-bottom:12px;">
      <strong>${l.base}</strong>
      <ul style="margin-top:6px;">
        ${l.equivale.map(pair => `<li>${pair[0]} + ${pair[1]}</li>`).join('')}
      </ul>
    </div>`).join('');

  $('#info-frutas').innerHTML = `
    <p style="margin-top:0;">${D.NORMAS_DIARIAS.notas_fruta}</p>
    <ul>${D.FRUTAS.map(f => `<li><strong>${f.cantidad}${f.unidad}</strong> ${f.nombre} <em style="color:var(--warn);">~${f.kcal} kcal</em></li>`).join('')}</ul>`;

  $('#info-frecuencias').innerHTML = `
    <table>
      <thead><tr><th>Nutriente</th><th>Alimento</th><th>Frecuencia</th></tr></thead>
      <tbody>${D.FRECUENCIAS_SEMANALES.map(f =>
        `<tr><td>${f.nutriente}</td><td>${f.alimento}</td><td><strong>${f.frecuencia}</strong></td></tr>`).join('')}
      </tbody>
    </table>
    <p style="margin-top:10px;">💧 Mínimo <strong>${D.NORMAS_DIARIAS.agua_litros_min} L</strong> de agua al día · 🍓 <strong>${D.NORMAS_DIARIAS.frutas_piezas} piezas</strong> de fruta al día.</p>`;

  $('#info-recomendaciones').innerHTML = `<ul>${D.RECOMENDACIONES.map(r => `<li>${r}</li>`).join('')}</ul>`;

  $('#info-consejos').innerHTML = D.CONSEJOS.map(c => `
    <div class="faq-item">
      <div class="faq-q">${c.titulo}</div>
      <div>${c.texto}</div>
    </div>`).join('');

  $('#info-faqs').innerHTML = D.FAQS.map(f => `
    <div class="faq-item">
      <div class="faq-q">${f.pregunta}</div>
      <div>${f.respuesta}</div>
    </div>`).join('');
}

// ============= COMBINAR ==========================================

function renderCombinar() {
  const cWrap = $('#combo-comida-chips');
  cWrap.innerHTML = '';
  D.COMIDAS.forEach(c => {
    cWrap.appendChild(chipEl(`${c.icono} ${c.nombre}`, c.id, 'comida-combo', STATE.combo.tipo_comida === c.id));
  });
  cWrap.onclick = e => {
    const c = e.target.closest('.chip');
    if (!c) return;
    STATE.combo.tipo_comida = c.dataset.value;
    renderCombinar();
  };

  fillSelect($('select[data-slot="hidrato"]'),  alimentosGrupo('hidrato'),  STATE.combo.hidrato);
  fillSelect($('select[data-slot="proteina"]'), alimentosGrupo('proteina'), STATE.combo.proteina);
  fillSelect($('select[data-slot="grasa"]'),    alimentosGrupo('grasa'),    STATE.combo.grasa);
  fillSelect($('select[data-slot="vegetal"]'),  alimentosGrupo('vegetal'),  STATE.combo.vegetal, true);

  const comida = D.COMIDAS.find(c => c.id === STATE.combo.tipo_comida);
  $('#slot-vegetal-wrap').classList.toggle('hidden', !comida.lleva_vegetales);

  $$('.combo-slot select').forEach(sel => {
    sel.onchange = () => { STATE.combo[sel.dataset.slot] = sel.value; };
  });

  renderCombosList();
}

function fillSelect(sel, items, valor, opcional = false) {
  sel.innerHTML = '';
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = opcional ? '— Sin seleccionar —' : '— Elige —';
  sel.appendChild(placeholder);
  items.forEach(a => {
    const o = document.createElement('option');
    o.value = a.id;
    o.textContent = `${a.cantidad}${a.unidad} · ${a.nombre}${a.kcal ? ` (~${a.kcal} kcal)` : ''}`;
    sel.appendChild(o);
  });
  sel.value = valor || '';
}

async function guardarCombo() {
  const c = STATE.combo;
  if (!c.hidrato || !c.proteina || !c.grasa) {
    toast('Falta elegir hidrato, proteína y grasa.', 'error');
    return;
  }
  const nombre = $('#combo-nombre').value.trim();
  const notas  = $('#combo-notas').value.trim();
  await DB.createCombo({
    nombre: nombre || null,
    tipo_comida: c.tipo_comida,
    hidrato_id: c.hidrato,
    proteina_id: c.proteina,
    grasa_id: c.grasa,
    vegetal_id: c.vegetal || null,
    notas: notas || null,
    origen: 'usuario',
  });
  toast('Combo guardado ✓');
  $('#combo-nombre').value = '';
  $('#combo-notas').value = '';
  STATE.combo = { tipo_comida: c.tipo_comida, hidrato: '', proteina: '', grasa: '', vegetal: '' };
  renderCombinar();
}

function combinarAleatorio() {
  const c = STATE.combo;
  const pick = arr => arr[Math.floor(Math.random() * arr.length)].id;
  c.hidrato  = pick(alimentosGrupo('hidrato'));
  c.proteina = pick(alimentosGrupo('proteina'));
  c.grasa    = pick(alimentosGrupo('grasa'));
  const comida = D.COMIDAS.find(x => x.id === c.tipo_comida);
  c.vegetal = comida.lleva_vegetales ? pick(alimentosGrupo('vegetal')) : '';
  renderCombinar();
}

// ----- Combos guardados ------------------------------------------

function renderCombosList() {
  const wrap = $('#combos-comida-filter');
  wrap.innerHTML = '';
  wrap.appendChild(chipEl('Todos', null, 'combos-filter', STATE.combosFilter === null));
  D.COMIDAS.forEach(c => {
    wrap.appendChild(chipEl(`${c.icono} ${c.nombre}`, c.id, 'combos-filter', STATE.combosFilter === c.id));
  });
  wrap.onclick = e => {
    const c = e.target.closest('.chip');
    if (!c) return;
    STATE.combosFilter = c.dataset.value || null;
    renderCombosList();
  };

  const filtro = STATE.combosFilter ? { tipo_comida: STATE.combosFilter } : {};
  const combos = DB.listCombos(filtro);
  const cont = $('#combos-list');
  cont.innerHTML = '';
  if (!combos.length) {
    cont.innerHTML = '<div class="empty-state">Aún no hay combos guardados.</div>';
    return;
  }
  combos.forEach(c => cont.appendChild(comboCard(c, 'db')));
}

function comboKey(c, source, idx) {
  return source === 'sug' ? `sug:${idx}` : `db:${c.id}`;
}

function comboCard(c, source, idx = null) {
  const key = comboKey(c, source, idx);
  if (STATE.editingComboKey === key) {
    return comboCardEdit(c, source, idx, key);
  }
  return comboCardView(c, source, idx, key);
}

function startEditingCombo(c, key) {
  STATE.editingComboKey = key;
  STATE.editingComboDraft = {
    nombre:      c.nombre || '',
    tipo_comida: c.tipo_comida,
    hidrato_id:  c.hidrato_id  || '',
    proteina_id: c.proteina_id || '',
    grasa_id:    c.grasa_id    || '',
    vegetal_id:  c.vegetal_id  || '',
    notas:       c.notas || '',
  };
}

function cancelEditingCombo() {
  STATE.editingComboKey = null;
  STATE.editingComboDraft = null;
}

function comboCardView(c, source, idx, key) {
  const card = document.createElement('div');
  card.className = 'combo-card';
  card.dataset.id = c.id;
  const comida = D.COMIDAS.find(x => x.id === c.tipo_comida);
  const items = [
    ['hidrato',  c.hidrato_id],
    ['proteína', c.proteina_id],
    ['grasa',    c.grasa_id],
    ['vegetal',  c.vegetal_id],
  ].filter(([_, id]) => id);

  const fb = source === 'db' ? DB.getFeedback(c.id) : [];
  const mediaGusto = fb.length ? (fb.reduce((s, x) => s + (x.gusto || 0), 0) / fb.length).toFixed(1) : null;
  const kcal = comboKcal(c);
  const macros = comboMacros(c);

  card.innerHTML = `
    <div class="combo-head">
      <div>
        <div class="combo-title">${c.nombre || (comida ? comida.nombre : 'Combo')}</div>
        <div class="combo-meta">${comida ? `${comida.icono} ${comida.nombre}` : ''}${c.origen === 'sugerencia' ? ' · 🎲 sugerido' : ''}${mediaGusto ? ` · ★ ${mediaGusto}` : ''} · 🔥 ~${kcal} kcal · P${macros.p} C${macros.c} F${macros.f}</div>
      </div>
      <span class="combo-tag" style="background:${comida ? '#00d4ff' : '#666'};">${comida ? comida.nombre : ''}</span>
    </div>
    <div class="combo-items">
      ${items.map(([k, id]) => {
        const a = alimentoById(id);
        return `<div class="item-line"><span>${a ? a.nombre : '—'}</span><span class="qty">${a ? a.cantidad + a.unidad : ''}</span></div>`;
      }).join('')}
    </div>
    ${c.notas ? `<div class="combo-meta">📝 ${c.notas}</div>` : ''}
    ${source === 'db' ? `
      <div class="combo-actions">
        <button data-action="edit">✏️ Editar</button>
        <button data-action="feedback">Valorar</button>
        <button data-action="delete" class="danger">Eliminar</button>
      </div>
      <div class="feedback-block hidden" data-feedback>
        <div class="rating-row"><label>Me gustó</label><div class="stars" data-rating="gusto"></div></div>
        <div class="rating-row"><label>Cómodo</label><div class="stars" data-rating="comodidad"></div></div>
        <textarea placeholder="Comentario (opcional)…" rows="2" data-fb-text></textarea>
        <button class="btn primary block" data-action="save-feedback" style="margin-top:8px;">Guardar valoración</button>
      </div>
    ` : `
      <div class="combo-actions">
        <button data-action="edit">✏️ Editar</button>
        <button data-action="use-combo">Cargar en Combinar</button>
        <button data-action="save-sug">Guardar</button>
      </div>
    `}
  `;

  card.querySelector('[data-action="edit"]').onclick = () => {
    startEditingCombo(c, key);
    refreshCardList(source);
  };

  if (source === 'db') {
    card.querySelector('[data-action="feedback"]').onclick = () => {
      card.querySelector('[data-feedback]').classList.toggle('hidden');
    };
    card.querySelector('[data-action="delete"]').onclick = async () => {
      if (!confirm('¿Eliminar este combo?')) return;
      await DB.deleteCombo(c.id);
      toast('Eliminado');
      renderCombosList();
    };
    setupStars(card.querySelector('[data-rating="gusto"]'),     'gusto', card);
    setupStars(card.querySelector('[data-rating="comodidad"]'), 'comodidad', card);
    card.querySelector('[data-action="save-feedback"]').onclick = async () => {
      await DB.addFeedback(
        c.id,
        Number(card.dataset.gusto || 0) || null,
        Number(card.dataset.comodidad || 0) || null,
        card.querySelector('[data-fb-text]').value.trim() || null
      );
      toast('Valoración guardada');
      renderCombosList();
    };
  } else {
    card.querySelector('[data-action="use-combo"]').onclick = () => {
      Object.assign(STATE.combo, {
        tipo_comida: c.tipo_comida,
        hidrato:  c.hidrato_id,
        proteina: c.proteina_id,
        grasa:    c.grasa_id,
        vegetal:  c.vegetal_id || '',
      });
      goTab('combinar');
      toast('Cargado en Combinar');
    };
    card.querySelector('[data-action="save-sug"]').onclick = async () => {
      await DB.createCombo({
        nombre: c.nombre || null,
        tipo_comida: c.tipo_comida,
        hidrato_id: c.hidrato_id,
        proteina_id: c.proteina_id,
        grasa_id: c.grasa_id,
        vegetal_id: c.vegetal_id || null,
        origen: 'sugerencia',
      });
      toast('Guardado en tus combos');
    };
  }

  return card;
}

function comboCardEdit(c, source, idx, key) {
  const draft = STATE.editingComboDraft;
  const comida = D.COMIDAS.find(x => x.id === draft.tipo_comida);
  const card = document.createElement('div');
  card.className = 'combo-card editing';

  const slot = (label, slotKey, items, valor, opcional = false) => `
    <div class="edit-slot">
      <div class="slot-label">${label}</div>
      <select data-slot="${slotKey}">
        <option value="">${opcional ? '— Sin seleccionar —' : '— Elige —'}</option>
        ${items.map(a => `<option value="${a.id}" ${a.id === valor ? 'selected' : ''}>${a.cantidad}${a.unidad} · ${a.nombre}${a.kcal ? ` (~${a.kcal} kcal)` : ''}</option>`).join('')}
      </select>
    </div>
  `;

  card.innerHTML = `
    <div class="combo-head">
      <div>
        <div class="combo-title">✏️ Editando combo</div>
        <div class="combo-meta">${comida.icono} ${comida.nombre} · ${source === 'sug' ? '🎲 sugerencia' : 'guardado'}</div>
      </div>
    </div>

    <div class="form-row">
      <label>Nombre</label>
      <input type="text" data-edit="nombre" value="${(draft.nombre || '').replace(/"/g, '&quot;')}" placeholder="Opcional">
    </div>

    ${slot('🌾 Hidrato',  'hidrato_id',  alimentosGrupo('hidrato'),  draft.hidrato_id)}
    ${slot('🍗 Proteína', 'proteina_id', alimentosGrupo('proteina'), draft.proteina_id)}
    ${slot('🥑 Grasa',    'grasa_id',    alimentosGrupo('grasa'),    draft.grasa_id)}
    ${comida.lleva_vegetales ? slot('🥦 Vegetal', 'vegetal_id', alimentosGrupo('vegetal'), draft.vegetal_id, true) : ''}

    <div class="form-row">
      <label>Notas</label>
      <textarea rows="2" data-edit="notas" placeholder="Opcional">${draft.notas || ''}</textarea>
    </div>

    <div class="kcal-preview">🔥 ~<span data-edit-kcal>${comboKcal(draft)}</span> kcal</div>

    <div class="combo-actions">
      <button class="btn primary" data-action="save-edit">${source === 'db' ? 'Guardar cambios' : 'Aplicar'}</button>
      <button class="btn ghost" data-action="cancel-edit">Cancelar</button>
    </div>
  `;

  // Bindings de selects + inputs
  card.querySelector('[data-edit="nombre"]').oninput = e => { draft.nombre = e.target.value; };
  card.querySelector('[data-edit="notas"]').oninput  = e => { draft.notas = e.target.value; };
  card.querySelectorAll('select[data-slot]').forEach(sel => {
    sel.onchange = () => {
      draft[sel.dataset.slot] = sel.value || null;
      card.querySelector('[data-edit-kcal]').textContent = comboKcal(draft);
    };
  });

  card.querySelector('[data-action="cancel-edit"]').onclick = () => {
    cancelEditingCombo();
    refreshCardList(source);
  };

  card.querySelector('[data-action="save-edit"]').onclick = async () => {
    if (!draft.hidrato_id || !draft.proteina_id || !draft.grasa_id) {
      toast('Falta elegir hidrato, proteína y grasa.', 'error');
      return;
    }
    if (source === 'db') {
      await DB.updateCombo({ ...draft, id: c.id });
      toast('Combo actualizado ✓');
      cancelEditingCombo();
      renderCombosList();
    } else {
      STATE.sugerencias[idx] = {
        ...STATE.sugerencias[idx],
        nombre:      draft.nombre || null,
        hidrato_id:  draft.hidrato_id,
        proteina_id: draft.proteina_id,
        grasa_id:    draft.grasa_id,
        vegetal_id:  draft.vegetal_id || null,
        notas:       draft.notas || null,
      };
      toast('Sugerencia actualizada');
      cancelEditingCombo();
      renderSugerenciasList();
    }
  };

  return card;
}

function refreshCardList(source) {
  if (source === 'db') renderCombosList();
  else renderSugerenciasList();
}

function setupStars(container, key, card) {
  container.innerHTML = '';
  for (let i = 1; i <= 5; i++) {
    const b = document.createElement('button');
    b.className = 'star';
    b.textContent = '★';
    b.dataset.value = i;
    b.onclick = () => {
      card.dataset[key] = i;
      Array.from(container.children).forEach((c, idx) => c.classList.toggle('on', idx < i));
    };
    container.appendChild(b);
  }
}

// ============= COMBOS (Mis combos + Sugerir) =====================

function renderCombos() {
  $$('#combos-subtab .chip').forEach(c =>
    c.classList.toggle('active', c.dataset.subtab === STATE.combosSubtab));
  $('#combos-mis').classList.toggle('hidden',    STATE.combosSubtab !== 'mis');
  $('#combos-sugerir').classList.toggle('hidden', STATE.combosSubtab !== 'sugerir');
  if (STATE.combosSubtab === 'mis') renderCombinar();
  else renderSugerencias();
}

// ============= SUGERENCIAS =======================================

function renderSugerencias() {
  const wrap = $('#sug-comida-chips');
  wrap.innerHTML = '';
  D.COMIDAS.forEach(c => {
    wrap.appendChild(chipEl(`${c.icono} ${c.nombre}`, c.id, 'sug-comida', STATE.sugerenciaComida === c.id));
  });
  wrap.onclick = e => {
    const c = e.target.closest('.chip');
    if (!c) return;
    STATE.sugerenciaComida = c.dataset.value;
    renderSugerencias();
  };
  renderSugerenciasList();
}

function generarSugerencias() {
  const tipo = STATE.sugerenciaComida;
  const comida = D.COMIDAS.find(c => c.id === tipo);
  const N = 5;
  const usedH = new Set(), usedP = new Set(), usedG = new Set(), usedV = new Set();
  const pickUnique = (arr, used) => {
    const disponibles = arr.filter(a => !used.has(a.id));
    const pool = disponibles.length ? disponibles : arr;
    const item = pool[Math.floor(Math.random() * pool.length)];
    used.add(item.id);
    return item;
  };

  const combos = [];
  for (let i = 0; i < N; i++) {
    const h = pickUnique(alimentosGrupo('hidrato'), usedH);
    const p = pickUnique(alimentosGrupo('proteina'), usedP);
    const g = pickUnique(alimentosGrupo('grasa'), usedG);
    const v = comida.lleva_vegetales ? pickUnique(alimentosGrupo('vegetal'), usedV) : null;
    combos.push({
      id: 'sug-' + i,
      nombre: null,
      tipo_comida: tipo,
      hidrato_id:  h.id,
      proteina_id: p.id,
      grasa_id:    g.id,
      vegetal_id:  v ? v.id : null,
      origen: 'sugerencia',
    });
  }

  STATE.sugerencias = combos;
  cancelEditingCombo();
  renderSugerenciasList();
}

function renderSugerenciasList() {
  const cont = $('#sugerencias-list');
  cont.innerHTML = '';
  if (!STATE.sugerencias.length) {
    cont.innerHTML = '<div class="empty-state">Pulsa <strong>🎲 Generar</strong> para obtener 5 combinaciones.</div>';
    return;
  }
  STATE.sugerencias.forEach((c, i) => cont.appendChild(comboCard(c, 'sug', i)));
}

// ============= REGISTRO ==========================================

function renderRegistro() {
  $('#registro-fecha').value = STATE.registroFecha;
  $('#date-pretty').textContent = formatFechaLarga(STATE.registroFecha);

  // Banner día pasado
  const banner = $('#past-day-banner');
  if (STATE.registroFecha < hoyISO()) {
    banner.classList.remove('hidden');
    banner.innerHTML = '📝 Estás editando un día pasado — puedes añadir notas o ajustar valores.';
  } else if (STATE.registroFecha > hoyISO()) {
    banner.classList.remove('hidden');
    banner.innerHTML = '⏭️ Día futuro — puedes pre-planificar pero no se considera consumido aún.';
  } else {
    banner.classList.add('hidden');
  }

  cargarRegistroFecha();
  renderPlanActiveBanner();
  renderPlanApplySection();

  // Botón guardar flotante
  $('#btn-guardar-dia').textContent = STATE.registroFecha < hoyISO() ? 'Guardar cambios' : 'Guardar día';
  $('#btn-guardar-dia').classList.remove('hidden');
}

function renderPlanActiveBanner() {
  const b = $('#plan-active-banner');
  const ap = STATE.registro.activePlan;
  if (!ap) { b.classList.add('hidden'); return; }
  b.classList.remove('hidden');
  b.innerHTML = `
    <div>
      📋 <strong>${ap.plan_nombre}</strong> — Día <strong>${ap.dia_num}</strong> de ${ap.dias_count}
      <div class="meta" style="font-size:11px;color:var(--text-soft);">Aplicado desde ${formatFecha(ap.start_date)}</div>
    </div>
    <button class="text-btn" id="btn-plan-detach">Quitar</button>
  `;
  $('#btn-plan-detach').onclick = async () => {
    if (!confirm('¿Quitar este plan asignado? (Los registros ya guardados no se borran.)')) return;
    await DB.deletePlanApplication(ap.id);
    toast('Plan desasignado');
    renderRegistro();
  };
}

function renderPlanApplySection() {
  const body = $('#plan-apply-body');
  const plans = DB.listPlans();
  const apps  = DB.listPlanApplications();

  body.innerHTML = `
    ${apps.length ? `
      <div style="margin-bottom:12px;">
        <div class="hint" style="margin-bottom:4px;">Asignados:</div>
        ${apps.map(a => `
          <div class="applied-plan-item">
            <div>
              <strong>${a.plan_nombre}</strong>
              <div class="meta">${formatFecha(a.start_date)} → ${formatFecha(a.end_date)} · ${a.dias_count} días</div>
            </div>
            <button class="btn ghost danger" data-app-id="${a.id}">Quitar</button>
          </div>
        `).join('')}
      </div>
    ` : ''}

    ${plans.length ? (() => {
      const minDate = hoyISO();
      const defaultDate = STATE.registroFecha >= minDate ? STATE.registroFecha : minDate;
      return `
      <div class="plan-apply-row">
        <select id="plan-apply-select">
          <option value="">— Elige un plan —</option>
          ${plans.map(p => `<option value="${p.id}">${p.nombre} (${p.dias_count} días)</option>`).join('')}
        </select>
      </div>
      <div class="plan-apply-row">
        <input type="date" id="plan-apply-start" value="${defaultDate}" min="${minDate}">
        <button class="btn primary" id="btn-apply-plan">Aplicar</button>
      </div>
      <p class="hint" style="margin-top:6px;">Sólo se puede aplicar desde hoy en adelante.</p>
      `;
    })() : `<p class="hint">Aún no tienes planes. Crea uno en la pestaña <strong>📆 Semana</strong>.</p>`}
  `;

  $$('[data-app-id]').forEach(b => b.onclick = async () => {
    if (!confirm('¿Quitar esta asignación?')) return;
    await DB.deletePlanApplication(Number(b.dataset.appId));
    toast('Quitado');
    renderPlanApplySection();
    renderRegistro();
  });

  const applyBtn = $('#btn-apply-plan');
  if (applyBtn) applyBtn.onclick = async () => {
    const planId = Number($('#plan-apply-select').value);
    const start  = $('#plan-apply-start').value;
    if (!planId || !start) { toast('Elige plan y fecha', 'error'); return; }
    if (start < hoyISO()) { toast('No puedes aplicar a fechas pasadas', 'error'); return; }
    // Comprobar si ya hay un plan que cubra la fecha de inicio (o se solapará)
    const existing = DB.getActivePlanForDate(start);
    if (existing) {
      if (!confirm(`La fecha ${formatFecha(start)} ya está cubierta por el plan "${existing.plan_nombre}" (${formatFecha(existing.start_date)} → ${formatFecha(existing.end_date)}).\n\n¿Sobreescribir? El plan anterior se eliminará.`)) return;
      await DB.deletePlanApplication(existing.id);
    }
    await DB.applyPlanToDate(planId, start);
    toast('Plan aplicado ✓');
    renderRegistro();
  };
}

function cargarRegistroFecha() {
  const fecha = STATE.registroFecha;
  const log = DB.getDailyLog(fecha);
  STATE.registro = {
    agua_ml: log ? log.agua_ml : 0,
    notas:   log ? (log.notas || '') : '',
    meals:   {},
    dailyId: log ? log.id : null,
    activePlan: null,
  };
  if (log) {
    DB.listMealLogs(log.id).forEach(m => {
      let snapshot = null;
      if (m.combo_snapshot) {
        try { snapshot = JSON.parse(m.combo_snapshot); } catch (e) { snapshot = null; }
      }
      let altFoods = [];
      if (m.alternativa_foods_json) {
        try { altFoods = JSON.parse(m.alternativa_foods_json) || []; } catch (e) { altFoods = []; }
      }
      STATE.registro.meals[m.tipo_comida] = {
        ...m,
        snapshot,
        alternativa_foods: altFoods,
        original_combo_id: m.combo_id,
      };
    });
  }

  // Pre-fill desde plan activo (sólo si esa comida no tenía combo asignado todavía)
  const activePlan = DB.getActivePlanForDate(fecha);
  STATE.registro.activePlan = activePlan;
  if (activePlan && activePlan.plan_meals) {
    const diaSlots = activePlan.plan_meals[String(activePlan.dia_num)] || {};
    D.COMIDAS.forEach(co => {
      const planComboId = diaSlots[co.id];
      if (!planComboId) return;
      const existing = STATE.registro.meals[co.id];
      if (existing && existing.combo_id) return;  // ya tiene combo, no sobrescribir
      if (!existing) STATE.registro.meals[co.id] = { frutas_ud: 0 };
      STATE.registro.meals[co.id].combo_id = planComboId;
      STATE.registro.meals[co.id]._planSuggested = true;
    });
  }

  $('#dia-notas').value = STATE.registro.notas;
  renderWeightCard();
  renderAgua();
  renderMeals();
  renderDayKcal();
  renderDayFruits();
}

// ----- Peso ------------------------------------------------------

function renderWeightCard() {
  const fecha = STATE.registroFecha;
  const last = DB.lastWeight();
  const check = DB.canRegisterWeight(fecha);

  const summary = $('#weight-summary-meta');
  if (summary) {
    if (last) {
      summary.textContent = `· ${last.peso_kg} kg (${formatFecha(last.fecha)})`;
    } else {
      summary.textContent = '· sin registros aún';
    }
  }

  const card = $('#weight-card');
  if (check.ok) {
    card.innerHTML = `
      <div class="water-head">
        <span>⚖️ Peso semanal</span>
        ${last ? `<span class="weight-meta">Último: ${last.peso_kg} kg · ${formatFecha(last.fecha)}</span>` : ''}
      </div>
      <div class="weight-input-row">
        <input type="number" step="0.1" min="20" max="250" id="peso-input" placeholder="Peso en kg (ej. 78,5)">
        <button class="btn primary" id="peso-save">Guardar</button>
      </div>
      <div class="hint" style="margin-top:6px;">Para la fecha: <strong>${formatFecha(fecha)}</strong>. Se permite 1 registro cada 7 días.</div>
    `;
    $('#peso-save').onclick = async () => {
      const val = parseFloat($('#peso-input').value.replace(',', '.'));
      if (!val || val < 20 || val > 250) { toast('Peso no válido', 'error'); return; }
      await DB.createWeight(fecha, val, null);
      toast('Peso registrado ✓');
      renderWeightCard();
    };
  } else {
    card.innerHTML = `
      <div class="water-head">
        <span>⚖️ Peso semanal</span>
        <span class="weight-meta">Disponible en ${check.diasRestantes} día${check.diasRestantes === 1 ? '' : 's'}</span>
      </div>
      <div class="weight-value">${check.last.peso_kg} kg</div>
      <div class="weight-meta">Registrado el ${formatFecha(check.last.fecha)}</div>
      <div class="weight-locked">
        <strong>Editar este registro:</strong>
        <div class="weight-input-row" style="margin-top:6px;">
          <input type="number" step="0.1" min="20" max="250" id="peso-edit-input" value="${check.last.peso_kg}">
          <button class="btn" id="peso-edit-save">Actualizar</button>
          <button class="btn danger" id="peso-edit-del">Borrar</button>
        </div>
      </div>
    `;
    $('#peso-edit-save').onclick = async () => {
      const val = parseFloat($('#peso-edit-input').value.replace(',', '.'));
      if (!val || val < 20 || val > 250) { toast('Peso no válido', 'error'); return; }
      await DB.updateWeight(check.last.id, val, null);
      toast('Actualizado ✓');
      renderWeightCard();
    };
    $('#peso-edit-del').onclick = async () => {
      if (!confirm('¿Eliminar este peso?')) return;
      await DB.deleteWeight(check.last.id);
      toast('Borrado');
      renderWeightCard();
    };
  }
}

// ----- Agua ------------------------------------------------------

function renderAgua() {
  const ml = STATE.registro.agua_ml;
  const target = D.NORMAS_DIARIAS.agua_litros_min * 1000;
  const pct = Math.min(100, (ml / target) * 100);
  $('#agua-fill').style.width = pct + '%';
  $('#agua-text').textContent = `${(ml / 1000).toFixed(2).replace('.', ',')} / ${D.NORMAS_DIARIAS.agua_litros_min.toString().replace('.', ',')} L`;
}

// ----- Kcal del día ----------------------------------------------

function renderDayKcal() {
  let total = 0, p = 0, c = 0, f = 0;
  const lineas = [];
  D.COMIDAS.forEach(co => {
    const meal = STATE.registro.meals[co.id];
    if (!meal) return;
    const kcal = meal.kcal_estimadas != null ? meal.kcal_estimadas : mealAutoKcal(meal);
    if (kcal > 0) {
      total += kcal;
      lineas.push(`${co.icono} ${kcal}`);
    }
    const macros = mealMacros(meal);
    p += macros.p; c += macros.c; f += macros.f;
  });
  $('#kcal-total').textContent = `${total} kcal`;
  $('#kcal-breakdown').textContent = lineas.length ? lineas.join('  ·  ') : '—';
  $('#macro-p').textContent = Math.round(p);
  $('#macro-c').textContent = Math.round(c);
  $('#macro-f').textContent = Math.round(f);
}

// ----- Fruta del día (resumen) -----------------------------------

function renderDayFruits() {
  let total = 0;
  D.COMIDAS.forEach(c => {
    const meal = STATE.registro.meals[c.id];
    if (meal && meal.frutas_ud) total += meal.frutas_ud;
  });
  const target = D.NORMAS_DIARIAS.frutas_piezas;
  const ok = total >= target;
  $('#day-fruit-summary').innerHTML = `
    <span>🍓 Piezas de fruta del día</span>
    <span class="${ok ? 'ok' : ''}"><strong>${total}</strong> / ${target}</span>
  `;
}

// ----- Comidas ---------------------------------------------------

function renderMeals() {
  const cont = $('#meals-container');
  cont.innerHTML = '';
  D.COMIDAS.forEach(c => cont.appendChild(mealCard(c)));
}

function mealCard(comida) {
  const card = document.createElement('div');
  card.className = 'meal-card';
  const meal = STATE.registro.meals[comida.id] || { frutas_ud: 0 };
  STATE.registro.meals[comida.id] = meal;
  // Asegurar alternativa_foods siempre como array en memoria
  if (!Array.isArray(meal.alternativa_foods)) meal.alternativa_foods = [];

  const planSeg = meal.comido_segun_plan == null ? null : !!meal.comido_segun_plan;
  const combosGuardados = DB.listCombos({ tipo_comida: comida.id });
  const selectedCombo = meal.combo_id ? DB.listCombos().find(c => c.id == meal.combo_id) : null;
  const kcalShown = mealAutoKcal(meal);
  const altHasFoods = meal.alternativa_foods.length > 0;
  const requireManual = planSeg === false && !altHasFoods;

  const snapItems = meal.snapshot ? [
    meal.snapshot.hidrato_id,
    meal.snapshot.proteina_id,
    meal.snapshot.grasa_id,
    meal.snapshot.vegetal_id,
  ].filter(Boolean).map(alimentoById).filter(Boolean) : [];

  card.innerHTML = `
    <div class="meal-head">
      <h3>${comida.icono} ${comida.nombre}</h3>
    </div>

    ${snapItems.length ? `
      <div class="snapshot-block">
        <div class="snap-label">🍴 Lo que comiste${meal.snapshot.nombre ? ` · <em>${meal.snapshot.nombre}</em>` : ''}</div>
        <ul class="snap-items">
          ${snapItems.map(a => `<li><span>${a.nombre}</span><span class="qty">${a.cantidad}${a.unidad}</span></li>`).join('')}
        </ul>
      </div>
    ` : ''}

    <div class="form-row">
      <label>Combo planificado</label>
      <select data-meal="combo">
        <option value="">— Sin asociar —</option>
        ${combosGuardados.map(c => {
          const nombre = c.nombre || nombreCombo(c);
          return `<option value="${c.id}" ${meal.combo_id == c.id ? 'selected' : ''}>${nombre} · ~${comboKcal(c)} kcal</option>`;
        }).join('')}
      </select>
      ${selectedCombo ? renderComboPreview(selectedCombo) : ''}
    </div>

    <div class="toggle-row">
      <button data-meal="plan-yes" class="${planSeg === true  ? 'on' : ''}">✅ Lo planificado</button>
      <button data-meal="plan-no"  class="${planSeg === false ? 'on' : ''}">↪ Comí otra cosa</button>
    </div>

    ${planSeg === false ? `
      <div class="form-row">
        <label>¿Qué comiste? (texto)</label>
        <textarea data-meal="alternativa" rows="2" placeholder="Describe lo que comiste…">${meal.alternativa_texto || ''}</textarea>
      </div>

      <div class="form-row">
        <label>O elige alimentos de la tabla</label>
        <select data-meal="alt-food-picker">
          <option value="">— Añadir alimento —</option>
          ${D.GRUPOS.map(g => `
            <optgroup label="${g.icono} ${g.nombre}">
              ${alimentosGrupo(g.id).map(a => `<option value="${a.id}">${a.cantidad}${a.unidad} · ${a.nombre} (~${a.kcal} kcal)</option>`).join('')}
            </optgroup>
          `).join('')}
        </select>
      </div>

      ${altHasFoods ? `
        <ul class="alt-foods-list">
          ${meal.alternativa_foods.map(fid => {
            const a = alimentoById(fid);
            return a ? `<li>
              <span><strong>${a.cantidad}${a.unidad}</strong> ${a.nombre} <span class="meta">· ${a.kcal} kcal · P${a.p_g||0} C${a.c_g||0} F${a.f_g||0}</span></span>
              <button class="rm" data-rm-fid="${fid}" title="Quitar">×</button>
            </li>` : '';
          }).join('')}
        </ul>
      ` : `
        <div class="form-row">
          <label>Calorías estimadas <span class="req">(obligatorio)</span></label>
          <input type="number" min="0" max="3000" step="10" data-meal="kcal-manual"
                 value="${meal.kcal_estimadas != null ? meal.kcal_estimadas : ''}"
                 placeholder="Por ejemplo: 450">
        </div>
        <div class="alert">📷 Foto obligatoria al no elegir alimentos de la tabla.</div>
      `}
    ` : ''}

    <div class="meal-extras">
      <div class="meal-fruit">
        <span>🍓 Fruta</span>
        <button data-meal="fruta-down">−</button>
        <span class="meal-fruit-count" data-meal="fruta-count">${meal.frutas_ud || 0}</span>
        <button data-meal="fruta-up">+</button>
      </div>
      <div class="meal-kcal">
        🔥 <span data-meal="kcal-val">${kcalShown}</span> kcal
      </div>
    </div>

    <div class="rating-combined">
      <div class="rate-block">
        <label>Me gustó</label>
        <div class="stars" data-meal-stars="gusto"></div>
      </div>
      <div class="rate-block">
        <label>Cómodo</label>
        <div class="stars" data-meal-stars="comodidad"></div>
      </div>
    </div>

    <div class="photo-wrap">
      <div class="photo-thumb ${meal.foto_data ? 'has-img' : ''}" data-meal="photo-thumb">${meal.foto_data ? `<img src="${meal.foto_data}" alt="">` : '📷'}</div>
      <div class="photo-actions">
        <label class="btn ghost">
          📷 Tomar / Elegir foto
          <input type="file" accept="image/*" capture="environment" hidden data-meal="photo-input">
        </label>
        ${meal.foto_data ? '<button class="btn ghost danger" data-meal="photo-clear">Quitar foto</button>' : ''}
      </div>
    </div>

    <div class="form-row" style="margin-top:10px;">
      <label>Notas</label>
      <textarea data-meal="notas" rows="2" placeholder="Cualquier nota sobre esta comida…">${meal.notas || ''}</textarea>
    </div>
  `;

  // ---- bindings ----
  const setStars = (key) => {
    const cont = card.querySelector(`[data-meal-stars="${key}"]`);
    cont.innerHTML = '';
    const current = meal[key] || 0;
    for (let i = 1; i <= 5; i++) {
      const b = document.createElement('button');
      b.className = 'star' + (i <= current ? ' on' : '');
      b.textContent = '★';
      b.onclick = () => { meal[key] = i; setStars(key); };
      cont.appendChild(b);
    }
  };
  setStars('gusto');
  setStars('comodidad');

  card.querySelector('[data-meal="combo"]').onchange = e => {
    meal.combo_id = e.target.value ? Number(e.target.value) : null;
    renderMeals();
    renderDayKcal();
  };

  card.querySelector('[data-meal="plan-yes"]').onclick = () => {
    meal.comido_segun_plan = 1;
    // Al volver al plan, limpiamos kcal manual y alternativa
    meal.kcal_estimadas = null;
    renderMeals();
    renderDayKcal();
  };
  card.querySelector('[data-meal="plan-no"]').onclick = () => {
    meal.comido_segun_plan = 0;
    renderMeals();
    renderDayKcal();
  };

  const altText = card.querySelector('[data-meal="alternativa"]');
  if (altText) altText.oninput = e => { meal.alternativa_texto = e.target.value; };
  card.querySelector('[data-meal="notas"]').oninput = e => { meal.notas = e.target.value; };

  const picker = card.querySelector('[data-meal="alt-food-picker"]');
  if (picker) picker.onchange = e => {
    const fid = e.target.value;
    if (!fid) return;
    if (!meal.alternativa_foods.includes(fid)) meal.alternativa_foods.push(fid);
    meal.kcal_estimadas = null;  // pasa a auto
    renderMeals();
    renderDayKcal();
  };

  card.querySelectorAll('[data-rm-fid]').forEach(b => b.onclick = () => {
    const fid = b.dataset.rmFid;
    meal.alternativa_foods = meal.alternativa_foods.filter(x => x !== fid);
    renderMeals();
    renderDayKcal();
  });

  const kcalManual = card.querySelector('[data-meal="kcal-manual"]');
  if (kcalManual) kcalManual.oninput = e => {
    const v = e.target.value;
    meal.kcal_estimadas = v === '' ? null : Number(v);
    card.querySelector('[data-meal="kcal-val"]').textContent = meal.kcal_estimadas || 0;
    renderDayKcal();
  };

  card.querySelector('[data-meal="fruta-down"]').onclick = () => {
    meal.frutas_ud = Math.max(0, (meal.frutas_ud || 0) - 1);
    renderMeals();
    renderDayKcal();
    renderDayFruits();
  };
  card.querySelector('[data-meal="fruta-up"]').onclick = () => {
    meal.frutas_ud = (meal.frutas_ud || 0) + 1;
    renderMeals();
    renderDayKcal();
    renderDayFruits();
  };

  const photoInput = card.querySelector('[data-meal="photo-input"]');
  photoInput.onchange = async e => {
    const f = e.target.files[0];
    if (!f) return;
    const dataUrl = await resizeImage(f, 1200, 0.75);
    meal.foto_data = dataUrl;
    renderMeals();
  };
  const clearBtn = card.querySelector('[data-meal="photo-clear"]');
  if (clearBtn) clearBtn.onclick = () => { meal.foto_data = null; renderMeals(); };

  const thumb = card.querySelector('[data-meal="photo-thumb"]');
  if (meal.foto_data) thumb.onclick = () => openPhoto(meal.foto_data);

  return card;
}

function nombreCombo(c) {
  const h = alimentoById(c.hidrato_id);
  const p = alimentoById(c.proteina_id);
  return `${h ? h.nombre.split(' ')[0] : '?'} + ${p ? p.nombre.split(' ')[0] : '?'}`;
}

// Conserva el snapshot original si combo_id no ha cambiado;
// si se cambió o no existía aún, captura el estado actual del combo.
function computeMealSnapshot(meal) {
  if (meal.combo_id == null) return meal.snapshot || null;
  const changed = meal.combo_id !== meal.original_combo_id;
  if (!changed && meal.snapshot) return meal.snapshot;
  const c = DB.listCombos().find(x => x.id == meal.combo_id);
  if (c) return buildSnapshot(c);
  return meal.snapshot || null;
}

async function guardarDia() {
  const fecha = STATE.registroFecha;
  const notas = $('#dia-notas').value.trim();

  // Validación: "Comí otra cosa" sin alimentos de tabla → foto y kcal manuales obligatorias
  for (const co of D.COMIDAS) {
    const meal = STATE.registro.meals[co.id];
    if (!meal) continue;
    if (meal.comido_segun_plan === 0) {
      const hasFoods = Array.isArray(meal.alternativa_foods) && meal.alternativa_foods.length > 0;
      if (!hasFoods) {
        if (!meal.foto_data) {
          toast(`${co.nombre}: falta foto (al no elegir alimentos)`, 'error');
          return;
        }
        if (meal.kcal_estimadas == null || meal.kcal_estimadas <= 0) {
          toast(`${co.nombre}: falta estimación de kcal`, 'error');
          return;
        }
      }
    }
  }

  let totalFrutas = 0;
  D.COMIDAS.forEach(c => {
    const meal = STATE.registro.meals[c.id];
    if (meal && meal.frutas_ud) totalFrutas += meal.frutas_ud;
  });

  const dailyId = await DB.upsertDailyLog(fecha, {
    agua_ml:   STATE.registro.agua_ml,
    frutas_ud: totalFrutas,
    notas:     notas || null,
  });
  STATE.registro.dailyId = dailyId;

  for (const [tipo, meal] of Object.entries(STATE.registro.meals)) {
    const snapshot = computeMealSnapshot(meal);
    meal.snapshot = snapshot;
    const altFoods = Array.isArray(meal.alternativa_foods) ? meal.alternativa_foods : [];
    const usedManual = meal.comido_segun_plan === 0 && altFoods.length === 0;
    const kcal = usedManual
      ? (meal.kcal_estimadas || 0)
      : mealAutoKcal(meal);
    await DB.upsertMealLog(dailyId, tipo, {
      combo_id:               meal.combo_id || null,
      comido_segun_plan:      meal.comido_segun_plan == null ? 1 : meal.comido_segun_plan,
      alternativa_texto:      meal.alternativa_texto || null,
      alternativa_foods_json: altFoods.length ? JSON.stringify(altFoods) : null,
      gusto:                  meal.gusto || null,
      comodidad:              meal.comodidad || null,
      foto_data:              meal.foto_data || null,
      notas:                  meal.notas || null,
      frutas_ud:              meal.frutas_ud || 0,
      kcal_estimadas:         kcal > 0 ? kcal : null,
      combo_snapshot:         snapshot ? JSON.stringify(snapshot) : null,
    });
    meal.original_combo_id = meal.combo_id || null;
  }
  toast('Día guardado ✓');
}

function resizeImage(file, maxW, quality) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const ratio = Math.min(1, maxW / img.width);
        const w = Math.round(img.width * ratio);
        const h = Math.round(img.height * ratio);
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ============= HISTORIAL =========================================

function renderHistorial() {
  const s = DB.stats(30);
  const grid = $('#stats-grid');
  grid.innerHTML = `
    <div class="stat-card">
      <div class="stat-value">${s.totalDias || 0}</div>
      <div class="stat-label">Días registrados</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${s.totalCombos || 0}</div>
      <div class="stat-label">Combos creados</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${s.mediaAgua != null ? s.mediaAgua.toString().replace('.', ',') + ' L' : '—'}</div>
      <div class="stat-label">Media agua (30 días)</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${s.mediaKcal != null ? s.mediaKcal : '—'}</div>
      <div class="stat-label">Media kcal/día (30 d.)</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${s.porcentajePlan != null ? s.porcentajePlan + '%' : '—'}</div>
      <div class="stat-label">Comidas según plan</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${s.ultimoPeso ? s.ultimoPeso.peso_kg + ' kg' : '—'}</div>
      <div class="stat-label">${s.ultimoPeso ? 'Último peso · ' + formatFecha(s.ultimoPeso.fecha) : 'Peso'}</div>
    </div>
    ${s.topCombos.length ? `
      <div class="stat-card full">
        <div class="stat-label">Combos más usados</div>
        ${s.topCombos.map(c => `<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--border);">
          <span>${c.nombre || c.tipo_comida}</span>
          <strong>${c.veces}×</strong>
        </div>`).join('')}
      </div>
    ` : ''}
  `;

  // Pesos
  const pesos = DB.listWeights();
  const wList = $('#weights-list');
  wList.innerHTML = '';
  if (!pesos.length) {
    wList.innerHTML = '<div class="empty-state">Aún no hay pesos registrados.</div>';
  } else {
    pesos.forEach(p => {
      const card = document.createElement('div');
      card.className = 'historial-card';
      card.innerHTML = `
        <div>
          <div class="date">${p.peso_kg} kg</div>
          <div class="stats">${formatFecha(p.fecha)}</div>
        </div>
        <button class="btn ghost danger" data-id="${p.id}">Borrar</button>
      `;
      card.querySelector('button').onclick = async () => {
        if (!confirm('¿Eliminar este peso?')) return;
        await DB.deleteWeight(p.id);
        renderHistorial();
      };
      wList.appendChild(card);
    });
  }

  // Días — totales calculados al vuelo desde meal_logs.
  const logs = DB.listDailyLogs(90);
  const cont = $('#historial-list');
  cont.innerHTML = '';
  if (!logs.length) {
    cont.innerHTML = '<div class="empty-state">Aún no hay días registrados.</div>';
  } else {
    logs.forEach(l => {
      const t = dayTotals(l);
      const card = document.createElement('div');
      card.className = 'historial-card';
      card.innerHTML = `
        <div>
          <div class="date">${formatFecha(l.fecha)}</div>
          <div class="stats">
            💧 ${(t.agua_ml / 1000).toFixed(2).replace('.', ',')} L ·
            🍓 ${t.frutas_ud} ·
            🔥 ${t.kcal} kcal
          </div>
          <div class="stats">P${t.p} · C${t.c} · F${t.f} g</div>
        </div>
        <button class="btn ghost">Abrir</button>
      `;
      card.querySelector('button').onclick = () => {
        STATE.registroFecha = l.fecha;
        goTab('registro');
      };
      cont.appendChild(card);
    });
  }

  // Reset chart UI cada vez que entramos
  $('#chart-wrap').classList.add('hidden');
  $$('#chart-buttons .chip').forEach(b => b.classList.remove('active'));
  $$('#chart-range-chips .chip').forEach(b =>
    b.classList.toggle('active', Number(b.dataset.range) === STATE.chartRangeDias)
  );
  STATE.chartActivo = null;
  destroyChart();
}

// ============= COMPRA (lista de la compra) ======================

function renderCompra() {
  const start = $('#compra-start');
  const end   = $('#compra-end');
  start.value = STATE.compra.start || hoyISO();
  end.value   = STATE.compra.end   || shiftDayISO(start.value, 6);
  // Si ya hay rango previo, re-renderiza la lista (marcas pueden haber cambiado)
  if (STATE.compra.start && STATE.compra.end) {
    STATE.compra.bought = DB.getShoppingMarks(STATE.compra.start, STATE.compra.end);
    renderCompraResult();
  } else {
    $('#compra-summary').classList.add('hidden');
    $('#compra-list').innerHTML = '';
    $('#compra-actions').style.display = 'none';
  }
}

function setCompraRange(dias) {
  const start = hoyISO();
  $('#compra-start').value = start;
  $('#compra-end').value   = shiftDayISO(start, dias - 1);
  generarCompra();
}

function countDaysISO(start, end) {
  let n = 0, cursor = start;
  while (cursor <= end) { n++; cursor = shiftDayISO(cursor, 1); }
  return n;
}

function shoppingListForRange(start, end) {
  const totals = {};
  let cursor = start;
  while (cursor <= end) {
    // Planificado para este día
    const app = DB.getActivePlanForDate(cursor);
    if (app && app.plan_meals) {
      const dayMeals = app.plan_meals[String(app.dia_num)] || {};
      for (const tipo of Object.keys(dayMeals)) {
        const cid = dayMeals[tipo];
        if (!cid) continue;
        const c = DB.listCombos().find(x => x.id == cid);
        if (!c) continue;
        for (const slot of ['hidrato_id', 'proteina_id', 'grasa_id', 'vegetal_id']) {
          const fid = c[slot];
          if (!fid) continue;
          const a = alimentoById(fid);
          if (!a) continue;
          if (!totals[fid]) totals[fid] = { planned: 0, consumed: 0, planned_times: 0 };
          totals[fid].planned += a.cantidad;
          totals[fid].planned_times++;
        }
      }
    }

    // Consumido para este día (lo realmente registrado)
    const log = DB.getDailyLog(cursor);
    if (log) {
      DB.listMealLogs(log.id).forEach(m => {
        const foods = [];
        if (m.combo_snapshot) {
          try {
            const snap = JSON.parse(m.combo_snapshot);
            ['hidrato_id', 'proteina_id', 'grasa_id', 'vegetal_id'].forEach(k => {
              if (snap[k]) foods.push(snap[k]);
            });
          } catch (e) {}
        }
        if (m.alternativa_foods_json) {
          try {
            (JSON.parse(m.alternativa_foods_json) || []).forEach(fid => foods.push(fid));
          } catch (e) {}
        }
        for (const fid of foods) {
          const a = alimentoById(fid);
          if (!a) continue;
          if (!totals[fid]) totals[fid] = { planned: 0, consumed: 0, planned_times: 0 };
          totals[fid].consumed += a.cantidad;
        }
      });
    }

    cursor = shiftDayISO(cursor, 1);
  }

  const grouped = { hidrato: [], proteina: [], grasa: [], vegetal: [], fruta: [] };
  for (const [fid, info] of Object.entries(totals)) {
    const a = alimentoById(fid);
    if (!a) continue;
    if (!grouped[a.grupo]) grouped[a.grupo] = [];
    grouped[a.grupo].push({ food: a, ...info });
  }
  Object.values(grouped).forEach(arr => arr.sort((x, y) => x.food.nombre.localeCompare(y.food.nombre)));
  return grouped;
}

async function generarCompra() {
  const start = $('#compra-start').value;
  const end   = $('#compra-end').value;
  if (!start || !end) { toast('Elige las dos fechas', 'error'); return; }
  if (end < start) { toast('La fecha final debe ser igual o posterior', 'error'); return; }
  STATE.compra.start = start;
  STATE.compra.end   = end;
  STATE.compra.bought = DB.getShoppingMarks(start, end);
  renderCompraResult();
}

function renderCompraResult() {
  const start = STATE.compra.start;
  const end   = STATE.compra.end;
  const data  = shoppingListForRange(start, end);
  const bought = STATE.compra.bought;
  const days = countDaysISO(start, end);

  let totalFoods = 0, kcalPlanificado = 0;
  for (const arr of Object.values(data)) {
    for (const it of arr) {
      totalFoods++;
      kcalPlanificado += (it.food.kcal || 0) * it.planned_times;
    }
  }
  const pendientes = data ? Object.values(data).flat().filter(it => !bought.includes(it.food.id) && Math.max(0, it.planned - it.consumed) > 0).length : 0;

  const summary = $('#compra-summary');
  summary.classList.remove('hidden');
  summary.innerHTML = `
    <div class="row"><span>📅 Días en el rango</span><strong>${days}</strong></div>
    <div class="row"><span>🍽️ Alimentos distintos planificados</span><strong>${totalFoods}</strong></div>
    <div class="row"><span>🛒 Por comprar</span><strong>${pendientes}</strong></div>
    <div class="row"><span>🔥 kcal totales del plan</span><strong>${kcalPlanificado}</strong></div>
  `;

  const cont = $('#compra-list');
  cont.innerHTML = '';
  if (totalFoods === 0) {
    cont.innerHTML = `<div class="empty-state">No hay alimentos planificados en este rango.<br>Asigna un plan en <strong>Registro → Asignar plan</strong> primero.</div>`;
    $('#compra-actions').style.display = 'none';
    return;
  }

  for (const g of D.GRUPOS) {
    const arr = data[g.id] || [];
    if (!arr.length) continue;
    const block = document.createElement('div');
    block.className = 'compra-grupo';
    block.innerHTML = `<div class="compra-grupo-head">${g.icono} ${g.nombre}</div>`;
    for (const it of arr) {
      const isBought = bought.includes(it.food.id);
      const remaining = Math.max(0, it.planned - it.consumed);
      const item = document.createElement('div');
      item.className = 'compra-item' + (isBought ? ' bought' : '');
      item.dataset.fid = it.food.id;
      item.innerHTML = `
        <button class="chk" aria-label="Marcar comprado">${isBought ? '✓' : ''}</button>
        <div class="compra-meta">
          <div class="compra-name">${it.food.nombre}</div>
          <div class="compra-detail">
            ${it.planned_times} ${it.planned_times === 1 ? 'vez' : 'veces'} ·
            ${it.consumed > 0 ? `consumido ${it.consumed}${it.food.unidad}` : 'sin consumir aún'}
            · plan ${it.planned}${it.food.unidad}
          </div>
        </div>
        <div class="compra-qty">${remaining}<small>${it.food.unidad} restantes</small></div>
      `;
      item.querySelector('.chk').onclick = async () => {
        const idx = bought.indexOf(it.food.id);
        if (idx >= 0) bought.splice(idx, 1);
        else bought.push(it.food.id);
        STATE.compra.bought = bought;
        await DB.saveShoppingMarks(start, end, bought);
        renderCompraResult();
      };
      block.appendChild(item);
    }
    cont.appendChild(block);
  }

  $('#compra-actions').style.display = 'flex';
}

// ============= GRÁFICAS ==========================================

function destroyChart() {
  if (STATE.chartInstance) {
    STATE.chartInstance.destroy();
    STATE.chartInstance = null;
  }
}

function mostrarChart(tipo) {
  STATE.chartActivo = tipo;
  $('#chart-wrap').classList.remove('hidden');
  $$('#chart-buttons .chip').forEach(b => b.classList.toggle('active', b.dataset.chart === tipo));

  const titles = {
    agua:     '💧 Litros de agua / día',
    peso:     '⚖️ Peso (kg) histórico',
    calorias: '🔥 Calorías / día',
    macros:   '🥗 Macros (g) / día — P · C · F',
    plan:     '✅ % comidas según plan',
  };
  $('#chart-title').textContent = titles[tipo];

  destroyChart();
  const ctx = $('#chart-canvas').getContext('2d');
  const days = STATE.chartRangeDias;
  const gridColor = '#2c2c2c', tickColor = '#b6b6b6', accent = '#00d4ff';

  if (tipo === 'macros') {
    const logs = DB.listDailyLogs(days);
    logs.reverse();
    const labels = logs.map(l => l.fecha.slice(5));
    const totals = logs.map(l => dayTotals(l));
    STATE.chartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'Proteína',  data: totals.map(t => t.p), backgroundColor: 'rgba(255,77,90,.7)'  },
          { label: 'Hidratos',  data: totals.map(t => t.c), backgroundColor: 'rgba(245,166,35,.7)' },
          { label: 'Grasa',     data: totals.map(t => t.f), backgroundColor: 'rgba(255,215,0,.7)'  },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { labels: { color: tickColor } } },
        scales: {
          x: { stacked: true, ticks: { color: tickColor }, grid: { color: gridColor } },
          y: { stacked: true, ticks: { color: tickColor }, grid: { color: gridColor }, beginAtZero: true },
        },
      },
    });
    return;
  }

  let labels = [], values = [], yLabel = '';
  if (tipo === 'agua') {
    const rows = DB.seriesAgua(days);
    labels = rows.map(r => r.fecha.slice(5));
    values = rows.map(r => r.litros);
    yLabel = 'Litros';
  } else if (tipo === 'peso') {
    const rows = DB.seriePeso(days <= 30 ? 12 : 52);
    labels = rows.map(r => r.fecha.slice(5));
    values = rows.map(r => r.peso_kg);
    yLabel = 'kg';
  } else if (tipo === 'calorias') {
    // Cálculo al vuelo (más fiable que el cache de kcal_estimadas).
    const logs = DB.listDailyLogs(days);
    logs.reverse();
    labels = logs.map(l => l.fecha.slice(5));
    values = logs.map(l => dayTotals(l).kcal);
    yLabel = 'kcal';
  } else if (tipo === 'plan') {
    const logs = DB.listDailyLogs(days);
    logs.reverse();
    labels = logs.map(l => l.fecha.slice(5));
    values = logs.map(l => {
      const meals = DB.listMealLogs(l.id);
      if (!meals.length) return 0;
      const ok = meals.filter(m => m.comido_segun_plan).length;
      return Math.round(100 * ok / meals.length);
    });
    yLabel = '%';
  }

  STATE.chartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: yLabel,
        data: values,
        borderColor: accent,
        backgroundColor: 'rgba(0,212,255,.15)',
        tension: 0.25,
        fill: true,
        pointRadius: 3,
        pointHoverRadius: 5,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: tickColor }, grid: { color: gridColor } },
        y: { ticks: { color: tickColor }, grid: { color: gridColor }, beginAtZero: tipo !== 'peso' },
      },
    },
  });
}

// ============= PLANES (sin fecha, Día 1..N) =====================

const FREQ_TARGETS = [
  { key: 'carne-roja', label: '🥩 Carnes rojas',  per7: { min: 2,  max: 3  } },
  { key: 'ave',        label: '🍗 Aves',          per7: { min: 3,  max: 4  } },
  { key: 'pescado',    label: '🐟 Pescados',      per7: { min: 2,  max: 2  } },
  { key: 'marisco',    label: '🦐 Mariscos',      per7: { min: 0,  max: 1  } },
  { key: 'huevo',      label: '🥚 Huevos',        per7: { min: 4,  max: 5  } },
  { key: 'verdura',    label: '🥦 Verduras',      per7: { min: 14, max: 14 } },
  { key: 'hidrato',    label: '🌾 Hidratos',      per7: { min: 21, max: 21 } },
];

function classifyProtein(proteinaId) {
  if (!proteinaId) return null;
  const a = alimentoById(proteinaId);
  if (!a || !a.tags) return 'otro';
  if (a.tags.includes('huevo'))      return 'huevo';
  if (a.tags.includes('marisco'))    return 'marisco';
  if (a.tags.includes('pescado'))    return 'pescado';
  if (a.tags.includes('ave'))        return 'ave';
  if (a.tags.includes('carne-roja')) return 'carne-roja';
  if (a.tags.includes('carne'))      return 'carne';
  if (a.tags.includes('lacteo'))     return 'lacteo';
  return 'otro';
}

function renderSemana() {
  if (STATE.editingPlan) renderPlanEditor();
  else renderPlansList();
}

function renderPlansList() {
  $('#plans-list-view').classList.remove('hidden');
  $('#plan-editor-view').classList.add('hidden');
  const cont = $('#plans-list');
  const plans = DB.listPlans();
  cont.innerHTML = '';
  if (!plans.length) {
    cont.innerHTML = '<div class="empty-state">Aún no tienes planes guardados.</div>';
    return;
  }
  plans.forEach(p => {
    const totalKcal = Object.values(p.meals || {}).reduce((sum, day) => {
      return sum + Object.values(day).reduce((s2, cid) => {
        if (!cid) return s2;
        const c = DB.listCombos().find(x => x.id == cid);
        return s2 + (c ? comboKcal(c) : 0);
      }, 0);
    }, 0);
    const card = document.createElement('div');
    card.className = 'plan-card';
    card.innerHTML = `
      <div class="plan-name">${p.nombre}</div>
      <div class="plan-meta">${p.dias_count} días · ~${Math.round(totalKcal / p.dias_count)} kcal/día media</div>
      ${p.notas ? `<div class="combo-meta" style="margin-top:6px;">📝 ${p.notas}</div>` : ''}
      <div class="combo-actions">
        <button data-action="edit-plan">Abrir</button>
        <button data-action="del-plan" class="danger">Eliminar</button>
      </div>
    `;
    card.querySelector('[data-action="edit-plan"]').onclick = () => {
      STATE.editingPlan = JSON.parse(JSON.stringify(p));
      if (!STATE.editingPlan.meals) STATE.editingPlan.meals = {};
      renderPlanEditor();
    };
    card.querySelector('[data-action="del-plan"]').onclick = async () => {
      if (!confirm(`¿Eliminar el plan "${p.nombre}"? Las asignaciones a fechas también se borrarán.`)) return;
      await DB.deletePlan(p.id);
      toast('Eliminado');
      renderPlansList();
    };
    cont.appendChild(card);
  });
}

function renderPlanEditor() {
  $('#plans-list-view').classList.add('hidden');
  $('#plan-editor-view').classList.remove('hidden');

  const p = STATE.editingPlan;
  $('#plan-nombre').value = p.nombre || '';
  $('#plan-day-count').textContent = p.dias_count;
  $('#plan-notas').value = p.notas || '';

  renderFreqCountersPlan();
  renderPlanDaysGrid();
}

function renderPlanDaysGrid() {
  const grid = $('#plan-days-grid');
  grid.innerHTML = '';
  const p = STATE.editingPlan;
  const combos = DB.listCombos();

  for (let d = 1; d <= p.dias_count; d++) {
    const dayMeals = p.meals[String(d)] || {};
    const totals = computeDayPlanTotals(dayMeals);
    const card = document.createElement('div');
    card.className = 'week-day';
    card.innerHTML = `
      <div class="week-day-head">
        <span>Día ${d}</span>
        <div class="day-actions">
          <button data-day-act="suggest" data-d="${d}">🎲 Sugerir día</button>
          <button data-day-act="clear" data-d="${d}">🧹 Vaciar</button>
        </div>
      </div>
      ${D.COMIDAS.map(co => {
        const candidatos = combos.filter(c => c.tipo_comida === co.id);
        const selected = dayMeals[co.id];
        const selCombo = selected ? combos.find(c => c.id == selected) : null;
        return `
          <div class="week-meal-row">
            <span class="label">${co.icono} ${co.nombre}</span>
            <div style="display:flex;gap:6px;align-items:center;flex:1;flex-wrap:wrap;">
              <select data-d="${d}" data-meal="${co.id}" style="flex:1;min-width:0;">
                <option value="">— Sin asignar —</option>
                ${candidatos.map(c => {
                  const nombre = c.nombre || nombreCombo(c);
                  return `<option value="${c.id}" ${selected == c.id ? 'selected' : ''}>${nombre} · ~${comboKcal(c)} kcal</option>`;
                }).join('')}
              </select>
              <div class="slot-actions">
                <button data-slot-act="suggest" data-d="${d}" data-meal="${co.id}" title="Aleatorio">🎲</button>
              </div>
              ${selCombo ? `<div style="width:100%;">${renderComboPreview(selCombo)}</div>` : ''}
            </div>
          </div>
        `;
      }).join('')}
      <div class="day-totals">
        <span>🔥 <strong>${totals.kcal}</strong> kcal</span>
        <span>P${totals.p} · C${totals.c} · F${totals.f} g</span>
      </div>
    `;

    // selects
    card.querySelectorAll('select').forEach(sel => {
      sel.onchange = () => {
        const d2 = sel.dataset.d;
        const m  = sel.dataset.meal;
        if (!p.meals[d2]) p.meals[d2] = {};
        p.meals[d2][m] = sel.value ? Number(sel.value) : null;
        renderFreqCountersPlan();
        renderPlanDaysGrid();
      };
    });

    // botones por slot
    card.querySelectorAll('[data-slot-act="suggest"]').forEach(btn => {
      btn.onclick = () => {
        const d2 = btn.dataset.d;
        const tipo = btn.dataset.meal;
        sugerirSlot(d2, tipo);
      };
    });

    // botones por día
    card.querySelector('[data-day-act="suggest"]').onclick = () => sugerirDia(d);
    card.querySelector('[data-day-act="clear"]').onclick = () => {
      p.meals[String(d)] = {};
      renderFreqCountersPlan();
      renderPlanDaysGrid();
    };

    grid.appendChild(card);
  }
}

function computeDayPlanTotals(dayMeals) {
  let kcal = 0, p = 0, c = 0, f = 0;
  for (const tipo of Object.keys(dayMeals)) {
    const cid = dayMeals[tipo];
    if (!cid) continue;
    const combo = DB.listCombos().find(x => x.id == cid);
    if (!combo) continue;
    kcal += comboKcal(combo);
    const m = comboMacros(combo);
    p += m.p; c += m.c; f += m.f;
  }
  return { kcal, p: Math.round(p), c: Math.round(c), f: Math.round(f) };
}

function renderFreqCountersPlan() {
  const counts = { 'carne-roja': 0, 'ave': 0, 'pescado': 0, 'marisco': 0, 'huevo': 0, 'verdura': 0, 'hidrato': 0 };
  const p = STATE.editingPlan;
  const combosCache = DB.listCombos();
  for (let d = 1; d <= p.dias_count; d++) {
    const dayMeals = p.meals[String(d)] || {};
    for (const tipo of Object.keys(dayMeals)) {
      const cid = dayMeals[tipo];
      if (!cid) continue;
      const c = combosCache.find(x => x.id == cid);
      if (!c) continue;
      if (c.hidrato_id) counts['hidrato']++;
      if (c.vegetal_id) counts['verdura']++;
      const cat = classifyProtein(c.proteina_id);
      if (cat && counts[cat] != null) counts[cat]++;
    }
  }
  // Escalado proporcional para planes != 7 días
  const factor = p.dias_count / 7;
  const cont = $('#freq-counters');
  cont.innerHTML = FREQ_TARGETS.map(t => {
    const minT = Math.round(t.per7.min * factor);
    const maxT = Math.round(t.per7.max * factor);
    const v = counts[t.key] || 0;
    let cls = '';
    if (v >= minT && v <= maxT) cls = 'met';
    else if (v > maxT) cls = 'over';
    return `
      <div class="freq-item ${cls}">
        <span>${t.label}</span>
        <span><span class="val">${v}</span>
        <span class="target">/ ${minT === maxT ? minT : `${minT}-${maxT}`} en ${p.dias_count}d</span></span>
      </div>
    `;
  }).join('');
}

function sugerirSlot(d, tipo) {
  const p = STATE.editingPlan;
  const candidatos = DB.listCombos().filter(c => c.tipo_comida === tipo);
  if (!candidatos.length) {
    toast(`Aún no tienes combos para ${tipo}. Créalos en Combinar.`, 'error');
    return;
  }
  const pick = candidatos[Math.floor(Math.random() * candidatos.length)];
  if (!p.meals[d]) p.meals[d] = {};
  p.meals[d][tipo] = pick.id;
  renderFreqCountersPlan();
  renderPlanDaysGrid();
}

function sugerirDia(d) {
  D.COMIDAS.forEach(co => sugerirSlot(String(d), co.id));
}

function sugerirTodoElPlan() {
  const p = STATE.editingPlan;
  for (let d = 1; d <= p.dias_count; d++) {
    D.COMIDAS.forEach(co => {
      const existing = (p.meals[String(d)] || {})[co.id];
      if (existing) return;  // no pisar
      const candidatos = DB.listCombos().filter(c => c.tipo_comida === co.id);
      if (!candidatos.length) return;
      const pick = candidatos[Math.floor(Math.random() * candidatos.length)];
      if (!p.meals[String(d)]) p.meals[String(d)] = {};
      p.meals[String(d)][co.id] = pick.id;
    });
  }
  renderFreqCountersPlan();
  renderPlanDaysGrid();
  toast('Plan rellenado con sugerencias ✓');
}

async function guardarPlan() {
  const p = STATE.editingPlan;
  const nombre = $('#plan-nombre').value.trim();
  if (!nombre) { toast('Pon un nombre al plan', 'error'); return; }
  const notas = $('#plan-notas').value.trim();
  const payload = {
    nombre,
    dias_count: p.dias_count,
    meals: p.meals,
    notas: notas || null,
  };
  if (p.id) {
    await DB.updatePlan({ ...payload, id: p.id });
  } else {
    const id = await DB.createPlan(payload);
    p.id = id;
  }
  toast('Plan guardado ✓');
  STATE.editingPlan = null;
  renderPlansList();
}

async function eliminarPlan() {
  const p = STATE.editingPlan;
  if (!p.id) {
    STATE.editingPlan = null;
    renderPlansList();
    return;
  }
  if (!confirm(`¿Eliminar el plan "${p.nombre}"?`)) return;
  await DB.deletePlan(p.id);
  toast('Eliminado');
  STATE.editingPlan = null;
  renderPlansList();
}

function nuevoPlan() {
  STATE.editingPlan = { id: null, nombre: '', dias_count: 7, meals: {}, notas: '' };
  renderPlanEditor();
}

function cambiarDias(delta) {
  const p = STATE.editingPlan;
  const nueva = Math.max(1, Math.min(30, p.dias_count + delta));
  if (nueva < p.dias_count) {
    // recortar días superiores
    for (let d = nueva + 1; d <= p.dias_count; d++) delete p.meals[String(d)];
  }
  p.dias_count = nueva;
  renderPlanEditor();
}

// ============= MENÚ / EXPORT / IMPORT ============================

function openMenu()  { $('#menu-modal').classList.remove('hidden'); }
function closeMenu() { $('#menu-modal').classList.add('hidden'); }

function openPhoto(src) {
  if (!src) return;
  $('#photo-modal-img').src = src;
  $('#photo-modal').classList.remove('hidden');
}
function closePhoto() {
  $('#photo-modal').classList.add('hidden');
  $('#photo-modal-img').src = '';
}

// ============= INIT ==============================================

// Expuesta para que cloud.js pueda refrescar la vista tras pull remoto
window.refreshCurrentView = () => {
  if (STATE.tab === 'tabla')        renderTabla();
  else if (STATE.tab === 'combos')  renderCombos();
  else if (STATE.tab === 'registro') renderRegistro();
  else if (STATE.tab === 'historial') renderHistorial();
  else if (STATE.tab === 'semana')  renderSemana();
  else if (STATE.tab === 'compra')  renderCompra();
};

function updateBrandSub() {
  const sub = $('#brand-sub');
  if (!sub) return;
  const u = CLOUD.currentUser();
  if (!u) { sub.textContent = 'Nutrición · Local'; return; }
  sub.innerHTML = 'Nutrición · ' + u.email +
    (CLOUD.isAdmin() ? ' <span class="badge-admin">ADMIN</span>' : '');
}

function updateAuthBanner() {
  let banner = $('#auth-banner');
  const u = CLOUD.currentUser();
  // Si está logueado pero sin workspace asignado, está en estado "no autorizado"
  const noAuth = u && !CLOUD.workspaceId();
  if (!banner) {
    if (!noAuth) return;
    banner = document.createElement('div');
    banner.id = 'auth-banner';
    banner.className = 'auth-banner';
    $('#app-main').insertBefore(banner, $('#app-main').firstChild);
  }
  if (!noAuth) { banner.remove(); return; }
  banner.innerHTML = `
    <div>
      <strong>⚠️ Sin acceso</strong><br>
      Tu email <strong>${u.email}</strong> no está en la lista de personas autorizadas.
      Pídele al administrador (<strong>${CLOUD.adminEmail()}</strong>) que te añada.
    </div>
    <button class="text-btn" id="banner-signout">Cerrar sesión</button>
  `;
  $('#banner-signout').onclick = async () => { await CLOUD.signOut(); };
}

function setupCloudUI() {
  const dot   = $('#cloud-dot');
  const label = $('#cloud-label');
  const btn   = $('#btn-cloud');
  if (!btn) return;

  const labels = {
    'idle':       'Conectando…',
    'signed-out': 'Local',
    'syncing':    'Sincronizando…',
    'synced':     'Sincronizado',
    'pending':    'Cambios pendientes',
    'offline':    'Sin conexión',
    'error':      'Error',
  };

  CLOUD.onStatus((s, detail) => {
    btn.className = 'cloud-btn ' + s;
    label.textContent = labels[s] || s;
    if (s === 'error' && detail) btn.title = detail;
  });

  CLOUD.onWorkspace(_ws => {
    updateBrandSub();
    updateAuthBanner();
    renderCloudMenuSection();
  });
  CLOUD.onStatus(() => updateBrandSub());

  btn.onclick = async () => {
    if (!CLOUD.isAuthenticated()) {
      try { await CLOUD.signIn(); }
      catch (e) { toast(CLOUD.explainError(e), 'error'); }
    } else {
      try { await CLOUD.syncNow(); toast('Sincronizado'); }
      catch (e) { toast(CLOUD.explainError(e), 'error'); }
    }
  };
}

function renderCloudMenuSection() {
  const cont = $('#menu-cloud-section');
  if (!cont) return;
  const u = CLOUD.currentUser();
  if (!u) {
    cont.innerHTML = `
      <button class="btn block primary" id="btn-menu-signin">🔐 Iniciar sesión con Google</button>
      <p class="hint center" style="margin:6px 0 14px;">Sincroniza tus datos entre dispositivos y compártelos con otras personas.</p>
    `;
    $('#btn-menu-signin').onclick = async () => {
      try { await CLOUD.signIn(); closeMenu(); }
      catch (e) { toast(CLOUD.explainError(e), 'error'); }
    };
  } else {
    const adminBadge = CLOUD.isAdmin() ? ' · 👑 administrador' : '';
    cont.innerHTML = `
      <div class="hint" style="margin-bottom:10px;">
        Sesión: <strong>${u.email}</strong>${adminBadge}
      </div>
      ${CLOUD.isAdmin() ? '<button class="btn block" id="btn-menu-share">👥 Gestionar accesos</button>' : ''}
      <button class="btn block" id="btn-menu-sync">🔄 Sincronizar ahora</button>
      <button class="btn block ghost" id="btn-menu-signout">Cerrar sesión</button>
    `;
    if (CLOUD.isAdmin()) {
      $('#btn-menu-share').onclick = () => { closeMenu(); openShare(); };
    }
    $('#btn-menu-sync').onclick  = async () => {
      try { await CLOUD.syncNow(); toast('Sincronizado ✓'); }
      catch (e) { toast('Error al sincronizar', 'error'); }
    };
    $('#btn-menu-signout').onclick = async () => {
      if (!confirm('¿Cerrar sesión? Tus datos se quedan en este dispositivo (puedes seguir usando la app sin sincronizar).')) return;
      await CLOUD.signOut();
      closeMenu();
    };
  }
}

function openShare()  { renderShareMembers(); $('#share-modal').classList.remove('hidden'); }
function closeShare() { $('#share-modal').classList.add('hidden'); $('#share-email').value = ''; }

function renderShareMembers() {
  const ws = CLOUD.currentWorkspace();
  const cont = $('#share-members');
  if (!ws) { cont.innerHTML = '<p class="hint">Sin workspace activo.</p>'; return; }
  const emails = ws.member_emails || [];
  const adminEmail = CLOUD.adminEmail().toLowerCase();
  cont.innerHTML = emails.map(e => {
    const isAdmin = e.toLowerCase() === adminEmail;
    return `
      <div class="share-member">
        <span>${e}${isAdmin ? '<span class="role">administrador</span>' : ''}</span>
        ${!isAdmin ? `<button data-rm-email="${e}" aria-label="Quitar">✕</button>` : ''}
      </div>
    `;
  }).join('') || '<p class="hint">Sólo tú.</p>';
  cont.querySelectorAll('[data-rm-email]').forEach(b => b.onclick = async () => {
    if (!confirm(`¿Quitar a ${b.dataset.rmEmail} del acceso?`)) return;
    try { await CLOUD.uninvite(b.dataset.rmEmail); toast('Eliminado'); renderShareMembers(); }
    catch (e) { toast(e.message || 'Error', 'error'); }
  });
}

async function main() {
  try {
    await DB.init();
  } catch (e) {
    console.error(e);
    $('#loading p').textContent = 'Error cargando la base de datos. Comprueba la conexión a internet.';
    return;
  }

  // Cloud: init y espera al primer estado de auth (no bloquea más de 1-2s)
  try {
    await CLOUD.init();
    await CLOUD.ready();
  } catch (e) { console.error('Cloud init error', e); }

  $('#loading').classList.add('hidden');
  setupCloudUI();

  $$('.tab-btn').forEach(b => b.onclick = () => goTab(b.dataset.go));

  // Tabla
  $('#search-input').oninput = e => { STATE.tabla.query = e.target.value; renderTabla(); };
  $('#search-clear').onclick = () => { $('#search-input').value = ''; STATE.tabla.query = ''; renderTabla(); };
  $('#btn-info').onclick = () => {
    $$('.info-block').forEach(b => b.open = true);
    $$('.info-block')[0].scrollIntoView({ behavior: 'smooth' });
  };

  // Combinar
  $('#btn-guardar-combo').onclick = guardarCombo;
  $('#btn-aleatorio-este').onclick = combinarAleatorio;

  // Sugerencias
  $('#btn-sugerir').onclick = generarSugerencias;

  // Combos sub-tabs
  $('#combos-subtab').onclick = e => {
    const c = e.target.closest('.chip');
    if (!c) return;
    STATE.combosSubtab = c.dataset.subtab;
    renderCombos();
  };

  // Compra
  $('#btn-compra-gen').onclick = generarCompra;
  $('#btn-compra-7').onclick  = () => setCompraRange(7);
  $('#btn-compra-14').onclick = () => setCompraRange(14);
  $('#btn-compra-30').onclick = () => setCompraRange(30);
  $('#btn-compra-uncheck').onclick = async () => {
    if (!STATE.compra.start) return;
    if (!confirm('¿Quitar todas las marcas de "comprado" de este rango?')) return;
    STATE.compra.bought = [];
    await DB.saveShoppingMarks(STATE.compra.start, STATE.compra.end, []);
    renderCompraResult();
  };

  // Registro – fecha
  $('#registro-fecha').onchange = e => {
    STATE.registroFecha = e.target.value || hoyISO();
    cargarRegistroFecha();
  };
  $('#btn-day-prev').onclick = () => {
    STATE.registroFecha = shiftDayISO(STATE.registroFecha, -1);
    renderRegistro();
  };
  $('#btn-day-next').onclick = () => {
    STATE.registroFecha = shiftDayISO(STATE.registroFecha, +1);
    renderRegistro();
  };
  $('#btn-day-today').onclick = () => { STATE.registroFecha = hoyISO(); renderRegistro(); };
  $('#btn-pick-date').onclick = () => $('#registro-fecha').showPicker?.() ?? $('#registro-fecha').focus();
  $('#btn-clear-day').onclick = () => {
    if (!confirm('¿Borrar todos los datos del día? Tendrás que darle a Guardar día para confirmar.')) return;
    STATE.registro.agua_ml   = 0;
    STATE.registro.notas     = '';
    STATE.registro.meals     = {};
    D.COMIDAS.forEach(co => { STATE.registro.meals[co.id] = { frutas_ud: 0, alternativa_foods: [] }; });
    $('#dia-notas').value = '';
    renderAgua();
    renderMeals();
    renderDayKcal();
    renderDayFruits();
    toast('Día vaciado. Pulsa Guardar día para confirmar.');
  };

  $$('button[data-add-ml]').forEach(b => b.onclick = () => {
    const delta = Number(b.dataset.addMl);
    STATE.registro.agua_ml = Math.max(0, STATE.registro.agua_ml + delta);
    renderAgua();
  });

  $('#dia-notas').oninput = e => { STATE.registro.notas = e.target.value; };
  $('#btn-guardar-dia').onclick = guardarDia;

  // Semana / Planes
  $('#btn-new-plan').onclick = nuevoPlan;
  $('#btn-plan-back').onclick = () => { STATE.editingPlan = null; renderPlansList(); };
  $('#plan-nombre').oninput = e => { if (STATE.editingPlan) STATE.editingPlan.nombre = e.target.value; };
  $('#plan-notas').oninput  = e => { if (STATE.editingPlan) STATE.editingPlan.notas  = e.target.value; };
  $('#plan-day-minus').onclick = () => cambiarDias(-1);
  $('#plan-day-plus').onclick  = () => cambiarDias(+1);
  $('#btn-suggest-all').onclick = sugerirTodoElPlan;
  $('#btn-plan-save').onclick   = guardarPlan;
  $('#btn-plan-delete').onclick = eliminarPlan;

  // Gráficas
  $('#chart-buttons').onclick = e => {
    const c = e.target.closest('.chip');
    if (!c) return;
    mostrarChart(c.dataset.chart);
  };
  $('#chart-range-chips').onclick = e => {
    const c = e.target.closest('.chip');
    if (!c) return;
    STATE.chartRangeDias = Number(c.dataset.range);
    $$('#chart-range-chips .chip').forEach(b => b.classList.toggle('active', b === c));
    if (STATE.chartActivo) mostrarChart(STATE.chartActivo);
  };
  $('#chart-close').onclick = () => {
    $('#chart-wrap').classList.add('hidden');
    $$('#chart-buttons .chip').forEach(b => b.classList.remove('active'));
    STATE.chartActivo = null;
    destroyChart();
  };

  // Visor de fotos
  $('#photo-modal-close').onclick = closePhoto;
  $('#photo-modal').onclick = e => { if (e.target.id === 'photo-modal') closePhoto(); };

  // Compartir workspace
  $('#btn-share-close').onclick = closeShare;
  $('#share-modal').onclick = e => { if (e.target.id === 'share-modal') closeShare(); };
  $('#btn-share-add').onclick = async () => {
    const email = $('#share-email').value.trim();
    if (!email) { toast('Escribe un email', 'error'); return; }
    try {
      await CLOUD.invite(email);
      toast('Añadido ✓');
      $('#share-email').value = '';
      renderShareMembers();
    } catch (e) {
      toast(e.message || 'Error', 'error');
    }
  };

  // Menú
  $('#btn-menu').onclick = openMenu;
  $('#btn-close-menu').onclick = closeMenu;
  $('#menu-modal').onclick = e => { if (e.target.id === 'menu-modal') closeMenu(); };
  $('#btn-export').onclick = () => { DB.exportToFile(); toast('Descargando…'); };
  $('#file-import').onchange = async e => {
    const f = e.target.files[0];
    if (!f) return;
    if (!confirm('¿Reemplazar la base de datos actual?')) return;
    await DB.importFromFile(f);
    toast('Importado ✓');
    closeMenu();
    goTab(STATE.tab);
  };
  $('#btn-reset').onclick = async () => {
    if (!confirm('Esto borrará TODOS los combos, días, pesos y fotos. ¿Seguro?')) return;
    await DB.reset();
    toast('Borrado');
    closeMenu();
    goTab(STATE.tab);
  };

  goTab('registro');
}

main();
