import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

export type StoredFile = {
  originalName: string;
  savedName: string;
  relativePath: string;
  size: number;
  mimeType: string;
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

const DATA_DIR = path.join(process.cwd(), "data");
const SUBMISSIONS_DIR = path.join(DATA_DIR, "submissions");
const DB_PATH = path.join(DATA_DIR, "submissions.json");

type SubmissionDatabase = {
  submissions: SubmissionRecord[];
};

async function ensureDataStore() {
  await mkdir(SUBMISSIONS_DIR, { recursive: true });
  try {
    await readFile(DB_PATH, "utf8");
  } catch {
    const emptyDb: SubmissionDatabase = { submissions: [] };
    await writeFile(DB_PATH, JSON.stringify(emptyDb, null, 2), "utf8");
  }
}

async function readDb(): Promise<SubmissionDatabase> {
  await ensureDataStore();
  const raw = await readFile(DB_PATH, "utf8");
  return JSON.parse(raw) as SubmissionDatabase;
}

async function writeDb(db: SubmissionDatabase) {
  await ensureDataStore();
  await writeFile(DB_PATH, JSON.stringify(db, null, 2), "utf8");
}

export async function persistUploadedFile(file: File, submissionId: string, label: "memo" | "answer") {
  const fileExtension = path.extname(file.name) || ".bin";
  const fileName = `${label}_${randomUUID()}${fileExtension}`;
  const targetPath = path.join(SUBMISSIONS_DIR, submissionId, fileName);
  await mkdir(path.dirname(targetPath), { recursive: true });

  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(targetPath, buffer);

  return {
    originalName: file.name,
    savedName: fileName,
    relativePath: path.relative(process.cwd(), targetPath),
    size: file.size,
    mimeType: file.type || "application/octet-stream",
  } satisfies StoredFile;
}

export async function createSubmissionRecord(
  payload: Omit<SubmissionRecord, "id" | "createdAt">
): Promise<SubmissionRecord> {
  const db = await readDb();
  const record: SubmissionRecord = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    ...payload,
  };
  db.submissions.unshift(record);
  await writeDb(db);
  return record;
}

export async function listSubmissionRecords(): Promise<SubmissionRecord[]> {
  const db = await readDb();
  return db.submissions;
}

export async function findSubmissionById(id: string): Promise<SubmissionRecord | null> {
  const db = await readDb();
  return db.submissions.find((submission) => submission.id === id) ?? null;
}
