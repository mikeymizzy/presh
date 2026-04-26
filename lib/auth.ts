import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { supabaseRequest } from "@/lib/supabase-rest";

const USERS_TABLE = process.env.SUPABASE_USERS_TABLE || "app_users";
const SESSIONS_TABLE = process.env.SUPABASE_SESSIONS_TABLE || "app_sessions";
const SESSION_COOKIE = "app_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

function isMissingTableError(error: unknown) {
  return error instanceof Error && error.message.includes("PGRST205");
}

function getAuthSetupMessage() {
  return [
    "Auth tables are missing in Supabase.",
    "Run supabase/submissions.sql in the Supabase SQL editor to create app_users/app_sessions/submissions schema.",
    `Expected tables: ${USERS_TABLE}, ${SESSIONS_TABLE}.`,
  ].join(" ");
}


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

export async function registerUser(username: string, password: string): Promise<AuthUser> {
  const normalized = username.trim().toLowerCase();
  if (normalized.length < 3) {
    throw new Error("Username must be at least 3 characters.");
  }
  if (password.length < 6) {
    throw new Error("Password must be at least 6 characters.");
  }

  try {
    const existing = await supabaseRequest<UserRow[]>(`${USERS_TABLE}?select=id,username,password_hash,created_at&username=eq.${encodeURIComponent(normalized)}&limit=1`);
    if (existing[0]) {
      throw new Error("Username already exists.");
    }

    const rows = await supabaseRequest<UserRow[]>(`${USERS_TABLE}?select=id,username,password_hash,created_at`, {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ username: normalized, password_hash: hashPassword(password) }),
    });

    if (!rows[0]) {
      throw new Error("Failed to create account.");
    }

    return { id: rows[0].id, username: rows[0].username };
  } catch (error) {
    if (isMissingTableError(error)) {
      throw new Error(getAuthSetupMessage());
    }
    throw error;
  }
}

export async function loginUser(username: string, password: string): Promise<AuthUser> {
  const normalized = username.trim().toLowerCase();
  try {
    const rows = await supabaseRequest<UserRow[]>(`${USERS_TABLE}?select=id,username,password_hash,created_at&username=eq.${encodeURIComponent(normalized)}&limit=1`);
    const row = rows[0];
    if (!row || !verifyPassword(password, row.password_hash)) {
      throw new Error("Invalid username or password.");
    }

    return { id: row.id, username: row.username };
  } catch (error) {
    if (isMissingTableError(error)) {
      throw new Error(getAuthSetupMessage());
    }
    throw error;
  }
}

export async function createSession(userId: string) {
  const rawToken = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString();

  try {
    await supabaseRequest<SessionRow[]>(`${SESSIONS_TABLE}?select=id,user_id,token_hash,expires_at`, {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ user_id: userId, token_hash: hashSessionToken(rawToken), expires_at: expiresAt }),
    });
  } catch (error) {
    if (isMissingTableError(error)) {
      throw new Error(getAuthSetupMessage());
    }
    throw error;
  }

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
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;

  if (token) {
    await supabaseRequest(`${SESSIONS_TABLE}?token_hash=eq.${encodeURIComponent(hashSessionToken(token))}`, {
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

  const tokenHash = hashSessionToken(token);
  let sessions: Array<SessionRow & Record<string, UserRow | undefined>>;
  try {
    sessions = await supabaseRequest<Array<SessionRow & Record<string, UserRow | undefined>>>(
      `${SESSIONS_TABLE}?select=id,user_id,token_hash,expires_at,${USERS_TABLE}(id,username,password_hash,created_at)&token_hash=eq.${encodeURIComponent(tokenHash)}&limit=1`
    );
  } catch (error) {
    if (isMissingTableError(error)) {
      return null;
    }
    throw error;
  }

  const session = sessions[0];
  if (!session) {
    return null;
  }

  if (new Date(session.expires_at).getTime() <= Date.now()) {
    await clearSession();
    return null;
  }

  const user = session[USERS_TABLE];
  if (!user) {
    return null;
  }

  return { id: user.id, username: user.username };
}
