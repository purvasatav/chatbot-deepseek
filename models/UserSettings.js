import mongoose from "mongoose";

const UserSettingsSchema = new mongoose.Schema({
    userId: { type: String, required: true, unique: true },
    customInstructions: { type: String, default: "" },
    tone: { type: String, default: "neutral" },
    responseLength: { type: String, default: "medium" },
    model: { type: String, default: "openai/gpt-oss-120b" },
    theme: { type: String, default: "dark" },
    accentColor: { type: String, default: "#2563eb" },
    voiceName: { type: String, default: "" },
    voiceRate: { type: Number, default: 1 },
    desktopNotifications: { type: Boolean, default: false },
}, { timestamps: true });

const UserSettings = mongoose.models.UserSettings || mongoose.model("UserSettings", UserSettingsSchema);

export default UserSettings;
