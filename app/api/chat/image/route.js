import connectDB from "@/config/db";
import Chat from "@/models/Chat";
import { getAuth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

async function generateChatTitle(userPrompt) {
    try {
        const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${process.env.GROQ_API_KEY}`
            },
            body: JSON.stringify({
                model: "openai/gpt-oss-120b",
                messages: [{
                    role: "user",
                    content: `Generate a short chat title (3-6 words, no quotes, no trailing punctuation) that captures the topic of this image request:\n\n"${userPrompt}"\n\nReply with ONLY the title.`
                }],
                max_tokens: 20
            })
        });
        const data = await res.json();
        let title = data.choices?.[0]?.message?.content?.trim() || "";
        title = title.replace(/^['"]|['"]$/g, "").replace(/[.!]+$/, "");
        return title || null;
    } catch (err) {
        console.error("Title generation failed:", err);
        return null;
    }
}

export async function POST(req) {
    try {
        const { userId } = getAuth(req);
        const { chatId, prompt, editImageBase64 } = await req.json();

        if (!userId) {
            return NextResponse.json({ success: false, message: "User not authenticated" }, { status: 401 });
        }
        if (!prompt || !prompt.trim()) {
            return NextResponse.json({ success: false, message: "Prompt required" }, { status: 400 });
        }

        await connectDB();
        const data = await Chat.findOne({ userId, _id: chatId });
        if (!data) {
            return NextResponse.json({ success: false, message: "Chat not found" }, { status: 404 });
        }

        const isFirstMessage = data.name === "New Chat" && data.messages.length === 0;

        const imageUrl = editImageBase64
            ? `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?model=kontext&image=${encodeURIComponent(editImageBase64)}&width=768&height=768&nologo=true&seed=${Date.now()}`
            : `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=768&height=768&nologo=true&seed=${Date.now()}`;

        // Run title generation (if needed) and the image-generation check
        // in parallel instead of sequentially. Using GET (not HEAD) here
        // because it actually confirms the image bytes were generated
        // successfully, rather than just that the endpoint responded -
        // HEAD was found to be unreliable for confirming real generation
        // success on this service.
        const [aiTitle, check] = await Promise.all([
            isFirstMessage ? generateChatTitle(prompt) : Promise.resolve(null),
            fetch(imageUrl)
        ]);

        if (isFirstMessage) {
            const fallback = prompt.trim().split(/\s+/).slice(0, 6).join(" ");
            const title = aiTitle || fallback;
            data.name = title.length > 40 ? title.slice(0, 40) + "..." : title;
        }

        if (!check.ok) {
            const message = editImageBase64
                ? "Couldn't edit that image - the model may not support this image format. Try a plain JPG/PNG under 2MB."
                : "Image generation failed, try a different prompt";
            return NextResponse.json({ success: false, message }, { status: 500 });
        }

        data.messages.push({ role: "user", content: prompt, timestamp: Date.now() });

        const message = { role: "assistant", content: `![Generated image](${imageUrl})`, timestamp: Date.now() };
        data.messages.push(message);
        await data.save();

        return NextResponse.json({ success: true, data: message });

    } catch (error) {
        console.error("Image gen error:", error);
        return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }
}