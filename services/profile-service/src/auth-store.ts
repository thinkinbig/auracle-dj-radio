import { randomBytes, randomUUID, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import Database from "better-sqlite3";
import type { AuthUser } from "@auracle/shared";

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const SWEEP_INTERVAL_MS = 1000 * 60 * 60;
const KEY_LENGTH = 64;

const scrypt = promisify(scryptCb) as (password: string, salt: string, keylen: number) => Promise<Buffer>;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS auth_users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS auth_sessions (
  token      TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES auth_users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(user_id);
`;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const hash = (await scrypt(password, salt, KEY_LENGTH)).toString("hex");
  return `${salt}:${hash}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, "hex");
  const actual = await scrypt(password, salt, KEY_LENGTH);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export class AuthStore {
  private readonly db: Database.Database;
  private readonly sweepTimer: ReturnType<typeof setInterval>;

  constructor(path: string) {
    this.db = new Database(path);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.db.exec(SCHEMA);
    this.pruneExpiredSessions();
    // Sweep expired sessions on a timer rather than on every token read.
    this.sweepTimer = setInterval(() => this.pruneExpiredSessions(), SWEEP_INTERVAL_MS);
    this.sweepTimer.unref?.();
  }

  async createUser(input: { email: string; password: string; name?: string }): Promise<AuthUser | undefined> {
    const email = normalizeEmail(input.email);
    const name = input.name?.trim() || email.split("@")[0] || "Listener";
    const user: AuthUser = { id: randomUUID(), email, name };
    const passwordHash = await hashPassword(input.password);

    try {
      this.db
        .prepare(
          `INSERT INTO auth_users (id, email, name, password_hash, created_at)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(user.id, user.email, user.name, passwordHash, Date.now());
      return user;
    } catch (err) {
      if ((err as { code?: string }).code === "SQLITE_CONSTRAINT_UNIQUE") return undefined;
      throw err;
    }
  }

  async verifyUser(email: string, password: string): Promise<AuthUser | undefined> {
    const row = this.db
      .prepare(`SELECT id, email, name, password_hash FROM auth_users WHERE email = ?`)
      .get(normalizeEmail(email)) as (AuthUser & { password_hash: string }) | undefined;
    if (!row || !(await verifyPassword(password, row.password_hash))) return undefined;
    return { id: row.id, email: row.email, name: row.name };
  }

  createSession(userId: string): string {
    const token = randomBytes(32).toString("base64url");
    const now = Date.now();
    this.db
      .prepare(
        `INSERT INTO auth_sessions (token, user_id, created_at, expires_at)
         VALUES (?, ?, ?, ?)`,
      )
      .run(token, userId, now, now + SESSION_TTL_MS);
    return token;
  }

  getUserByToken(token: string | undefined): AuthUser | undefined {
    if (!token) return undefined;
    // Expired rows are filtered out by `expires_at > ?` here; no write needed
    // on this hot read path — the sweep timer reclaims them.
    return this.db
      .prepare(
        `SELECT u.id, u.email, u.name
         FROM auth_sessions s
         JOIN auth_users u ON u.id = s.user_id
         WHERE s.token = ? AND s.expires_at > ?`,
      )
      .get(token, Date.now()) as AuthUser | undefined;
  }

  deleteSession(token: string | undefined): void {
    if (!token) return;
    this.db.prepare(`DELETE FROM auth_sessions WHERE token = ?`).run(token);
  }

  private pruneExpiredSessions(): void {
    this.db.prepare(`DELETE FROM auth_sessions WHERE expires_at <= ?`).run(Date.now());
  }

  close(): void {
    clearInterval(this.sweepTimer);
    this.db.close();
  }
}
