import connectDB from "@/config/db";
import UserSettings from "@/models/UserSettings";
import { getAuth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

export async function GET(req) {
    try {
        const { userId } = getAuth(req);
        if (!userId) {
            return NextResponse.json({ success: false, message: "User not authenticated" }, { status: 401 });
        }

        await connectDB();
        let settings = await UserSettings.findOne({ userId });

        if (!settings) {
            settings = await UserSettings.create({ userId });
        }

        return NextResponse.json({ success: true, data: settings });

    } catch (error) {
        console.error("Settings GET error:", error);
        return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }
}

export async function POST(req) {
    try {
        const { userId } = getAuth(req);
        if (!userId) {
            return NextResponse.json({ success: false, message: "User not authenticated" }, { status: 401 });
        }

        const { customInstructions, tone, responseLength, model, theme, accentColor, voiceName, voiceRate, desktopNotifications } = await req.json();

        const update = {};
        if (customInstructions !== undefined) update.customInstructions = customInstructions;
        if (tone !== undefined) update.tone = tone;
        if (responseLength !== undefined) update.responseLength = responseLength;
        if (model !== undefined) update.model = model;
        if (theme !== undefined) update.theme = theme;
        if (accentColor !== undefined) update.accentColor = accentColor;
        if (voiceName !== undefined) update.voiceName = voiceName;
        if (voiceRate !== undefined) update.voiceRate = voiceRate;
        if (desktopNotifications !== undefined) update.desktopNotifications = desktopNotifications;

        await connectDB();
        const settings = await UserSettings.findOneAndUpdate(
            { userId },
            update,
            { new: true, upsert: true }
        );

        return NextResponse.json({ success: true, data: settings, message: "Settings saved" });

    } catch (error) {
        console.error("Settings POST error:", error);
        return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }
}
