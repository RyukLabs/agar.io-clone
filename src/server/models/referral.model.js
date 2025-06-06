const mongoose = require("mongoose");
const { Schema, model } = mongoose;

const ReferralSchema = new Schema({
  referrer_user_id: { type: Schema.Types.ObjectId, ref: "User", required: true },
  referred_user_id: { type: Schema.Types.ObjectId, ref: "User", required: true },
  referral_code: { type: String, required: true },
  status: { type: String, enum: ["pending", "completed", "cancelled"], default: "pending" },
  reward_given: { type: Boolean, default: false },
  reward_value: { type: Number, default: 0 },
  reward_currency: { type: String },
  created_at: { type: Date, default: Date.now }
});

module.exports = model("Referral", ReferralSchema);
