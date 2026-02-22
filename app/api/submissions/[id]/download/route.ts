import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest } from "next/server";
import { findSubmissionById } from "@/lib/submissions-store";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const target = req.nextUrl.searchParams.get("file");

  if (target !== "memo" && target !== "answer" && target !== "report") {
    return Response.json({ error: "file query must be memo, answer, or report" }, { status: 400 });
  }

  const submission = await findSubmissionById(id);
  if (!submission) {
    return Response.json({ error: "Submission not found" }, { status: 404 });
  }

  if (target === "report") {
    return new Response(submission.report, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="${submission.studentName.replace(/\s+/g, "_")}_report.txt"`,
      },
    });
  }

  const fileInfo = target === "memo" ? submission.files.memo : submission.files.answer;
  const legacyPath = fileInfo.relativePath.startsWith("/")
    ? fileInfo.relativePath
    : path.join(process.cwd(), fileInfo.relativePath);
  const data = await readFile(legacyPath);

  return new Response(data, {
    headers: {
      "Content-Type": fileInfo.mimeType,
      "Content-Disposition": `attachment; filename="${fileInfo.originalName}"`,
    },
  });
}
