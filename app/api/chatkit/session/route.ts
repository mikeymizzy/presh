import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

const CHATKIT_SESSIONS_URL = "https://api.openai.com/v1/chatkit/sessions";
const USER_COOKIE_NAME = "chatkit_user_id";

export async function POST(req: NextRequest) {
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  const OPENAI_WORKFLOW_ID = process.env.OPENAI_WORKFLOW_ID;

  if (!OPENAI_API_KEY) {
    return NextResponse.json(
      {
        error:
          "OPENAI_API_KEY is not configured. Add it to .env.local and restart the dev server.",
      },
      { status: 500 }
    );
  }

  if (!OPENAI_WORKFLOW_ID) {
    return NextResponse.json(
      {
        error:
          "OPENAI_WORKFLOW_ID is not configured. Set it to your Agent Builder workflow id (wf_...).",
      },
      { status: 500 }
    );
  }

  const existingUserId = req.cookies.get(USER_COOKIE_NAME)?.value;
  const userId = existingUserId || `user_${randomUUID()}`;

  const openaiResponse = await fetch(CHATKIT_SESSIONS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "OpenAI-Beta": "chatkit_beta=v1",
    },
    body: JSON.stringify({
      user: userId,
      workflow: {
        id: OPENAI_WORKFLOW_ID,
      },
      chatkit_configuration: {
        file_upload: {
          enabled: true,
          max_file_size: 20,
          max_files: 5,
        },
      },
    }),
  });

  if (!openaiResponse.ok) {
    const errorText = await openaiResponse.text();
    let message = `OpenAI ChatKit session error: ${openaiResponse.status}`;

    try {
      const parsed = JSON.parse(errorText) as {
        error?: { message?: string };
      };
      if (parsed?.error?.message) {
        message = parsed.error.message;
      }
    } catch {
      // Keep default message when response body isn't JSON.
    }

    return NextResponse.json(
      { error: message },
      { status: openaiResponse.status }
    );
  }

  const data = (await openaiResponse.json()) as { client_secret?: string };
  if (!data.client_secret) {
    return NextResponse.json(
      { error: "Missing client_secret in ChatKit session response." },
      { status: 502 }
    );
  }

  const response = NextResponse.json({ client_secret: data.client_secret });
  if (!existingUserId) {
    response.cookies.set(USER_COOKIE_NAME, userId, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  }

  return response;
}
