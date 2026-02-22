import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import os from "node:os";
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

type SubmissionDatabase = {
  submissions: SubmissionRecord[];
};

type StorageContext = {
  dataDir: string;
  submissionsDir: string;
  dbPath: string;
  usingFallbackTempDir: boolean;
};

let storageContextPromise: Promise<StorageContext> | null = null;

async function canUseDirectory(targetDir: string) {
  try {
    await mkdir(targetDir, { recursive: true });
    await access(targetDir);
    return true;
  } catch {
    return false;
  }
}

async function resolveStorageContext(): Promise<StorageContext> {
  const configuredDataDir = process.env.SUBMISSIONS_DATA_DIR;
  const primaryDataDir = configuredDataDir || path.join(process.cwd(), "data");
  const tempDataDir = path.join(os.tmpdir(), "presh-data");

  const primaryOk = await canUseDirectory(primaryDataDir);
  const dataDir = primaryOk ? primaryDataDir : tempDataDir;

  if (!primaryOk) {
    await mkdir(tempDataDir, { recursive: true });
    console.warn(
      `Submission storage fallback enabled. Could not write to ${primaryDataDir}; using ${tempDataDir} instead.`
    );
  }

  return {
    dataDir,
    submissionsDir: path.join(dataDir, "submissions"),
    dbPath: path.join(dataDir, "submissions.json"),
    usingFallbackTempDir: !primaryOk,
  };
}

async function getStorageContext() {
  if (!storageContextPromise) {
    storageContextPromise = resolveStorageContext();
  }
  return storageContextPromise;
}

async function ensureDataStore() {
  const context = await getStorageContext();
  await mkdir(context.submissionsDir, { recursive: true });
  try {
    await readFile(context.dbPath, "utf8");
  } catch {
    const emptyDb: SubmissionDatabase = { submissions: [] };
    await writeFile(context.dbPath, JSON.stringify(emptyDb, null, 2), "utf8");
  }
  return context;
}

async function readDb(): Promise<SubmissionDatabase> {
  const context = await ensureDataStore();
  const raw = await readFile(context.dbPath, "utf8");
  return JSON.parse(raw) as SubmissionDatabase;
}

async function writeDb(db: SubmissionDatabase) {
  const context = await ensureDataStore();
  await writeFile(context.dbPath, JSON.stringify(db, null, 2), "utf8");
}

export async function getSubmissionStorageInfo() {
  const context = await ensureDataStore();
  return {
    dataDir: context.dataDir,
    usingFallbackTempDir: context.usingFallbackTempDir,
  };
}

export async function persistUploadedFile(file: File, submissionId: string, label: "memo" | "answer") {
  const context = await ensureDataStore();
  const fileExtension = path.extname(file.name) || ".bin";
  const fileName = `${label}_${randomUUID()}${fileExtension}`;
  const targetPath = path.join(context.submissionsDir, submissionId, fileName);
  await mkdir(path.dirname(targetPath), { recursive: true });

  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(targetPath, buffer);

  return {
    originalName: file.name,
    savedName: fileName,
    relativePath: targetPath,
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
