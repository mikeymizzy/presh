import { NextRequest } from "next/server";
import { createSession, registerUser } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const { username, password } = (await req.json()) as { username?: string; password?: string };
    if (!username || !password) {
      return Response.json({ error: "username and password are required" }, { status: 400 });
    }

    const user = await registerUser(username, password);
    await createSession(user.id);

    return Response.json({ user });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to register";
    return Response.json({ error: message }, { status: 400 });
  }
}
