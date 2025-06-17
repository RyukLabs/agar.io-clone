"use strict";

const http = require('http');
const WebSocket = require('ws');
const socketIO = require('socket.io');
const BinaryProtocol = require('./lib/binaryProtocol');

class HybridServer {
    constructor(config) {
        this.config = config;
        this.binaryProtocol = new BinaryProtocol();
        this.clients = new Map(); // clientId -> {socket, type: 'socketio'|'websocket', protocol}
        
        // Create HTTP server
        this.server = http.createServer();
        
        // Setup Socket.IO (legacy support)
        this.io = socketIO(this.server, {
            cors: {
                origin: "*",
                methods: ["GET", "POST"]
            }
        });
        
        // Setup Binary WebSocket Server
        this.wss = new WebSocket.Server({ 
            server: this.server,
            path: '/binary'
        });
        
        this.setupSocketIO();
        this.setupBinaryWebSocket();
    }

    setupSocketIO() {
        this.io.on('connection', (socket) => {
            console.log('Socket.IO client connected:', socket.id);
            
            this.clients.set(socket.id, {
                socket: socket,
                type: 'socketio',
                protocol: 'json'
            });

            socket.on('disconnect', () => {
                console.log('Socket.IO client disconnected:', socket.id);
                this.clients.delete(socket.id);
            });

            // Legacy Socket.IO event handlers
            socket.on('respawn', (data) => {
                this.handlePlayerAction(socket.id, 'SPAWN', data);
            });

            socket.on('0', (data) => { // target
                this.handlePlayerAction(socket.id, 'SET_TARGET', data);
            });

            socket.on('1', () => { // split
                this.handlePlayerAction(socket.id, 'SPLIT');
            });

            socket.on('2', () => { // eject mass
                this.handlePlayerAction(socket.id, 'EJECT_MASS');
            });
        });
    }

    setupBinaryWebSocket() {
        this.wss.on('connection', (ws, req) => {
            const clientId = this.generateClientId();
            console.log('Binary WebSocket client connected:', clientId);
            
            ws.binaryType = 'arraybuffer';
            
            this.clients.set(clientId, {
                socket: ws,
                type: 'websocket',
                protocol: 'binary'
            });

            ws.on('close', () => {
                console.log('Binary WebSocket client disconnected:', clientId);
                this.clients.delete(clientId);
            });

            ws.on('message', (data) => {
                if (data instanceof ArrayBuffer) {
                    const parsed = this.binaryProtocol.parseClientMessage(data);
                    if (parsed) {
                        this.handlePlayerAction(clientId, parsed.type, parsed);
                    }
                }
            });

            // Send initial connection confirmation
            ws.send(this.binaryProtocol.packReset());
        });
    }

    handlePlayerAction(clientId, actionType, data) {
        // This will be called by your main game logic
        // Route to existing game handlers
        console.log(`Client ${clientId} action: ${actionType}`, data);
        
        // Emit to game logic system
        if (this.onPlayerAction) {
            this.onPlayerAction(clientId, actionType, data);
        }
    }

    // Send updates to all clients
    broadcastGameState(gameState) {
        const { visiblePlayers, visibleFood, visibleViruses, visibleMass } = gameState;
        
        // Pack binary data once
        const binaryData = this.binaryProtocol.packWorldUpdate(
            visiblePlayers, 
            visibleFood, 
            visibleViruses, 
            visibleMass
        );

        this.clients.forEach((client, clientId) => {
            try {
                if (client.type === 'socketio') {
                    // Send JSON data to Socket.IO clients
                    client.socket.emit('serverTellPlayerMove', 
                        gameState.playerData,
                        visiblePlayers,
                        visibleFood,
                        visibleMass,
                        visibleViruses
                    );
                } else if (client.type === 'websocket') {
                    // Send binary data to WebSocket clients
                    if (client.socket.readyState === WebSocket.OPEN) {
                        client.socket.send(binaryData);
                    }
                }
            } catch (error) {
                console.error(`Error sending to client ${clientId}:`, error);
                this.clients.delete(clientId);
            }
        });
    }

    // Send to specific client
    sendToClient(clientId, messageType, data) {
        const client = this.clients.get(clientId);
        if (!client) return;

        try {
            if (client.type === 'socketio') {
                client.socket.emit(messageType, data);
            } else if (client.type === 'websocket') {
                let binaryData;
                switch (messageType) {
                    case 'addCell':
                        binaryData = this.binaryProtocol.packAddCell(data.cellId);
                        break;
                    case 'reset':
                        binaryData = this.binaryProtocol.packReset();
                        break;
                    default:
                        console.warn('Unknown message type for binary client:', messageType);
                        return;
                }
                
                if (client.socket.readyState === WebSocket.OPEN) {
                    client.socket.send(binaryData);
                }
            }
        } catch (error) {
            console.error(`Error sending to client ${clientId}:`, error);
            this.clients.delete(clientId);
        }
    }

    generateClientId() {
        return 'ws_' + Math.random().toString(36).substr(2, 9);
    }

    listen(port, callback) {
        this.server.listen(port, callback);
    }

    getConnectedClients() {
        return this.clients.size;
    }

    getClientStats() {
        const stats = {
            total: this.clients.size,
            socketio: 0,
            websocket: 0
        };

        this.clients.forEach(client => {
            stats[client.type]++;
        });

        return stats;
    }
}

module.exports = HybridServer; 