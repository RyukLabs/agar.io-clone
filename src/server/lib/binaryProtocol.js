"use strict";

// Binary Protocol Implementation - Like Original Agar.io
// This replaces Socket.IO with raw WebSocket + binary protocol

const OPCODES = {
    // Client -> Server
    SPAWN: 0x00,
    SPECTATE: 0x01,
    SET_TARGET: 0x10,
    SPLIT: 0x11,
    EJECT_MASS: 0x15,
    
    // Server -> Client  
    WORLD_UPDATE: 0x10,
    SPECTATOR_POSITION: 0x11,
    RESET: 0x12,
    ADD_CELL: 0x20,
    LEADERBOARD: 0x31
};

class BinaryProtocol {
    constructor() {
        this.encoder = new TextEncoder();
        this.decoder = new TextDecoder();
    }

    // Pack world update - most critical for performance
    packWorldUpdate(visiblePlayers, visibleFood, visibleViruses, visibleMass) {
        // Estimate buffer size to avoid reallocation
        const estimatedSize = 1 + // opcode
            2 + // eat record length
            2 + // remove record length  
            visiblePlayers.length * 32 + // players (conservative estimate)
            visibleFood.length * 16 + // food
            visibleViruses.length * 16 + // viruses
            visibleMass.length * 16; // mass
            
        const buffer = new ArrayBuffer(estimatedSize);
        const view = new DataView(buffer);
        let offset = 0;

        // Opcode
        view.setUint8(offset, OPCODES.WORLD_UPDATE);
        offset += 1;

        // Eat Record Length (placeholder for now)
        view.setUint16(offset, 0, true); // little endian
        offset += 2;

        // Update Record - Players
        for (const player of visiblePlayers) {
            for (const cell of player.cells) {
                // Check if buffer has enough space, if not, create larger buffer
                if (offset + 32 > buffer.byteLength) {
                    const newBuffer = new ArrayBuffer(buffer.byteLength * 2);
                    new Uint8Array(newBuffer).set(new Uint8Array(buffer));
                    return this.packWorldUpdate(visiblePlayers, visibleFood, visibleViruses, visibleMass);
                }
                
                view.setUint32(offset, cell.id, true);
                offset += 4;
                view.setInt32(offset, Math.round(cell.x), true);
                offset += 4;
                view.setInt32(offset, Math.round(cell.y), true);
                offset += 4;
                view.setUint16(offset, Math.round(cell.radius), true);
                offset += 2;
                
                // Flags (player = 0x00, virus = 0x01, etc.)
                let flags = 0x00;
                if (player.name) flags |= 0x08; // has name
                view.setUint8(offset, flags);
                offset += 1;
                
                // RGB Color (simplified to 3 bytes)
                view.setUint8(offset, player.hue || 0);
                view.setUint8(offset + 1, 128); // saturation
                view.setUint8(offset + 2, 128); // lightness
                offset += 3;
                
                // Player name (if has name flag)
                if (flags & 0x08) {
                    const nameBytes = this.encoder.encode(player.name || "");
                    const nameLength = Math.min(nameBytes.length, 255);
                    view.setUint8(offset, nameLength);
                    offset += 1;
                    
                    for (let i = 0; i < nameLength; i++) {
                        view.setUint8(offset + i, nameBytes[i]);
                    }
                    offset += nameLength;
                }
            }
        }

        // Food entities
        for (const food of visibleFood) {
            if (offset + 16 > buffer.byteLength) {
                const newBuffer = new ArrayBuffer(buffer.byteLength * 2);
                new Uint8Array(newBuffer).set(new Uint8Array(buffer));
                return this.packWorldUpdate(visiblePlayers, visibleFood, visibleViruses, visibleMass);
            }
            
            view.setUint32(offset, food.id, true);
            offset += 4;
            view.setInt32(offset, Math.round(food.x), true);
            offset += 4;
            view.setInt32(offset, Math.round(food.y), true);
            offset += 4;
            view.setUint16(offset, Math.round(food.radius), true);
            offset += 2;
            view.setUint8(offset, 0x01); // food flag
            offset += 1;
            view.setUint8(offset, food.hue || 0); // food color
            offset += 1;
        }

        // Viruses
        for (const virus of visibleViruses) {
            if (offset + 16 > buffer.byteLength) {
                const newBuffer = new ArrayBuffer(buffer.byteLength * 2);
                new Uint8Array(newBuffer).set(new Uint8Array(buffer));
                return this.packWorldUpdate(visiblePlayers, visibleFood, visibleViruses, visibleMass);
            }
            
            view.setUint32(offset, virus.id, true);
            offset += 4;
            view.setInt32(offset, Math.round(virus.x), true);
            offset += 4;
            view.setInt32(offset, Math.round(virus.y), true);
            offset += 4;
            view.setUint16(offset, Math.round(virus.radius), true);
            offset += 2;
            view.setUint8(offset, 0x80); // virus flag
            offset += 1;
            view.setUint8(offset, 0); // padding
            offset += 1;
        }

        // Mass food
        for (const mass of visibleMass) {
            if (offset + 16 > buffer.byteLength) {
                const newBuffer = new ArrayBuffer(buffer.byteLength * 2);
                new Uint8Array(newBuffer).set(new Uint8Array(buffer));
                return this.packWorldUpdate(visiblePlayers, visibleFood, visibleViruses, visibleMass);
            }
            
            view.setUint32(offset, mass.id, true);
            offset += 4;
            view.setInt32(offset, Math.round(mass.x), true);
            offset += 4;
            view.setInt32(offset, Math.round(mass.y), true);
            offset += 4;
            view.setUint16(offset, Math.round(mass.radius), true);
            offset += 2;
            view.setUint8(offset, 0x20); // ejected mass flag
            offset += 1;
            view.setUint8(offset, mass.hue || 0);
            offset += 1;
        }

        // End marker (cell id = 0)
        if (offset + 4 <= buffer.byteLength) {
            view.setUint32(offset, 0, true);
            offset += 4;
        }

        // Remove Record Length (placeholder)
        view.setUint16(1 + 2, 0, true);

        // Return trimmed buffer
        return buffer.slice(0, offset);
    }

    // Parse client input
    parseClientMessage(buffer) {
        const view = new DataView(buffer);
        const opcode = view.getUint8(0);
        
        switch (opcode) {
            case OPCODES.SET_TARGET:
                return {
                    type: 'SET_TARGET',
                    x: view.getInt32(1, true),
                    y: view.getInt32(5, true)
                };
                
            case OPCODES.SPLIT:
                return { type: 'SPLIT' };
                
            case OPCODES.EJECT_MASS:
                return { type: 'EJECT_MASS' };
                
            case OPCODES.SPAWN:
                const nameLength = buffer.byteLength - 1;
                const nameBytes = new Uint8Array(buffer, 1, nameLength);
                const name = this.decoder.decode(nameBytes);
                return {
                    type: 'SPAWN',
                    name: name
                };
                
            default:
                console.warn('Unknown opcode:', opcode);
                return null;
        }
    }

    // Pack simple messages
    packAddCell(cellId) {
        const buffer = new ArrayBuffer(5);
        const view = new DataView(buffer);
        view.setUint8(0, OPCODES.ADD_CELL);
        view.setUint32(1, cellId, true);
        return buffer;
    }

    packReset() {
        const buffer = new ArrayBuffer(1);
        const view = new DataView(buffer);
        view.setUint8(0, OPCODES.RESET);
        return buffer;
    }
}

module.exports = BinaryProtocol; 