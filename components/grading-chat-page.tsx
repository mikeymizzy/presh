"use client";

import { AgentChat } from "@/components/agent-chat";

export function GradingChatPage() {
  return (
    <div className="h-[100dvh] bg-gradient-to-b from-slate-100 to-slate-50">
      <main className="mx-auto flex h-full w-full max-w-5xl flex-col p-3 md:p-4">
        <h1 className="mb-3 text-center text-2xl font-extrabold tracking-tight text-foreground md:text-3xl">
          Gap Learning Grading
        </h1>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <AgentChat />
        </div>
      </main>
    </div>
  );
}
