"use strict";

const {isVisibleEntity} = require("../lib/entityUtils");
const SpatialGrid = require("../lib/spatialGrid");

exports.foodUtils = require('./food');
exports.virusUtils = require('./virus');
exports.massFoodUtils = require('./massFood');
exports.playerUtils = require('./player');

exports.Map = class {
    constructor(config) {
        this.food = new exports.foodUtils.FoodManager(config.foodMass, config.foodUniformDisposition);
        this.viruses = new exports.virusUtils.VirusManager(config.virus);
        this.massFood = new exports.massFoodUtils.MassFoodManager();
        this.players = new exports.playerUtils.PlayerManager();
        
        // Initialize spatial grid for performance optimization
        // Grid size of 500 creates a 10x10 grid for the 5000x5000 game world
        this.spatialGrid = new SpatialGrid(config.gameWidth, config.gameHeight, 500);
    }

    balanceMass(foodMass, gameMass, maxFood, maxVirus) {
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
        //console.debug('[DEBUG] Mass rebalanced!');

        const virusesToAdd = maxVirus - this.viruses.data.length;
        if (virusesToAdd > 0) {
            this.viruses.addNew(virusesToAdd);
        }
    }

    enumerateWhatPlayersSee(callback) {
        // Update spatial grid once per frame (major performance optimization)
        this.spatialGrid.clear();
        this.spatialGrid.addEntities(this.food.data, 'food');
        this.spatialGrid.addEntities(this.viruses.data, 'virus');
        this.spatialGrid.addEntities(this.massFood.data, 'mass');
        
        // Add all player cells to spatial grid
        for (let player of this.players.data) {
            for (let cell of player.cells) {
                this.spatialGrid.addEntity(cell, 'player', player);
            }
        }
        
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

        for (let currentPlayer of this.players.data) {
            // PERFORMANCE BOOST: Only check entities in nearby grid cells instead of ALL entities
            const nearbyEntities = this.spatialGrid.getNearbyEntities(currentPlayer);
            
            // Same exact visibility logic, but operating on 90% fewer entities
            var visibleFood = nearbyEntities.food.filter(entity => isVisibleEntity(entity, currentPlayer, false));
            var visibleViruses = nearbyEntities.virus.filter(entity => isVisibleEntity(entity, currentPlayer));
            var visibleMass = nearbyEntities.mass.filter(entity => isVisibleEntity(entity, currentPlayer));

            var visiblePlayers = [];
            const addedPlayerIds = new Set(); // Prevent duplicate players
            for (let playerData of nearbyEntities.player) {
                if (!addedPlayerIds.has(playerData.player.id) && isVisibleEntity(playerData.cell, currentPlayer)) {
                    visiblePlayers.push(extractData(playerData.player));
                    addedPlayerIds.add(playerData.player.id);
                }
            }

            callback(extractData(currentPlayer), visiblePlayers, visibleFood, visibleMass, visibleViruses);
        }
    }
}
