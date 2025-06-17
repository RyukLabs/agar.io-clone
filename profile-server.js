const fs = require('fs');
const path = require('path');

console.log('🔍 Profiling server performance...');

// Track game loop timing
let gameLoopStats = {
    tickGame: { count: 0, totalTime: 0, maxTime: 0 },
    sendUpdates: { count: 0, totalTime: 0, maxTime: 0 },
    enumerateWhatPlayersSee: { count: 0, totalTime: 0, maxTime: 0 }
};

// Wrap performance-critical functions
function wrapFunction(obj, funcName, category) {
    const original = obj[funcName];
    obj[funcName] = function(...args) {
        const start = process.hrtime.bigint();
        const result = original.apply(this, args);
        const end = process.hrtime.bigint();
        const timeMs = Number(end - start) / 1000000;
        
        gameLoopStats[category].count++;
        gameLoopStats[category].totalTime += timeMs;
        if (timeMs > gameLoopStats[category].maxTime) {
            gameLoopStats[category].maxTime = timeMs;
        }
        
        // Alert on slow frames
        if (timeMs > 16) {
            console.log(`⚠️  SLOW ${category}: ${timeMs.toFixed(2)}ms (target: <16ms)`);
        }
        
        return result;
    };
}

// Override setInterval to track game loops
const originalSetInterval = global.setInterval;
global.setInterval = function(fn, delay) {
    if (delay === 1000/60) {
        console.log('🎮 Monitoring 60fps game loop...');
        return originalSetInterval(() => {
            const start = process.hrtime.bigint();
            fn();
            const end = process.hrtime.bigint();
            const frameTime = Number(end - start) / 1000000;
            
            if (frameTime > 16.67) {
                console.log(`🚨 FRAME DROP: ${frameTime.toFixed(2)}ms (${(60 / (1000/frameTime)).toFixed(1)} fps)`);
            }
        }, delay);
    } else if (delay === 1000 / 25) { // Network updates
        console.log('📡 Monitoring 25fps network updates...');
        return originalSetInterval(() => {
            const start = process.hrtime.bigint();
            fn();
            const end = process.hrtime.bigint();
            const updateTime = Number(end - start) / 1000000;
            
            if (updateTime > 40) {
                console.log(`📡 SLOW NETWORK UPDATE: ${updateTime.toFixed(2)}ms (target: <40ms)`);
            }
        }, delay);
    }
    return originalSetInterval(fn, delay);
};

// Monitor memory usage
setInterval(() => {
    const memUsage = process.memoryUsage();
    const memMB = {
        rss: Math.round(memUsage.rss / 1024 / 1024 * 100) / 100,
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024 * 100) / 100,
        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024 * 100) / 100
    };
    
    console.log(`🧠 Memory: ${memMB.heapUsed}MB used, ${memMB.rss}MB total`);
    
    if (memMB.heapUsed > 100) {
        console.log('⚠️  HIGH MEMORY USAGE - Possible memory leak!');
    }
}, 5000);

// Performance summary every 10 seconds
setInterval(() => {
    console.log('\n📊 === PERFORMANCE SUMMARY ===');
    Object.entries(gameLoopStats).forEach(([name, stats]) => {
        if (stats.count > 0) {
            const avg = stats.totalTime / stats.count;
            console.log(`${name}: avg ${avg.toFixed(2)}ms, max ${stats.maxTime.toFixed(2)}ms, calls ${stats.count}`);
        }
    });
    console.log('================================\n');
}, 10000);

// Load the actual server
console.log('🚀 Starting monitored server...');
require('./bin/server/server.js'); 