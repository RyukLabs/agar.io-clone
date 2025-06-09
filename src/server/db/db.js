const mongoose = require("mongoose");

require("dotenv").config();

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/agario_game";

const connectDB = async () => {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("MongoDB connected successfully!");
  } catch (error) {
    console.error("Error connecting to MongoDB:", error.message);
    process.exit(1); 
  }
};

module.exports = connectDB;
