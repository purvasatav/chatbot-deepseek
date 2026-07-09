import { Webhook } from "svix";
import connectDB from "@/config/db";
import User from "@/models/User";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

export async function POST(req) {
    const wh = new Webhook(process.env.SIGNING_SECRET);
    const headerPayload = await headers();
    const svixHeaders = {
        "svix-id": headerPayload.get("svix-id"),
        "svix-timestamp": headerPayload.get("svix-timestamp"),
        "svix-signature": headerPayload.get("svix-signature"),
    };

    const payload = await req.json();
    const body = JSON.stringify(payload);

    let evt;
    try {
        evt = wh.verify(body, svixHeaders);
    } catch (err) {
        console.error("Webhook signature verification failed:", err.message);
        return NextResponse.json({ message: "Webhook verification failed" }, { status: 400 });
    }

    const { data, type } = evt;

    await connectDB();

    try {
        switch (type) {
            case "user.created":
            case "user.updated": {
                // user.created / user.updated payloads include profile fields.
                const userData = {
                    _id: data.id,
                    email: data.email_addresses?.[0]?.email_address || "",
                    name: `${data.first_name || ""} ${data.last_name || ""}`.trim() || "User",
                    image: data.image_url || "",
                };
                if (type === "user.created") {
                    await User.create(userData);
                } else {
                    await User.findByIdAndUpdate(data.id, userData, { upsert: true });
                }
                break;
            }

            case "user.deleted":
                // user.deleted payloads only contain { id, deleted, object } - no profile fields.
                await User.findByIdAndDelete(data.id);
                break;

            default:
                break;
        }
    } catch (err) {
        console.error("Webhook DB update failed:", err.message);
        return NextResponse.json({ message: "Failed to process event" }, { status: 500 });
    }

    return NextResponse.json({ message: "Event received" });
}
