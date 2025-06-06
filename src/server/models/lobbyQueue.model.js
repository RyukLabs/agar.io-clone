const mongoose = require("mongoose");
const { Schema, model } = mongoose;

const LobbyQueueSchema = new Schema({
  lobby_id: { type: Schema.Types.ObjectId, ref: "Lobby", required: true },
  user_id: { type: Schema.Types.ObjectId, ref: "User", required: true },
  joined_at: { type: Date, default: Date.now }
});

module.exports = model("LobbyQueue", LobbyQueueSchema);
