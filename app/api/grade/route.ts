import { NextRequest } from "next/server";
import { createSubmissionRecord, persistUploadedFile } from "@/lib/submissions-store";

const MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";

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
                text: `You are a strict but fair instructor. Student: ${studentName}.\n\nTask: compare the student's answer against the memo and generate:\n1) Score out of 100\n2) Key strengths\n3) Gaps/mistakes\n4) Recommendations\n5) Short final summary for parents/teachers.\n\nAdditional instruction:\n${prompt}`,
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

    const gradingData = (await gradingResponse.json()) as {
      id?: string;
      output_text?: string;
    };

    const report = gradingData.output_text || "No grading report generated.";

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

    return Response.json({ submission });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    console.error("Grading route error:", error);
    return Response.json({ error: message }, { status: 500 });
  }
}
