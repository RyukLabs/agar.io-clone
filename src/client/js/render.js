const FULL_ANGLE = 2 * Math.PI;

// Animation timing
let animationTime = 0;

const drawRoundObject = (position, radius, graph) => {
    graph.beginPath();
    graph.arc(position.x, position.y, radius, 0, FULL_ANGLE);
    graph.closePath();
    graph.fill();
    graph.stroke();
}

const drawCircle = (position, radius, sides, graph) => {
    let pointCount = sides;
    graph.beginPath();
    let firstPoint = true;
    for (let theta = 0; theta < FULL_ANGLE; theta += FULL_ANGLE / pointCount) {
        let point = {
            x: position.x + radius * Math.cos(theta),
            y: position.y + radius * Math.sin(theta)
        };
        if (firstPoint) {
            graph.moveTo(point.x, point.y);
            firstPoint = false;
        } else {
            graph.lineTo(point.x, point.y);
        }
    }
    graph.closePath();
    graph.fill();
    graph.stroke();
}

// Jiggly animation functions
const getJiggleOffset = (angle, time, intensity = 1) => {
    return Math.sin(time * 0.008 + angle * 3) * intensity;
}

const drawJigglyCircle = (position, radius, sides, intensity, graph) => {
    let pointCount = sides;
    graph.beginPath();
    let firstPoint = true;
    
    for (let i = 0; i < pointCount; i++) {
        let theta = (i / pointCount) * FULL_ANGLE;
        let jiggle = getJiggleOffset(theta, animationTime, intensity);
        let point = {
            x: position.x + (radius + jiggle) * Math.cos(theta),
            y: position.y + (radius + jiggle) * Math.sin(theta)
        };
        
        if (firstPoint) {
            graph.moveTo(point.x, point.y);
            firstPoint = false;
        } else {
            graph.lineTo(point.x, point.y);
        }
    }
    graph.closePath();
    graph.fill();
    graph.stroke();
}

const drawFood = (position, food, graph) => {
    graph.fillStyle = 'hsl(' + food.hue + ', 100%, 50%)';
    graph.strokeStyle = 'hsl(' + food.hue + ', 100%, 45%)';
    graph.lineWidth = 0;
    
    // Add subtle jiggle to food particles
    const jiggleIntensity = food.radius * 0.027635625;
    drawJigglyCircle(position, food.radius, 12, jiggleIntensity, graph);
};

const drawVirus = (position, virus, graph) => {
    graph.strokeStyle = virus.stroke;
    graph.fillStyle = virus.fill;
    graph.lineWidth = Math.max(virus.strokeWidth * 0.5, 1); // Reduced border width by 50%
    
    // Draw main circular body first
    graph.beginPath();
    graph.arc(position.x, position.y, virus.radius, 0, FULL_ANGLE);
    graph.fill();
    graph.stroke();
    
    // Add tiny spikes around the edge like agar.io
    const spikeCount = 20; // More spikes for authentic look
    const baseRadius = virus.radius;
    const spikeLength = baseRadius * 0.15; // Tiny spikes - only 15% of radius
    
    graph.strokeStyle = virus.stroke;
    graph.lineWidth = Math.max(virus.strokeWidth * 0.3, 0.5); // Even thinner for spikes
    
    for (let i = 0; i < spikeCount; i++) {
        const angle = (i / spikeCount) * FULL_ANGLE;
        
        // Add slight randomness to spike angles and lengths for organic look
        const angleVariation = (Math.sin(angle * 3 + animationTime * 0.002) * 0.1);
        const lengthVariation = (Math.sin(angle * 5 + animationTime * 0.003) * 0.3 + 1);
        
        const spikeAngle = angle + angleVariation;
        const currentSpikeLength = spikeLength * lengthVariation;
        
        // Start point on the edge of the circle
        const startX = position.x + baseRadius * Math.cos(spikeAngle);
        const startY = position.y + baseRadius * Math.sin(spikeAngle);
        
        // End point of the spike
        const endX = position.x + (baseRadius + currentSpikeLength) * Math.cos(spikeAngle);
        const endY = position.y + (baseRadius + currentSpikeLength) * Math.sin(spikeAngle);
        
        // Draw the spike line
        graph.beginPath();
        graph.moveTo(startX, startY);
        graph.lineTo(endX, endY);
        graph.stroke();
    }
}

const drawPortal = (position, portal, graph) => {
    graph.save();
    
    // Apply opacity based on portal state
    graph.globalAlpha = portal.opacity || 1.0;
    
    // Enhanced sci-fi portal effects with time-based animations
    const time = animationTime * 0.01;
    const fastTime = animationTime * 0.03;
    
    // Pulsing effect - more intense when active
    const pulseIntensity = portal.state === 'active' ? 8 : 3;
    const pulseSpeed = portal.state === 'active' ? 0.02 : 0.01;
    const pulseRadius = portal.radius + Math.sin(time * pulseSpeed * 100) * pulseIntensity;
    
    // Draw outer energy field
    if (portal.state === 'active') {
        // Outer energy field with gradient
        const gradient = graph.createRadialGradient(
            position.x, position.y, pulseRadius * 0.5,
            position.x, position.y, pulseRadius + 30
        );
        gradient.addColorStop(0, portal.fill + '00');
        gradient.addColorStop(0.7, portal.fill + '40');
        gradient.addColorStop(1, portal.fill + '10');
        
        graph.fillStyle = gradient;
        graph.beginPath();
        graph.arc(position.x, position.y, pulseRadius + 30, 0, 2 * Math.PI);
        graph.fill();
    } else if (portal.state === 'warning') {
        // Gentle warning glow
        graph.beginPath();
        graph.arc(position.x, position.y, pulseRadius + 10, 0, 2 * Math.PI);
        graph.fillStyle = portal.fill + '20';
        graph.fill();
    }
    
    // Draw main portal rim
    graph.strokeStyle = portal.fill;
    graph.lineWidth = portal.state === 'active' ? 4 : 2;
    graph.beginPath();
    graph.arc(position.x, position.y, pulseRadius, 0, 2 * Math.PI);
    graph.stroke();
    
    // Draw spiral lines emanating from center
    const spiralCount = portal.state === 'active' ? 6 : 3;
    const spiralRotationSpeed = portal.state === 'active' ? 0.04 : 0.02;
    const spiralRotation = time * spiralRotationSpeed * 100;
    
    graph.lineWidth = portal.state === 'active' ? 3 : 2;
    
    for (let i = 0; i < spiralCount; i++) {
        const baseAngle = (i / spiralCount) * FULL_ANGLE + spiralRotation;
        
        // Draw spiral arms
        graph.beginPath();
        graph.strokeStyle = portal.fill + (portal.state === 'active' ? 'AA' : '60');
        
        let firstPoint = true;
        const maxRadius = pulseRadius * 0.9;
        const steps = 20;
        
        for (let step = 0; step < steps; step++) {
            const progress = step / steps;
            const currentRadius = maxRadius * progress;
            
            // Create spiral effect
            const spiralTurns = portal.state === 'active' ? 2 : 1.5;
            const angle = baseAngle + progress * spiralTurns * FULL_ANGLE;
            
            // Add some wave motion to the spiral
            const wave = Math.sin(progress * 8 + fastTime * 100) * currentRadius * 0.1;
            const adjustedRadius = currentRadius + wave;
            
            const x = position.x + adjustedRadius * Math.cos(angle);
            const y = position.y + adjustedRadius * Math.sin(angle);
            
            if (firstPoint) {
                graph.moveTo(x, y);
                firstPoint = false;
            } else {
                graph.lineTo(x, y);
            }
        }
        graph.stroke();
        
        // Draw energy particles along the spiral
        if (portal.state === 'active') {
            const particleCount = 4;
            for (let p = 0; p < particleCount; p++) {
                const particleProgress = (p / particleCount + time * 0.5) % 1;
                const particleRadius = maxRadius * particleProgress;
                const particleAngle = baseAngle + particleProgress * 2 * FULL_ANGLE;
                
                const px = position.x + particleRadius * Math.cos(particleAngle);
                const py = position.y + particleRadius * Math.sin(particleAngle);
                
                graph.fillStyle = '#FFFFFF';
                graph.beginPath();
                graph.arc(px, py, 2, 0, 2 * Math.PI);
                graph.fill();
            }
        }
    }
    
    // Draw central core with pulsing effect
    if (portal.state === 'active') {
        // Outer core ring
        const coreRadius = pulseRadius * 0.3;
        const corePulse = Math.sin(fastTime * 150) * 3;
        
        graph.fillStyle = portal.fill + '80';
        graph.beginPath();
        graph.arc(position.x, position.y, coreRadius + corePulse, 0, 2 * Math.PI);
        graph.fill();
        
        // Inner black hole
        graph.fillStyle = '#000000';
        graph.beginPath();
        graph.arc(position.x, position.y, coreRadius * 0.6, 0, 2 * Math.PI);
        graph.fill();
        
        // Energy ring around black hole
        graph.strokeStyle = '#FFFFFF';
        graph.lineWidth = 1;
        graph.beginPath();
        graph.arc(position.x, position.y, coreRadius * 0.6 + 2, 0, 2 * Math.PI);
        graph.stroke();
        
    } else if (portal.state === 'warning') {
        // Smaller, less intense center for warning state
        const coreRadius = pulseRadius * 0.2;
        graph.fillStyle = '#444444';
        graph.beginPath();
        graph.arc(position.x, position.y, coreRadius, 0, 2 * Math.PI);
        graph.fill();
    }
    
    graph.restore();
}

const drawFireFood = (position, mass, playerConfig, graph) => {
    graph.strokeStyle = 'hsl(' + mass.hue + ', 100%, 45%)';
    graph.fillStyle = 'hsl(' + mass.hue + ', 100%, 50%)';
    graph.lineWidth = playerConfig.border + 2;
    
    // Add jiggle to fire food
    const jiggleIntensity = mass.radius * 0.08;
    drawJigglyCircle(position, mass.radius - 1, 16, jiggleIntensity, graph);
};

const circlePoint = (position, radius, theta) => ({
    x: position.x + radius * Math.cos(theta),
    y: position.y + radius * Math.sin(theta)
});

const cellTouchingBorders = (cell, borders) => {
    return cell.x - cell.radius <= borders.left ||
           cell.x + cell.radius >= borders.right ||
           cell.y - cell.radius <= borders.top ||
           cell.y + cell.radius >= borders.bottom;
}

const regulatePoint = (point, borders) => {
    if (point.x < borders.left) {
        point.x = borders.left;
    } else if (point.x > borders.right) {
        point.x = borders.right;
    }

    if (point.y < borders.top) {
        point.y = borders.top;
    } else if (point.y > borders.bottom) {
        point.y = borders.bottom;
    }

    return point;
}

const drawCellWithLines = (cell, borders, graph) => {
    let pointCount = 30 + ~~(cell.mass / 5);
    let points = [];
    
    // Add jiggle to cell border points
    const jiggleIntensity = Math.max(cell.radius * 0.008290688, 0.276356);
    
    for (let i = 0; i < pointCount; i++) {
        let theta = (i / pointCount) * FULL_ANGLE;
        let jiggle = getJiggleOffset(theta, animationTime, jiggleIntensity);
        let point = circlePoint(cell, cell.radius + jiggle, theta);
        points.push(regulatePoint(point, borders));
    }
    graph.beginPath();
    graph.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
        graph.lineTo(points[i].x, points[i].y);
    }
    graph.closePath();
    graph.fill();
    graph.stroke();
}

const drawJigglyRoundObject = (position, radius, intensity, graph) => {
    const pointCount = Math.max(24, Math.floor(radius / 2));
    graph.beginPath();
    let firstPoint = true;
    
    for (let i = 0; i < pointCount; i++) {
        let theta = (i / pointCount) * FULL_ANGLE;
        let jiggle = getJiggleOffset(theta, animationTime, intensity);
        let point = {
            x: position.x + (radius + jiggle) * Math.cos(theta),
            y: position.y + (radius + jiggle) * Math.sin(theta)
        };
        
        if (firstPoint) {
            graph.moveTo(point.x, point.y);
            firstPoint = false;
        } else {
            graph.lineTo(point.x, point.y);
        }
    }
    graph.closePath();
    graph.fill();
    graph.stroke();
}

const drawCells = (cells, playerConfig, toggleMassState, borders, graph) => {
    // Update animation time
    animationTime = Date.now();
    
    // Check if player is in split mode (has multiple cells)
    const isInSplitMode = cells.length > 1;
    
    for (let cell of cells) {
        // Draw the cell itself
        graph.fillStyle = cell.color;
        graph.strokeStyle = cell.borderColor;
        graph.lineWidth = 6;
        
        if (cellTouchingBorders(cell, borders)) {
            // Assemble the cell from lines with jiggle
            drawCellWithLines(cell, borders, graph);
        } else {
            // Draw jiggly circle for cells
            const jiggleIntensity = Math.max(cell.radius * 0.011054250, 0.44217);
            drawJigglyRoundObject(cell, cell.radius, jiggleIntensity, graph);
        }

        // Draw primary cell indicator (black border) when in split mode
        if (isInSplitMode && cell.isPrimary) {
            graph.strokeStyle = '#000000';
            graph.lineWidth = Math.max(cell.radius * 0.08, 3);
            
            // Make primary border slightly jiggly too
            const borderJiggle = Math.max(cell.radius * 0.005527125, 0.165814);
            const borderPointCount = Math.max(30, Math.floor(cell.radius / 1.5));
            
            graph.beginPath();
            let firstPoint = true;
            for (let i = 0; i < borderPointCount; i++) {
                let theta = (i / borderPointCount) * FULL_ANGLE;
                let jiggle = getJiggleOffset(theta, animationTime, borderJiggle);
                let borderRadius = cell.radius + graph.lineWidth / 2 + jiggle;
                let point = {
                    x: cell.x + borderRadius * Math.cos(theta),
                    y: cell.y + borderRadius * Math.sin(theta)
                };
                
                if (firstPoint) {
                    graph.moveTo(point.x, point.y);
                    firstPoint = false;
                } else {
                    graph.lineTo(point.x, point.y);
                }
            }
            graph.closePath();
            graph.stroke();
        }

        // Draw the name of the player
        let fontSize = Math.max(cell.radius / 3, 12);
        graph.lineWidth = playerConfig.textBorderSize;
        graph.fillStyle = playerConfig.textColor;
        graph.strokeStyle = playerConfig.textBorder;
        graph.miterLimit = 1;
        graph.lineJoin = 'round';
        graph.textAlign = 'center';
        graph.textBaseline = 'middle';
        graph.font = 'bold ' + fontSize + 'px sans-serif';
        graph.strokeText(cell.name, cell.x, cell.y);
        graph.fillText(cell.name, cell.x, cell.y);

        // Draw the mass (if enabled)
        if (toggleMassState === 1) {
            graph.font = 'bold ' + Math.max(fontSize / 3 * 2, 10) + 'px sans-serif';
            if (cell.name.length === 0) fontSize = 0;
            graph.strokeText(Math.round(cell.mass), cell.x, cell.y + fontSize);
            graph.fillText(Math.round(cell.mass), cell.x, cell.y + fontSize);
        }
    }
};

const drawGrid = (global, player, screen, graph) => {
    graph.lineWidth = 1;
    graph.strokeStyle = global.lineColor;
    graph.globalAlpha = 0.15;
    graph.beginPath();

    for (let x = -player.x; x < screen.width; x += screen.height / 18) {
        graph.moveTo(x, 0);
        graph.lineTo(x, screen.height);
    }

    for (let y = -player.y; y < screen.height; y += screen.height / 18) {
        graph.moveTo(0, y);
        graph.lineTo(screen.width, y);
    }

    graph.stroke();
    graph.globalAlpha = 1;
};

const drawBorder = (borders, graph) => {
    graph.lineWidth = 1;
    graph.strokeStyle = '#000000'
    graph.beginPath()
    graph.moveTo(borders.left, borders.top);
    graph.lineTo(borders.right, borders.top);
    graph.lineTo(borders.right, borders.bottom);
    graph.lineTo(borders.left, borders.bottom);
    graph.closePath()
    graph.stroke();
};

const drawErrorMessage = (message, graph, screen) => {
    graph.fillStyle = '#333333';
    graph.fillRect(0, 0, screen.width, screen.height);
    graph.textAlign = 'center';
    graph.fillStyle = '#FFFFFF';
    graph.font = 'bold 30px sans-serif';
    graph.fillText(message, screen.width / 2, screen.height / 2);
}

const drawMapBorders = (mapWidth, mapHeight, graph) => {
    graph.strokeStyle = '#ffffff';
    graph.lineWidth = 10;
    graph.beginPath();
    graph.rect(0, 0, mapWidth, mapHeight);
    graph.stroke();
    
    // Add a subtle background for the map area
    graph.fillStyle = 'rgba(255, 255, 255, 0.02)';
    graph.fillRect(0, 0, mapWidth, mapHeight);
};

const drawSpectatorUI = (spectatorZoom, portals, graph) => {
    // Draw zoom indicator
    graph.fillStyle = 'rgba(0, 0, 0, 0.5)';
    graph.fillRect(10, 10, 200, 80);
    
    graph.strokeStyle = '#ffffff';
    graph.lineWidth = 2;
    graph.strokeRect(10, 10, 200, 80);
    
    graph.fillStyle = '#ffffff';
    graph.font = '14px Arial';
    graph.textAlign = 'left';
    graph.fillText('Zoom: ' + (spectatorZoom.scale * 100).toFixed(0) + '%', 20, 30);
    graph.fillText('Mouse wheel: Zoom', 20, 45);
    graph.fillText('Click & drag: Pan', 20, 60);
    
    // Show portal count or wave status
    graph.fillText('Portals: ' + (portals?.length || 0), 20, 75);
};

module.exports = {
    drawFood,
    drawVirus,
    drawPortal,
    drawFireFood,
    drawCells,
    drawErrorMessage,
    drawGrid,
    drawBorder,
    drawMapBorders,
    drawSpectatorUI
};