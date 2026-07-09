import mongoose from "mongoose";

const ChatSchema = new mongoose.Schema(
    {
        name: {type: String, required: true},
        pinned: {type: Boolean, default: false},
        archived: {type: Boolean, default: false},
        project: {type: String, default: ""},
        shared: {type: Boolean, default: false},
        shareId: {type: String, default: null},
        messages: [
            {
                role: {type: String, required: true},
                content: {type: String, required: true},
                timestamp: {type: Number, required: true},
                fileName: {type: String},
                fileData: {type: String},
                fileType: {type: String},
            },
        ],
        userId: {type: String, required: true},
    },
    {timestamps: true}
);

// userId is queried on every /api/chat/get call (and that route is hit
// constantly - every pin/delete/share/title-poll). Without this index,
// Mongo does a full collection scan each time.
ChatSchema.index({ userId: 1, updatedAt: -1 });

const Chat = mongoose.models.Chat || mongoose.model("Chat", ChatSchema)

export default Chat;