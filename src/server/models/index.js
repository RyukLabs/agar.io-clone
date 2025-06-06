const User = require("./models/user.model");
const GameSession = require("./models/gameSession.model");
const PoolTransaction = require("./models/poolTransaction.model");
const Lobby = require("./models/lobby.model");
const Leaderboard = require("./models/leaderboard.model");
const LobbyQueue = require("./models/lobbyQueue.model");
const Chat = require("./models/chat.model");
const Referral = require("./models/referral.model");

module.exports = {
  User,
  GameSession,
  PoolTransaction,
  Lobby,
  Leaderboard,
  LobbyQueue,
  Chat,
  Referral
};
