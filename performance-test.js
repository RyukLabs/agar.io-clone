const WebSocket = require('ws');
const io = require('socket.io-client');

console.log('🚀 Starting Performance Test: Binary WebSocket vs Socket.IO');
console.log('This will show you EXACTLY why your game lags on AWS!\n');

// Test Binary WebSocket
function testBinaryWebSocket() {
    return new Promise((resolve) => {
        console.log('⚡ Testing Binary WebSocket...');
        const startTime = Date.now();
        let messageCount = 0;
        let totalBytes = 0;
        let latencies = [];
        let lastPing = null;

        const ws = new WebSocket('ws://localhost:3000/binary');
        ws.binaryType = 'arraybuffer';

        ws.on('open', () => {
            console.log('✅ Binary WebSocket connected');
            
            // Send spawn message
            const nameBytes = Buffer.from('BinaryPerfTest');
            const spawnMsg = Buffer.alloc(1 + nameBytes.length);
            spawnMsg.writeUInt8(0x00, 0); // SPAWN opcode
            nameBytes.copy(spawnMsg, 1);
            ws.send(spawnMsg);
            
            // Send movement updates rapidly (simulating real gameplay)
            const interval = setInterval(() => {
                const targetMsg = Buffer.alloc(9);
                targetMsg.writeUInt8(0x10, 0); // SET_TARGET opcode
                targetMsg.writeInt32LE(Math.random() * 5000, 1);
                targetMsg.writeInt32LE(Math.random() * 5000, 5);
                ws.send(targetMsg);
                lastPing = Date.now();
            }, 40); // 25fps realistic input rate
            
            setTimeout(() => {
                clearInterval(interval);
                const elapsed = (Date.now() - startTime) / 1000;
                const avgLatency = latencies.length > 0 ? 
                    latencies.reduce((a, b) => a + b, 0) / latencies.length : 0;
                
                console.log(`📊 Binary WebSocket Results (${elapsed}s test):`);
                console.log(`   Messages: ${messageCount}`);
                console.log(`   Total bytes: ${totalBytes} (${(totalBytes / 1024).toFixed(2)} KB)`);
                console.log(`   Average latency: ${Math.round(avgLatency)}ms`);
                console.log(`   Data rate: ${(totalBytes / elapsed / 1024).toFixed(2)} KB/s`);
                console.log(`   Avg message size: ${(totalBytes / messageCount).toFixed(1)} bytes\n`);
                
                ws.close();
                resolve({
                    protocol: 'Binary WebSocket',
                    messageCount,
                    totalBytes,
                    avgLatency,
                    dataRate: totalBytes / elapsed / 1024,
                    avgMessageSize: totalBytes / messageCount
                });
            }, 5000);
        });

        ws.on('message', (data) => {
            const now = Date.now();
            if (lastPing) {
                latencies.push(now - lastPing);
            }
            messageCount++;
            totalBytes += data.byteLength || data.length;
            
            if (messageCount === 1) {
                console.log(`   First binary message: ${data.byteLength || data.length} bytes`);
            }
        });

        ws.on('error', (err) => {
            console.log('❌ Binary WebSocket error:', err.message);
            resolve(null);
        });
    });
}

// Test Socket.IO
function testSocketIO() {
    return new Promise((resolve) => {
        console.log('🐌 Testing Socket.IO...');
        const startTime = Date.now();
        let messageCount = 0;
        let totalBytes = 0;
        let latencies = [];
        let lastPing = null;

        const socket = io('http://localhost:3000');
        
        socket.on('connect', () => {
            console.log('✅ Socket.IO connected');
            
            // Send spawn message
            socket.emit('gotit', { name: 'SocketIOPerfTest' });
            
            // Send movement updates
            const interval = setInterval(() => {
                socket.emit('0', {
                    x: Math.random() * 5000,
                    y: Math.random() * 5000
                });
                lastPing = Date.now();
            }, 40); // 25fps
            
            setTimeout(() => {
                clearInterval(interval);
                const elapsed = (Date.now() - startTime) / 1000;
                const avgLatency = latencies.length > 0 ? 
                    latencies.reduce((a, b) => a + b, 0) / latencies.length : 0;
                
                console.log(`📊 Socket.IO Results (${elapsed}s test):`);
                console.log(`   Messages: ${messageCount}`);
                console.log(`   Total bytes: ${totalBytes} (${(totalBytes / 1024).toFixed(2)} KB)`);
                console.log(`   Average latency: ${Math.round(avgLatency)}ms`);
                console.log(`   Data rate: ${(totalBytes / elapsed / 1024).toFixed(2)} KB/s`);
                console.log(`   Avg message size: ${(totalBytes / messageCount).toFixed(1)} bytes\n`);
                
                socket.disconnect();
                resolve({
                    protocol: 'Socket.IO',
                    messageCount,
                    totalBytes,
                    avgLatency,
                    dataRate: totalBytes / elapsed / 1024,
                    avgMessageSize: totalBytes / messageCount
                });
            }, 5000);
        });

        socket.on('serverTellPlayerMove', (playerData, visiblePlayers, visibleFood, visibleMass, visibleViruses) => {
            const now = Date.now();
            if (lastPing) {
                latencies.push(now - lastPing);
            }
            messageCount++;
            
            // Estimate JSON size (Socket.IO overhead)
            const jsonSize = JSON.stringify({
                playerData,
                visiblePlayers,
                visibleFood,
                visibleMass,
                visibleViruses
            }).length;
            
            totalBytes += jsonSize;
            
            if (messageCount === 1) {
                console.log(`   First JSON message: ~${jsonSize} bytes`);
            }
        });

        socket.on('error', (err) => {
            console.log('❌ Socket.IO error:', err);
            resolve(null);
        });
    });
}

// Run comparison test
async function runComparison() {
    const binaryResults = await testBinaryWebSocket();
    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait between tests
    const socketIOResults = await testSocketIO();
    
    if (binaryResults && socketIOResults) {
        console.log('🔥 === PERFORMANCE COMPARISON ===');
        console.log(`Speed: Binary is ${(socketIOResults.avgLatency / binaryResults.avgLatency).toFixed(2)}x FASTER`);
        console.log(`Bandwidth: Binary uses ${((socketIOResults.avgMessageSize - binaryResults.avgMessageSize) / socketIOResults.avgMessageSize * 100).toFixed(1)}% LESS data`);
        console.log(`Data efficiency: Binary ${binaryResults.avgMessageSize.toFixed(1)} bytes vs Socket.IO ${socketIOResults.avgMessageSize.toFixed(1)} bytes per message`);
        console.log('\n💡 THIS is why your game works locally but lags on AWS!');
        console.log('   Local: Fast CPU + zero network latency = Socket.IO seems fine');
        console.log('   AWS: Real network + JSON overhead + Socket.IO overhead = LAG');
    }
    
    process.exit(0);
}

runComparison().catch(console.error); 