import { randomUUID } from "node:crypto";

export type StoredFile = {
  originalName: string;
  savedName: string;
  relativePath: string;
  size: number;
  mimeType: string;
  contentBase64?: string;
};

export type SubmissionRecord = {
  id: string;
  studentName: string;
  prompt: string;
  report: string;
  createdAt: string;
  openaiResponseId?: string;
  files: {
    memo: StoredFile;
    answer: StoredFile;
  };
};

type SubmissionDatabaseRow = {
  id: string;
  student_name: string;
  prompt: string;
  report: string;
  created_at: string;
  openai_response_id?: string | null;
  files: SubmissionRecord["files"];
};

type SubmissionInsertPayload = {
  student_name: string;
  prompt: string;
  report: string;
  openai_response_id?: string;
  files: SubmissionRecord["files"];
};

type SupabaseConfig = {
  url: string;
  anonKey: string;
};

const DEFAULT_SUPABASE_URL = "https://omxhddfxldlkoyokdemk.supabase.co";
const DEFAULT_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9teGhkZGZ4bGRsa295b2tkZW1rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3MzY5NjMsImV4cCI6MjA4NzMxMjk2M30.igVT1rjeylulUKqKDUai7HgOqdEblTm3g1rb_8oo6Lw";

function getSupabaseConfig(): SupabaseConfig {
  return {
    url: process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL,
    anonKey: process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY,
  };
}

async function supabaseRequest<T>(
  endpoint: string,
  init?: RequestInit
): Promise<T> {
  const { url, anonKey } = getSupabaseConfig();
  const response = await fetch(`${url}/rest/v1/${endpoint}`, {
    ...init,
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Supabase request failed (${response.status}): ${details}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

function mapRowToSubmissionRecord(row: SubmissionDatabaseRow): SubmissionRecord {
  return {
    id: row.id,
    studentName: row.student_name,
    prompt: row.prompt,
    report: row.report,
    createdAt: row.created_at,
    openaiResponseId: row.openai_response_id || undefined,
    files: row.files,
  };
}

export async function getSubmissionStorageInfo() {
  return {
    dataDir: "supabase",
    usingFallbackTempDir: false,
  };
}

export async function persistUploadedFile(file: File, submissionId: string, label: "memo" | "answer") {
  const fileExtension = (file.name.match(/(\.[^./\\]+)$/)?.[1] || ".bin").toLowerCase();
  const fileName = `${label}_${submissionId}_${randomUUID()}${fileExtension}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  return {
    originalName: file.name,
    savedName: fileName,
    relativePath: "",
    size: file.size,
    mimeType: file.type || "application/octet-stream",
    contentBase64: buffer.toString("base64"),
  } satisfies StoredFile;
}

export async function createSubmissionRecord(
  payload: Omit<SubmissionRecord, "id" | "createdAt">
): Promise<SubmissionRecord> {
  const insertPayload: SubmissionInsertPayload = {
    student_name: payload.studentName,
    prompt: payload.prompt,
    report: payload.report,
    openai_response_id: payload.openaiResponseId,
    files: payload.files,
  };

  const rows = await supabaseRequest<SubmissionDatabaseRow[]>(
    "submissions?select=id,student_name,prompt,report,created_at,openai_response_id,files",
    {
      method: "POST",
      headers: {
        Prefer: "return=representation",
      },
      body: JSON.stringify(insertPayload),
    }
  );

  if (!rows[0]) {
    throw new Error("Supabase insert returned no row.");
  }

  return mapRowToSubmissionRecord(rows[0]);
}

export async function listSubmissionRecords(): Promise<SubmissionRecord[]> {
  const rows = await supabaseRequest<SubmissionDatabaseRow[]>(
    "submissions?select=id,student_name,prompt,report,created_at,openai_response_id,files&order=created_at.desc"
  );

  return rows.map(mapRowToSubmissionRecord);
}

export async function findSubmissionById(id: string): Promise<SubmissionRecord | null> {
  const rows = await supabaseRequest<SubmissionDatabaseRow[]>(
    `submissions?select=id,student_name,prompt,report,created_at,openai_response_id,files&id=eq.${encodeURIComponent(id)}&limit=1`
  );

  return rows[0] ? mapRowToSubmissionRecord(rows[0]) : null;
}
