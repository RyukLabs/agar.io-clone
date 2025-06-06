const mongoose = require("mongoose");
const { Schema, model } = mongoose;

const LeaderboardSchema = new Schema({
  user_id: { type: Schema.Types.ObjectId, ref: "User", required: true },
  score: { type: Number, required: true },
  recorded_at: { type: Date, default: Date.now }
});

module.exports = model("Leaderboard", LeaderboardSchema);
