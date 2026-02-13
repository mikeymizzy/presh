"use client";

import React from "react"

import {
  useState,
  useRef,
  useEffect,
  useCallback,
  type FormEvent,
} from "react";
import {
  Send,
  Loader2,
  RotateCcw,
  GraduationCap,
  User,
  Paperclip,
  FileText,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  files?: UploadedFile[];
}

interface UploadedFile {
  fileId: string;
  fileName: string;
  fileSize: number;
}

export function GradingChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [responseSource, setResponseSource] = useState<string | null>(null);
  const [pendingFiles, setPendingFiles] = useState<UploadedFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`;
    }
  }, [input]);

  const handleFileUpload = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;

      setIsUploading(true);
      setError(null);

      try {
        for (const file of Array.from(files)) {
          const formData = new FormData();
          formData.append("file", file);

          const res = await fetch("/api/upload", {
            method: "POST",
            body: formData,
          });

          if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.error || "Failed to upload file");
          }

          const data = await res.json();
          setPendingFiles((prev) => [
            ...prev,
            {
              fileId: data.fileId,
              fileName: data.fileName,
              fileSize: data.fileSize,
            },
          ]);
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to upload file"
        );
      } finally {
        setIsUploading(false);
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      }
    },
    []
  );

  const removePendingFile = useCallback((fileId: string) => {
    setPendingFiles((prev) => prev.filter((f) => f.fileId !== fileId));
  }, []);

  const sendMessage = useCallback(
    async (messageText: string) => {
      if ((!messageText.trim() && pendingFiles.length === 0) || isLoading)
        return;

      const text =
        messageText.trim() ||
        `Please review and grade the uploaded file${pendingFiles.length > 1 ? "s" : ""}.`;

      const userMessage: Message = {
        id: `user-${Date.now()}`,
        role: "user",
        content: text,
        files: pendingFiles.length > 0 ? [...pendingFiles] : undefined,
      };

      const assistantMessageId = `assistant-${Date.now()}`;
      const assistantMessage: Message = {
        id: assistantMessageId,
        role: "assistant",
        content: "",
      };

      const currentPendingFiles = [...pendingFiles];
      setMessages((prev) => [...prev, userMessage, assistantMessage]);
      setInput("");
      setPendingFiles([]);
      setIsLoading(true);
      setError(null);

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: text,
            sessionId,
            fileIds: currentPendingFiles.map((f) => f.fileId),
          }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || "Failed to get response");
        }

        const reader = res.body?.getReader();
        if (!reader) throw new Error("No response stream");

        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.trim() || !line.startsWith("data: ")) continue;
            const data = line.slice(6).trim();

            try {
              const event = JSON.parse(data);
              if (event.type === "text") {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMessageId
                      ? { ...m, content: m.content + event.text }
                      : m
                  )
                );
              } else if (event.type === "done") {
                if (event.responseId) {
                  setSessionId(event.responseId);
                }
                if (typeof event.configuredModel === "string") {
                  setResponseSource(event.configuredModel);
                } else if (typeof event.responseModel === "string") {
                  setResponseSource(event.responseModel);
                }
              }
            } catch {
              // skip
            }
          }
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Something went wrong"
        );
        setMessages((prev) =>
          prev.filter((m) => m.id !== assistantMessageId)
        );
      } finally {
        setIsLoading(false);
      }
    },
    [isLoading, sessionId, pendingFiles]
  );

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const resetChat = () => {
    setMessages([]);
    setSessionId(null);
    setResponseSource(null);
    setError(null);
    setInput("");
    setPendingFiles([]);
  };

  const isEmpty = messages.length === 0;

  return (
    <div className="flex h-full flex-col">
      {/* Chat header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
            <GraduationCap className="h-4 w-4 text-primary-foreground" />
          </div>
          <div>
            <div className="text-sm font-semibold text-foreground">
              Grading Assistant
            </div>
            {responseSource && (
              <div className="text-xs text-muted-foreground">
                Source: <code>{responseSource}</code>
              </div>
            )}
          </div>
        </div>
        {messages.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={resetChat}
            className="h-7 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="h-3 w-3" />
            New chat
          </Button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {isEmpty ? (
          <UploadPrompt
            onFileSelect={() => fileInputRef.current?.click()}
            isUploading={isUploading}
          />
        ) : (
          <div className="mx-auto flex max-w-2xl flex-col gap-4">
            {messages.map((message) => (
              <ChatMessage key={message.id} message={message} />
            ))}
            {error && (
              <div className="mx-auto w-full max-w-md rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-center">
                <p className="text-sm text-destructive">{error}</p>
                <button
                  type="button"
                  onClick={() => setError(null)}
                  className="mt-1.5 text-xs font-medium text-destructive underline underline-offset-2"
                >
                  Dismiss
                </button>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Pending files */}
      {pendingFiles.length > 0 && (
        <div className="border-t border-border bg-secondary/30 px-4 py-2">
          <div className="mx-auto flex max-w-2xl flex-wrap gap-2">
            {pendingFiles.map((file) => (
              <div
                key={file.fileId}
                className="flex items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1.5"
              >
                <FileText className="h-3.5 w-3.5 text-primary" />
                <span className="max-w-[160px] truncate text-xs text-foreground">
                  {file.fileName}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {formatFileSize(file.fileSize)}
                </span>
                <button
                  type="button"
                  onClick={() => removePendingFile(file.fileId)}
                  className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Input area */}
      <div className="border-t border-border bg-card px-4 py-3">
        <form
          onSubmit={handleSubmit}
          className="mx-auto flex max-w-2xl items-end gap-2"
        >
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept=".pdf,.doc,.docx,.txt,.md,.csv,.xls,.xlsx,.ppt,.pptx,.rtf,.html,.json,.py,.js,.ts,.java,.c,.cpp"
            multiple
            onChange={(e) => handleFileUpload(e.target.files)}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading || isLoading}
            className="h-10 w-10 shrink-0 text-muted-foreground hover:text-foreground"
          >
            {isUploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Paperclip className="h-4 w-4" />
            )}
            <span className="sr-only">Attach file</span>
          </Button>
          <div className="relative flex-1">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                pendingFiles.length > 0
                  ? "Add instructions or press Send to grade..."
                  : "Upload your assignment or type a message..."
              }
              disabled={isLoading}
              rows={1}
              className="w-full resize-none rounded-lg border border-input bg-background px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
            />
          </div>
          <Button
            type="submit"
            size="icon"
            disabled={
              isLoading ||
              ((!input.trim()) && pendingFiles.length === 0)
            }
            className="h-10 w-10 shrink-0 rounded-lg"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            <span className="sr-only">Send message</span>
          </Button>
        </form>
      </div>
    </div>
  );
}

function UploadPrompt({
  onFileSelect,
  isUploading,
}: {
  onFileSelect: () => void;
  isUploading: boolean;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 px-4">
      <div className="flex flex-col items-center gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
          <GraduationCap className="h-8 w-8 text-primary" />
        </div>
        <div className="text-center">
          <h2 className="text-xl font-semibold text-foreground font-serif text-balance">
            Upload Your Assignment
          </h2>
          <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
            Attach your assignment file to get started. The AI grading assistant will review your work and provide detailed feedback.
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={onFileSelect}
        disabled={isUploading}
        className="group flex w-full max-w-sm cursor-pointer flex-col items-center gap-3 rounded-xl border-2 border-dashed border-border bg-card px-6 py-8 transition-colors hover:border-primary hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isUploading ? (
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        ) : (
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 transition-colors group-hover:bg-primary/20">
            <Paperclip className="h-5 w-5 text-primary" />
          </div>
        )}
        <div className="text-center">
          <p className="text-sm font-medium text-foreground">
            {isUploading ? "Uploading..." : "Click to upload your file"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            PDF, DOCX, TXT, and more supported
          </p>
        </div>
      </button>

      <p className="max-w-xs text-center text-xs text-muted-foreground">
        Or type a message below to ask a grading question directly.
      </p>
    </div>
  );
}

function ChatMessage({ message }: { message: Message }) {
  const isUser = message.role === "user";

  return (
    <div
      className={`flex items-start gap-3 ${isUser ? "flex-row-reverse" : ""}`}
    >
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
          isUser
            ? "bg-secondary text-secondary-foreground"
            : "bg-primary text-primary-foreground"
        }`}
      >
        {isUser ? (
          <User className="h-4 w-4" />
        ) : (
          <GraduationCap className="h-4 w-4" />
        )}
      </div>
      <div className={`max-w-[80%] ${isUser ? "text-right" : ""}`}>
        {/* Show attached files */}
        {message.files && message.files.length > 0 && (
          <div
            className={`mb-1.5 flex flex-wrap gap-1.5 ${isUser ? "justify-end" : ""}`}
          >
            {message.files.map((file) => (
              <div
                key={file.fileId}
                className="flex items-center gap-1.5 rounded-md bg-primary/10 px-2 py-1"
              >
                <FileText className="h-3 w-3 text-primary" />
                <span className="max-w-[120px] truncate text-[11px] font-medium text-primary">
                  {file.fileName}
                </span>
              </div>
            ))}
          </div>
        )}
        <div
          className={`rounded-xl px-4 py-2.5 text-sm leading-relaxed ${
            isUser
              ? "bg-primary text-primary-foreground"
              : "bg-secondary text-secondary-foreground"
          }`}
        >
          {message.content ? (
            <FormattedContent content={message.content} />
          ) : (
            <div className="flex items-center gap-1.5 py-0.5">
              <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-current opacity-60 [animation-delay:0ms]" />
              <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-current opacity-60 [animation-delay:150ms]" />
              <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-current opacity-60 [animation-delay:300ms]" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FormattedContent({ content }: { content: string }) {
  const lines = content.split("\n");

  return (
    <div className="space-y-1.5 whitespace-pre-wrap">
      {lines.map((line, i) => {
        if (line.startsWith("### ")) {
          return (
            <p key={i} className="font-semibold">
              {line.replace(/^###\s*/, "")}
            </p>
          );
        }
        if (line.startsWith("## ")) {
          return (
            <p key={i} className="font-semibold text-base">
              {line.replace(/^##\s*/, "")}
            </p>
          );
        }
        if (line.match(/^[-*]\s/)) {
          return (
            <p key={i} className="pl-3">
              {"\u2022 "}
              {formatInlineText(line.replace(/^[-*]\s/, ""))}
            </p>
          );
        }
        if (line.match(/^\d+[.)]\s/)) {
          return (
            <p key={i} className="pl-3">
              {formatInlineText(line)}
            </p>
          );
        }
        return <p key={i}>{formatInlineText(line)}</p>;
      })}
    </div>
  );
}

function formatInlineText(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="font-semibold">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return part;
  });
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
