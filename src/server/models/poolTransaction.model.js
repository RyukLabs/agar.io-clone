const mongoose = require("mongoose");
const { Schema, model } = mongoose;

const PoolTransactionSchema = new Schema({
  user_id: { type: Schema.Types.ObjectId, ref: "User", required: true },
  lobby_id: { type: Schema.Types.ObjectId, ref: "Lobby", required: true },
  tx_hash: { type: String, required: true, unique: true },
  direction: { type: String, enum: ["IN", "OUT"], required: true },
  amount: { type: String, required: true },
  purpose: { type: String, required: true },
  created_at: { type: Date, default: Date.now }
});

module.exports = model("PoolTransaction", PoolTransactionSchema);
