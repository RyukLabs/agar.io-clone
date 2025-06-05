var io = require('socket.io-client');
var render = require('./render');
var ChatClient = require('./chat-client');
var Canvas = require('./canvas');
var global = require('./global');

var playerNameInput = document.getElementById('playerNameInput');
var socket;

var debug = function (args) {
    if (console && console.log) {
        console.log(args);
    }
};

if (/Android|webOS|iPhone|iPad|iPod|BlackBerry/i.test(navigator.userAgent)) {
    global.mobile = true;
}

function startGame(type) {
    global.playerName = playerNameInput.value.replace(/(<([^>]+)>)/ig, '').substring(0, 25);
    global.playerType = type;

    global.screen.width = window.innerWidth;
    global.screen.height = window.innerHeight;

    document.getElementById('startMenuWrapper').style.maxHeight = '0px';
    document.getElementById('gameAreaWrapper').style.opacity = 1;
    if (!socket) {
        socket = io({ query: "type=" + type });
        setupSocket(socket);
    }
    if (!global.animLoopHandle)
        animloop();
    socket.emit('respawn');
    window.chat.socket = socket;
    window.chat.registerFunctions();
    window.canvas.socket = socket;
    global.socket = socket;
}

// Checks if the nick chosen contains valid alphanumeric characters (and underscores).
function validNick() {
    var regex = /^\w*$/;
    debug('Regex Test', regex.exec(playerNameInput.value));
    return regex.exec(playerNameInput.value) !== null;
}

window.onload = function () {

    var btn = document.getElementById('startButton'),
        btnS = document.getElementById('spectateButton'),
        nickErrorText = document.querySelector('#startMenu .input-error');

    btnS.onclick = function () {
        startGame('spectator');
    };

    btn.onclick = function () {

        // Checks if the nick is valid.
        if (validNick()) {
            nickErrorText.style.opacity = 0;
            startGame('player');
        } else {
            nickErrorText.style.opacity = 1;
        }
    };

    var settingsMenu = document.getElementById('settingsButton');
    var settings = document.getElementById('settings');

    settingsMenu.onclick = function () {
        if (settings.style.maxHeight == '300px') {
            settings.style.maxHeight = '0px';
        } else {
            settings.style.maxHeight = '300px';
        }
    };

    playerNameInput.addEventListener('keypress', function (e) {
        var key = e.which || e.keyCode;

        if (key === global.KEY_ENTER) {
            if (validNick()) {
                nickErrorText.style.opacity = 0;
                startGame('player');
            } else {
                nickErrorText.style.opacity = 1;
            }
        }
    });
};

// TODO: Break out into GameControls.

var playerConfig = {
    border: 6,
    textColor: '#FFFFFF',
    textBorder: '#000000',
    textBorderSize: 3,
    defaultSize: 30
};

var player = {
    id: -1,
    x: global.screen.width / 2,
    y: global.screen.height / 2,
    screenWidth: global.screen.width,
    screenHeight: global.screen.height,
    target: { x: global.screen.width / 2, y: global.screen.height / 2 }
};
global.player = player;

// Spectator zoom functionality
var spectatorZoom = {
    scale: 1.0,
    minScale: 0.1,  // 10x zoom out to see whole map
    maxScale: 2.0,  // 2x zoom in
    x: 0,           // Camera position
    y: 0,
    mapWidth: 5000, // Will be set from server
    mapHeight: 5000 // Will be set from server
};
global.spectatorZoom = spectatorZoom;

var foods = [];
var viruses = [];
var fireFood = [];
var users = [];
var leaderboard = [];
var portals = [];
global.portals = portals;
var target = { x: player.x, y: player.y };
global.target = target;

window.canvas = new Canvas();
window.chat = new ChatClient();

var visibleBorderSetting = document.getElementById('visBord');
visibleBorderSetting.onchange = settings.toggleBorder;

var showMassSetting = document.getElementById('showMass');
showMassSetting.onchange = settings.toggleMass;

var continuitySetting = document.getElementById('continuity');
continuitySetting.onchange = settings.toggleContinuity;

var roundFoodSetting = document.getElementById('roundFood');
roundFoodSetting.onchange = settings.toggleRoundFood;

var c = window.canvas.cv;
var graph = c.getContext('2d');

$("#feed").click(function () {
    socket.emit('1');
    window.canvas.reenviar = false;
});

$("#split").click(function () {
    socket.emit('2');
    window.canvas.reenviar = false;
});

function handleDisconnect() {
    socket.close();
    if (!global.kicked) { // We have a more specific error message 
        render.drawErrorMessage('Disconnected!', graph, global.screen);
    }
}

// socket stuff.
function setupSocket(socket) {
    // Handle ping.
    socket.on('pongcheck', function () {
        var latency = Date.now() - global.startPingTime;
        debug('Latency: ' + latency + 'ms');
        window.chat.addSystemLine('Ping: ' + latency + 'ms');
    });

    // Handle error.
    socket.on('connect_error', handleDisconnect);
    socket.on('disconnect', handleDisconnect);

    // Handle connection.
    socket.on('welcome', function (playerSettings, gameSizes) {
        player = playerSettings;
        player.name = global.playerName;
        player.screenWidth = global.screen.width;
        player.screenHeight = global.screen.height;
        player.target = window.canvas.target;
        global.player = player;
        window.chat.player = player;
        socket.emit('gotit', player);
        global.gameStart = true;
        window.chat.addSystemLine('Connected to the game!');
        window.chat.addSystemLine('Type <b>-help</b> for a list of commands.');
        if (global.mobile) {
            document.getElementById('gameAreaWrapper').removeChild(document.getElementById('chatbox'));
        }
        c.focus();
        global.game.width = gameSizes.width;
        global.game.height = gameSizes.height;
        
        // Set spectator zoom map dimensions
        spectatorZoom.mapWidth = gameSizes.width;
        spectatorZoom.mapHeight = gameSizes.height;
        
        // For spectators, center the camera on the map
        if (global.playerType === 'spectator') {
            // Position camera at map center
            spectatorZoom.x = gameSizes.width / 2;  // 2500 for a 5000x5000 map
            spectatorZoom.y = gameSizes.height / 2; // 2500 for a 5000x5000 map
            
            // Set initial zoom to fit the full map with padding
            const mapToScreenRatioX = global.screen.width / gameSizes.width;
            const mapToScreenRatioY = global.screen.height / gameSizes.height;
            spectatorZoom.scale = Math.min(mapToScreenRatioX, mapToScreenRatioY) * 0.9; // 90% to fit map with padding
            

        }
        
        resize();
    });

    // Simple zoom for spectators
    c.addEventListener('wheel', function(e) {
        if (global.playerType === 'spectator') {
            e.preventDefault();
            const zoomFactor = 1.1;
            
            if (e.deltaY < 0) {
                spectatorZoom.scale = Math.min(spectatorZoom.scale * zoomFactor, spectatorZoom.maxScale);
            } else {
                spectatorZoom.scale = Math.max(spectatorZoom.scale / zoomFactor, spectatorZoom.minScale);
            }
        }
    });

    // Simple drag for spectators
    let isDragging = false;
    let lastMouseX = 0;
    let lastMouseY = 0;
    
    c.addEventListener('mousedown', function(e) {
        if (global.playerType === 'spectator') {
            isDragging = true;
            lastMouseX = e.clientX;
            lastMouseY = e.clientY;
        }
    });
    
    c.addEventListener('mousemove', function(e) {
        if (global.playerType === 'spectator' && isDragging) {
            const deltaX = e.clientX - lastMouseX;
            const deltaY = e.clientY - lastMouseY;
            
            // Scale the drag movement according to zoom level
            spectatorZoom.x -= deltaX / spectatorZoom.scale;
            spectatorZoom.y -= deltaY / spectatorZoom.scale;
            
            lastMouseX = e.clientX;
            lastMouseY = e.clientY;
        }
    });
    
    c.addEventListener('mouseup', function(e) {
        if (global.playerType === 'spectator') {
            isDragging = false;
        }
    });

    socket.on('playerDied', (data) => {
        const player = isUnnamedCell(data.playerEatenName) ? 'An unnamed cell' : data.playerEatenName;
        //const killer = isUnnamedCell(data.playerWhoAtePlayerName) ? 'An unnamed cell' : data.playerWhoAtePlayerName;

        //window.chat.addSystemLine('{GAME} - <b>' + (player) + '</b> was eaten by <b>' + (killer) + '</b>');
        window.chat.addSystemLine('{GAME} - <b>' + (player) + '</b> was eaten');
    });

    socket.on('playerDisconnect', (data) => {
        window.chat.addSystemLine('{GAME} - <b>' + (isUnnamedCell(data.name) ? 'An unnamed cell' : data.name) + '</b> disconnected.');
    });

    socket.on('playerJoin', (data) => {
        window.chat.addSystemLine('{GAME} - <b>' + (isUnnamedCell(data.name) ? 'An unnamed cell' : data.name) + '</b> joined.');
    });

    socket.on('leaderboard', (data) => {
        leaderboard = data.leaderboard;
        var status = '<span class="title">Leaderboard</span>';
        for (var i = 0; i < leaderboard.length; i++) {
            status += '<br />';
            if (leaderboard[i].id == player.id) {
                if (leaderboard[i].name.length !== 0)
                    status += '<span class="me">' + (i + 1) + '. ' + leaderboard[i].name + "</span>";
                else
                    status += '<span class="me">' + (i + 1) + ". An unnamed cell</span>";
            } else {
                if (leaderboard[i].name.length !== 0)
                    status += (i + 1) + '. ' + leaderboard[i].name;
                else
                    status += (i + 1) + '. An unnamed cell';
            }
        }
        //status += '<br />Players: ' + data.players;
        document.getElementById('status').innerHTML = status;
    });

    socket.on('serverMSG', function (data) {
        window.chat.addSystemLine(data);
    });

    // Chat.
    socket.on('serverSendPlayerChat', function (data) {
        window.chat.addChatLine(data.sender, data.message, false);
    });

    // Handle movement.
    socket.on('serverTellPlayerMove', function (playerData, userData, foodsList, massList, virusList, portalsList) {
        if (global.playerType == 'player') {
            player.x = playerData.x;
            player.y = playerData.y;
            player.hue = playerData.hue;
            player.massTotal = playerData.massTotal;
            player.cells = playerData.cells;
        }
        users = userData;
        foods = foodsList;
        viruses = virusList;
        fireFood = massList;
        portals = portalsList || []; // Default to empty array if undefined
        

    });

    // Death.
    socket.on('RIP', function () {
        global.gameStart = false;
        render.drawErrorMessage('You died!', graph, global.screen);
        window.setTimeout(() => {
            document.getElementById('gameAreaWrapper').style.opacity = 0;
            document.getElementById('startMenuWrapper').style.maxHeight = '1000px';
            if (global.animLoopHandle) {
                window.cancelAnimationFrame(global.animLoopHandle);
                global.animLoopHandle = undefined;
            }
        }, 2500);
    });

    socket.on('kick', function (reason) {
        global.gameStart = false;
        global.kicked = true;
        if (reason !== '') {
            render.drawErrorMessage('You were kicked for: ' + reason, graph, global.screen);
        }
        else {
            render.drawErrorMessage('You were kicked!', graph, global.screen);
        }
        socket.close();
    });
}

const isUnnamedCell = (name) => name.length < 1;

// Utility function to check if entity is in viewport
function isInViewport(entity, player, screen) {
    const viewportMargin = 100; // Buffer to prevent popping
    const entityViewX = entity.x - player.x + screen.width / 2;
    const entityViewY = entity.y - player.y + screen.height / 2;
    
    return entityViewX > -viewportMargin && 
           entityViewX < screen.width + viewportMargin &&
           entityViewY > -viewportMargin && 
           entityViewY < screen.height + viewportMargin;
}

function getPosition(entity, player, screen) {
    return {
        x: entity.x - player.x + screen.width / 2,
        y: entity.y - player.y + screen.height / 2
    };
}

window.requestAnimFrame = (function () {
    return window.requestAnimationFrame ||
        window.webkitRequestAnimationFrame ||
        window.mozRequestAnimationFrame ||
        window.msRequestAnimationFrame ||
        function (callback) {
            window.setTimeout(callback, 1000 / 60);
        };
})();

window.cancelAnimFrame = (function (handle) {
    return window.cancelAnimationFrame ||
        window.mozCancelAnimationFrame;
})();

function animloop() {
    global.animLoopHandle = window.requestAnimFrame(animloop);
    gameLoop();
}

function gameLoop() {
    if (global.gameStart) {
        graph.fillStyle = global.backgroundColor;
        graph.fillRect(0, 0, global.screen.width, global.screen.height);

        // Set up spectator rendering
        if (global.playerType === 'spectator') {
            graph.save();
            
            // Center the map in the screen - use actual canvas dimensions
            const actualScreenCenterX = c.width / 2;
            const actualScreenCenterY = c.height / 2;
            const offsetX = actualScreenCenterX - spectatorZoom.x * spectatorZoom.scale;
            const offsetY = actualScreenCenterY - spectatorZoom.y * spectatorZoom.scale;
            
            graph.translate(offsetX, offsetY);
            graph.scale(spectatorZoom.scale, spectatorZoom.scale);
            
            // Skip grid for spectators - it creates unwanted visual noise

            // Show all entities at their world coordinates (with bounds checking)
            foods.forEach(food => {
                // Only render food within map bounds
                if (food.x >= 0 && food.x <= spectatorZoom.mapWidth && 
                    food.y >= 0 && food.y <= spectatorZoom.mapHeight) {
                    render.drawFood({x: food.x, y: food.y}, food, graph);
                }
            });

            fireFood.forEach(fireFood => {
                if (fireFood.x >= 0 && fireFood.x <= spectatorZoom.mapWidth && 
                    fireFood.y >= 0 && fireFood.y <= spectatorZoom.mapHeight) {
                    render.drawFireFood({x: fireFood.x, y: fireFood.y}, fireFood, playerConfig, graph);
                }
            });

            viruses.forEach(virus => {
                if (virus.x >= 0 && virus.x <= spectatorZoom.mapWidth && 
                    virus.y >= 0 && virus.y <= spectatorZoom.mapHeight) {
                    render.drawVirus({x: virus.x, y: virus.y}, virus, graph);
                }
            });

            portals.forEach(portal => {
                if (portal.x >= 0 && portal.x <= spectatorZoom.mapWidth && 
                    portal.y >= 0 && portal.y <= spectatorZoom.mapHeight) {
                    render.drawPortal({x: portal.x, y: portal.y}, portal, graph);
                }
            });

            // Draw map borders
            graph.strokeStyle = '#ffffff';
            graph.lineWidth = 10;
            graph.beginPath();
            graph.rect(0, 0, spectatorZoom.mapWidth, spectatorZoom.mapHeight);
            graph.stroke();

            // Draw player cells
            var cellsToDraw = [];
            for (var i = 0; i < users.length; i++) {
                let color = 'hsl(' + users[i].hue + ', 100%, 50%)';
                let borderColor = 'hsl(' + users[i].hue + ', 100%, 45%)';
                for (var j = 0; j < users[i].cells.length; j++) {
                    cellsToDraw.push({
                        color: color,
                        borderColor: borderColor,
                        mass: users[i].cells[j].mass,
                        name: users[i].name,
                        radius: users[i].cells[j].radius,
                        x: users[i].cells[j].x,
                        y: users[i].cells[j].y,
                        isPrimary: users[i].cells[j].isPrimary
                    });
                }
            }

            cellsToDraw.sort(function (obj1, obj2) {
                return obj1.mass - obj2.mass;
            });

            render.drawCells(cellsToDraw, playerConfig, global.toggleMassState, {}, graph);
            
            graph.restore();
            
            // Draw zoom UI on top of the transformed view
            render.drawSpectatorUI(spectatorZoom, portals, graph);
            
        } else {
            // Regular player view
            render.drawGrid(global, player, global.screen, graph);

            // Apply viewport culling
            const visibleFood = foods.filter(food => isInViewport(food, player, global.screen));
            const visibleFireFood = fireFood.filter(food => isInViewport(food, player, global.screen));
            const visibleViruses = viruses.filter(virus => isInViewport(virus, player, global.screen));
            const visiblePortals = portals; // Temporarily disable viewport culling for portals
            const visibleUsers = users.filter(user => isInViewport(user, player, global.screen));



            // Render only visible entities
            visibleFood.forEach(food => {
                let position = getPosition(food, player, global.screen);
                render.drawFood(position, food, graph);
            });

            visibleFireFood.forEach(fireFood => {
                let position = getPosition(fireFood, player, global.screen);
                render.drawFireFood(position, fireFood, playerConfig, graph);
            });

            visibleViruses.forEach(virus => {
                let position = getPosition(virus, player, global.screen);
                render.drawVirus(position, virus, graph);
            });

            visiblePortals.forEach(portal => {
                let position = getPosition(portal, player, global.screen);
                render.drawPortal(position, portal, graph);
            });

            let borders = {
                left: global.screen.width / 2 - player.x,
                right: global.screen.width / 2 + global.game.width - player.x,
                top: global.screen.height / 2 - player.y,
                bottom: global.screen.height / 2 + global.game.height - player.y
            }

            if (global.borderDraw) {
                render.drawBorder(borders, graph);
            }

            var cellsToDraw = [];
            for (var i = 0; i < visibleUsers.length; i++) {
                let color = 'hsl(' + visibleUsers[i].hue + ', 100%, 50%)';
                let borderColor = 'hsl(' + visibleUsers[i].hue + ', 100%, 45%)';
                for (var j = 0; j < visibleUsers[i].cells.length; j++) {
                    cellsToDraw.push({
                        color: color,
                        borderColor: borderColor,
                        mass: visibleUsers[i].cells[j].mass,
                        name: visibleUsers[i].name,
                        radius: visibleUsers[i].cells[j].radius,
                        x: visibleUsers[i].cells[j].x - player.x + global.screen.width / 2,
                        y: visibleUsers[i].cells[j].y - player.y + global.screen.height / 2,
                        isPrimary: visibleUsers[i].cells[j].isPrimary
                    });
                }
            }

            cellsToDraw.sort(function (obj1, obj2) {
                return obj1.mass - obj2.mass;
            });

            render.drawCells(cellsToDraw, playerConfig, global.toggleMassState, borders, graph);
        }

        if (global.playerType === 'player') {
            socket.emit('0', window.canvas.target);
        }
    }
}

window.addEventListener('resize', resize);

function resize() {
    if (!socket) return;

    // Canvas size should always match window size for both players and spectators
    player.screenWidth = c.width = global.screen.width = window.innerWidth;
    player.screenHeight = c.height = global.screen.height = window.innerHeight;

    if (global.playerType == 'spectator') {
        player.x = global.game.width / 2;
        player.y = global.game.height / 2;
    }

    socket.emit('windowResized', { screenWidth: global.screen.width, screenHeight: global.screen.height });
}
