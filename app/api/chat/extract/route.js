import { NextResponse } from "next/server";
import mammoth from "mammoth";

export const runtime = "nodejs";
export const maxDuration = 60;

const OCR_SPACE_ENDPOINT = "https://api.ocr.space/parse/image";

async function ocrWithOcrSpace(buffer, filename, mimeType) {
    const apiKey = process.env.OCR_SPACE_API_KEY;
    if (!apiKey) {
        throw new Error("OCR_SPACE_API_KEY is not set");
    }

    const formData = new FormData();
    const blob = new Blob([buffer], { type: mimeType });
    formData.append("file", blob, filename);
    formData.append("apikey", apiKey);
    formData.append("language", "eng");
    formData.append("isOverlayRequired", "false");
    formData.append("OCREngine", "2");
    formData.append("scale", "true");

    const response = await fetch(OCR_SPACE_ENDPOINT, {
        method: "POST",
        body: formData,
    });

    if (!response.ok) {
        if (response.status === 413) {
            throw new Error("FILE_TOO_LARGE");
        }
        throw new Error(`OCR.space request failed with status ${response.status}`);
    }

    const result = await response.json();

    if (result.IsErroredOnProcessing) {
        const message = Array.isArray(result.ErrorMessage)
            ? result.ErrorMessage.join(", ")
            : (result.ErrorMessage || "Unknown OCR.space error");
        throw new Error(message);
    }

    const parsedResults = result.ParsedResults || [];
    const text = parsedResults.map((r) => r.ParsedText || "").join("\n\n").trim();

    return text;
}

export async function POST(req) {
    try {
        const formData = await req.formData();
        const file = formData.get("file");

        if (!file) {
            return NextResponse.json({ success: false, message: "No file provided" }, { status: 400 });
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        const name = file.name.toLowerCase();
        let text = "";
        let usedOcr = false;

        if (name.endsWith(".pdf")) {
            const pdfParse = (await import("pdf-parse")).default;
            const result = await pdfParse(buffer);
            text = result.text.trim();

            if (!text || text.length < 20) {
                try {
                    text = await ocrWithOcrSpace(buffer, file.name, "application/pdf");
                    usedOcr = true;
                } catch (ocrError) {
                    console.error("Scanned-PDF OCR error:", ocrError);
                    const isTooLarge = ocrError.message === "FILE_TOO_LARGE";
                    return NextResponse.json({
                        success: false,
                        message: isTooLarge
                            ? "This scanned PDF is too large for OCR (limit is 1MB). Try compressing it or splitting it into smaller files."
                            : "This PDF appears to be scanned, and OCR on it failed. Try exporting/printing individual pages as images (PNG/JPG) and uploading those instead - image OCR is fully supported."
                    });
                }
            }
        } else if (name.endsWith(".docx")) {
            const result = await mammoth.extractRawText({ buffer });
            text = result.value;
        } else if (name.match(/\.(jpg|jpeg|png|webp|bmp)$/)) {
            try {
                text = await ocrWithOcrSpace(buffer, file.name, file.type || "image/png");
                usedOcr = true;
            } catch (ocrError) {
                console.error("Image OCR error:", ocrError);
                const isTooLarge = ocrError.message === "FILE_TOO_LARGE";
                return NextResponse.json({
                    success: false,
                    message: isTooLarge
                        ? "This image is too large for OCR (limit is 1MB). Try compressing it or using a smaller resolution."
                        : "Failed to extract text from this image via OCR. Please try a clearer image or a different file."
                });
            }
        } else {
            return NextResponse.json({ success: false, message: "Unsupported file type" }, { status: 400 });
        }

        text = text.trim();
        if (!text) {
            return NextResponse.json({ success: false, message: "No text could be found in this file, even with OCR" });
        }

        const MAX_CHARS = 15000;
        if (text.length > MAX_CHARS) {
            text = text.slice(0, MAX_CHARS) + "\n\n[Content truncated for length...]";
        }

        return NextResponse.json({ success: true, text, usedOcr });

    } catch (error) {
        console.error("Extract error:", error);
        return NextResponse.json({ success: false, message: "Failed to extract text: " + error.message }, { status: 500 });
    }
}