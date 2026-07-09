export const maxDuration = 60;

import connectDB from "@/config/db";
import Chat from "@/models/Chat";
import { getAuth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

export async function POST(req){
    try {
        const {userId} = getAuth(req)
        const { chatId, messageIndex } = await req.json();
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
        data.messages.splice(messageIndex, 1);
        await data.save();
        return NextResponse.json({success: true, data: data.messages})
    } catch (error) {
        console.error("Delete Message Route Error:", error);
        return NextResponse.json({ success: false, error: error.message });
    }
}