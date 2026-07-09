export const maxDuration = 60;

import connectDB from "@/config/db";
import Chat from "@/models/Chat";
import { getAuth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

async function groqComplete(messages, maxTokens = 1024) {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${process.env.GROQ_API_KEY}`
        },
        body: JSON.stringify({
            model: "openai/gpt-oss-120b",
            messages,
            max_tokens: maxTokens
        })
    });
    const data = await res.json();
    return data.choices?.[0]?.message?.content || "";
}

async function tavilySearch(query) {
    try {
        const res = await fetch("https://api.tavily.com/search", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                api_key: process.env.TAVILY_API_KEY,
                query,
                max_results: 4,
                include_answer: true
            })
        });
        const data = await res.json();
        return data.results || [];
    } catch (err) {
        console.error("Tavily error for query:", query, err);
        return [];
    }
}

export async function POST(req) {
    try {
        const { userId } = getAuth(req);
        const { chatId, prompt } = await req.json();

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

        data.messages.push({ role: "user", content: prompt, timestamp: Date.now() });

        // Step 1: break the question into 3-4 focused sub-questions
        const planText = await groqComplete([{
            role: "user",
            content: `Break this research question into exactly 3 focused, distinct search queries that together would cover it well. Reply with ONLY the 3 queries, one per line, no numbering, no extra text.\n\nQuestion: ${prompt}`
        }], 200);

        const subQueries = planText.split("\n").map(q => q.trim()).filter(Boolean).slice(0, 4);
        const queries = subQueries.length > 0 ? subQueries : [prompt];

        // Step 2: run all searches in parallel
        const searchResults = await Promise.all(queries.map(q => tavilySearch(q)));

        let sourceCount = 0;
        const sourceBlocks = [];
        searchResults.forEach((results, i) => {
            results.forEach((r) => {
                sourceCount++;
                sourceBlocks.push(`[${sourceCount}] (re: "${queries[i]}") ${r.title}\n${r.content}\nURL: ${r.url}`);
            });
        });

        if (sourceCount === 0) {
            return NextResponse.json({ success: false, message: "No search results found for this topic" });
        }

        // Step 3: synthesize a full report citing sources
        const reportPrompt = `You are a research assistant. Using ONLY the sources below, write a thorough, well-organized report answering this question:\n\n"${prompt}"\n\nUse headings where helpful. Cite sources inline like [1], [2] matching the numbers below. End with a "Sources" section listing each numbered URL.\n\nSOURCES:\n${sourceBlocks.join("\n\n")}`;

        const report = await groqComplete([{ role: "user", content: reportPrompt }], 2048);

        const message = { role: "assistant", content: report, timestamp: Date.now() };
        data.messages.push(message);
        await data.save();

        return NextResponse.json({ success: true, data: message });

    } catch (error) {
        console.error("Research Route Error:", error);
        return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }
}