import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest } from "next/server";
import { findSubmissionById } from "@/lib/submissions-store";

function escapePdfText(text: string) {
  return text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function wrapText(text: string, maxChars: number) {
  const rawLines = text.split(/\r?\n/);
  const lines: string[] = [];

  for (const rawLine of rawLines) {
    const words = rawLine.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push("");
      continue;
    }

    let current = words[0];
    for (const word of words.slice(1)) {
      if (`${current} ${word}`.length <= maxChars) {
        current = `${current} ${word}`;
      } else {
        lines.push(current);
        current = word;
      }
    }
    lines.push(current);
  }

  return lines;
}

function createReportPdf(studentName: string, report: string) {
  const title = `Grading Report - ${studentName}`;
  const bodyLines = wrapText(report, 95);
  const lines = [title, "", ...bodyLines];

  const textCommands: string[] = [];
  let y = 770;
  for (const line of lines) {
    if (y < 40) {
      break;
    }
    textCommands.push(`1 0 0 1 40 ${y} Tm (${escapePdfText(line)}) Tj`);
    y -= line === "" ? 12 : 14;
  }

  const contentStream = `BT\n/F1 11 Tf\n${textCommands.join("\n")}\nET`;
  const contentLength = Buffer.byteLength(contentStream, "utf8");

  const objects = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n",
    "4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
    `5 0 obj\n<< /Length ${contentLength} >>\nstream\n${contentStream}\nendstream\nendobj\n`,
  ];

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [0];

  for (const object of objects) {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += object;
  }

  const xrefStart = Buffer.byteLength(pdf, "utf8");
  const xrefRows = ["0000000000 65535 f "]; 
  for (let i = 1; i < offsets.length; i += 1) {
    xrefRows.push(`${String(offsets[i]).padStart(10, "0")} 00000 n `);
  }

  pdf += `xref\n0 ${offsets.length}\n${xrefRows.join("\n")}\n`;
  pdf += `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  return Buffer.from(pdf, "utf8");
}

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
    const reportPdf = createReportPdf(submission.studentName, submission.report);
    return new Response(reportPdf, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${submission.studentName.replace(/\s+/g, "_")}_report.pdf"`,
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
