const SUPABASE_SELECT_PATH = "submissions?select=id&limit=1";

function getSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    return null;
  }

  return {
    url: url.trim().replace(/\/+$/, ""),
    serviceRoleKey,
  };
}

export async function GET() {
  const config = getSupabaseConfig();

  if (!config) {
    return Response.json(
      {
        ok: false,
        error:
          "Missing NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) and/or SUPABASE_SERVICE_ROLE_KEY environment variables.",
      },
      { status: 500 }
    );
  }

  try {
    const response = await fetch(`${config.url}/rest/v1/${SUPABASE_SELECT_PATH}`, {
      method: "GET",
      headers: {
        apikey: config.serviceRoleKey,
        Authorization: `Bearer ${config.serviceRoleKey}`,
      },
      cache: "no-store",
    });

    if (!response.ok) {
      const rawBody = await response.text();
      return Response.json(
        {
          ok: false,
          error: `Supabase keep-awake ping failed (${response.status}): ${rawBody || "Unknown error"}`,
        },
        { status: 500 }
      );
    }

    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
