import connectDB from "@/config/db";
import Chat from "@/models/Chat";
import { getAuth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

export async function GET(req){
    try {
        const { userId } = getAuth(req);

        if (!userId) {
            return NextResponse.json({
              success: false,
              message: "User not authenticated",
            });
          }

          // Connect to the database and fetch all chats for the user.
          // - .select("-messages.fileData") drops the heavy base64 file blobs
          //   from the payload; they aren't needed for the sidebar/list view.
          // - .lean() skips Mongoose document hydration, returning plain JS
          //   objects, which is significantly faster to serialize.
          await connectDB();
          const data = await Chat.find({ userId })
              .select("-messages.fileData")
              .sort({ updatedAt: -1 })
              .lean();

          return NextResponse.json({ success: true, data })
    } catch (error) {
        return NextResponse.json({ success: false, error: error.message});
    }
}