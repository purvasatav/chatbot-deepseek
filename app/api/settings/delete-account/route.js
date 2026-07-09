import connectDB from "@/config/db";
import Chat from "@/models/Chat";
import UserSettings from "@/models/UserSettings";
import { getAuth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

export async function POST(req) {
    try {
        const { userId } = getAuth(req);
        if (!userId) {
            return NextResponse.json({ success: false, message: "User not authenticated" }, { status: 401 });
        }

        await connectDB();
        await Chat.deleteMany({ userId });
        await UserSettings.deleteMany({ userId });

        return NextResponse.json({ success: true, message: "All data deleted" });

    } catch (error) {
        console.error("Delete account error:", error);
        return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }
}