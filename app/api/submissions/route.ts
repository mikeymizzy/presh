import { listSubmissionRecords } from "@/lib/submissions-store";

export async function GET() {
  const submissions = await listSubmissionRecords();
  return Response.json({ submissions });
}
