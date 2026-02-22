import { NextRequest } from "next/server";
import { getSubmissionStorageInfo, listSubmissionRecords, listSubmissionRecordsByStudent } from "@/lib/submissions-store";

export async function GET(request: NextRequest) {
  const studentName = request.nextUrl.searchParams.get("studentName")?.trim();
  const includeAll = request.nextUrl.searchParams.get("includeAll") === "true";

  const submissionsPromise = includeAll
    ? listSubmissionRecords()
    : studentName
      ? listSubmissionRecordsByStudent(studentName)
      : Promise.resolve([]);

  const [submissions, storage] = await Promise.all([submissionsPromise, getSubmissionStorageInfo()]);
  return Response.json({ submissions, storage });
}
