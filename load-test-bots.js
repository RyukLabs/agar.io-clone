const io = require('socket.io-client');
const os = require('os');

class LoadTestBot {
    constructor(botId, serverUrl) {
        this.botId = botId;
        this.serverUrl = serverUrl;
        this.socket = null;
        this.isConnected = false;
        this.position = { x: 2500, y: 2500 }; // Center of default 5000x5000 map
        this.target = { x: 2500, y: 2500 };
        this.name = `Bot${botId}`;
        this.heartbeatInterval = null;
        this.movementInterval = null;
        this.actionInterval = null;
        this.lastPingTime = 0;
        this.latency = 0;
    }

    connect() {
        console.log(`Bot ${this.botId}: Connecting...`);
        this.socket = io(this.serverUrl, { query: "type=player" });
        
        this.socket.on('connect', () => {
            console.log(`Bot ${this.botId}: Connected`);
            this.isConnected = true;
            
            // Send initial player data immediately after connection
            const playerData = {
                name: this.name,
                screenWidth: 1920,
                screenHeight: 1080
            };
            console.log(`Bot ${this.botId}: Sending gotit with data:`, playerData);
            this.socket.emit('gotit', playerData);
        });

        this.socket.on('welcome', (playerSettings, gameSizes) => {
            console.log(`Bot ${this.botId}: Welcomed to game`);
            
            // Start movement and actions after welcome
            this.startMovement();
            this.startHeartbeat();
            this.startRandomActions();
        });

        this.socket.on('pongcheck', () => {
            this.latency = Date.now() - this.lastPingTime;
        });

        this.socket.on('disconnect', () => {
            console.log(`Bot ${this.botId}: Disconnected`);
            this.isConnected = false;
            this.cleanup();
        });

        this.socket.on('connect_error', (err) => {
            console.log(`Bot ${this.botId}: Connection error:`, err.message);
        });
    }

    startHeartbeat() {
        // Send heartbeat every 40ms (matches networkUpdateFactor config)
        this.heartbeatInterval = setInterval(() => {
            if (this.isConnected) {
                this.socket.emit('0', this.target);
            }
        }, 40);
    }

    startMovement() {
        // Change target position every 2-5 seconds for realistic movement
        this.movementInterval = setInterval(() => {
            if (this.isConnected) {
                // Generate random target within game bounds (5000x5000 from config)
                this.target = {
                    x: Math.random() * 4500 + 250, // Keep away from edges
                    y: Math.random() * 4500 + 250
                };
            }
        }, 2000 + Math.random() * 3000);
    }

    startRandomActions() {
        // Randomly split or feed every 5-15 seconds
        this.actionInterval = setInterval(() => {
            if (this.isConnected && Math.random() < 0.3) {
                if (Math.random() < 0.7) {
                    // Feed (70% chance)
                    this.socket.emit('1');
                } else {
                    // Split (30% chance)
                    this.socket.emit('2');
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