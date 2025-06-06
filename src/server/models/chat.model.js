const mongoose = require("mongoose");
const { Schema, model } = mongoose;

const ChatSchema = new Schema({
  type: { type: String, enum: ["global", "lobby"], required: true },
  lobby_id: { type: Schema.Types.ObjectId, ref: "Lobby" },
  user_id: { type: Schema.Types.ObjectId, ref: "User", required: true },
  message: { type: String, required: true },
  created_at: { type: Date, default: Date.now }
});

module.exports = model("Chat", ChatSchema);
