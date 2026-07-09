export const maxDuration = 60;

import connectDB from "@/config/db";
import Chat from "@/models/Chat";
import { getAuth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

export async function POST(req){
    try {
        const {userId} = getAuth(req)
        const { chatId } = await req.json();
        if(!userId){
            return NextResponse.json({ success: false, message: "User not authenticated" });
        }
        await connectDB()
        const data = await Chat.findOne({userId, _id: chatId})
        if (!data || data.messages.length < 2) {
            return NextResponse.json({ success: false, message: "Nothing to regenerate" });
        }

        // Remove the last assistant message, find the last user message before it
        const lastMessage = data.messages[data.messages.length - 1];
        if (lastMessage.role !== "assistant") {
            return NextResponse.json({ success: false, message: "Last message is not an AI response" });
        }
        data.messages.pop();
        const lastUserMessage = data.messages[data.messages.length - 1];

        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${process.env.GROQ_API_KEY}`
            },
            body: JSON.stringify({
                model: "llama-3.3-70b-versatile",
                messages: [{ role: "user", content: lastUserMessage.content }],
                max_tokens: 1024
            })
        });
        const result = await response.json();
        if(!result.choices || !result.choices[0]){
            return NextResponse.json({ success: false, message: result.error?.message || "API error" });
        }
        const message = {
            role: "assistant",
            content: result.choices[0].message.content,
            timestamp: Date.now()
        };
        data.messages.push(message);
        await data.save();
        return NextResponse.json({success: true, data: message})
    } catch (error) {
        console.error("Regenerate Route Error:", error);
        return NextResponse.json({ success: false, error: error.message });
    }
}