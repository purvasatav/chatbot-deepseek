import { NextResponse } from "next/server";
import mammoth from "mammoth";
import path from "path";
import { createWorker } from "tesseract.js";

// Statically importing the worker script (rather than relying on pdfjs's own
// internal dynamic string-based import of it) forces Next's serverless
// file-tracer to detect and include the physical file in the deployed
// function bundle. A dynamic import built from a runtime string (which is
// what pdfjs does internally, and what workerSrc alone doesn't fix) is
// invisible to the tracer - this static import is what actually gets the
// file copied into the Vercel bundle.
import "pdfjs-dist/legacy/build/pdf.worker.mjs";

export const runtime = "nodejs";
export const maxDuration = 60;

async function ocrImageBuffer(buffer) {
    const worker = await createWorker("eng", 1, {
        cachePath: "/tmp",
    });
    const { data } = await worker.recognize(buffer);
    await worker.terminate();
    return data.text;
}

// pdfjs-dist's page.render() assumes a browser environment (DOMMatrix,
// Path2D, ImageData, and a CanvasFactory that returns real <canvas>-like
// objects), and it also needs its worker script (pdf.worker.mjs) at runtime.
// On Vercel's serverless bundle, none of that exists/resolves automatically,
// so we polyfill the globals, point workerSrc directly at the on-disk file,
// and supply a custom CanvasFactory.
async function ocrScannedPdf(buffer) {
    const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const { createCanvas, DOMMatrix, Path2D, ImageData } = await import("@napi-rs/canvas");

    // Point pdfjs directly at the worker file's on-disk location instead of
    // letting it dynamically resolve the path itself (that internal
    // resolution is what fails on Vercel's serverless bundle).
    pdfjsLib.GlobalWorkerOptions.workerSrc = path.join(
        process.cwd(),
        "node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"
    );

    // Polyfill globals pdfjs-dist expects to exist (normally provided by the browser).
    if (typeof globalThis.DOMMatrix === "undefined") globalThis.DOMMatrix = DOMMatrix;
    if (typeof globalThis.Path2D === "undefined") globalThis.Path2D = Path2D;
    if (typeof globalThis.ImageData === "undefined") globalThis.ImageData = ImageData;

    class NodeCanvasFactory {
        create(width, height) {
            const canvas = createCanvas(width, height);
            const context = canvas.getContext("2d");
            return { canvas, context };
        }
        reset(canvasAndContext, width, height) {
            canvasAndContext.canvas.width = width;
            canvasAndContext.canvas.height = height;
        }
        destroy(canvasAndContext) {
            canvasAndContext.canvas.width = 0;
            canvasAndContext.canvas.height = 0;
            canvasAndContext.canvas = null;
            canvasAndContext.context = null;
        }
    }

    const loadingTask = pdfjsLib.getDocument({
        data: new Uint8Array(buffer),
        useWorkerFetch: false,
        isEvalSupported: false,
        useSystemFonts: true,
        canvasFactory: new NodeCanvasFactory(),
    });
    const pdfDocument = await loadingTask.promise;

    const MAX_PAGES = 15;
    const pageCount = Math.min(pdfDocument.numPages, MAX_PAGES);
    let fullText = "";

    for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
        const page = await pdfDocument.getPage(pageNum);
        const viewport = page.getViewport({ scale: 2.0 });
        const canvasFactory = new NodeCanvasFactory();
        const canvasAndContext = canvasFactory.create(viewport.width, viewport.height);

        await page.render({
            canvasContext: canvasAndContext.context,
            viewport,
            canvasFactory,
        }).promise;

        const pageBuffer = canvasAndContext.canvas.toBuffer("image/png");
        const pageText = await ocrImageBuffer(pageBuffer);
        fullText += pageText.trim() + "\n\n";

        canvasFactory.destroy(canvasAndContext);
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
                    // TEMP DEBUG: surfacing the real error message directly in the
                    // response so we can confirm the fix without pulling logs.
                    // Revert to a clean user-facing message once confirmed working.
                    return NextResponse.json({
                        success: false,
                        message: `OCR failed: ${ocrError?.message || String(ocrError)}`
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