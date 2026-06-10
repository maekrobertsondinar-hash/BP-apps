import initSqlJs, { Database } from 'sql.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(process.cwd(), 'data', 'csgm.db');
const SETUP_FILE = path.join(process.cwd(), 'data', 'admin-setup.txt');

let db: Database;

const SCHEMA = `
PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  full_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'USER' CHECK(role IN ('ADMIN','USER')),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','APPROVED')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  last_login TEXT
);

CREATE TABLE IF NOT EXISTS workers (
  matricule TEXT PRIMARY KEY,
  nom TEXT NOT NULL,
  prenom TEXT NOT NULL,
  date_naissance TEXT,
  fonction TEXT,
  date_entree TEXT,
  date_fin TEXT DEFAULT '',
  wilaya TEXT,
  affiliation TEXT,
  chantier TEXT DEFAULT '',
  affair TEXT DEFAULT '',
  numero_permis TEXT DEFAULT '',
  date_expiration_permis TEXT DEFAULT '',
  numero_brevet_march TEXT DEFAULT '',
  date_expiration_brevet_march TEXT DEFAULT '',
  numero_brevet_dang TEXT DEFAULT '',
  date_expiration_brevet_dang TEXT DEFAULT '',
  numero_brevet_pers TEXT DEFAULT '',
  date_expiration_brevet_pers TEXT DEFAULT '',
  doc_permis_utilisation TEXT DEFAULT '',
  doc_brevet_march_utilisation TEXT DEFAULT '',
  doc_brevet_dang_utilisation TEXT DEFAULT '',
  doc_brevet_pers_utilisation TEXT DEFAULT '',
  created_by TEXT DEFAULT '',
  created_at TEXT DEFAULT '',
  last_modified_by TEXT DEFAULT '',
  updated_at TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  worker_matricule TEXT NOT NULL,
  doc_type TEXT NOT NULL CHECK(doc_type IN ('docPermis','docBrevetMarch','docBrevetDang','docBrevetPers')),
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  data TEXT NOT NULL,
  uploaded_by TEXT DEFAULT '',
  uploaded_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  UNIQUE(worker_matricule, doc_type),
  FOREIGN KEY(worker_matricule) REFERENCES workers(matricule) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS bordereau_entries (
  id TEXT PRIMARY KEY,
  chantier TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('arrivee','depart')),
  date TEXT NOT NULL,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  data TEXT NOT NULL,
  uploaded_by TEXT DEFAULT '',
  uploaded_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_by TEXT DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
`;

export async function initDB(): Promise<void> {
  const SQL = await initSqlJs({
    locateFile: (file: string) =>
      path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', file),
  });

  if (fs.existsSync(DB_PATH)) {
    const buf = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buf);
  } else {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    db = new SQL.Database();
  }

  db.run(SCHEMA);
  await seedAdmin();
  persistDB();
  console.log('✅ Database initialized');
}

async function seedAdmin(): Promise<void> {
  const row = db.exec('SELECT COUNT(*) as cnt FROM users WHERE role = ?', ['ADMIN']);
  const count = row[0]?.values[0]?.[0] as number ?? 0;
  if (count > 0) return;

  const password = generatePassword(12);
  const hash = await bcrypt.hash(password, 12);

  db.run(
    `INSERT INTO users (username, full_name, password_hash, role, status)
     VALUES (?, ?, ?, 'ADMIN', 'APPROVED')`,
    ['AMROUS Abdallah', 'AMROUS Abdallah', hash]
  );

  const msg = [
    '='.repeat(60),
    '  FIRST-RUN ADMIN SETUP',
    '  Username : AMROUS Abdallah',
    `  Password : ${password}`,
    '  CHANGE THIS PASSWORD after first login.',
    '='.repeat(60),
  ].join('\n');

  console.log('\n' + msg + '\n');
  fs.mkdirSync(path.dirname(SETUP_FILE), { recursive: true });
  fs.writeFileSync(SETUP_FILE, msg);
}

function generatePassword(len: number): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%';
  let out = '';
  for (let i = 0; i < len; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

export function getDB(): Database {
  return db;
}

export function persistDB(): void {
  if (!db) return;
  const data = db.export();
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

export function query<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = []
): T[] {
  const result = db.exec(sql, params as any);
  if (!result.length) return [];
  const { columns, values } = result[0];
  return values.map(row => {
    const obj: Record<string, unknown> = {};
    columns.forEach((col, i) => { obj[col] = row[i]; });
    return obj as T;
  });
}

export function run(
  sql: string,
  params: unknown[] = []
): void {
  db.run(sql, params as any);
}

export function get<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = []
): T | null {
  const rows = query<T>(sql, params);
  return rows[0] ?? null;
}
