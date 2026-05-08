import { NextRequest } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { getSubmissionStorageInfo, listSubmissionRecordsByUserId } from "@/lib/submissions-store";

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) {
    const storage = await getSubmissionStorageInfo();
    return Response.json({ submissions: [], storage, user: null });
  }

  const [submissions, storage] = await Promise.all([
    listSubmissionRecordsByUserId(user.id),
    getSubmissionStorageInfo(),
  ]);

  return Response.json({ submissions, storage, user });
}
