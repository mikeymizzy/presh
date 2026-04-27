"use client";

import { FormEvent, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

type StorageInfo = {
  dataDir: string;
  usingFallbackTempDir: boolean;
};

type SubmissionRecord = {
  id: string;
  studentName: string;
  prompt: string;
  report: string;
  createdAt: string;
};

type AuthUser = {
  id: string;
  username: string;
};

const LOADING_MESSAGES = [
  "Reading the memo and student answer…",
  "Checking key concepts against the memo…",
  "Scoring accuracy and identifying gaps…",
  "Drafting your grading report…",
];

function ReportViewer({ report, loading }: { report: string; loading: boolean }) {
  const [progressValue, setProgressValue] = useState(8);
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    if (!loading) {
      setProgressValue(8);
      setMessageIndex(0);
      return;
    }

    const progressTimer = window.setInterval(() => {
      setProgressValue((current) => {
        if (current >= 92) {
          return current;
        }

        const increment = current < 50 ? 8 : 4;
        return Math.min(current + increment, 92);
      });
    }, 700);

    const messageTimer = window.setInterval(() => {
      setMessageIndex((current) => (current + 1) % LOADING_MESSAGES.length);
    }, 1800);

    return () => {
      window.clearInterval(progressTimer);
      window.clearInterval(messageTimer);
    };
  }, [loading]);

  if (loading) {
    return (
      <div className="space-y-4 rounded-md border bg-background p-4">
        <p className="text-sm font-medium">Generating your report…</p>
        <Progress value={progressValue} className="h-2" />
        <p className="text-xs text-muted-foreground">{LOADING_MESSAGES[messageIndex]}</p>
      </div>
    );
  }

  if (!report) {
    return <p className="text-sm text-muted-foreground">Run a submission to see your Gap Learning Grading report.</p>;
  }

  return <pre className="max-h-[500px] overflow-auto whitespace-pre-wrap rounded-md border bg-background p-4 text-sm leading-6">{report}</pre>;
}

export function GradingChatPage() {
  const prompt = "Grade the answer against the memo and give a concise report.";
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const [memo, setMemo] = useState<File | null>(null);
  const [answer, setAnswer] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<string>("");
  const [submissions, setSubmissions] = useState<SubmissionRecord[]>([]);
  const [storageInfo, setStorageInfo] = useState<StorageInfo | null>(null);

  const loadSession = async () => {
    const response = await fetch("/api/auth/me");
    if (!response.ok) {
      setUser(null);
      setSubmissions([]);
      return;
    }

    const data = (await response.json()) as { user: AuthUser };
    setUser(data.user);
  };

  const loadSubmissions = async () => {
    const response = await fetch("/api/submissions");
    if (!response.ok) {
      if (response.status === 401) {
        setUser(null);
      }
      setSubmissions([]);
      return;
    }

    const data = (await response.json()) as { submissions?: SubmissionRecord[]; storage?: StorageInfo };
    setSubmissions(data.submissions || []);
    setStorageInfo(data.storage || null);
  };

  useEffect(() => {
    loadSession().catch(() => setError("Could not verify login session."));
  }, []);

  useEffect(() => {
    if (!user) {
      return;
    }

    loadSubmissions().catch(() => {
      setError("Could not load submission history.");
    });
  }, [user]);

  const onAuth = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    const response = await fetch(authMode === "login" ? "/api/auth/login" : "/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    const data = (await response.json()) as { user?: AuthUser; error?: string };
    if (!response.ok || !data.user) {
      setError(data.error || "Authentication failed.");
      return;
    }

    setUser(data.user);
    setPassword("");
  };

  const onLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    setReport("");
    setSubmissions([]);
    setMemo(null);
    setAnswer(null);
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!memo || !answer) {
      setError("Please upload both memo and answer files.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const body = new FormData();
      body.append("prompt", prompt);
      body.append("memo", memo);
      body.append("answer", answer);

      const response = await fetch("/api/grade", {
        method: "POST",
        body,
      });

      const data = (await response.json()) as {
        error?: string;
        submission?: SubmissionRecord;
        storage?: StorageInfo;
      };

      if (!response.ok || !data.submission) {
        throw new Error(data.error || "Failed to grade submission.");
      }

      setReport(data.submission.report);
      setSubmissions((current) => [data.submission!, ...current]);
      setStorageInfo(data.storage || null);
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : "Unexpected error.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-slate-50 p-4 md:p-8">
        <main className="w-full max-w-md">
          <h1 className="mb-6 text-center text-4xl font-bold tracking-tight">Gap Learning Grading</h1>
          <Card>
            <CardHeader>
              <CardTitle>{authMode === "login" ? "Login" : "Create account"}</CardTitle>
              <CardDescription>
                {authMode === "login" ? "Sign in to grade and save submissions." : "Create your account to start grading."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-4" onSubmit={onAuth}>
                <Input value={username} onChange={(event) => setUsername(event.target.value)} placeholder="Username" required />
                <Input value={password} onChange={(event) => setPassword(event.target.value)} type="password" placeholder="Password" required />
                <Button type="submit" className="w-full">{authMode === "login" ? "Login" : "Create account"}</Button>
              </form>
              <Button variant="link" onClick={() => setAuthMode((current) => (current === "login" ? "register" : "login"))}>
                {authMode === "login" ? "Need an account? Register" : "Already have an account? Login"}
              </Button>
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-slate-50 p-4 md:p-8">
      <main className="mx-auto grid w-full max-w-6xl gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Gap Learning Grading</CardTitle>
              <Button variant="outline" size="sm" onClick={onLogout}>Logout</Button>
            </div>
            <p className="text-sm text-muted-foreground">Logged in as {user.username}</p>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={onSubmit}>
              <div className="space-y-2">
                <label className="block text-sm font-medium">Memo file</label>
                <Input type="file" accept=".pdf,.txt,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg" onChange={(event) => setMemo(event.target.files?.[0] || null)} required />
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-medium">Student answer file</label>
                <Input type="file" accept=".pdf,.txt,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg" onChange={(event) => setAnswer(event.target.files?.[0] || null)} required />
              </div>
              <Button type="submit" disabled={loading} className="w-full">
                {loading ? "Grading..." : "Grade and save"}
              </Button>
            </form>
            {error ? <p className="mt-4 text-sm text-destructive">{error}</p> : null}
            {storageInfo?.usingFallbackTempDir ? <p className="mt-4 text-xs">Storage: {storageInfo.dataDir}</p> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Gap Learning Grading Report</CardTitle>
          </CardHeader>
          <CardContent>
            <ReportViewer report={report} loading={loading} />
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Your Grading Results</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {submissions.length === 0 ? <p className="text-sm text-muted-foreground">No submissions saved yet.</p> : null}
              {submissions.map((submission) => (
                <div key={submission.id} className="rounded-lg border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-medium">{submission.studentName}</p>
                      <p className="text-xs text-muted-foreground">{new Date(submission.createdAt).toLocaleString()}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <a className="text-sm underline" href={`/api/submissions/${submission.id}/download?file=memo`}>Memo</a>
                      <a className="text-sm underline" href={`/api/submissions/${submission.id}/download?file=answer`}>Answer</a>
                      <a className="text-sm underline" href={`/api/submissions/${submission.id}/download?file=report`}>Report (PDF)</a>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
