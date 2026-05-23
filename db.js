// SQLite en navegador via sql.js (WebAssembly).
// Persistencia: el blob de la BD se guarda en IndexedDB y se rehidrata al abrir.
// Export / Import: el usuario puede descargar/cargar el fichero .sqlite manualmente.

const DB_IDB_NAME   = 'nutricion-coach10';
const DB_IDB_STORE  = 'db';
const DB_IDB_KEY    = 'sqlite-blob';
const SQLJS_VERSION = '1.10.3';
const SQLJS_CDN     = `https://cdn.jsdelivr.net/npm/sql.js@${SQLJS_VERSION}/dist/`;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS combos (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre       TEXT,
  tipo_comida  TEXT NOT NULL,
  hidrato_id   TEXT,
  proteina_id  TEXT,
  grasa_id     TEXT,
  vegetal_id   TEXT,
  fruta_id     TEXT,
  origen       TEXT DEFAULT 'usuario',  -- 'usuario' | 'sugerencia'
  notas        TEXT,
  created_at   TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS combo_feedback (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  combo_id    INTEGER NOT NULL,
  gusto       INTEGER,
  comodidad   INTEGER,
  comentario  TEXT,
  created_at  TEXT DEFAULT (datetime('now','localtime')),
  FOREIGN KEY (combo_id) REFERENCES combos(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS daily_logs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  fecha       TEXT NOT NULL UNIQUE,
  agua_ml     INTEGER DEFAULT 0,
  frutas_ud   INTEGER DEFAULT 0,
  notas       TEXT,
  created_at  TEXT DEFAULT (datetime('now','localtime')),
  updated_at  TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS meal_logs (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  daily_log_id       INTEGER NOT NULL,
  tipo_comida        TEXT NOT NULL,
  combo_id           INTEGER,
  comido_segun_plan  INTEGER DEFAULT 1,
  alternativa_texto  TEXT,
  gusto              INTEGER,
  comodidad          INTEGER,
  foto_data          TEXT,
  notas              TEXT,
  frutas_ud          INTEGER DEFAULT 0,
  kcal_estimadas    INTEGER,
  combo_snapshot    TEXT,
  FOREIGN KEY (daily_log_id) REFERENCES daily_logs(id) ON DELETE CASCADE,
  FOREIGN KEY (combo_id)     REFERENCES combos(id)     ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS weight_logs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  fecha       TEXT NOT NULL UNIQUE,
  peso_kg     REAL NOT NULL,
  notas       TEXT,
  created_at  TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS weekly_plans (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  semana_inicio  TEXT NOT NULL UNIQUE,
  meals_json     TEXT,
  notas          TEXT,
  created_at     TEXT DEFAULT (datetime('now','localtime')),
  updated_at     TEXT DEFAULT (datetime('now','localtime'))
);

-- Planes reutilizables sin fecha: solo Día 1..N
CREATE TABLE IF NOT EXISTS plans (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre       TEXT NOT NULL,
  dias_count   INTEGER NOT NULL DEFAULT 7,
  meals_json   TEXT,
  notas        TEXT,
  created_at   TEXT DEFAULT (datetime('now','localtime')),
  updated_at   TEXT DEFAULT (datetime('now','localtime'))
);

-- Asignación de un plan a un rango de fechas para usarlo en Registro
CREATE TABLE IF NOT EXISTS plan_applications (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id     INTEGER NOT NULL,
  start_date  TEXT NOT NULL,
  end_date    TEXT NOT NULL,
  notas       TEXT,
  created_at  TEXT DEFAULT (datetime('now','localtime')),
  FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_apps_range ON plan_applications(start_date, end_date);

-- Lista de la compra: marcas "comprado" persistentes por rango de fechas
CREATE TABLE IF NOT EXISTS shopping_lists (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  start_date  TEXT NOT NULL,
  end_date    TEXT NOT NULL,
  bought_json TEXT,
  updated_at  TEXT DEFAULT (datetime('now','localtime')),
  UNIQUE(start_date, end_date)
);

CREATE INDEX IF NOT EXISTS idx_combos_tipo     ON combos(tipo_comida);
CREATE INDEX IF NOT EXISTS idx_daily_fecha     ON daily_logs(fecha);
CREATE INDEX IF NOT EXISTS idx_meal_log_daily  ON meal_logs(daily_log_id);
CREATE INDEX IF NOT EXISTS idx_weight_fecha    ON weight_logs(fecha);
`;

const DB = (() => {
  let _SQL = null;
  let _db = null;

  function idbOpen() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_IDB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(DB_IDB_STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror   = () => reject(req.error);
    });
  }

  async function idbLoadBlob() {
    const idb = await idbOpen();
    return new Promise((resolve, reject) => {
      const tx = idb.transaction(DB_IDB_STORE, 'readonly');
      const req = tx.objectStore(DB_IDB_STORE).get(DB_IDB_KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror   = () => reject(req.error);
    });
  }

  async function idbSaveBlob(uint8) {
    const idb = await idbOpen();
    return new Promise((resolve, reject) => {
      const tx = idb.transaction(DB_IDB_STORE, 'readwrite');
      tx.objectStore(DB_IDB_STORE).put(uint8, DB_IDB_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror    = () => reject(tx.error);
    });
  }

  async function init() {
    if (_db) return _db;
    _SQL = await initSqlJs({ locateFile: f => SQLJS_CDN + f });
    const existing = await idbLoadBlob();
    _db = existing ? new _SQL.Database(existing) : new _SQL.Database();
    _db.exec(SCHEMA);
    runMigrations();
    await persist();
    return _db;
  }

  // ALTER TABLE ADD COLUMN sólo si la columna no existe (idempotente).
  function ensureColumn(table, col, def) {
    const cols = exec(`PRAGMA table_info(${table})`).map(r => r.name);
    if (!cols.includes(col)) run(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
  }

  function runMigrations() {
    ensureColumn('meal_logs', 'frutas_ud',             'INTEGER DEFAULT 0');
    ensureColumn('meal_logs', 'kcal_estimadas',        'INTEGER');
    ensureColumn('meal_logs', 'combo_snapshot',        'TEXT');
    ensureColumn('meal_logs', 'alternativa_foods_json','TEXT');
  }

  async function persist() {
    if (!_db) return;
    const data = _db.export();
    await idbSaveBlob(data);
  }

  function run(sql, params = []) {
    const stmt = _db.prepare(sql);
    stmt.bind(params);
    stmt.step();
    stmt.free();
  }

  function exec(sql, params = []) {
    const stmt = _db.prepare(sql);
    stmt.bind(params);
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
    return rows;
  }

  function lastInsertId() {
    return exec('SELECT last_insert_rowid() AS id')[0].id;
  }

  // ---- Combos ----------------------------------------------------------

  async function createCombo(c) {
    run(
      `INSERT INTO combos (nombre, tipo_comida, hidrato_id, proteina_id, grasa_id, vegetal_id, fruta_id, origen, notas)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [c.nombre || null, c.tipo_comida, c.hidrato_id || null, c.proteina_id || null,
       c.grasa_id || null, c.vegetal_id || null, c.fruta_id || null,
       c.origen || 'usuario', c.notas || null]
    );
    const id = lastInsertId();
    await persist();
    return id;
  }

  function listCombos(filter = {}) {
    let sql = 'SELECT * FROM combos';
    const where = [];
    const args = [];
    if (filter.tipo_comida) { where.push('tipo_comida = ?'); args.push(filter.tipo_comida); }
    if (where.length) sql += ' WHERE ' + where.join(' AND ');
    sql += ' ORDER BY created_at DESC';
    return exec(sql, args);
  }

  async function updateCombo(c) {
    run(
      `UPDATE combos
       SET nombre = ?, tipo_comida = ?, hidrato_id = ?, proteina_id = ?, grasa_id = ?, vegetal_id = ?, notas = ?
       WHERE id = ?`,
      [c.nombre || null, c.tipo_comida, c.hidrato_id || null, c.proteina_id || null,
       c.grasa_id || null, c.vegetal_id || null, c.notas || null, c.id]
    );
    await persist();
  }

  async function deleteCombo(id) {
    run('DELETE FROM combos WHERE id = ?', [id]);
    await persist();
  }

  // ---- Feedback --------------------------------------------------------

  async function addFeedback(comboId, gusto, comodidad, comentario) {
    run(
      'INSERT INTO combo_feedback (combo_id, gusto, comodidad, comentario) VALUES (?,?,?,?)',
      [comboId, gusto || null, comodidad || null, comentario || null]
    );
    await persist();
  }

  function getFeedback(comboId) {
    return exec('SELECT * FROM combo_feedback WHERE combo_id = ? ORDER BY created_at DESC', [comboId]);
  }

  // ---- Daily logs ------------------------------------------------------

  async function upsertDailyLog(fecha, fields) {
    const rows = exec('SELECT id FROM daily_logs WHERE fecha = ?', [fecha]);
    if (rows.length) {
      const sets = [];
      const args = [];
      for (const [k, v] of Object.entries(fields)) {
        sets.push(`${k} = ?`);
        args.push(v);
      }
      sets.push("updated_at = datetime('now','localtime')");
      args.push(rows[0].id);
      run(`UPDATE daily_logs SET ${sets.join(', ')} WHERE id = ?`, args);
      await persist();
      return rows[0].id;
    } else {
      const cols = ['fecha', ...Object.keys(fields)];
      const placeholders = cols.map(() => '?').join(',');
      run(
        `INSERT INTO daily_logs (${cols.join(',')}) VALUES (${placeholders})`,
        [fecha, ...Object.values(fields)]
      );
      const id = lastInsertId();
      await persist();
      return id;
    }
  }

  function getDailyLog(fecha) {
    const rows = exec('SELECT * FROM daily_logs WHERE fecha = ?', [fecha]);
    return rows[0] || null;
  }

  function listDailyLogs(limit = 90) {
    return exec('SELECT * FROM daily_logs ORDER BY fecha DESC LIMIT ?', [limit]);
  }

  async function deleteDailyLog(id) {
    run('DELETE FROM daily_logs WHERE id = ?', [id]);
    await persist();
  }

  // ---- Meal logs -------------------------------------------------------

  async function upsertMealLog(dailyLogId, tipoComida, fields) {
    const rows = exec(
      'SELECT id FROM meal_logs WHERE daily_log_id = ? AND tipo_comida = ?',
      [dailyLogId, tipoComida]
    );
    if (rows.length) {
      const sets = [];
      const args = [];
      for (const [k, v] of Object.entries(fields)) {
        sets.push(`${k} = ?`);
        args.push(v);
      }
      args.push(rows[0].id);
      run(`UPDATE meal_logs SET ${sets.join(', ')} WHERE id = ?`, args);
      await persist();
      return rows[0].id;
    } else {
      const cols = ['daily_log_id', 'tipo_comida', ...Object.keys(fields)];
      const placeholders = cols.map(() => '?').join(',');
      run(
        `INSERT INTO meal_logs (${cols.join(',')}) VALUES (${placeholders})`,
        [dailyLogId, tipoComida, ...Object.values(fields)]
      );
      const id = lastInsertId();
      await persist();
      return id;
    }
  }

  function listMealLogs(dailyLogId) {
    return exec('SELECT * FROM meal_logs WHERE daily_log_id = ? ORDER BY tipo_comida', [dailyLogId]);
  }

  // ---- Pesos -----------------------------------------------------------

  // Permite registrar uno por ventana de 7 días respecto al último.
  function canRegisterWeight(fechaISO) {
    const last = exec('SELECT * FROM weight_logs ORDER BY fecha DESC LIMIT 1')[0];
    if (!last) return { ok: true };
    const d1 = new Date(last.fecha + 'T00:00:00');
    const d2 = new Date(fechaISO   + 'T00:00:00');
    const days = Math.round((d2 - d1) / 86400000);
    if (days >= 7) return { ok: true, last };
    return { ok: false, last, diasRestantes: 7 - days };
  }

  async function createWeight(fechaISO, pesoKg, notas) {
    run('INSERT INTO weight_logs (fecha, peso_kg, notas) VALUES (?,?,?)',
        [fechaISO, pesoKg, notas || null]);
    const id = lastInsertId();
    await persist();
    return id;
  }

  async function updateWeight(id, pesoKg, notas) {
    run('UPDATE weight_logs SET peso_kg = ?, notas = ? WHERE id = ?',
        [pesoKg, notas || null, id]);
    await persist();
  }

  async function deleteWeight(id) {
    run('DELETE FROM weight_logs WHERE id = ?', [id]);
    await persist();
  }

  function lastWeight() {
    return exec('SELECT * FROM weight_logs ORDER BY fecha DESC LIMIT 1')[0] || null;
  }

  function listWeights(limit = 52) {
    return exec('SELECT * FROM weight_logs ORDER BY fecha DESC LIMIT ?', [limit]);
  }

  // ---- Planes semanales -----------------------------------------------

  async function upsertWeeklyPlan(semanaInicio, mealsObj, notas) {
    const json = JSON.stringify(mealsObj || {});
    const rows = exec('SELECT id FROM weekly_plans WHERE semana_inicio = ?', [semanaInicio]);
    if (rows.length) {
      run(
        `UPDATE weekly_plans SET meals_json = ?, notas = ?, updated_at = datetime('now','localtime')
         WHERE id = ?`,
        [json, notas || null, rows[0].id]
      );
      await persist();
      return rows[0].id;
    }
    run(
      `INSERT INTO weekly_plans (semana_inicio, meals_json, notas) VALUES (?,?,?)`,
      [semanaInicio, json, notas || null]
    );
    const id = lastInsertId();
    await persist();
    return id;
  }

  function getWeeklyPlan(semanaInicio) {
    const rows = exec('SELECT * FROM weekly_plans WHERE semana_inicio = ?', [semanaInicio]);
    if (!rows.length) return null;
    const p = rows[0];
    try { p.meals = JSON.parse(p.meals_json || '{}'); } catch (e) { p.meals = {}; }
    return p;
  }

  async function deleteWeeklyPlan(id) {
    run('DELETE FROM weekly_plans WHERE id = ?', [id]);
    await persist();
  }

  // ---- Plans (sin fecha) -----------------------------------------------

  async function createPlan(p) {
    run(
      'INSERT INTO plans (nombre, dias_count, meals_json, notas) VALUES (?,?,?,?)',
      [p.nombre, p.dias_count || 7, JSON.stringify(p.meals || {}), p.notas || null]
    );
    const id = lastInsertId();
    await persist();
    return id;
  }

  async function updatePlan(p) {
    run(
      `UPDATE plans SET nombre = ?, dias_count = ?, meals_json = ?, notas = ?,
       updated_at = datetime('now','localtime') WHERE id = ?`,
      [p.nombre, p.dias_count, JSON.stringify(p.meals || {}), p.notas || null, p.id]
    );
    await persist();
  }

  async function deletePlan(id) {
    run('DELETE FROM plans WHERE id = ?', [id]);
    await persist();
  }

  function listPlans() {
    return exec('SELECT * FROM plans ORDER BY updated_at DESC').map(p => {
      try { p.meals = JSON.parse(p.meals_json || '{}'); } catch (e) { p.meals = {}; }
      return p;
    });
  }

  function getPlan(id) {
    const rows = exec('SELECT * FROM plans WHERE id = ?', [id]);
    if (!rows.length) return null;
    const p = rows[0];
    try { p.meals = JSON.parse(p.meals_json || '{}'); } catch (e) { p.meals = {}; }
    return p;
  }

  // ---- Plan applications ----------------------------------------------

  async function applyPlanToDate(planId, startDate) {
    const plan = getPlan(planId);
    if (!plan) throw new Error('Plan no encontrado');
    const endDate = (() => {
      const d = new Date(startDate + 'T00:00:00');
      d.setDate(d.getDate() + plan.dias_count - 1);
      return d.toISOString().slice(0, 10);
    })();
    run(
      `INSERT INTO plan_applications (plan_id, start_date, end_date) VALUES (?,?,?)`,
      [planId, startDate, endDate]
    );
    const id = lastInsertId();
    await persist();
    return id;
  }

  async function deletePlanApplication(id) {
    run('DELETE FROM plan_applications WHERE id = ?', [id]);
    await persist();
  }

  function listPlanApplications() {
    return exec(
      `SELECT pa.*, p.nombre AS plan_nombre, p.dias_count
       FROM plan_applications pa
       JOIN plans p ON p.id = pa.plan_id
       ORDER BY pa.start_date DESC`
    );
  }

  // ---- Lista de la compra ---------------------------------------------

  function getShoppingMarks(startDate, endDate) {
    const rows = exec(
      'SELECT * FROM shopping_lists WHERE start_date = ? AND end_date = ?',
      [startDate, endDate]
    );
    if (!rows.length) return [];
    try { return JSON.parse(rows[0].bought_json || '[]'); } catch (e) { return []; }
  }

  async function saveShoppingMarks(startDate, endDate, boughtArr) {
    const json = JSON.stringify(boughtArr || []);
    const rows = exec('SELECT id FROM shopping_lists WHERE start_date = ? AND end_date = ?', [startDate, endDate]);
    if (rows.length) {
      run(`UPDATE shopping_lists SET bought_json = ?, updated_at = datetime('now','localtime') WHERE id = ?`,
          [json, rows[0].id]);
    } else {
      run(`INSERT INTO shopping_lists (start_date, end_date, bought_json) VALUES (?,?,?)`,
          [startDate, endDate, json]);
    }
    await persist();
  }

  // Devuelve la aplicación activa para una fecha, o null
  function getActivePlanForDate(fecha) {
    const rows = exec(
      `SELECT pa.*, p.nombre AS plan_nombre, p.dias_count, p.meals_json
       FROM plan_applications pa
       JOIN plans p ON p.id = pa.plan_id
       WHERE pa.start_date <= ? AND pa.end_date >= ?
       ORDER BY pa.created_at DESC LIMIT 1`,
      [fecha, fecha]
    );
    if (!rows.length) return null;
    const a = rows[0];
    try { a.plan_meals = JSON.parse(a.meals_json || '{}'); } catch (e) { a.plan_meals = {}; }
    const d1 = new Date(a.start_date + 'T00:00:00');
    const d2 = new Date(fecha       + 'T00:00:00');
    a.dia_num = Math.round((d2 - d1) / 86400000) + 1;  // 1-indexed
    return a;
  }

  // ---- Series temporales (para gráficas) -------------------------------

  function seriesAgua(dias = 30) {
    return exec(
      `SELECT fecha, ROUND(agua_ml/1000.0, 2) AS litros
       FROM daily_logs
       WHERE fecha >= date('now', ?)
       ORDER BY fecha ASC`,
      [`-${dias} days`]
    );
  }

  function seriePeso(limit = 26) {
    return exec(
      `SELECT fecha, peso_kg FROM weight_logs ORDER BY fecha ASC LIMIT ?`,
      [limit]
    );
  }

  function serieCalorias(dias = 30) {
    return exec(
      `SELECT dl.fecha AS fecha, COALESCE(SUM(ml.kcal_estimadas), 0) AS kcal
       FROM daily_logs dl
       LEFT JOIN meal_logs ml ON ml.daily_log_id = dl.id
       WHERE dl.fecha >= date('now', ?)
       GROUP BY dl.fecha
       ORDER BY dl.fecha ASC`,
      [`-${dias} days`]
    );
  }

  // ---- Estadísticas ----------------------------------------------------

  function stats(dias = 30) {
    return {
      totalDias: exec('SELECT COUNT(*) AS n FROM daily_logs')[0].n,
      totalCombos: exec('SELECT COUNT(*) AS n FROM combos')[0].n,
      mediaAgua: exec(
        `SELECT ROUND(AVG(agua_ml)/1000.0, 2) AS media_l
         FROM daily_logs
         WHERE fecha >= date('now', ?)`,
        [`-${dias} days`]
      )[0].media_l,
      mediaKcal: exec(
        `SELECT ROUND(AVG(total), 0) AS media
         FROM (
           SELECT dl.id, COALESCE(SUM(ml.kcal_estimadas), 0) AS total
           FROM daily_logs dl
           LEFT JOIN meal_logs ml ON ml.daily_log_id = dl.id
           WHERE dl.fecha >= date('now', ?)
           GROUP BY dl.id
         )`,
        [`-${dias} days`]
      )[0].media,
      porcentajePlan: exec(
        `SELECT ROUND(100.0 * SUM(comido_segun_plan) / COUNT(*), 1) AS pct
         FROM meal_logs
         WHERE comido_segun_plan IS NOT NULL`
      )[0].pct,
      ultimoPeso: lastWeight(),
      topCombos: exec(
        `SELECT c.id, c.nombre, c.tipo_comida, COUNT(m.id) AS veces
         FROM combos c
         LEFT JOIN meal_logs m ON m.combo_id = c.id
         GROUP BY c.id
         HAVING veces > 0
         ORDER BY veces DESC
         LIMIT 5`
      ),
    };
  }

  function dailyKcal(dailyLogId) {
    return exec(
      `SELECT COALESCE(SUM(kcal_estimadas), 0) AS total
       FROM meal_logs WHERE daily_log_id = ?`,
      [dailyLogId]
    )[0].total;
  }

  // ---- Export / Import -------------------------------------------------

  function exportToFile() {
    const data = _db.export();
    const blob = new Blob([data], { type: 'application/x-sqlite3' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const fecha = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `nutricion-coach10-${fecha}.sqlite`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function importFromFile(file) {
    const buf = new Uint8Array(await file.arrayBuffer());
    _db.close();
    _db = new _SQL.Database(buf);
    _db.exec(SCHEMA);
    await persist();
  }

  async function reset() {
    _db.close();
    _db = new _SQL.Database();
    _db.exec(SCHEMA);
    await persist();
  }

  return {
    init,
    createCombo, listCombos, updateCombo, deleteCombo,
    addFeedback, getFeedback,
    upsertDailyLog, getDailyLog, listDailyLogs, deleteDailyLog,
    upsertMealLog, listMealLogs,
    canRegisterWeight, createWeight, updateWeight, deleteWeight, lastWeight, listWeights,
    upsertWeeklyPlan, getWeeklyPlan, deleteWeeklyPlan,
    createPlan, updatePlan, deletePlan, listPlans, getPlan,
    applyPlanToDate, deletePlanApplication, listPlanApplications, getActivePlanForDate,
    getShoppingMarks, saveShoppingMarks,
    seriesAgua, seriePeso, serieCalorias,
    dailyKcal,
    stats,
    exportToFile, importFromFile, reset,
  };
})();

window.DB = DB;
