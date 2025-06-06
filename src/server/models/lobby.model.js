const mongoose = require("mongoose");
const { Schema, model } = mongoose;

const LobbySchema = new Schema({
  name: { type: String, required: true, unique: true },
  token_symbol: { type: String, required: true },
  is_active: { type: Boolean, default: true },
  entry_fees: { type: Number, required: true },
  created_at: { type: Date, default: Date.now }
});

module.exports = model("Lobby", LobbySchema);
