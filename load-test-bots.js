const io = require('socket.io-client');
const os = require('os');

class LoadTestBot {
    constructor(botId, serverUrl) {
        this.botId = botId;
        this.serverUrl = serverUrl;
        this.socket = null;
        this.isConnected = false;
        this.isAlive = false;
        this.position = { x: 2500, y: 2500 };
        this.target = { x: 2500, y: 2500 };
        this.name = `Bot${botId}`;
        this.heartbeatInterval = null;
        this.movementInterval = null;
        this.actionInterval = null;
        this.lastPingTime = 0;
        this.latency = 0;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 2000;
        this.gridPosition = this.calculateGridPosition(botId);
        this.lastDirection = 0;
        this.avoidingCorner = false;
    }

    calculateGridPosition(botId) {
        // Create a 5x5 grid (25 possible positions)
        const gridSize = 5;
        const cellSize = 1000; // Each grid cell is 1000x1000
        const margin = 500; // Margin from edges
        
        // Calculate grid coordinates
        const row = Math.floor(botId % gridSize);
        const col = Math.floor(botId / gridSize);
        
        // Calculate center of grid cell
        return {
            x: margin + (col * cellSize) + (cellSize / 2),
            y: margin + (row * cellSize) + (cellSize / 2)
        };
    }

    connect() {
        console.log(`Bot ${this.botId}: Connecting...`);
        this.socket = io(this.serverUrl, { query: "type=player" });
        
        this.socket.on('connect', () => {
            console.log(`Bot ${this.botId}: Connected`);
            this.isConnected = true;
            this.reconnectAttempts = 0;
        });

        this.socket.on('welcome', (playerSettings, gameSizes) => {
            console.log(`Bot ${this.botId}: Welcomed to game`);
            
            // Send initial player data after welcome
            const playerData = {
                name: this.name,
                screenWidth: 1920,
                screenHeight: 1080
            };
            console.log(`Bot ${this.botId}: Sending gotit with data:`, playerData);
            this.socket.emit('gotit', playerData);
            
            this.isAlive = true;
            
            // Start movement and actions only when alive
            this.startMovement();
            this.startHeartbeat();
            this.startRandomActions();
        });

        this.socket.on('RIP', () => {
            console.log(`Bot ${this.botId}: Died`);
            this.isAlive = false;
            this.cleanup();
            
            // Wait a bit before respawning
            setTimeout(() => {
                console.log(`Bot ${this.botId}: Respawning...`);
                this.socket.emit('respawn');
            }, 1000);
        });

        this.socket.on('disconnect', () => {
            console.log(`Bot ${this.botId}: Disconnected`);
            this.isConnected = false;
            this.isAlive = false;
            this.cleanup();
            this.attemptReconnect();
        });

        this.socket.on('connect_error', (err) => {
            console.log(`Bot ${this.botId}: Connection error:`, err.message);
            this.attemptReconnect();
        });
    }

    attemptReconnect() {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            console.log(`Bot ${this.botId}: Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
            setTimeout(() => {
                this.cleanup();
                this.connect();
            }, this.reconnectDelay);
        } else {
            console.log(`Bot ${this.botId}: Max reconnection attempts reached, giving up.`);
        }
    }

    startMovement() {
        this.movementInterval = setInterval(() => {
            if (this.isConnected && this.isAlive) {
                // Calculate grid-based position
                const gridPos = this.calculateGridPosition(this.botId);
                
                // Add some random offset within the grid cell
                const offset = 200;
                this.target = {
                    x: gridPos.x + (Math.random() * offset * 2 - offset),
                    y: gridPos.y + (Math.random() * offset * 2 - offset)
                };
                
                console.log(`Bot ${this.botId}: Moving to (${this.target.x.toFixed(0)}, ${this.target.y.toFixed(0)})`);
            }
        }, 2000);
    }

    startHeartbeat() {
        this.heartbeatInterval = setInterval(() => {
            if (this.isConnected && this.isAlive) {
                // Update position based on target
                const dx = this.target.x - this.position.x;
                const dy = this.target.y - this.position.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                if (distance > 0) {
                    const speed = 6.25;
                    const moveX = (dx / distance) * speed;
                    const moveY = (dy / distance) * speed;
                    
                    this.position.x += moveX;
                    this.position.y += moveY;
                }
                
                // Send current position to server
                this.socket.emit('0', this.position);
            }
        }, 30);
    }

    startRandomActions() {
        this.actionInterval = setInterval(() => {
            if (this.isConnected && this.isAlive) {
                if (Math.random() < 0.3) {
                    if (Math.random() < 0.7) {
                        this.socket.emit('1'); // Feed
                    } else {
                        this.socket.emit('2'); // Split
                    }
                }
            }
        }, 5000 + Math.random() * 10000);
    }

    sendPing() {
        if (this.isConnected) {
            this.lastPingTime = Date.now();
            this.socket.emit('pingcheck');
        }
    }

    cleanup() {
        if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
        if (this.movementInterval) clearInterval(this.movementInterval);
        if (this.actionInterval) clearInterval(this.actionInterval);
    }

    disconnect() {
        this.cleanup();
        if (this.socket) {
            this.socket.disconnect();
        }
    }
}

class LoadTester {
    constructor(serverUrl, maxBots = 150) {
        this.serverUrl = serverUrl;
        this.maxBots = maxBots;
        this.bots = [];
        this.metrics = {
            startTime: Date.now(),
            connectedBots: 0,
            totalLatency: 0,
            latencyCount: 0,
            errors: 0
        };
        this.metricsInterval = null;
    }

    async start() {
        console.log(`Starting load test with ${this.maxBots} bots...`);
        console.log(`Target server: ${this.serverUrl}`);
        
        // Start metrics collection
        this.startMetricsCollection();

        // Spawn bots gradually (10 bots every 2 seconds)
        for (let i = 0; i < this.maxBots; i++) {
            const bot = new LoadTestBot(i + 1, this.serverUrl);
            this.bots.push(bot);
            
            bot.connect();
            
            // Wait 200ms between each bot to avoid overwhelming the server
            if (i % 10 === 9) {
                console.log(`Spawned ${i + 1} bots...`);
                await this.sleep(2000);
            } else {
                await this.sleep(200);
            }
        }

        console.log(`All ${this.maxBots} bots spawned!`);
    }

    startMetricsCollection() {
        this.metricsInterval = setInterval(() => {
            this.collectAndDisplayMetrics();
        }, 5000); // Display metrics every 5 seconds
    }

    collectAndDisplayMetrics() {
        const connectedBots = this.bots.filter(bot => bot.isConnected).length;
        const avgLatency = this.calculateAverageLatency();
        const memUsage = process.memoryUsage();
        const cpuUsage = os.loadavg();
        
        console.log('\n--- LOAD TEST METRICS ---');
        console.log(`Connected Bots: ${connectedBots}/${this.maxBots}`);
        console.log(`Average Latency: ${avgLatency.toFixed(2)}ms`);
        console.log(`Memory Usage: ${(memUsage.heapUsed / 1024 / 1024).toFixed(2)} MB`);
        console.log(`CPU Load (1m): ${cpuUsage[0].toFixed(2)}`);
        console.log(`Runtime: ${((Date.now() - this.metrics.startTime) / 1000).toFixed(0)}s`);
        console.log('-------------------------\n');

        // Ping random bots to measure latency
        this.pingRandomBots(10);
    }

    calculateAverageLatency() {
        const connectedBots = this.bots.filter(bot => bot.isConnected && bot.latency > 0);
        if (connectedBots.length === 0) return 0;
        
        const totalLatency = connectedBots.reduce((sum, bot) => sum + bot.latency, 0);
        return totalLatency / connectedBots.length;
    }

    pingRandomBots(count) {
        const connectedBots = this.bots.filter(bot => bot.isConnected);
        const sampleSize = Math.min(count, connectedBots.length);
        
        for (let i = 0; i < sampleSize; i++) {
            const randomBot = connectedBots[Math.floor(Math.random() * connectedBots.length)];
            randomBot.sendPing();
        }
    }

    async stop() {
        console.log('Stopping load test...');
        
        if (this.metricsInterval) {
            clearInterval(this.metricsInterval);
        }

        // Disconnect all bots
        this.bots.forEach(bot => bot.disconnect());
        
        // Wait for cleanup
        await this.sleep(2000);
        
        console.log('Load test stopped.');
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Main execution
const serverUrl = process.argv[2] || 'http://localhost:3000';
const botCount = parseInt(process.argv[3]) || 150;

const loadTester = new LoadTester(serverUrl, botCount);

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\nReceived SIGINT, shutting down gracefully...');
    await loadTester.stop();
    process.exit(0);
});

// Start the load test
loadTester.start().catch(console.error);

console.log('Load test started. Press Ctrl+C to stop.'); 