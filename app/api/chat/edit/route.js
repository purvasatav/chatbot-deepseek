export const maxDuration = 60;

import connectDB from "@/config/db";
import Chat from "@/models/Chat";
import { getAuth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

export async function POST(req){
    try {
        const {userId} = getAuth(req)
        const { chatId, messageIndex, newContent } = await req.json();
        if(!userId){
            return NextResponse.json({ success: false, message: "User not authenticated" });
        }
        await connectDB()
        const data = await Chat.findOne({userId, _id: chatId})
        if (!data) {
            return NextResponse.json({ success: false, message: "Chat not found" });
        }
        if (messageIndex == null || messageIndex < 0 || messageIndex >= data.messages.length) {
            return NextResponse.json({ success: false, message: "Invalid message index" });
        }
        if (data.messages[messageIndex].role !== "user") {
            return NextResponse.json({ success: false, message: "Can only edit your own messages" });
        }

        // Truncate everything from this message onward, then re-add the edited one
        data.messages = data.messages.slice(0, messageIndex);
        const editedUserMessage = {
            role: "user",
            content: newContent,
            timestamp: Date.now()
        };
        data.messages.push(editedUserMessage);

        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${process.env.GROQ_API_KEY}`
            },
            body: JSON.stringify({
                model: "llama-3.3-70b-versatile",
                messages: [{ role: "user", content: newContent }],
                max_tokens: 1024
            })
        });
        const result = await response.json();
        if(!result.choices || !result.choices[0]){
            return NextResponse.json({ success: false, message: result.error?.message || "API error" });
        }
        const assistantMessage = {
            role: "assistant",
            content: result.choices[0].message.content,
            timestamp: Date.now()
        };
        data.messages.push(assistantMessage);
        await data.save();
        return NextResponse.json({success: true, data: data.messages})
    } catch (error) {
        console.error("Edit Route Error:", error);
        return NextResponse.json({ success: false, error: error.message });
    }
}