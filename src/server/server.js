/*jslint bitwise: true, node: true */
'use strict';

const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const SAT = require('sat');

const gameLogic = require('./game-logic');
const loggingRepositry = require('./repositories/logging-repository');
const chatRepository = require('./repositories/chat-repository');
const config = require('../../config');
const util = require('./lib/util');
const mapUtils = require('./map/map');
const {getPosition} = require("./lib/entityUtils");

let map = new mapUtils.Map(config);
// Initialize spatial partitioning with game bounds for optimal performance
map.players.setGameBounds(config.gameWidth, config.gameHeight);

let sockets = {};
let spectators = [];
const INIT_MASS_LOG = util.mathLog(config.defaultPlayerMass, config.slowBase);

let leaderboard = [];
let leaderboardChanged = false;

const Vector = SAT.Vector;

app.use(express.static(__dirname + '/../client'));

io.on('connection', function (socket) {
    let type = socket.handshake.query.type;
    console.log('User has connected: ', type);
    switch (type) {
        case 'player':
            addPlayer(socket);
            break;
        case 'spectator':
            addSpectator(socket);
            break;
        default:
            console.log('Unknown user type, not doing anything.');
    }
});

function generateSpawnpoint() {
    let radius = util.massToRadius(config.defaultPlayerMass);
    return getPosition(config.newPlayerInitialPosition === 'farthest', radius, map.players.data)
}


const addPlayer = (socket) => {
    var currentPlayer = new mapUtils.playerUtils.Player(socket.id);

    socket.on('gotit', function (clientPlayerData) {
        console.log('[INFO] Player ' + clientPlayerData.name + ' connecting!');
        currentPlayer.init(generateSpawnpoint(), config.defaultPlayerMass);

        if (map.players.findIndexByID(socket.id) > -1) {
            console.log('[INFO] Player ID is already connected, kicking.');
            socket.disconnect();
        } else if (!util.validNick(clientPlayerData.name)) {
            socket.emit('kick', 'Invalid username.');
            socket.disconnect();
        } else {
            console.log('[INFO] Player ' + clientPlayerData.name + ' connected!');
            sockets[socket.id] = socket;

            const sanitizedName = clientPlayerData.name.replace(/(<([^>]+)>)/ig, '');
            clientPlayerData.name = sanitizedName;

            currentPlayer.clientProvidedData(clientPlayerData);
            map.players.pushNew(currentPlayer);
            io.emit('playerJoin', { name: currentPlayer.name });
            console.log('Total players: ' + map.players.data.length);
        }

    });

    socket.on('pingcheck', () => {
        socket.emit('pongcheck');
    });

    socket.on('windowResized', (data) => {
        currentPlayer.screenWidth = data.screenWidth;
        currentPlayer.screenHeight = data.screenHeight;
    });

    socket.on('respawn', () => {
        map.players.removePlayerByID(currentPlayer.id);
        socket.emit('welcome', currentPlayer, {
            width: config.gameWidth,
            height: config.gameHeight
        });
        console.log('[INFO] User ' + currentPlayer.name + ' has respawned');
    });

    socket.on('disconnect', () => {
        map.players.removePlayerByID(currentPlayer.id);
        console.log('[INFO] User ' + currentPlayer.name + ' has disconnected');
        socket.broadcast.emit('playerDisconnect', { name: currentPlayer.name });
    });

    socket.on('playerChat', (data) => {
        var _sender = data.sender.replace(/(<([^>]+)>)/ig, '');
        var _message = data.message.replace(/(<([^>]+)>)/ig, '');

        if (config.logChat === 1) {
            console.log('[CHAT] [' + (new Date()).getHours() + ':' + (new Date()).getMinutes() + '] ' + _sender + ': ' + _message);
        }

        socket.broadcast.emit('serverSendPlayerChat', {
            sender: currentPlayer.name,
            message: _message.substring(0, 35)
        });

        chatRepository.logChatMessage(_sender, _message, currentPlayer.ipAddress)
            .catch((err) => console.error("Error when attempting to log chat message", err));
    });

    socket.on('pass', async (data) => {
        const password = data[0];
        if (password === config.adminPass) {
            console.log('[ADMIN] ' + currentPlayer.name + ' just logged in as an admin.');
            socket.emit('serverMSG', 'Welcome back ' + currentPlayer.name);
            socket.broadcast.emit('serverMSG', currentPlayer.name + ' just logged in as an admin.');
            currentPlayer.admin = true;
        } else {
            console.log('[ADMIN] ' + currentPlayer.name + ' attempted to log in with the incorrect password: ' + password);

            socket.emit('serverMSG', 'Password incorrect, attempt logged.');

            loggingRepositry.logFailedLoginAttempt(currentPlayer.name, currentPlayer.ipAddress)
                .catch((err) => console.error("Error when attempting to log failed login attempt", err));
        }
    });

    socket.on('kick', (data) => {
        if (!currentPlayer.admin) {
            socket.emit('serverMSG', 'You are not permitted to use this command.');
            return;
        }

        var reason = '';
        var worked = false;
        for (let playerIndex in map.players.data) {
            let player = map.players.data[playerIndex];
            if (player.name === data[0] && !player.admin && !worked) {
                if (data.length > 1) {
                    for (var f = 1; f < data.length; f++) {
                        if (f === data.length) {
                            reason = reason + data[f];
                        }
                        else {
                            reason = reason + data[f] + ' ';
                        }
                    }
                }
                if (reason !== '') {
                    console.log('[ADMIN] User ' + player.name + ' kicked successfully by ' + currentPlayer.name + ' for reason ' + reason);
                }
                else {
                    console.log('[ADMIN] User ' + player.name + ' kicked successfully by ' + currentPlayer.name);
                }
                socket.emit('serverMSG', 'User ' + player.name + ' was kicked by ' + currentPlayer.name);
                sockets[player.id].emit('kick', reason);
                sockets[player.id].disconnect();
                map.players.removePlayerByIndex(playerIndex);
                worked = true;
            }
        }
        if (!worked) {
            socket.emit('serverMSG', 'Could not locate user or user is an admin.');
        }
    });

    // Heartbeat function, update everytime.
    socket.on('0', (target) => {
        currentPlayer.lastHeartbeat = new Date().getTime();
        if (target.x !== currentPlayer.x || target.y !== currentPlayer.y) {
            currentPlayer.target = target;
        }
    });

    socket.on('1', function () {
        // Fire food.
        const minCellMass = config.defaultPlayerMass + config.fireFood;
        for (let i = 0; i < currentPlayer.cells.length; i++) {
            if (currentPlayer.cells[i].mass >= minCellMass) {
                currentPlayer.changeCellMass(i, -config.fireFood);
                map.massFood.addNew(currentPlayer, i, config.fireFood);
            }
        }
    });

    socket.on('2', () => {
        currentPlayer.userSplit(config.limitSplit, config.defaultPlayerMass);
    });
}

const addSpectator = (socket) => {
    socket.on('gotit', function () {
        sockets[socket.id] = socket;
        spectators.push(socket.id);
        io.emit('playerJoin', { name: '' });
    });

    socket.emit("welcome", {}, {
        width: config.gameWidth,
        height: config.gameHeight
    });
}

    const tickPlayer = (currentPlayer) => {
    if (currentPlayer.lastHeartbeat < new Date().getTime() - config.maxHeartbeatInterval) {
        sockets[currentPlayer.id].emit('kick', 'Last heartbeat received over ' + config.maxHeartbeatInterval + ' ago.');
        sockets[currentPlayer.id].disconnect();
    }

    currentPlayer.move(config.slowBase, config.gameWidth, config.gameHeight, INIT_MASS_LOG);

    // PERFORMANCE FIX: Use spatial partitioning for entity collision instead of O(n×m) loops
    const boundary = new (require('./lib/quadtree')).Rectangle(config.gameWidth / 2, config.gameHeight / 2, config.gameWidth / 2, config.gameHeight / 2);
    const entityQuadTree = new (require('./lib/quadtree')).QuadTree(boundary, 10, 5);
    
    // Insert all entities into spatial partitioning ONCE
    map.food.data.forEach((food, index) => {
        if (food) entityQuadTree.insert(new (require('./lib/quadtree')).Point(food.x, food.y, { type: 'food', index, entity: food }));
    });
    map.massFood.data.forEach((mass, index) => {
        if (mass) entityQuadTree.insert(new (require('./lib/quadtree')).Point(mass.x, mass.y, { type: 'massFood', index, entity: mass }));
    });
    map.viruses.data.forEach((virus, index) => {
        if (virus) entityQuadTree.insert(new (require('./lib/quadtree')).Point(virus.x, virus.y, { type: 'virus', index, entity: virus }));
    });

    const isEntityInsideCircle = (point, circle) => {
        return SAT.pointInCircle(new Vector(point.x, point.y), circle);
    };

    const canEatMass = (cell, cellCircle, cellIndex, mass) => {
        if (isEntityInsideCircle(mass, cellCircle)) {
            if (mass.id === currentPlayer.id && mass.speed > 0 && cellIndex === mass.num)
                return false;
            if (cell.mass > mass.mass * 1.1)
                return true;
        }
        return false;
    };

    const canEatVirus = (cell, cellCircle, virus) => {
        return virus.mass < cell.mass && isEntityInsideCircle(virus, cellCircle)
    }

    const cellsToSplit = [];
    const eatenFoodIndexes = [];
    const eatenMassIndexes = [];
    const eatenVirusIndexes = [];

    for (let cellIndex = 0; cellIndex < currentPlayer.cells.length; cellIndex++) {
        const currentCell = currentPlayer.cells[cellIndex];
        const cellCircle = currentCell.toCircle();
        
        // HIGH-PERFORMANCE: Query only nearby entities using spatial partitioning
        const searchRadius = currentCell.radius + 20; // Collision detection radius
        const nearbyEntities = entityQuadTree.queryCircle(currentCell, searchRadius);
        
        let massGained = 0;
        
        for (let nearbyPoint of nearbyEntities) {
            const { type, index, entity } = nearbyPoint.userData;
            
            switch (type) {
                case 'food':
                    if (isEntityInsideCircle(entity, cellCircle)) {
                        eatenFoodIndexes.push(index);
                        massGained += config.foodMass;
                    }
                    break;
                    
                case 'massFood':
                    if (canEatMass(currentCell, cellCircle, cellIndex, entity)) {
                        eatenMassIndexes.push(index);
                        massGained += entity.mass;
                    }
                    break;
                    
                case 'virus':
                    if (canEatVirus(currentCell, cellCircle, entity)) {
                        eatenVirusIndexes.push(index);
                        cellsToSplit.push(cellIndex);
                    }
                    break;
            }
        }
        
        currentPlayer.changeCellMass(cellIndex, massGained);
    }
    
    // Batch entity removals
    if (eatenFoodIndexes.length > 0) map.food.delete(eatenFoodIndexes);
    if (eatenMassIndexes.length > 0) map.massFood.remove(eatenMassIndexes);
    if (eatenVirusIndexes.length > 0) map.viruses.delete(eatenVirusIndexes);
    
    currentPlayer.virusSplit(cellsToSplit, config.limitSplit, config.defaultPlayerMass);
};

const tickGame = () => {
    map.players.data.forEach(tickPlayer);
    map.massFood.move(config.gameWidth, config.gameHeight);

    map.players.handleCollisions(function (gotEaten, eater) {
        const cellGotEaten = map.players.getCell(gotEaten.playerIndex, gotEaten.cellIndex);

        map.players.data[eater.playerIndex].changeCellMass(eater.cellIndex, cellGotEaten.mass);

        const playerDied = map.players.removeCell(gotEaten.playerIndex, gotEaten.cellIndex);
        if (playerDied) {
            let playerGotEaten = map.players.data[gotEaten.playerIndex];
            io.emit('playerDied', { name: playerGotEaten.name }); //TODO: on client it is `playerEatenName` instead of `name`
            sockets[playerGotEaten.id].emit('RIP');
            map.players.removePlayerByIndex(gotEaten.playerIndex);
        }
    });

};

const calculateLeaderboard = () => {
    const topPlayers = map.players.getTopPlayers();

    if (leaderboard.length !== topPlayers.length) {
        leaderboard = topPlayers;
        leaderboardChanged = true;
    } else {
        for (let i = 0; i < leaderboard.length; i++) {
            if (leaderboard[i].id !== topPlayers[i].id) {
                leaderboard = topPlayers;
                leaderboardChanged = true;
                break;
            }
        }
    }
}

const gameloop = () => {
    if (map.players.data.length > 0) {
        calculateLeaderboard();
        map.players.shrinkCells(config.massLossRate, config.defaultPlayerMass, config.minMassLoss);
    }

    map.balanceMass(config.foodMass, config.gameMass, config.maxFood, config.maxVirus);
};

// HIGH-PERFORMANCE: Batch network updates to prevent event loop lag
let updateBatch = [];
let batchTimeout = null;

const sendUpdates = () => {
    spectators.forEach(updateSpectator);
    
    // Collect all updates into a batch
    map.enumerateWhatPlayersSee(function (playerData, visiblePlayers, visibleFood, visibleMass, visibleViruses) {
        updateBatch.push({
            socketId: playerData.id,
            data: [playerData, visiblePlayers, visibleFood, visibleMass, visibleViruses],
            needsLeaderboard: leaderboardChanged
        });
    });

    // Process batch with setImmediate to prevent event loop blocking
    if (!batchTimeout) {
        batchTimeout = setImmediate(() => {
            processBatchedUpdates();
            batchTimeout = null;
        });
    }

    leaderboardChanged = false;
};

const processBatchedUpdates = () => {
    const BATCH_SIZE = 10; // Process in chunks to prevent lag
    let processed = 0;
    
    const processBatch = () => {
        const endIndex = Math.min(processed + BATCH_SIZE, updateBatch.length);
        
        for (let i = processed; i < endIndex; i++) {
            const update = updateBatch[i];
            const socket = sockets[update.socketId];
            
            if (socket && socket.connected) {
                socket.emit('serverTellPlayerMove', ...update.data);
                if (update.needsLeaderboard) {
                    sendLeaderboard(socket);
                }
            }
        }
        
        processed = endIndex;
        
        if (processed < updateBatch.length) {
            // Use setImmediate to yield control back to event loop
            setImmediate(processBatch);
        } else {
            // Batch complete, reset for next frame
            updateBatch = [];
        }
    };
    
    processBatch();
};

const sendLeaderboard = (socket) => {
    socket.emit('leaderboard', {
        players: map.players.data.length,
        leaderboard
    });
}
const updateSpectator = (socketID) => {
    let playerData = {
        x: config.gameWidth / 2,
        y: config.gameHeight / 2,
        cells: [],
        massTotal: 0,
        hue: 100,
        id: socketID,
        name: ''
    };
    sockets[socketID].emit('serverTellPlayerMove', playerData, map.players.data, map.food.data, map.massFood.data, map.viruses.data);
    if (leaderboardChanged) {
        sendLeaderboard(sockets[socketID]);
    }
}

setInterval(tickGame, 1000 / 60);
setInterval(gameloop, 1000);
setInterval(sendUpdates, 1000 / config.networkUpdateFactor);

// Don't touch, IP configurations.
var ipaddress = process.env.OPENSHIFT_NODEJS_IP || process.env.IP || config.host;
var serverport = process.env.OPENSHIFT_NODEJS_PORT || process.env.PORT || config.port;
http.listen(serverport, ipaddress, () => console.log('[DEBUG] Listening on ' + ipaddress + ':' + serverport));
