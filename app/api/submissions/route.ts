import { getSubmissionStorageInfo, listSubmissionRecords } from "@/lib/submissions-store";

export async function GET() {
  const [submissions, storage] = await Promise.all([
    listSubmissionRecords(),
    getSubmissionStorageInfo(),
  ]);
  return Response.json({ submissions, storage });
}
