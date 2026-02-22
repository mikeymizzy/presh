"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type SubmissionRecord = {
  id: string;
  studentName: string;
  createdAt: string;
};

export default function AdminSubmissionsPage() {
  const [submissions, setSubmissions] = useState<SubmissionRecord[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/submissions?includeAll=true")
      .then(async (response) => {
        const data = (await response.json()) as { submissions?: SubmissionRecord[] };
        setSubmissions(data.submissions || []);
      })
      .catch(() => {
        setError("Could not load submissions.");
      });
  }, []);

  return (
    <div className="min-h-[100dvh] bg-slate-50 p-4 md:p-8">
      <main className="mx-auto w-full max-w-5xl">
        <Card>
          <CardHeader>
            <CardTitle>Admin submissions</CardTitle>
          </CardHeader>
          <CardContent>
            {error ? <p className="mb-4 text-sm text-destructive">{error}</p> : null}
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
                      <a className="text-sm underline" href={`/api/submissions/${submission.id}/download?file=memo&includeAll=true`}>Memo</a>
                      <a className="text-sm underline" href={`/api/submissions/${submission.id}/download?file=answer&includeAll=true`}>Answer</a>
                      <a className="text-sm underline" href={`/api/submissions/${submission.id}/download?file=report&includeAll=true`}>Report (PDF)</a>
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
