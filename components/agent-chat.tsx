"use client";

import { useState } from "react";
import { ChatKit, useChatKit } from "@openai/chatkit-react";

export function AgentChat() {
  const [error, setError] = useState<string | null>(null);
  const attachmentConfig = {
    enabled: true,
    maxCount: 5,
    maxSize: 20 * 1024 * 1024,
    accept: {
      "application/pdf": [".pdf"],
      "image/*": [".png", ".jpg", ".jpeg", ".webp"],
    },
  };

  const chatkit = useChatKit({
    api: {
      getClientSecret: async () => {
        const response = await fetch("/api/chatkit/session", {
          method: "POST",
        });
        const data = (await response.json().catch(() => ({}))) as {
          client_secret?: string;
          error?: string;
        };

        if (!response.ok) {
          throw new Error(data.error || "Failed to initialize agent session");
        }
        if (!data.client_secret) {
          throw new Error("Missing client secret from session endpoint");
        }

        return data.client_secret;
      },
    },
    theme: "light",
    header: {
      title: {
        enabled: false,
      },
    },
    startScreen: {
      greeting: "Upload your assignment to get started.",
      prompts: [
        {
          label: "Grade uploaded assignment",
          prompt:
            "Please grade the uploaded assignment and provide rubric-based feedback.",
          icon: "document",
        },
        {
          label: "Ask grading question",
          prompt: "I have a grading question.",
          icon: "circle-question",
        },
      ],
    },
    composer: {
      placeholder: "Ask the grading agent...",
      attachments: attachmentConfig,
    },
    onError: ({ error: eventError }) => {
      const maybeAny = eventError as Error & {
        cause?: unknown;
        details?: unknown;
        status?: number;
      };
      const detail = {
        name: maybeAny.name,
        message: maybeAny.message,
        status: maybeAny.status,
        cause: maybeAny.cause,
        details: maybeAny.details,
      };
      console.error("ChatKit error:", detail);

      let message = maybeAny.message || "ChatKit error";
      if (message.includes("status 400")) {
        message =
          "Upload rejected (400). Try a smaller PDF/PNG/JPG file. If it still fails, your workflow may not allow attachments.";
      }
      setError(message);
    },
    onLog: ({ name, data }) => {
      if (name.includes("upload") || name.includes("attachment")) {
        console.debug("ChatKit upload log:", name, data);
      }
    },
  });

  return (
    <div className="flex h-full min-h-0 flex-col">
      {error ? (
        <div className="border-b border-destructive/30 bg-destructive/5 px-4 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}
      <ChatKit control={chatkit.control} className="block min-h-0 flex-1 w-full" />
    </div>
  );
}
