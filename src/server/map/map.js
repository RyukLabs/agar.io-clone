"use strict";

const {isVisibleEntity} = require("../lib/entityUtils");

exports.foodUtils = require('./food');
exports.virusUtils = require('./virus');
exports.massFoodUtils = require('./massFood');
exports.playerUtils = require('./player');
exports.portalUtils = require('./portal');

// Spatial Grid for optimized collision detection
class SpatialGrid {
    constructor(width, height, cellSize) {
        this.width = width;
        this.height = height;
        this.cellSize = cellSize;
        this.cols = Math.ceil(width / cellSize);
        this.rows = Math.ceil(height / cellSize);
        this.grid = new Array(this.cols * this.rows);
        this.clear();
    }

    clear() {
        for (let i = 0; i < this.grid.length; i++) {
            this.grid[i] = [];
        }
    }

    getIndex(x, y) {
        const col = Math.floor(x / this.cellSize);
        const row = Math.floor(y / this.cellSize);
        if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) {
            return -1;
        }
        return row * this.cols + col;
    }

    insert(entity) {
        const index = this.getIndex(entity.x, entity.y);
        if (index >= 0) {
            this.grid[index].push(entity);
        }
    }

    getNearbyEntities(x, y, radius) {
        const entities = new Set();
        const startCol = Math.max(0, Math.floor((x - radius) / this.cellSize));
        const endCol = Math.min(this.cols - 1, Math.floor((x + radius) / this.cellSize));
        const startRow = Math.max(0, Math.floor((y - radius) / this.cellSize));
        const endRow = Math.min(this.rows - 1, Math.floor((y + radius) / this.cellSize));

        for (let row = startRow; row <= endRow; row++) {
            for (let col = startCol; col <= endCol; col++) {
                const index = row * this.cols + col;
                if (index >= 0 && index < this.grid.length) {
                    this.grid[index].forEach(entity => entities.add(entity));
                }
            }
        }

        return entities;
    }
}

exports.Map = class {
    constructor(config) {
        this.food = new exports.foodUtils.FoodManager(config.foodMass, config.foodUniformDisposition);
        this.viruses = new exports.virusUtils.VirusManager(config.virus);
        this.massFood = new exports.massFoodUtils.MassFoodManager();
        this.players = new exports.playerUtils.PlayerManager();
        this.portals = new exports.portalUtils.PortalManager();
        this.spatialGrid = new SpatialGrid(config.gameWidth, config.gameHeight, 100);
    }

    balanceMass(foodMass, gameMass, maxFood, maxVirus, maxPortal) {
        const totalMass = this.food.data.length * foodMass + this.players.getTotalMass();

        const massDiff = gameMass - totalMass;
        const foodFreeCapacity = maxFood - this.food.data.length;
        const foodDiff = Math.min(parseInt(massDiff / foodMass), foodFreeCapacity);
        if (foodDiff > 0) {
            console.debug('[DEBUG] Adding ' + foodDiff + ' food');
            this.food.addNew(foodDiff);
        } else if (foodDiff && foodFreeCapacity !== maxFood) {
            console.debug('[DEBUG] Removing ' + -foodDiff + ' food');
            this.food.removeExcess(-foodDiff);
        }

        const virusesToAdd = maxVirus - this.viruses.data.length;
        if (virusesToAdd > 0) {
            this.viruses.addNew(virusesToAdd);
        }

        // Portals are now handled by their own timing system in updatePortals()
    }

    enumerateWhatPlayersSee(callback) {
        for (let currentPlayer of this.players.data) {
            // Use spatial grid for more efficient entity filtering
            const nearbyEntities = this.spatialGrid.getNearbyEntities(currentPlayer.x, currentPlayer.y, 1000);
            
            var visibleFood = Array.from(nearbyEntities)
                .filter(entity => entity.type === 'food' && isVisibleEntity(entity, currentPlayer, false));
            
            var visibleViruses = Array.from(nearbyEntities)
                .filter(entity => entity.type === 'virus' && isVisibleEntity(entity, currentPlayer));
            
            var visibleMass = Array.from(nearbyEntities)
                .filter(entity => entity.type === 'mass' && isVisibleEntity(entity, currentPlayer));

            // Get visible portals with their state information
            var allVisiblePortals = this.portals.getVisiblePortals();
            console.log('[DEBUG] All visible portals from manager:', allVisiblePortals.length);
            
            // Bypass isVisibleEntity for now since portals should be visible globally
            var visiblePortals = allVisiblePortals;
            
            console.log('[DEBUG] Visible portals after filter:', visiblePortals.length);

            const extractData = (player) => {
                return {
                    x: player.x,
                    y: player.y,
                    cells: player.cells,
                    massTotal: Math.round(player.massTotal),
                    hue: player.hue,
                    id: player.id,
                    name: player.name
                };
            }

            var visiblePlayers = [];
            for (let player of this.players.data) {
                for (let cell of player.cells) {
                    if (isVisibleEntity(cell, currentPlayer)) {
                        visiblePlayers.push(extractData(player));
                        break;
                    }
                }
            }

            callback(extractData(currentPlayer), visiblePlayers, visibleFood, visibleMass, visibleViruses, visiblePortals);
        }
    }

    // Update spatial grid
    updateSpatialGrid() {
        this.spatialGrid.clear();
        
        // Add all entities to spatial grid
        this.food.data.forEach(food => {
            food.type = 'food';
            this.spatialGrid.insert(food);
        });
        
        this.viruses.data.forEach(virus => {
            virus.type = 'virus';
            this.spatialGrid.insert(virus);
        });
        
        this.massFood.data.forEach(mass => {
            mass.type = 'mass';
            this.spatialGrid.insert(mass);
        });

        // Only add visible portals to spatial grid
        const visiblePortals = this.portals.getVisiblePortals();
        console.log('[DEBUG] Adding', visiblePortals.length, 'visible portals to spatial grid');
        visiblePortals.forEach(portal => {
            portal.type = 'portal';
            this.spatialGrid.insert(portal);
        });
    }

    updatePortals(config) {
        this.portals.update(config);
    }
}
