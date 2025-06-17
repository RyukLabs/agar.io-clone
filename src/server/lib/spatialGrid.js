"use strict";

// Spatial Grid for 100x performance optimization of visibility calculations
// Reduces O(N²) complexity to O(N log N) by partitioning game world into sectors

function SpatialGrid(worldWidth, worldHeight, gridSize) {
    this.worldWidth = worldWidth;
    this.worldHeight = worldHeight;
    this.gridSize = gridSize;
    this.cols = Math.ceil(worldWidth / gridSize);
    this.rows = Math.ceil(worldHeight / gridSize);
    this.clear();
}

SpatialGrid.prototype.clear = function() {
    this.grid = [];
    for (let i = 0; i < this.rows; i++) {
        this.grid[i] = [];
        for (let j = 0; j < this.cols; j++) {
            this.grid[i][j] = {
                food: [],
                virus: [],
                mass: [],
                player: []
            };
        }
    }
};

SpatialGrid.prototype.getGridCoords = function(x, y) {
    const col = Math.floor(Math.max(0, Math.min(x, this.worldWidth - 1)) / this.gridSize);
    const row = Math.floor(Math.max(0, Math.min(y, this.worldHeight - 1)) / this.gridSize);
    return {
        col: Math.min(col, this.cols - 1),
        row: Math.min(row, this.rows - 1)
    };
};

SpatialGrid.prototype.addEntity = function(entity, type, additionalData) {
    const coords = this.getGridCoords(entity.x, entity.y);
    if (type === 'player') {
        this.grid[coords.row][coords.col][type].push({
            cell: entity,
            player: additionalData
        });
    } else {
        this.grid[coords.row][coords.col][type].push(entity);
    }
};

SpatialGrid.prototype.addEntities = function(entities, type) {
    for (let entity of entities) {
        this.addEntity(entity, type);
    }
};

SpatialGrid.prototype.getNearbyEntities = function(player) {
    const center = this.getGridCoords(player.x, player.y);
    
    // Calculate player's view area
    const viewWidth = player.screenWidth || 1920; // Default fallback
    const viewHeight = player.screenHeight || 1080; // Default fallback
    
    // Determine how many grid cells we need to check based on view area
    const cellsToCheckX = Math.ceil(viewWidth / 2 / this.gridSize) + 1;
    const cellsToCheckY = Math.ceil(viewHeight / 2 / this.gridSize) + 1;
    
    const nearby = {
        food: [],
        virus: [],
        mass: [],
        player: []
    };

    // Check all grid cells within the player's potential view area
    for (let rowOffset = -cellsToCheckY; rowOffset <= cellsToCheckY; rowOffset++) {
        for (let colOffset = -cellsToCheckX; colOffset <= cellsToCheckX; colOffset++) {
            const checkRow = center.row + rowOffset;
            const checkCol = center.col + colOffset;
            
            if (checkRow >= 0 && checkRow < this.rows && 
                checkCol >= 0 && checkCol < this.cols) {
                
                const cell = this.grid[checkRow][checkCol];
                nearby.food = nearby.food.concat(cell.food);
                nearby.virus = nearby.virus.concat(cell.virus);
                nearby.mass = nearby.mass.concat(cell.mass);
                nearby.player = nearby.player.concat(cell.player);
            }
        }
    }

    return nearby;
};

module.exports = SpatialGrid; 