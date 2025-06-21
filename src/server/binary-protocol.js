// Custom binary protocol for Agar.io
// Much more compact than MessagePack for our specific data structures

class BinaryProtocol {
    constructor() {
        this.buffer = Buffer.alloc(8192); // Start with 8KB buffer
        this.offset = 0;
    }

    reset() {
        this.offset = 0;
    }

    ensureCapacity(bytes) {
        if (this.offset + bytes > this.buffer.length) {
            const newBuffer = Buffer.alloc(this.buffer.length * 2);
            this.buffer.copy(newBuffer);
            this.buffer = newBuffer;
        }
    }

    writeUInt8(value) {
        this.ensureCapacity(1);
        this.buffer.writeUInt8(value, this.offset);
        this.offset += 1;
    }

    writeUInt16(value) {
        this.ensureCapacity(2);
        this.buffer.writeUInt16LE(value, this.offset);
        this.offset += 2;
    }

    writeInt16(value) {
        this.ensureCapacity(2);
        this.buffer.writeInt16LE(value, this.offset);
        this.offset += 2;
    }

    writeUInt32(value) {
        this.ensureCapacity(4);
        this.buffer.writeUInt32LE(value, this.offset);
        this.offset += 4;
    }

    writeFloat(value) {
        this.ensureCapacity(4);
        this.buffer.writeFloatLE(value, this.offset);
        this.offset += 4;
    }

    writeString(str) {
        const utf8 = Buffer.from(str, 'utf8');
        this.writeUInt8(utf8.length);
        this.ensureCapacity(utf8.length);
        utf8.copy(this.buffer, this.offset);
        this.offset += utf8.length;
    }

    // Encode player data (most critical for bandwidth)
    encodePlayer(playerData) {
        // Player data: x(2), y(2), hue(1), cellCount(1), cells[x(2),y(2),mass(2),radius(1)]
        this.writeInt16(Math.round(playerData.x));
        this.writeInt16(Math.round(playerData.y));
        this.writeUInt8(playerData.hue);
        this.writeUInt8(playerData.cells.length);
        
        playerData.cells.forEach(cell => {
            this.writeInt16(Math.round(cell.x));
            this.writeInt16(Math.round(cell.y));
            this.writeUInt16(Math.round(cell.mass));
            this.writeUInt8(Math.min(255, Math.round(cell.radius)));
        });
    }

    // Encode delta updates
    encodeDelta(deltas) {
        // Format: entityType(1), addedCount(1), updatedCount(1), removedCount(1)
        ['players', 'food', 'mass', 'viruses'].forEach((entityType, typeIndex) => {
            const delta = deltas[entityType];
            this.writeUInt8(typeIndex);
            this.writeUInt8(delta.added.length);
            this.writeUInt8(delta.updated.length);
            this.writeUInt8(delta.removed.length);

            // Encode added entities
            delta.added.forEach(item => {
                this.encodeEntity(item.data, entityType);
            });

            // Encode updated entities  
            delta.updated.forEach(item => {
                this.encodeEntity(item.data, entityType);
            });

            // Encode removed entity IDs (just indices for efficiency)
            delta.removed.forEach(entityId => {
                this.writeUInt16(parseInt(entityId.split('_')[1]) || 0);
            });
        });
    }

    encodeEntity(entity, type) {
        switch(type) {
            case 'players':
                this.writeInt16(Math.round(entity.x));
                this.writeInt16(Math.round(entity.y));
                this.writeUInt8(entity.hue);
                this.writeString(entity.name || '');
                this.writeUInt8(entity.cells ? entity.cells.length : 0);
                if (entity.cells) {
                    entity.cells.forEach(cell => {
                        this.writeInt16(Math.round(cell.x));
                        this.writeInt16(Math.round(cell.y));
                        this.writeUInt16(Math.round(cell.mass));
                        this.writeUInt8(Math.min(255, Math.round(cell.radius)));
                    });
                }
                break;
            case 'food':
                this.writeInt16(Math.round(entity.x));
                this.writeInt16(Math.round(entity.y));
                this.writeUInt8(entity.hue || 0);
                break;
            case 'mass':
                this.writeInt16(Math.round(entity.x));
                this.writeInt16(Math.round(entity.y));
                this.writeUInt16(Math.round(entity.mass));
                this.writeUInt8(entity.hue || 0);
                break;
            case 'viruses':
                this.writeInt16(Math.round(entity.x));
                this.writeInt16(Math.round(entity.y));
                this.writeUInt16(Math.round(entity.mass));
                break;
        }
    }

    getBuffer() {
        return this.buffer.slice(0, this.offset);
    }
}

// Decoder for client
class BinaryDecoder {
    constructor(buffer) {
        this.buffer = buffer;
        this.offset = 0;
    }

    readUInt8() {
        const value = this.buffer.readUInt8(this.offset);
        this.offset += 1;
        return value;
    }

    readUInt16() {
        const value = this.buffer.readUInt16LE(this.offset);
        this.offset += 2;
        return value;
    }

    readInt16() {
        const value = this.buffer.readInt16LE(this.offset);
        this.offset += 2;
        return value;
    }

    readUInt32() {
        const value = this.buffer.readUInt32LE(this.offset);
        this.offset += 4;
        return value;
    }

    readFloat() {
        const value = this.buffer.readFloatLE(this.offset);
        this.offset += 4;
        return value;
    }

    readString() {
        const length = this.readUInt8();
        const str = this.buffer.toString('utf8', this.offset, this.offset + length);
        this.offset += length;
        return str;
    }

    decodePlayer() {
        return {
            x: this.readInt16(),
            y: this.readInt16(),
            hue: this.readUInt8(),
            cells: Array.from({length: this.readUInt8()}, () => ({
                x: this.readInt16(),
                y: this.readInt16(),
                mass: this.readUInt16(),
                radius: this.readUInt8()
            }))
        };
    }

    decodeDelta() {
        const deltas = {};
        const entityTypes = ['players', 'food', 'mass', 'viruses'];
        
        entityTypes.forEach(entityType => {
            const typeIndex = this.readUInt8();
            const addedCount = this.readUInt8();
            const updatedCount = this.readUInt8();
            const removedCount = this.readUInt8();
            
            deltas[entityTypes[typeIndex]] = {
                added: Array.from({length: addedCount}, () => ({
                    data: this.decodeEntity(entityTypes[typeIndex])
                })),
                updated: Array.from({length: updatedCount}, () => ({
                    data: this.decodeEntity(entityTypes[typeIndex])
                })),
                removed: Array.from({length: removedCount}, () => this.readUInt16())
            };
        });
        
        return deltas;
    }

    decodeEntity(type) {
        switch(type) {
            case 'players':
                const cellCount = this.readUInt8();
                return {
                    x: this.readInt16(),
                    y: this.readInt16(),
                    hue: this.readUInt8(),
                    name: this.readString(),
                    cells: Array.from({length: cellCount}, () => ({
                        x: this.readInt16(),
                        y: this.readInt16(),
                        mass: this.readUInt16(),
                        radius: this.readUInt8()
                    }))
                };
            case 'food':
                return {
                    x: this.readInt16(),
                    y: this.readInt16(),
                    hue: this.readUInt8()
                };
            case 'mass':
                return {
                    x: this.readInt16(),
                    y: this.readInt16(),
                    mass: this.readUInt16(),
                    hue: this.readUInt8()
                };
            case 'viruses':
                return {
                    x: this.readInt16(),
                    y: this.readInt16(),
                    mass: this.readUInt16()
                };
        }
    }
}

module.exports = { BinaryProtocol, BinaryDecoder }; 