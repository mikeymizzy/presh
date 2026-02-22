"use client";

import { FormEvent, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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

  const loadSubmissions = async () => {
    const response = await fetch("/api/submissions");
    const data = (await response.json()) as { submissions?: SubmissionRecord[] };
    setSubmissions(data.submissions || []);
  };

  useEffect(() => {
    loadSubmissions().catch(() => {
      setError("Could not load submission history.");
    });
  }, []);

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
      };

      if (!response.ok || !data.submission) {
        throw new Error(data.error || "Failed to grade submission.");
      }

      setReport(data.submission.report);
      setSubmissions((current) => [data.submission!, ...current]);
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
                      <a className="text-sm underline" href={`/api/submissions/${submission.id}/download?file=report`}>Report</a>
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
