import { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_API_KEY) {
    return Response.json(
      {
        error:
          "OPENAI_API_KEY is not configured. Add it to .env.local and restart the dev server.",
      },
      { status: 500 }
    );
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return Response.json({ error: "No file provided" }, { status: 400 });
    }

    // Upload to OpenAI Files API
    const uploadForm = new FormData();
    uploadForm.append("file", file);
    uploadForm.append("purpose", "responses");

    const response = await fetch("https://api.openai.com/v1/files", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: uploadForm,
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error("File upload error:", response.status, errorData);
      return Response.json(
        { error: "Failed to upload file" },
        { status: response.status }
      );
    }

    const data = await response.json();

    return Response.json({
      fileId: data.id,
      fileName: data.filename,
      fileSize: data.bytes,
    });
  } catch (error) {
    console.error("Upload error:", error);
    return Response.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
