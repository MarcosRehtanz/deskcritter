// Módulo singleton de acceso a SQLite via tauri-plugin-sql
// Usa invoke() directo en vez de la clase Database (no disponible sin bundler)

import { dbg } from './debug.js';

const DB_URL = 'sqlite:deskcritter.db';
const invoke = () => window.__TAURI__.core.invoke;

async function init() {
  dbg('db', 'init() cargando DB...');
  await invoke()('plugin:sql|load', { db: DB_URL });
  dbg('db', 'init() DB cargada');
}

async function select(query, values = []) {
  return invoke()('plugin:sql|select', { db: DB_URL, query, values });
}

async function execute(query, values = []) {
  return invoke()('plugin:sql|execute', { db: DB_URL, query, values });
}

// --- Config ---

export { init };

export async function getConfig(key) {
  const rows = await select('SELECT value FROM config WHERE key = ?', [key]);
  return rows.length > 0 ? JSON.parse(rows[0].value) : undefined;
}

export async function setConfig(key, value) {
  const json = JSON.stringify(value);
  await execute(
    'INSERT INTO config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [key, json]
  );
}

export async function getAllConfig() {
  const rows = await select('SELECT key, value FROM config');
  const result = {};
  for (const row of rows) {
    try { result[row.key] = JSON.parse(row.value); } catch { result[row.key] = row.value; }
  }
  return result;
}

// --- Characters ---

export async function getCharacters() {
  return select('SELECT id, name, sprite, is_active FROM characters ORDER BY name');
}

export async function getActiveCharacter() {
  const rows = await select('SELECT id, name, sprite, is_active FROM characters WHERE is_active = 1 LIMIT 1');
  return rows.length > 0 ? rows[0] : null;
}

export async function addCharacter(name, spriteDataUrl) {
  const result = await execute(
    'INSERT INTO characters (name, sprite, is_active) VALUES (?, ?, 0)',
    [name, spriteDataUrl]
  );
  return result.lastInsertId;
}

export async function deleteCharacter(id) {
  await execute('DELETE FROM characters WHERE id = ?', [id]);
}

export async function setActiveCharacter(id) {
  await execute('UPDATE characters SET is_active = 0');
  await execute('UPDATE characters SET is_active = 1 WHERE id = ?', [id]);
}

export async function deactivateAllCharacters() {
  await execute('UPDATE characters SET is_active = 0');
}

// --- Historial de chat ---

export async function addMessage(sessionId, role, text) {
  const timestamp = Date.now();
  await execute(
    'INSERT INTO messages (session_id, role, text, timestamp) VALUES ($1, $2, $3, $4)',
    [sessionId, role, text, timestamp]
  );
}

export async function getMessages(sessionId, limit = 100) {
  const rows = await select(
    'SELECT id, session_id, role, text, timestamp FROM messages WHERE session_id = $1 ORDER BY timestamp ASC LIMIT $2',
    [sessionId, limit]
  );
  return rows;
}

export async function searchMessages(query, limit = 50) {
  const rows = await select(
    'SELECT id, session_id, role, text, timestamp FROM messages WHERE text LIKE $1 ORDER BY timestamp DESC LIMIT $2',
    ['%' + query + '%', limit]
  );
  return rows;
}

export async function getRecentSessions(limit = 20) {
  const rows = await select(
    `SELECT session_id, MIN(timestamp) as first_msg, MAX(timestamp) as last_msg, COUNT(*) as msg_count
     FROM messages GROUP BY session_id ORDER BY last_msg DESC LIMIT $1`,
    [limit]
  );
  return rows;
}

export async function deleteOldMessages(maxMessages) {
  if (!maxMessages || maxMessages <= 0) return;
  await execute(
    'DELETE FROM messages WHERE id NOT IN (SELECT id FROM messages ORDER BY timestamp DESC LIMIT $1)',
    [maxMessages]
  );
}

