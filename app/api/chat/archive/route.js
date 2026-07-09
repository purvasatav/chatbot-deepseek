import connectDB from "@/config/db";
import Chat from "@/models/Chat";
import { getAuth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

export async function POST(req){
    try {
        const { userId } = getAuth(req);
        if (!userId) {
            return NextResponse.json({ success: false, message: "User not authenticated" });
        }
        const { chatId } = await req.json();
        await connectDB();
        const chat = await Chat.findOne({ _id: chatId, userId });
        if (!chat) return NextResponse.json({ success: false, message: "Chat not found" });
        chat.archived = !chat.archived;
        await chat.save();
        return NextResponse.json({ success: true, message: chat.archived ? "Chat archived" : "Chat unarchived", archived: chat.archived });
    } catch (error) {
        return NextResponse.json({ success: false, error: error.message });
    }
}