import mongoose from "mongoose";

const AttachmentSchema = new mongoose.Schema(
    {
        fileName: { type: String },
        fileData: { type: String },
        fileType: { type: String },
    },
    { _id: false }
);

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
                // Legacy single-file fields — kept so old messages still render.
                fileName: {type: String},
                fileData: {type: String},
                fileType: {type: String},
                // New: multiple attachments per message.
                attachments: [AttachmentSchema],
            },
        ],
        userId: {type: String, required: true},
    },
    {timestamps: true}
);

ChatSchema.index({ userId: 1, updatedAt: -1 });

const Chat = mongoose.models.Chat || mongoose.model("Chat", ChatSchema)

export default Chat;