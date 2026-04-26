import { randomUUID } from "node:crypto";
import { supabaseRequest } from "@/lib/supabase-rest";

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
  userId: string;
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
  user_id: string;
  student_name: string;
  prompt: string;
  report: string;
  created_at: string;
  openai_response_id?: string | null;
  files: SubmissionRecord["files"];
};

type SubmissionInsertPayload = {
  user_id: string;
  student_name: string;
  prompt: string;
  report: string;
  openai_response_id?: string;
  files: SubmissionRecord["files"];
};

const DEFAULT_SUBMISSIONS_TABLE = "submissions";

function getSubmissionsTable() {
  return process.env.SUPABASE_SUBMISSIONS_TABLE || DEFAULT_SUBMISSIONS_TABLE;
}

function getMissingTableSetupMessage(tableName: string) {
  return [
    `Supabase table '${tableName}' was not found in schema cache.`,
    `Create the table (or set SUPABASE_SUBMISSIONS_TABLE to an existing table) and allow anon role access.`,
    "Run supabase/submissions.sql in the Supabase SQL editor.",
  ].join("\n");
}

function formatStoreError(error: unknown, tableName: string) {
  if (!(error instanceof Error)) {
    return error;
  }

  if (error.message.includes("PGRST205")) {
    return new Error(getMissingTableSetupMessage(tableName));
  }

  return error;
}

function mapRowToSubmissionRecord(row: SubmissionDatabaseRow): SubmissionRecord {
  return {
    id: row.id,
    userId: row.user_id,
    studentName: row.student_name,
    prompt: row.prompt,
    report: row.report,
    createdAt: row.created_at,
    openaiResponseId: row.openai_response_id || undefined,
    files: row.files,
  };
}

export async function getSubmissionStorageInfo() {
  const table = getSubmissionsTable();
  return {
    dataDir: `supabase:${table}`,
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
  const table = getSubmissionsTable();
  const insertPayload: SubmissionInsertPayload = {
    user_id: payload.userId,
    student_name: payload.studentName,
    prompt: payload.prompt,
    report: payload.report,
    openai_response_id: payload.openaiResponseId,
    files: payload.files,
  };

  try {
    const rows = await supabaseRequest<SubmissionDatabaseRow[]>(
      `${table}?select=id,user_id,student_name,prompt,report,created_at,openai_response_id,files`,
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
  } catch (error) {
    throw formatStoreError(error, table);
  }
}

export async function listSubmissionRecordsByUserId(userId: string): Promise<SubmissionRecord[]> {
  const table = getSubmissionsTable();
  const rows = await supabaseRequest<SubmissionDatabaseRow[]>(
    `${table}?select=id,user_id,student_name,prompt,report,created_at,openai_response_id,files&user_id=eq.${encodeURIComponent(userId)}&order=created_at.desc`
  );

  return rows.map(mapRowToSubmissionRecord);
}

export async function findSubmissionByIdForUser(id: string, userId: string): Promise<SubmissionRecord | null> {
  const table = getSubmissionsTable();
  const rows = await supabaseRequest<SubmissionDatabaseRow[]>(
    `${table}?select=id,user_id,student_name,prompt,report,created_at,openai_response_id,files&id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(userId)}&limit=1`
  );

  return rows[0] ? mapRowToSubmissionRecord(rows[0]) : null;
}
