export const maxDuration = 60;

import connectDB from "@/config/db";
import Chat from "@/models/Chat";
import UserSettings from "@/models/UserSettings";
import { getAuth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const TONE_INSTRUCTIONS = {
    professional: "Respond in a professional, formal tone.",
    friendly: "Respond in a warm, friendly, conversational tone.",
    creative: "Respond in a creative, imaginative, expressive tone.",
    neutral: ""
};

const LENGTH_TOKENS = { short: 400, medium: 1024, long: 2048 };
const MAX_HISTORY_MESSAGES = 20; // last 20 turns (user+assistant combined) sent as context

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
                    content: `Generate a short chat title (3-6 words, no quotes, no trailing punctuation) that captures the topic of this message:\n\n"${userPrompt}"\n\nReply with ONLY the title.`
                }],
                max_tokens: 20
            })
        });
        const data = await res.json();
        let title = data.choices?.[0]?.message?.content?.trim() || "";
        title = title.replace(/^["']|["']$/g, "").replace(/[.!]+$/, "");
        return title || null;
    } catch (err) {
        console.error("Title generation failed:", err);
        return null;
    }
}

async function getUserSettings(userId) {
    try {
        const settings = await UserSettings.findOne({ userId });
        if (settings) return settings;
    } catch (err) {
        console.error("Settings fetch failed:", err);
    }
    return { customInstructions: "", tone: "neutral", responseLength: "medium", model: "openai/gpt-oss-120b" };
}

async function getSearchContext(query) {
    try {
        const res = await fetch("https://api.tavily.com/search", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                api_key: process.env.TAVILY_API_KEY,
                query,
                max_results: 5,
                include_answer: true
            })
        });
        const data = await res.json();
        if (!data.results || data.results.length === 0) return null;
        const snippets = data.results.map((r, i) => `[${i + 1}] ${r.title}\n${r.content}\nSource: ${r.url}`).join("\n\n");
        return `Web search results for "${query}":\n\n${snippets}\n\nUse these results to inform your answer. Cite sources like [1], [2] where relevant.`;
    } catch (err) {
        console.error("Tavily search failed:", err);
        return null;
    }
}

// Builds prior-turn history from stored chat messages, excluding file/image blobs
// (those are large and not meaningful to the model as raw base64), and excluding
// the message we just pushed (the current turn), which is handled separately.
function buildHistoryMessages(allMessages) {
    const priorMessages = allMessages.slice(0, -1); // exclude the just-pushed current user message
    const trimmed = priorMessages.slice(-MAX_HISTORY_MESSAGES);
    return trimmed
        .filter(m => m.role === "user" || m.role === "assistant")
        .map(m => ({
            role: m.role,
            content: m.content || ""
        }));
}

export async function POST(req) {
    try {
        const { userId } = getAuth(req);
        const { chatId, prompt, imageBase64, useSearch, fileMeta } = await req.json();

        if (!userId) {
            return NextResponse.json({ success: false, message: "User not authenticated" }, { status: 401 });
        }

        await connectDB();
        const data = await Chat.findOne({ userId, _id: chatId });
        if (!data) {
            return NextResponse.json({ success: false, message: "Chat not found" }, { status: 404 });
        }

        const userPrompt = { role: "user", content: prompt, timestamp: Date.now() };
        if (fileMeta) {
            userPrompt.fileName = fileMeta.fileName;
            userPrompt.fileData = fileMeta.fileData;
            userPrompt.fileType = fileMeta.fileType;
        }
        data.messages.push(userPrompt);

        // Give the chat an instant fallback title synchronously (no blocking AI call).
        const isNewChat = data.name === "New Chat" && data.messages.length === 1;
        if (isNewChat) {
            const fallback = prompt.trim().split(/\s+/).slice(0, 6).join(" ");
            data.name = fallback.length > 40 ? fallback.slice(0, 40) + "..." : fallback;
        }
        await data.save();

        // Generate the "real" AI title in the background — never awaited, never blocks the response.
        if (isNewChat) {
            generateChatTitle(prompt).then(async (aiTitle) => {
                if (!aiTitle) return;
                try {
                    const chatToUpdate = await Chat.findOne({ userId, _id: chatId });
                    if (chatToUpdate) {
                        chatToUpdate.name = aiTitle.length > 40 ? aiTitle.slice(0, 40) + "..." : aiTitle;
                        await chatToUpdate.save();
                    }
                } catch (e) {
                    console.error("Background title update failed:", e);
                }
            }).catch(e => console.error("Title generation failed:", e));
        }

        // --- Image path: non-streaming vision response (single-turn, no history needed) ---
        if (imageBase64) {
            const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${process.env.GROQ_API_KEY}`
                },
                body: JSON.stringify({
                    model: "qwen/qwen3.6-27b",
                    messages: [{
                        role: "user",
                        content: [
                            { type: "text", text: prompt },
                            { type: "image_url", image_url: { url: imageBase64 } }
                        ]
                    }],
                    max_tokens: 1024
                })
            });
            const result = await response.json();
            if (!result.choices || !result.choices[0]) {
                return NextResponse.json({ success: false, message: result.error?.message || "API error" });
            }
            const message = { role: "assistant", content: result.choices[0].message.content, timestamp: Date.now() };
            data.messages.push(message);
            await data.save();
            return NextResponse.json({ success: true, data: message });
        }

        // --- Text path: real streaming, WITH conversation history, optional web search, user settings ---
        const [settings, searchContext] = await Promise.all([
            getUserSettings(userId),
            useSearch ? getSearchContext(prompt) : Promise.resolve(null)
        ]);

        let finalPrompt = prompt;
        if (searchContext) {
            finalPrompt = `${searchContext}\n\nUser question: ${prompt}`;
        }

        const systemParts = [];
        if (TONE_INSTRUCTIONS[settings.tone]) systemParts.push(TONE_INSTRUCTIONS[settings.tone]);
        if (settings.customInstructions?.trim()) systemParts.push(settings.customInstructions.trim());
        const systemText = systemParts.join(" ");

        // Build full conversation: system prompt + prior history + current (possibly search-augmented) message
        const historyMessages = buildHistoryMessages(data.messages);

        const messages = [
            ...(systemText ? [{ role: "system", content: systemText }] : []),
            ...historyMessages,
            { role: "user", content: finalPrompt }
        ];

        const modelToUse = settings.model || "openai/gpt-oss-120b";
        const maxTokens = LENGTH_TOKENS[settings.responseLength] || 1024;

        const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${process.env.GROQ_API_KEY}`
            },
            body: JSON.stringify({
                model: modelToUse,
                messages,
                max_tokens: maxTokens,
                stream: true
            })
        });

        if (!groqResponse.ok || !groqResponse.body) {
            const errText = await groqResponse.text();
            console.error("Groq API error:", errText);
            return NextResponse.json({ success: false, message: "AI API error" }, { status: 500 });
        }

        let fullContent = "";
        const encoder = new TextEncoder();
        const decoder = new TextDecoder();

        const stream = new ReadableStream({
            async start(controller) {
                const reader = groqResponse.body.getReader();
                let buffer = "";
                try {
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        buffer += decoder.decode(value, { stream: true });
                        const lines = buffer.split("\n");
                        buffer = lines.pop();
                        for (const line of lines) {
                            const trimmed = line.trim();
                            if (!trimmed.startsWith("data:")) continue;
                            const payload = trimmed.slice(5).trim();
                            if (payload === "[DONE]") continue;
                            try {
                                const json = JSON.parse(payload);
                                const delta = json.choices?.[0]?.delta?.content;
                                if (delta) {
                                    fullContent += delta;
                                    controller.enqueue(encoder.encode(delta));
                                }
                            } catch (e) {}
                        }
                    }
                } catch (err) {
                    console.error("Stream read error:", err);
                } finally {
                    try {
                        const freshChat = await Chat.findOne({ userId, _id: chatId });
                        if (freshChat) {
                            freshChat.messages.push({ role: "assistant", content: fullContent, timestamp: Date.now() });
                            await freshChat.save();
                        }
                    } catch (saveErr) {
                        console.error("Failed to save streamed message:", saveErr);
                    }
                    controller.close();
                }
            }
        });

        return new Response(stream, {
            status: 200,
            headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache" }
        });

    } catch (error) {
        console.error("AI Route Error:", error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}