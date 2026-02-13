import { NextRequest } from "next/server";

const DEFAULT_MODEL = "gpt-4.1-mini";

export async function POST(req: NextRequest) {
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  const OPENAI_WORKFLOW_ID = process.env.OPENAI_WORKFLOW_ID;
  const OPENAI_MODEL = process.env.OPENAI_MODEL;
  const TARGET_MODEL = OPENAI_WORKFLOW_ID || OPENAI_MODEL || DEFAULT_MODEL;
  if (!OPENAI_API_KEY) {
    return Response.json(
      {
        error:
          "OPENAI_API_KEY is not configured. Add it to .env.local and restart the dev server.",
      },
      { status: 500 }
    );
  }

  try {
    const { message, sessionId, fileIds } = await req.json();

    if (!message || typeof message !== "string") {
      return Response.json(
        { error: "message is required" },
        { status: 400 }
      );
    }

    // Build input - include file attachments if provided
    const input: unknown[] = [];

    // Add file content references if files were uploaded
    if (fileIds && Array.isArray(fileIds) && fileIds.length > 0) {
      for (const fileId of fileIds) {
        input.push({
          type: "input_file",
          file_id: fileId,
        });
      }
    }

    // Add the user text message
    input.push({
      type: "input_text",
      text: message,
    });

    const body: Record<string, unknown> = {
      model: TARGET_MODEL,
      input: [
        {
          role: "user",
          content: input,
        },
      ],
      stream: true,
      store: true,
    };

    // Use previous response for conversation continuity
    if (sessionId) {
      body.previous_response_id = sessionId;
    }

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error("OpenAI API error:", response.status, errorData);
      let message = `OpenAI API error: ${response.status}`;
      try {
        const parsed = JSON.parse(errorData);
        const apiMessage = parsed?.error?.message;
        if (typeof apiMessage === "string" && apiMessage.length > 0) {
          message = apiMessage;
        }
      } catch {
        // ignore parse errors and use status fallback
      }
      return Response.json(
        { error: message },
        { status: response.status }
      );
    }

    // Stream the response back
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const reader = response.body?.getReader();
        if (!reader) {
          controller.close();
          return;
        }

        const decoder = new TextDecoder();
        let buffer = "";

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              if (!line.trim() || !line.startsWith("data: ")) continue;
              const data = line.slice(6).trim();
              if (data === "[DONE]") continue;

              try {
                const event = JSON.parse(data);

                if (event.type === "response.output_text.delta") {
                  controller.enqueue(
                    encoder.encode(
                      `data: ${JSON.stringify({ type: "text", text: event.delta })}\n\n`
                    )
                  );
                } else if (event.type === "response.completed") {
                  controller.enqueue(
                    encoder.encode(
                      `data: ${JSON.stringify({
                        type: "done",
                        responseId: event.response?.id,
                        responseModel: event.response?.model,
                        configuredModel: TARGET_MODEL,
                      })}\n\n`
                    )
                  );
                }
              } catch {
                // skip unparseable
              }
            }
          }
        } catch (err) {
          console.error("Stream error:", err);
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("Chat API error:", error);
    return Response.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
