const mongoose = require("mongoose");
const { Schema, model } = mongoose;

const GameSessionSchema = new Schema({
  user_id: { type: Schema.Types.ObjectId, ref: "User", required: true },
  lobby_id: { type: Schema.Types.ObjectId, ref: "Lobby", required: true },
  tx_hash: { type: String, required: true, unique: true },
  tx_status: { type: String, enum: ["Pending", "Completed", "Failed"], default: "Pending" },
  joined_at: { type: Date, required: true, default: Date.now },
  exited_at: { type: Date },
  disconnected_at: { type: Date },
  mass_gained: { type: Number, default: 0 },
  rewards: { type: Number, default: 0 },
  rewarded: { type: Boolean, default: false }
});

module.exports = model("GameSession", GameSessionSchema);
