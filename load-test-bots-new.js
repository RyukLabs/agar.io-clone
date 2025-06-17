const io = require('socket.io-client');
const os = require('os');

class LoadTestBot {
    constructor(botId, serverUrl) {
        this.botId = botId;
        this.serverUrl = serverUrl;
        this.socket = null;
        this.isConnected = false;
        this.isSpawned = false; // Track if bot has spawned into game
        this.currentPosition = { x: 2500, y: 2500 };
        this.worldTarget = { x: 2500, y: 2500 };
        this.name = `Bot${botId}`;
        this.heartbeatInterval = null;
        this.movementInterval = null;
        this.massCheckInterval = null;
        this.lastPingTime = 0;
        this.latency = 0;
        this.mass = 10; // Updated to match server default
        this.visibleEntities = [];
        this.personality = this.assignPersonality(botId);
        this.hasSplit = false;
        this.gameConfig = null;
        this.spawnTimeout = null;
    }

    assignPersonality(id) {
        const types = ['aggressive', 'passive', 'explorer'];
        return types[id % types.length];
    }

    connect() {
        console.log(`Bot ${this.botId} (${this.personality}): Connecting to ${this.serverUrl}...`);
        this.socket = io(this.serverUrl, { 
            query: "type=player",
            forceNew: true,
            timeout: 20000,
            reconnection: false
        });

        // Set spawn timeout to detect if spawn fails
        this.spawnTimeout = setTimeout(() => {
            if (this.isConnected && !this.isSpawned) {
                console.log(`⚠️ Bot ${this.botId}: Spawn timeout - retrying gotit...`);
                this.sendSpawnRequest();
            }
        }, 5000);

        this.socket.on('connect', () => {
            this.isConnected = true;
            console.log(`✅ Bot ${this.botId} connected, sending spawn request...`);
            this.sendSpawnRequest();
        });

        this.socket.on('welcome', (data) => {
            console.log(`🎉 Bot ${this.botId} received welcome! Spawning into game...`);
            this.isSpawned = true;
            
            if (this.spawnTimeout) {
                clearTimeout(this.spawnTimeout);
                this.spawnTimeout = null;
            }
            
            if (data && data.player) {
                this.currentPosition = { 
                    x: data.player.x || 2500, 
                    y: data.player.y || 2500 
                };
                this.mass = data.player.massTotal || data.player.mass || 10;
                console.log(`🎯 Bot ${this.botId} spawned at (${Math.round(this.currentPosition.x)}, ${Math.round(this.currentPosition.y)}) with mass ${this.mass}`);
            }
            
            if (data && data.gameConfig) {
                this.gameConfig = data.gameConfig;
                console.log(`🎮 Bot ${this.botId} received game config: ${this.gameConfig.width}x${this.gameConfig.height}`);
            }
            
            // Start bot behavior after successful spawn
            this.startHeartbeat();
            this.startSmartMovement();
            this.checkMassForSplit();
        });

        this.socket.on('serverTellPlayerMove', (gameUpdate) => {
            if (!this.isSpawned) return;
            
            if (gameUpdate && gameUpdate.player) {
                this.currentPosition = { 
                    x: gameUpdate.player.x || this.currentPosition.x, 
                    y: gameUpdate.player.y || this.currentPosition.y 
                };
                this.mass = gameUpdate.player.massTotal || gameUpdate.player.mass || this.mass;
            }
            
            // Combine all visible entities for AI decision making
            this.visibleEntities = [];
            
            if (gameUpdate.players) {
                gameUpdate.players.forEach(p => {
                    this.visibleEntities.push({ ...p, type: 'player' });
                });
            }
            
            if (gameUpdate.food) {
                gameUpdate.food.forEach(f => {
                    this.visibleEntities.push({ ...f, type: 'food', mass: 1 });
                });
            }
            
            if (gameUpdate.massFood) {
                gameUpdate.massFood.forEach(f => {
                    this.visibleEntities.push({ ...f, type: 'massFood' });
                });
            }
            
            if (gameUpdate.viruses) {
                gameUpdate.viruses.forEach(v => {
                    this.visibleEntities.push({ ...v, type: 'virus' });
                });
            }
            
            if (gameUpdate.portals) {
                gameUpdate.portals.forEach(p => {
                    this.visibleEntities.push({ ...p, type: 'portal' });
                });
            }
        });

        this.socket.on('leaderboard', (leaderboard) => {
            // Optional: Could use leaderboard data for strategy
        });

        this.socket.on('pongcheck', () => {
            this.latency = Date.now() - this.lastPingTime;
        });

        this.socket.on('RIP', (data) => {
            console.log(`💀 Bot ${this.botId} died! ${data ? `Killed by: ${data.killer || data.cause}` : ''}`);
            this.isSpawned = false;
            this.cleanup();
            
            // Respawn after a short delay
            setTimeout(() => {
                if (this.isConnected) {
                    console.log(`🔄 Bot ${this.botId} respawning...`);
                    this.sendSpawnRequest();
                }
            }, 1000);
        });

        this.socket.on('kick', (reason) => {
            console.log(`🚫 Bot ${this.botId}: Kicked from server: ${reason}`);
            this.isConnected = false;
            this.isSpawned = false;
            this.cleanup();
            if (this.onDeath) {
                this.onDeath(this);
            }
        });

        this.socket.on('disconnect', (reason) => {
            console.log(`🔌 Bot ${this.botId}: Disconnected (${reason})`);
            this.isConnected = false;
            this.isSpawned = false;
            this.cleanup();
            if (this.onDeath) {
                this.onDeath(this);
            }
        });

        this.socket.on('connect_error', (err) => {
            console.log(`❌ Bot ${this.botId}: Connection error:`, err.message);
        });
        
        this.socket.on('error', (err) => {
            console.log(`⚠️ Bot ${this.botId}: Socket error:`, err);
        });
    }

    sendSpawnRequest() {
        if (!this.socket || !this.isConnected) return;
        
        const playerData = { 
            name: this.name, 
            screenWidth: 1920, 
            screenHeight: 1080 
        };
        
        console.log(`📡 Bot ${this.botId} sending gotit with data:`, playerData);
        this.socket.emit('gotit', playerData);
    }

    startHeartbeat() {
        if (this.heartbeatInterval) return; // Already started
        
        this.heartbeatInterval = setInterval(() => {
            if (this.isConnected && this.isSpawned) {
                const relativeTarget = {
                    x: this.worldTarget.x - this.currentPosition.x,
                    y: this.worldTarget.y - this.currentPosition.y
                };
                // Send movement vector (event '0')
                this.socket.emit('0', relativeTarget);
            }
        }, 16); // 60 FPS heartbeat
    }

    startSmartMovement() {
        if (this.movementInterval) return; // Already started
        
        this.movementInterval = setInterval(() => {
            if (!this.isConnected || !this.isSpawned) return;

            const prey = this.visibleEntities.filter(e => 
                e.type === 'player' && e.massTotal && e.massTotal < this.mass * 0.8);
            const threats = this.visibleEntities.filter(e => 
                e.type === 'player' && e.massTotal && e.massTotal > this.mass * 1.2);
            const food = this.visibleEntities.filter(e => 
                e.type === 'food' || e.type === 'massFood');
            const viruses = this.visibleEntities.filter(e => e.type === 'virus');
            const portals = this.visibleEntities.filter(e => e.type === 'portal');
            
            // Avoid portals
            const closePortal = portals.find(p => this.getDistance(p, this.currentPosition) < 150000);
            if (closePortal) {
                this.worldTarget = this.getOppositeDirection(closePortal);
                return;
            }
            
            // Avoid viruses if too small to safely split
            const closeVirus = viruses.find(v => this.getDistance(v, this.currentPosition) < 100000);
            if (closeVirus && this.mass < 150) {
                this.worldTarget = this.getOppositeDirection(closeVirus);
                return;
            }

            // Flee from threats
            if (threats.length > 0) {
                const closest = this.getClosest(threats);
                this.worldTarget = this.getOppositeDirection(closest);
                return;
            }

            // Hunt prey if aggressive and big enough
            if (this.personality === 'aggressive' && prey.length > 0 && this.mass > 50) {
                const target = this.getClosest(prey);
                this.worldTarget = { x: target.x, y: target.y };
                return;
            }

            // Eat food
            if (food.length > 0) {
                const target = this.getClosest(food);
                this.worldTarget = { x: target.x, y: target.y };
                return;
            }

            // Random movement if nothing else to do
            if (Math.random() < 0.1) {
                const bounds = this.gameConfig ? {
                    width: this.gameConfig.width || 5000,
                    height: this.gameConfig.height || 5000
                } : { width: 5000, height: 5000 };
                
                this.worldTarget = {
                    x: Math.random() * (bounds.width - 500) + 250,
                    y: Math.random() * (bounds.height - 500) + 250
                };
            }
        }, 250 + Math.random() * 100);
    }

    checkMassForSplit() {
        if (this.massCheckInterval) return; // Already started
        
        this.massCheckInterval = setInterval(() => {
            if (!this.isConnected || !this.isSpawned || this.hasSplit) return;
            
            // Split if big enough and there's prey nearby
            if (this.mass > 100) {
                const prey = this.visibleEntities.filter(e => 
                    e.type === 'player' && e.massTotal && e.massTotal < this.mass * 0.6);
                const closePrey = prey.find(p => this.getDistance(p, this.currentPosition) < 50000);
                
                if (closePrey) {
                    console.log(`⚡ Bot ${this.botId}: Splitting to catch prey`);
                    this.socket.emit('2'); // Split command
                    this.hasSplit = true;
                    
                    // Reset split flag after some time
                    setTimeout(() => {
                        this.hasSplit = false;
                    }, 10000);
                }
            }
        }, 3000);
    }

    sendPing() {
        if (this.isConnected) {
            this.lastPingTime = Date.now();
            this.socket.emit('pingcheck');
        }
    }

    getClosest(entities) {
        if (!entities || entities.length === 0) return null;
        return entities.reduce((closest, entity) => {
            const d1 = this.getDistance(this.currentPosition, entity);
            const d2 = this.getDistance(this.currentPosition, closest);
            return d1 < d2 ? entity : closest;
        }, entities[0]);
    }

    getDistance(a, b) {
        return (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
    }

    getOppositeDirection(entity) {
        const dx = this.currentPosition.x - entity.x;
        const dy = this.currentPosition.y - entity.y;
        const length = Math.sqrt(dx * dx + dy * dy) || 1;
        return {
            x: this.currentPosition.x + (dx / length) * 500,
            y: this.currentPosition.y + (dy / length) * 500
        };
    }

    cleanup() {
        if (this.spawnTimeout) {
            clearTimeout(this.spawnTimeout);
            this.spawnTimeout = null;
        }
        clearInterval(this.heartbeatInterval);
        clearInterval(this.movementInterval);
        clearInterval(this.massCheckInterval);
        this.heartbeatInterval = null;
        this.movementInterval = null;
        this.massCheckInterval = null;
    }

    setDeathCallback(callback) {
        this.onDeath = callback;
    }

    disconnect() {
        this.cleanup();
        if (this.socket) {
            this.socket.disconnect();
        }
    }
}

class LoadTester {
    constructor(serverUrl, maxBots = 50) {
        this.serverUrl = serverUrl;
        this.maxBots = maxBots;
        this.bots = [];
        this.metricsInterval = null;
        this.nextBotId = 1;
        this.isRunning = false;
        this.respawnQueue = [];
        this.respawnInterval = null;
    }

    async start() {
        console.log(`🚀 Starting load test with ${this.maxBots} bots on ${this.serverUrl}...`);
        this.isRunning = true;
        this.startMetricsCollection();
        this.startRespawnHandler();

        // Spawn bots more gradually to avoid overwhelming the server
        for (let i = 0; i < this.maxBots; i++) {
            await this.spawnBot();

            if (i % 5 === 4) {
                await this.sleep(3000); // Longer delay every 5 bots
            } else {
                await this.sleep(1000); // 1 second between individual bots
            }
        }

        console.log(`✅ All ${this.maxBots} bots spawned!`);
    }

    async spawnBot() {
        // Safety check: don't spawn if we're already at max capacity
        if (this.bots.length >= this.maxBots) {
            console.log(`⚠️ Cannot spawn bot - already at max capacity (${this.bots.length}/${this.maxBots})`);
            return;
        }

        const bot = new LoadTestBot(this.nextBotId++, this.serverUrl);
        
        // Set up death callback to handle respawning
        bot.setDeathCallback((deadBot) => {
            if (this.isRunning) {
                console.log(`💀 Bot ${deadBot.botId} died, queuing for respawn...`);
                this.queueRespawn(deadBot);
            }
        });

        this.bots.push(bot);
        bot.connect();
        console.log(`🤖 Spawned Bot ${bot.botId} (${bot.personality}) - Total: ${this.bots.length}/${this.maxBots}`);
    }

    queueRespawn(deadBot) {
        // Remove dead bot from active bots list
        const index = this.bots.indexOf(deadBot);
        if (index > -1) {
            this.bots.splice(index, 1);
            console.log(`🗑️ Removed dead Bot ${deadBot.botId} from active list. Remaining: ${this.bots.length}/${this.maxBots}`);
            
            // Only queue respawn if we're below max capacity
            if (this.bots.length < this.maxBots) {
                this.respawnQueue.push(Date.now());
                console.log(`📋 Queued respawn. Queue size: ${this.respawnQueue.length}`);
            } else {
                console.log(`⚠️ Not queuing respawn - already at capacity`);
            }
        } else {
            console.log(`⚠️ Warning: Dead bot ${deadBot.botId} not found in active bots list`);
        }
    }

    startRespawnHandler() {
        this.respawnInterval = setInterval(async () => {
            if (!this.isRunning) return;

            // Process respawn queue (respawn one bot per interval to avoid overwhelming)
            if (this.respawnQueue.length > 0 && this.bots.length < this.maxBots) {
                // Additional safety check before spawning
                const activeBots = this.bots.filter(bot => bot.isConnected || bot.socket).length;
                if (activeBots < this.maxBots) {
                    this.respawnQueue.shift(); // Remove from queue
                    console.log(`🔄 Respawning bot... (Active: ${activeBots}/${this.maxBots}, Total: ${this.bots.length}/${this.maxBots})`);
                    await this.spawnBot();
                    await this.sleep(1000); // Small delay between respawns
                } else {
                    console.log(`⚠️ Skipping respawn - already at max capacity (${activeBots}/${this.maxBots})`);
                }
            } else if (this.bots.length >= this.maxBots) {
                // Clear respawn queue if we're at capacity
                if (this.respawnQueue.length > 0) {
                    console.log(`🧹 Clearing ${this.respawnQueue.length} queued respawns - at max capacity`);
                    this.respawnQueue = [];
                }
            }
        }, 3000); // Check every 3 seconds (slower respawn rate)
    }

    startMetricsCollection() {
        this.metricsInterval = setInterval(() => {
            const connected = this.bots.filter(bot => bot.isConnected).length;
            const spawned = this.bots.filter(bot => bot.isSpawned).length;
            const avgLatency = this.getAverageLatency().toFixed(2);
            const avgMass = this.getAverageMass().toFixed(1);
            const mem = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2);
            const cpu = os.loadavg()[0].toFixed(2);

            console.log(`\n--- 🎮 LOAD TEST METRICS ---`);
            console.log(`🌐 Server: ${this.serverUrl}`);
            console.log(`🔗 Connected Bots: ${connected}/${this.maxBots}`);
            console.log(`🎯 Spawned Bots: ${spawned}/${this.maxBots}`);
            console.log(`📊 Total Bots: ${this.bots.length}/${this.maxBots}`);
            console.log(`⏳ Respawn Queue: ${this.respawnQueue.length}`);
            console.log(`📡 Average Latency: ${avgLatency}ms`);
            console.log(`⚖️ Average Bot Mass: ${avgMass}`);
            console.log(`💾 Memory Usage: ${mem} MB`);
            console.log(`🖥️ CPU Load (1m): ${cpu}`);
            console.log(`🆔 Next Bot ID: ${this.nextBotId}`);
            console.log(`----------------------------\n`);

            this.pingRandomBots(Math.min(10, connected));
        }, 10000); // Every 10 seconds
    }

    getAverageLatency() {
        const latencies = this.bots
            .filter(bot => bot.isConnected && bot.latency > 0)
            .map(bot => bot.latency);
        return latencies.length > 0
            ? latencies.reduce((a, b) => a + b, 0) / latencies.length
            : 0;
    }
    
    getAverageMass() {
        const masses = this.bots
            .filter(bot => bot.isSpawned && bot.mass > 0)
            .map(bot => bot.mass);
        return masses.length > 0
            ? masses.reduce((a, b) => a + b, 0) / masses.length
            : 0;
    }

    pingRandomBots(count) {
        const connected = this.bots.filter(bot => bot.isConnected);
        for (let i = 0; i < Math.min(count, connected.length); i++) {
            const bot = connected[Math.floor(Math.random() * connected.length)];
            bot.sendPing();
        }
    }

    async stop() {
        console.log('🛑 Stopping load test...');
        this.isRunning = false;
        clearInterval(this.metricsInterval);
        clearInterval(this.respawnInterval);
        this.respawnQueue = [];
        
        // Disconnect all bots
        this.bots.forEach(bot => bot.disconnect());
        await this.sleep(2000);
        
        console.log('✅ Load test stopped.');
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Command line interface
const serverUrl = process.argv[2] || 'http://localhost:3000';
const botCount = parseInt(process.argv[3]) || 100;
const loadTester = new LoadTester(serverUrl, botCount);

console.log(`🤖 Agar.io Load Tester`);
console.log(`🎯 Target Server: ${serverUrl}`);
console.log(`📊 Bot Count: ${botCount}`);
console.log(`⚡ Press Ctrl+C to stop\n`);

process.on('SIGINT', async () => {
    console.log('\n🛑 Gracefully shutting down...');
    await loadTester.stop();
    process.exit(0);
});

// Error handling
process.on('uncaughtException', async (error) => {
    console.error('💥 Uncaught Exception:', error);
    await loadTester.stop();
    process.exit(1);
});

process.on('unhandledRejection', async (reason, promise) => {
    console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
    await loadTester.stop();
    process.exit(1);
});

loadTester.start();
