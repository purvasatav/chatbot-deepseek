import connectDB from "@/config/db";
import Chat from "@/models/Chat";
import { NextResponse } from "next/server";

export async function GET(req, { params }){
    try {
        const { shareId } = params;
        await connectDB();
        const chat = await Chat.findOne({ shareId, shared: true });
        if (!chat) {
            return NextResponse.json({ success: false, message: "This chat is not shared or no longer exists" });
        }
        return NextResponse.json({
            success: true,
            data: { name: chat.name, messages: chat.messages, createdAt: chat.createdAt }
        });
    } catch (error) {
        return NextResponse.json({ success: false, error: error.message });
    }
}
