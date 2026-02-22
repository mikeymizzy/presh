"use client";

import { FormEvent, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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

export function GradingChatPage() {
  const [studentName, setStudentName] = useState("");
  const [prompt, setPrompt] = useState("Grade the answer against the memo and give a concise report.");
  const [memo, setMemo] = useState<File | null>(null);
  const [answer, setAnswer] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<string>("");
  const [submissions, setSubmissions] = useState<SubmissionRecord[]>([]);
  const [storageInfo, setStorageInfo] = useState<StorageInfo | null>(null);

  const loadSubmissions = async (name: string) => {
    const studentNameValue = name.trim();
    if (!studentNameValue) {
      setSubmissions([]);
      return;
    }

    const response = await fetch(`/api/submissions?studentName=${encodeURIComponent(studentNameValue)}`);
    const data = (await response.json()) as { submissions?: SubmissionRecord[]; storage?: StorageInfo };
    setSubmissions(data.submissions || []);
    setStorageInfo(data.storage || null);
  };

  useEffect(() => {
    loadSubmissions(studentName).catch(() => {
      setError("Could not load submission history.");
    });
  }, [studentName]);

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
      body.append("studentName", studentName);
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

  return (
    <div className="min-h-[100dvh] bg-slate-50 p-4 md:p-8">
      <main className="mx-auto grid w-full max-w-6xl gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Student Submission Grader</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={onSubmit}>
              <Input
                value={studentName}
                onChange={(event) => setStudentName(event.target.value)}
                placeholder="Student name"
                required
              />
              <Textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} rows={4} />
              <div className="space-y-2">
                <label className="block text-sm font-medium">Memo file</label>
                <Input type="file" accept=".pdf,.txt,.doc,.docx,.png,.jpg,.jpeg" onChange={(event) => setMemo(event.target.files?.[0] || null)} required />
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-medium">Student answer file</label>
                <Input type="file" accept=".pdf,.txt,.doc,.docx,.png,.jpg,.jpeg" onChange={(event) => setAnswer(event.target.files?.[0] || null)} required />
              </div>
              <Button type="submit" disabled={loading} className="w-full">
                {loading ? "Grading..." : "Grade and save"}
              </Button>
            </form>
            {error ? <p className="mt-4 text-sm text-destructive">{error}</p> : null}
            {storageInfo?.usingFallbackTempDir ? (
              <p className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800">
                Persistent directory is not writable in this deployment, so submissions are temporarily stored in {" "}
                <code className="mx-1 rounded bg-amber-100 px-1 py-0.5">{storageInfo.dataDir}</code>. {" "}
                Configure <code className="mx-1 rounded bg-amber-100 px-1 py-0.5">SUBMISSIONS_DATA_DIR</code> to a persistent writable volume to keep records long-term.
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Generated Report</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="max-h-[500px] overflow-auto whitespace-pre-wrap rounded-md bg-muted p-3 text-sm">{report || "Run a submission to see the grading report."}</pre>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Submission database (download anytime)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {!studentName.trim() ? <p className="text-sm text-muted-foreground">Enter your student name to view your submissions.</p> : null}
              {studentName.trim() && submissions.length === 0 ? <p className="text-sm text-muted-foreground">No submissions saved yet.</p> : null}
              {submissions.map((submission) => (
                <div key={submission.id} className="rounded-lg border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-medium">{submission.studentName}</p>
                      <p className="text-xs text-muted-foreground">{new Date(submission.createdAt).toLocaleString()}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <a className="text-sm underline" href={`/api/submissions/${submission.id}/download?file=memo&studentName=${encodeURIComponent(studentName.trim())}`}>Memo</a>
                      <a className="text-sm underline" href={`/api/submissions/${submission.id}/download?file=answer&studentName=${encodeURIComponent(studentName.trim())}`}>Answer</a>
                      <a className="text-sm underline" href={`/api/submissions/${submission.id}/download?file=report&studentName=${encodeURIComponent(studentName.trim())}`}>Report (PDF)</a>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-4 text-sm text-muted-foreground">
              Admin view: <a href="/admin/submissions" className="underline">Open all submissions</a>
            </p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
