import { NextRequest } from "next/server";
import {
  createSubmissionRecord,
  getSubmissionStorageInfo,
  persistUploadedFile,
} from "@/lib/submissions-store";

const MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";

type ResponseOutputItem = {
  type?: string;
  content?: Array<{
    type?: string;
    text?: string;
  }>;
};

type ResponsesApiPayload = {
  id?: string;
  output_text?: string;
  output?: ResponseOutputItem[];
};

type QuestionFeedback = {
  questionNumber: string;
  questionTitle?: string;
  maxScore: number;
  awardedScore: number;
  strengths: string;
  issues: string;
  improvement: string;
};

type StructuredGradingReport = {
  questions: QuestionFeedback[];
  overallStrengths: string[];
  overallGaps: string[];
  overallRecommendations: string[];
  summaryForParentsTeachers: string;
};

function extractReportText(payload: ResponsesApiPayload) {
  if (payload.output_text && payload.output_text.trim().length > 0) {
    return payload.output_text.trim();
  }

  const chunks: string[] = [];
  for (const item of payload.output || []) {
    if (item.type !== "message") {
      continue;
    }
    for (const part of item.content || []) {
      if (part.type === "output_text" && part.text) {
        chunks.push(part.text);
      }
    }
  }

  return chunks.join("\n").trim();
}

function parseJsonReport(rawText: string): StructuredGradingReport | null {
  const trimmed = rawText.trim();
  const withoutFence = trimmed
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  const candidates = [withoutFence, trimmed];

  const startIndex = withoutFence.indexOf("{");
  const endIndex = withoutFence.lastIndexOf("}");
  if (startIndex >= 0 && endIndex > startIndex) {
    candidates.push(withoutFence.slice(startIndex, endIndex + 1));
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as StructuredGradingReport;
      if (!Array.isArray(parsed.questions)) {
        continue;
      }
      return parsed;
    } catch {
      // Ignore and try next candidate.
    }
  }

  return null;
}

function sanitizeList(items: string[] | undefined) {
  return (items || []).map((item) => String(item || "").trim()).filter(Boolean);
}

function formatScore(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.00$/, "");
}

function buildBeautifulReport(report: StructuredGradingReport) {
  const questions = (report.questions || []).filter(
    (question) =>
      Number.isFinite(question?.maxScore) &&
      Number.isFinite(question?.awardedScore) &&
      question.maxScore >= 0
  );

  const totals = questions.reduce(
    (acc, question) => {
      const maxScore = Math.max(0, question.maxScore);
      const awardedScore = Math.max(0, Math.min(question.awardedScore, maxScore));
      return {
        max: acc.max + maxScore,
        awarded: acc.awarded + awardedScore,
      };
    },
    { max: 0, awarded: 0 }
  );

  const finalPercent = totals.max > 0 ? (totals.awarded / totals.max) * 100 : 0;
  const header = [
    "GRADING REPORT",
    "=".repeat(56),
    `Final Score: ${formatScore(finalPercent)} / 100`,
    `Marks: ${formatScore(totals.awarded)} / ${formatScore(totals.max)}`,
    "",
    "Question-by-Question Feedback",
    "-".repeat(56),
  ];

  const perQuestionLines =
    questions.length > 0
      ? questions.flatMap((question, index) => {
          const title = question.questionTitle ? ` - ${question.questionTitle}` : "";
          const safeMax = Math.max(0, question.maxScore);
          const safeAwarded = Math.max(0, Math.min(question.awardedScore, safeMax));

          return [
            `${index + 1}. Question ${question.questionNumber}${title}`,
            `   Score: ${formatScore(safeAwarded)} / ${formatScore(safeMax)}`,
            `   What was done well: ${question.strengths || "No strengths identified."}`,
            `   What was incorrect/missing: ${question.issues || "No issues identified."}`,
            `   How to improve: ${question.improvement || "No improvement guidance provided."}`,
            "",
          ];
        })
      : ["No question-level feedback was generated.", ""];

  const overallStrengths = sanitizeList(report.overallStrengths);
  const overallGaps = sanitizeList(report.overallGaps);
  const overallRecommendations = sanitizeList(report.overallRecommendations);

  const buildSection = (title: string, items: string[]) => [
    title,
    "-".repeat(56),
    ...(items.length ? items.map((item) => `• ${item}`) : ["• Not provided."]),
    "",
  ];

  const summary = (report.summaryForParentsTeachers || "No summary provided.").trim();

  const lines = [
    ...header,
    ...perQuestionLines,
    ...buildSection("Overall Strengths", overallStrengths),
    ...buildSection("Overall Gaps", overallGaps),
    ...buildSection("Overall Recommendations", overallRecommendations),
    "Summary for Parents/Teachers",
    "-".repeat(56),
    summary,
  ];

  return lines.join("\n").trim();
}

export async function POST(req: NextRequest) {
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_API_KEY) {
    return Response.json(
      { error: "OPENAI_API_KEY is not configured." },
      { status: 500 }
    );
  }

  try {
    const formData = await req.formData();
    const studentName = String(formData.get("studentName") || "").trim();
    const prompt = String(formData.get("prompt") || "Grade this submission against the memo and provide a clear report.").trim();
    const memo = formData.get("memo") as File | null;
    const answer = formData.get("answer") as File | null;

    if (!studentName) {
      return Response.json({ error: "studentName is required" }, { status: 400 });
    }

    if (!memo || !answer) {
      return Response.json({ error: "Both memo and answer files are required" }, { status: 400 });
    }

    const uploadFile = async (file: File) => {
      const uploadForm = new FormData();
      uploadForm.append("file", file);
      uploadForm.append("purpose", "user_data");

      const uploadResponse = await fetch("https://api.openai.com/v1/files", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
        },
        body: uploadForm,
      });

      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text();
        throw new Error(`Failed to upload ${file.name}: ${errorText}`);
      }

      return (await uploadResponse.json()) as { id: string };
    };

    const memoUpload = await uploadFile(memo);
    const answerUpload = await uploadFile(answer);

    const gradingResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: `You are a strict but fair instructor. Student: ${studentName}.

Carefully extract every question from the memo, including each question's mark allocation where provided.
Then mark the student's answer question-by-question.

Scoring rules (must follow exactly):
- Every memo question must be included in the report.
- Unanswered or missing answers must receive 0 for that question.
- awardedScore for each question cannot exceed maxScore.
- Total marks must be the sum of awardedScore across questions.
- Final percentage score must be derived from totals, not guessed.
- If the memo does not provide mark allocation, use equal maxScore weights and clearly reflect that in feedback.

Return ONLY valid JSON (no markdown, no code fences) using this shape:
{
  "questions": [
    {
      "questionNumber": "1",
      "questionTitle": "optional short title",
      "maxScore": 10,
      "awardedScore": 4,
      "strengths": "...",
      "issues": "...",
      "improvement": "..."
    }
  ],
  "overallStrengths": ["..."],
  "overallGaps": ["..."],
  "overallRecommendations": ["..."],
  "summaryForParentsTeachers": "..."
}

Important ordering rule for content quality: question-by-question feedback first, then overall feedback.

Additional instruction:
${prompt}`,
              },
              {
                type: "input_file",
                file_id: memoUpload.id,
              },
              {
                type: "input_file",
                file_id: answerUpload.id,
              },
            ],
          },
        ],
      }),
    });

    if (!gradingResponse.ok) {
      const errorText = await gradingResponse.text();
      return Response.json({ error: `Grading failed: ${errorText}` }, { status: gradingResponse.status });
    }

    const gradingData = (await gradingResponse.json()) as ResponsesApiPayload;
    const rawReport = extractReportText(gradingData);
    const structuredReport = rawReport ? parseJsonReport(rawReport) : null;

    const report = structuredReport
      ? buildBeautifulReport(structuredReport)
      : rawReport || "No grading report generated.";

    const tempId = crypto.randomUUID();
    const memoFile = await persistUploadedFile(memo, tempId, "memo");
    const answerFile = await persistUploadedFile(answer, tempId, "answer");

    const submission = await createSubmissionRecord({
      studentName,
      prompt,
      report,
      openaiResponseId: gradingData.id,
      files: {
        memo: memoFile,
        answer: answerFile,
      },
    });

    const storage = await getSubmissionStorageInfo();

    return Response.json({
      submission,
      storage,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    console.error("Grading route error:", error);
    return Response.json({ error: message }, { status: 500 });
  }
}
