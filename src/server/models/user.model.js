const mongoose = require("mongoose");
const { Schema, model } = mongoose;

const UserSchema = new Schema({
  user_name: { type: String, required: true, unique: true },
  wallet_address: { type: String, required: true, unique: true },
  referral_code: { type: String },
  referred_by: { type: Schema.Types.ObjectId, ref: "User" },
  current_lobby: { type: Schema.Types.ObjectId, ref: "Lobby", default: null },
  created_at: { type: Date, default: Date.now }
});

module.exports = model("User", UserSchema);
