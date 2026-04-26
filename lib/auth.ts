import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { supabaseRequest } from "@/lib/supabase-rest";

const CONFIGURED_USERS_TABLE = process.env.SUPABASE_USERS_TABLE;
const CONFIGURED_SESSIONS_TABLE = process.env.SUPABASE_SESSIONS_TABLE;
const DEFAULT_USERS_TABLE = "app_users";
const DEFAULT_SESSIONS_TABLE = "app_sessions";
const SESSION_COOKIE = "app_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

let resolvedUsersTable: string | null = CONFIGURED_USERS_TABLE || null;
let resolvedSessionsTable: string | null = CONFIGURED_SESSIONS_TABLE || null;

function isMissingTableError(error: unknown) {
  return error instanceof Error && error.message.includes("PGRST205");
}

function getAuthSetupMessage() {
  return [
    "Auth tables are missing in Supabase.",
    "Run supabase/submissions.sql in the Supabase SQL editor, or set SUPABASE_USERS_TABLE/SUPABASE_SESSIONS_TABLE to existing tables.",
  ].join(" ");
}

const USER_TABLE_CANDIDATES = [CONFIGURED_USERS_TABLE, DEFAULT_USERS_TABLE, "users"].filter(Boolean) as string[];
const SESSION_TABLE_CANDIDATES = [CONFIGURED_SESSIONS_TABLE, DEFAULT_SESSIONS_TABLE, "sessions"].filter(Boolean) as string[];

type UserRow = {
  id: string;
  username: string;
  password_hash: string;
  created_at: string;
};

type SessionRow = {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: string;
};

export type AuthUser = {
  id: string;
  username: string;
};

function hashPassword(password: string, salt?: string) {
  const usedSalt = salt || randomBytes(16).toString("hex");
  const key = scryptSync(password, usedSalt, 64).toString("hex");
  return `${usedSalt}:${key}`;
}

function verifyPassword(password: string, passwordHash: string) {
  const [salt, key] = passwordHash.split(":");
  if (!salt || !key) {
    return false;
  }

  const computed = scryptSync(password, salt, 64);
  const stored = Buffer.from(key, "hex");
  if (computed.length !== stored.length) {
    return false;
  }

  return timingSafeEqual(computed, stored);
}

function hashSessionToken(token: string) {
  return scryptSync(token, "session-token", 64).toString("hex");
}

async function resolveUsersTable() {
  if (resolvedUsersTable) {
    return resolvedUsersTable;
  }

  for (const table of USER_TABLE_CANDIDATES) {
    try {
      await supabaseRequest<UserRow[]>(`${table}?select=id&limit=1`);
      resolvedUsersTable = table;
      return table;
    } catch (error) {
      if (!isMissingTableError(error)) {
        throw error;
      }
    }
  }

  throw new Error(getAuthSetupMessage());
}

async function resolveSessionsTable() {
  if (resolvedSessionsTable) {
    return resolvedSessionsTable;
  }

  for (const table of SESSION_TABLE_CANDIDATES) {
    try {
      await supabaseRequest<SessionRow[]>(`${table}?select=id&limit=1`);
      resolvedSessionsTable = table;
      return table;
    } catch (error) {
      if (!isMissingTableError(error)) {
        throw error;
      }
    }
  }

  throw new Error(getAuthSetupMessage());
}

export async function registerUser(username: string, password: string): Promise<AuthUser> {
  const normalized = username.trim().toLowerCase();
  if (normalized.length < 3) {
    throw new Error("Username must be at least 3 characters.");
  }
  if (password.length < 6) {
    throw new Error("Password must be at least 6 characters.");
  }

  const usersTable = await resolveUsersTable();
  const existing = await supabaseRequest<UserRow[]>(`${usersTable}?select=id,username,password_hash,created_at&username=eq.${encodeURIComponent(normalized)}&limit=1`);
  if (existing[0]) {
    throw new Error("Username already exists.");
  }

  const rows = await supabaseRequest<UserRow[]>(`${usersTable}?select=id,username,password_hash,created_at`, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ username: normalized, password_hash: hashPassword(password) }),
  });

  if (!rows[0]) {
    throw new Error("Failed to create account.");
  }

  return { id: rows[0].id, username: rows[0].username };
}

export async function loginUser(username: string, password: string): Promise<AuthUser> {
  const normalized = username.trim().toLowerCase();
  const usersTable = await resolveUsersTable();
  const rows = await supabaseRequest<UserRow[]>(`${usersTable}?select=id,username,password_hash,created_at&username=eq.${encodeURIComponent(normalized)}&limit=1`);
  const row = rows[0];
  if (!row || !verifyPassword(password, row.password_hash)) {
    throw new Error("Invalid username or password.");
  }

  return { id: row.id, username: row.username };
}

export async function createSession(userId: string) {
  const sessionsTable = await resolveSessionsTable();
  const rawToken = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString();

  await supabaseRequest<SessionRow[]>(`${sessionsTable}?select=id,user_id,token_hash,expires_at`, {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ user_id: userId, token_hash: hashSessionToken(rawToken), expires_at: expiresAt }),
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, rawToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function clearSession() {
  const sessionsTable = await resolveSessionsTable();
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;

  if (token) {
    await supabaseRequest(`${sessionsTable}?token_hash=eq.${encodeURIComponent(hashSessionToken(token))}`, {
      method: "DELETE",
    });
  }

  cookieStore.delete(SESSION_COOKIE);
}

export async function getAuthenticatedUser(): Promise<AuthUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) {
    return null;
  }

  const [usersTable, sessionsTable] = await Promise.all([resolveUsersTable(), resolveSessionsTable()]);
  const tokenHash = hashSessionToken(token);
  const sessions = await supabaseRequest<Array<SessionRow & Record<string, UserRow | undefined>>>(
    `${sessionsTable}?select=id,user_id,token_hash,expires_at,${usersTable}(id,username,password_hash,created_at)&token_hash=eq.${encodeURIComponent(tokenHash)}&limit=1`
  );

  const session = sessions[0];
  if (!session) {
    return null;
  }

  if (new Date(session.expires_at).getTime() <= Date.now()) {
    await clearSession();
    return null;
  }

  const user = session[usersTable];
  if (!user) {
    return null;
  }

  return { id: user.id, username: user.username };
}
