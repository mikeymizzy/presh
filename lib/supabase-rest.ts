export type SupabaseConfig = {
  url: string;
  anonKey: string;
};

type SupabaseErrorBody = {
  code?: string;
  message?: string;
  details?: string | null;
  hint?: string | null;
};

const DEFAULT_SUPABASE_URL = "https://omxhddfxldlkoyokdemk.supabase.co";
const DEFAULT_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9teGhkZGZ4bGRsa295b2tkZW1rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3MzY5NjMsImV4cCI6MjA4NzMxMjk2M30.igVT1rjeylulUKqKDUai7HgOqdEblTm3g1rb_8oo6Lw";

export function getSupabaseConfig(): SupabaseConfig {
  const configuredUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || DEFAULT_SUPABASE_URL;

  return {
    url: configuredUrl.trim().replace(/\/+$/, ""),
    anonKey:
      process.env.SUPABASE_ANON_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      DEFAULT_SUPABASE_ANON_KEY,
  };
}

function formatSupabaseNetworkError(error: unknown, configuredUrl: string): string | null {
  if (!(error instanceof Error)) {
    return null;
  }

  const maybeCause = (error as Error & { cause?: unknown }).cause;
  if (typeof maybeCause !== "object" || maybeCause === null) {
    return null;
  }

  const cause = maybeCause as { code?: string; hostname?: string };
  if (cause.code !== "ENOTFOUND") {
    return null;
  }

  const host = cause.hostname || "configured Supabase host";
  return [
    `Unable to resolve Supabase host '${host}'.`,
    `Check SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and confirm DNS/network access for '${configuredUrl}'.`,
  ].join(" ");
}

function formatSupabaseError(status: number, body: SupabaseErrorBody | string) {
  const detailText = typeof body === "string" ? body : JSON.stringify(body);
  return `Supabase request failed (${status}): ${detailText}`;
}

export async function supabaseRequest<T>(endpoint: string, init?: RequestInit): Promise<T> {
  const { url, anonKey } = getSupabaseConfig();
  let response: Response;

  try {
    response = await fetch(`${url}/rest/v1/${endpoint}`, {
      ...init,
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        "Content-Type": "application/json",
        ...(init?.headers || {}),
      },
    });
  } catch (error) {
    const networkError = formatSupabaseNetworkError(error, url);
    if (networkError) {
      throw new Error(networkError);
    }
    throw error;
  }

  if (!response.ok) {
    const raw = await response.text();
    let parsed: SupabaseErrorBody | string = raw;
    try {
      parsed = JSON.parse(raw) as SupabaseErrorBody;
    } catch {
      // keep raw text as-is
    }
    throw new Error(formatSupabaseError(response.status, parsed));
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const rawBody = await response.text();
  if (!rawBody.trim()) {
    return undefined as T;
  }

  return JSON.parse(rawBody) as T;
}
