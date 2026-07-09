import { NextResponse } from "next/server";
import mammoth from "mammoth";
import { createWorker } from "tesseract.js";

export const runtime = "nodejs";
export const maxDuration = 60;

async function ocrImageBuffer(buffer) {
    const worker = await createWorker("eng");
    const { data } = await worker.recognize(buffer);
    await worker.terminate();
    return data.text;
}

async function ocrScannedPdf(buffer) {
    const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const { createCanvas } = await import("@napi-rs/canvas");

    const loadingTask = pdfjsLib.getDocument({
        data: new Uint8Array(buffer),
        useWorkerFetch: false,
        isEvalSupported: false,
        useSystemFonts: true,
    });
    const pdfDocument = await loadingTask.promise;

    const MAX_PAGES = 15;
    const pageCount = Math.min(pdfDocument.numPages, MAX_PAGES);
    let fullText = "";

    for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
        const page = await pdfDocument.getPage(pageNum);
        const viewport = page.getViewport({ scale: 2.0 });
        const canvas = createCanvas(viewport.width, viewport.height);
        const context = canvas.getContext("2d");

        await page.render({ canvasContext: context, viewport }).promise;

        const pageBuffer = canvas.toBuffer("image/png");
        const pageText = await ocrImageBuffer(pageBuffer);
        fullText += pageText.trim() + "\n\n";
    }

    if (pdfDocument.numPages > MAX_PAGES) {
        fullText += `\n[Only the first ${MAX_PAGES} of ${pdfDocument.numPages} pages were processed]`;
    }

    return fullText.trim();
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
                    text = await ocrScannedPdf(buffer);
                    usedOcr = true;
                } catch (ocrError) {
                    console.error("Scanned-PDF OCR error:", ocrError);
                    return NextResponse.json({
                        success: false,
                        message: "This PDF appears to be scanned, and OCR on it failed. Try exporting/printing individual pages as images (PNG/JPG) and uploading those instead - image OCR is fully supported."
                    });
                }
            }
        } else if (name.endsWith(".docx")) {
            const result = await mammoth.extractRawText({ buffer });
            text = result.value;
        } else if (name.match(/\.(jpg|jpeg|png|webp|bmp)$/)) {
            text = await ocrImageBuffer(buffer);
            usedOcr = true;
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

