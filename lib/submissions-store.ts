import { mkdir, readFile, writeFile, access, mkdtemp, rm } from "node:fs/promises";
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

function buildContext(dataDir: string, usingFallbackTempDir: boolean): StorageContext {
  return {
    dataDir,
    submissionsDir: path.join(dataDir, "submissions"),
    dbPath: path.join(dataDir, "submissions.json"),
    usingFallbackTempDir,
  };
}

async function canUseDirectory(targetDir: string) {
  try {
    await mkdir(targetDir, { recursive: true });
    await access(targetDir);
    const probeParent = path.join(targetDir, ".presh-write-probe-");
    const probeDir = await mkdtemp(probeParent);
    await rm(probeDir, { recursive: true, force: true });
    return true;
  } catch {
    return false;
  }
}

async function resolveStorageContext(): Promise<StorageContext> {
  const configuredDataDir = process.env.SUBMISSIONS_DATA_DIR;
  const primaryDataDir = configuredDataDir || path.join(process.cwd(), "data");
  const tempDataDir = path.join(os.tmpdir(), "presh-data");

  if (await canUseDirectory(primaryDataDir)) {
    return buildContext(primaryDataDir, false);
  }

  await mkdir(tempDataDir, { recursive: true });
  console.warn(
    `Persistent directory is not writable in this deployment, so submissions are temporarily stored in ${tempDataDir}. Configure SUBMISSIONS_DATA_DIR to a persistent writable volume to keep records long-term. (Attempted primary path: ${primaryDataDir})`
  );
  return buildContext(tempDataDir, true);
}

async function getStorageContext() {
  if (!storageContextPromise) {
    storageContextPromise = resolveStorageContext();
  }
  return storageContextPromise;
}

function resetStorageContextToTempDir() {
  const tempDataDir = path.join(os.tmpdir(), "presh-data");
  storageContextPromise = Promise.resolve(buildContext(tempDataDir, true));
  return storageContextPromise;
}

async function initializeContext(context: StorageContext) {
  await mkdir(context.submissionsDir, { recursive: true });
  try {
    await readFile(context.dbPath, "utf8");
  } catch {
    const emptyDb: SubmissionDatabase = { submissions: [] };
    await writeFile(context.dbPath, JSON.stringify(emptyDb, null, 2), "utf8");
  }
}

async function ensureDataStore() {
  const context = await getStorageContext();
  try {
    await initializeContext(context);
    return context;
  } catch (error) {
    if (!context.usingFallbackTempDir) {
      const fallbackContext = await resetStorageContextToTempDir();
      await mkdir(fallbackContext.dataDir, { recursive: true });
      console.warn(
        `Submission storage switched to fallback temp dir after init failure for ${context.dataDir}.`,
        error
      );
      await initializeContext(fallbackContext);
      return fallbackContext;
    }
    throw error;
  }
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
