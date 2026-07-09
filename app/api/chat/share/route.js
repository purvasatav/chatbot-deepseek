import connectDB from "@/config/db";
import Chat from "@/models/Chat";
import { getAuth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import crypto from "crypto";

export async function POST(req) {
    try {
        const { userId } = getAuth(req);
        if (!userId) {
            return NextResponse.json({ success: false, message: "User not authenticated" });
        }

        const { chatId } = await req.json();
        if (!chatId) {
            return NextResponse.json({ success: false, message: "chatId is required" });
        }

        await connectDB();

        const chat = await Chat.findOne({ _id: chatId, userId });
        if (!chat) {
            return NextResponse.json({ success: false, message: "Chat not found" });
        }

        // Toggle sharing
        chat.shared = !chat.shared;

        if (chat.shared && !chat.shareId) {
            // only generate a new shareId if one doesn't already exist
            chat.shareId = crypto.randomBytes(12).toString("hex");
        }

        await chat.save();

        return NextResponse.json({
            success: true,
            shared: chat.shared,
            shareId: chat.shareId,
        });

    } catch (error) {
        return NextResponse.json({ success: false, message: error.message });
    }
}