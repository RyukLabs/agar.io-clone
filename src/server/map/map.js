"use strict";

const {isVisibleEntity} = require("../lib/entityUtils");

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
        // HIGH-PERFORMANCE: Use spatial partitioning for visibility culling
        const { QuadTree, Rectangle, Point } = require('../lib/quadtree');
        const boundary = new Rectangle(2500, 2500, 2500, 2500);
        const spatialIndex = new QuadTree(boundary, 15, 4); // Optimized for visibility queries
        
        // Insert all entities into spatial index ONCE
        this.food.data.forEach(food => {
            if (food) spatialIndex.insert(new Point(food.x, food.y, { type: 'food', entity: food }));
        });
        this.viruses.data.forEach(virus => {
            if (virus) spatialIndex.insert(new Point(virus.x, virus.y, { type: 'virus', entity: virus }));
        });
        this.massFood.data.forEach(mass => {
            if (mass) spatialIndex.insert(new Point(mass.x, mass.y, { type: 'massFood', entity: mass }));
        });
        this.players.data.forEach(player => {
            player.cells.forEach(cell => {
                if (cell) spatialIndex.insert(new Point(cell.x, cell.y, { type: 'player', entity: player, cell: cell }));
            });
        });

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
            // Calculate view area based on player's largest cell
            const maxCellRadius = Math.max(...currentPlayer.cells.map(cell => cell.radius), 50);
            const viewRadius = maxCellRadius * 2.5; // Viewport calculation
            
            // Query only entities within view using spatial partitioning
            const visiblePoints = spatialIndex.queryCircle(currentPlayer, viewRadius);
            
            const visibleFood = [];
            const visibleViruses = [];
            const visibleMass = [];
            const visiblePlayerMap = new Map();
            
            // Process spatial query results
            for (let point of visiblePoints) {
                const { type, entity, cell } = point.userData;
                
                switch (type) {
                    case 'food':
                        if (isVisibleEntity(entity, currentPlayer, false)) {
                            visibleFood.push(entity);
                        }
                        break;
                    case 'virus':
                        if (isVisibleEntity(entity, currentPlayer)) {
                            visibleViruses.push(entity);
                        }
                        break;
                    case 'massFood':
                        if (isVisibleEntity(entity, currentPlayer)) {
                            visibleMass.push(entity);
                        }
                        break;
                    case 'player':
                        if (entity.id !== currentPlayer.id && isVisibleEntity(cell, currentPlayer)) {
                            visiblePlayerMap.set(entity.id, entity);
                        }
                        break;
                }
            }
            
            const visiblePlayers = Array.from(visiblePlayerMap.values()).map(extractData);

            callback(extractData(currentPlayer), visiblePlayers, visibleFood, visibleMass, visibleViruses);
        }
    }
}
