"use strict";

const util = require('../lib/util');
const SAT = require('sat');

// Portal states
const PORTAL_STATES = {
    HIDDEN: 'hidden',
    WARNING: 'warning',    // Transparent phase
    ACTIVE: 'active',      // Visible and deadly
    DISAPPEARING: 'disappearing'
};

exports.Portal = class {
    constructor(position, mass, config) {
        this.id = util.randomInRange(0, 99999);
        this.x = position.x;
        this.y = position.y;
        this.radius = util.massToRadius(mass);
        this.mass = mass;
        this.fill = config.fill;
        this.stroke = config.stroke;
        this.strokeWidth = config.strokeWidth;
        
        // State management
        this.state = PORTAL_STATES.WARNING;
        this.createdAt = Date.now();
        this.warningDuration = config.warningDuration;
        this.activeDuration = config.activeDuration;
        this.opacity = 0.3; // Start transparent
    }

    update() {
        const now = Date.now();
        const elapsed = now - this.createdAt;
        
        if (elapsed < this.warningDuration) {
            // Warning phase - transparent
            this.state = PORTAL_STATES.WARNING;
            this.opacity = 0.3;
        } else if (elapsed < this.warningDuration + this.activeDuration) {
            // Active phase - fully visible and deadly
            this.state = PORTAL_STATES.ACTIVE;
            this.opacity = 1.0;
        } else {
            // Disappearing phase
            this.state = PORTAL_STATES.DISAPPEARING;
            this.opacity = 0;
        }
    }

    isActive() {
        return this.state === PORTAL_STATES.ACTIVE;
    }

    isVisible() {
        return this.state === PORTAL_STATES.WARNING || this.state === PORTAL_STATES.ACTIVE;
    }

    shouldBeRemoved() {
        return this.state === PORTAL_STATES.DISAPPEARING;
    }

    toCircle() {
        return new SAT.Circle(new SAT.Vector(this.x, this.y), this.radius);
    }

    // Return data for client
    getClientData() {
        return {
            id: this.id,
            x: this.x,
            y: this.y,
            radius: this.radius,
            mass: this.mass,
            fill: this.fill,
            stroke: this.stroke,
            strokeWidth: this.strokeWidth,
            state: this.state,
            opacity: this.opacity
        };
    }
};

exports.PortalManager = class {
    constructor() {
        this.data = [];
        this.lastWaveSpawnTime = Date.now() - 10000; // Start immediately
        this.waveActive = false;
    }

    update(config) {
        const now = Date.now();
        

        
        // Update existing portals
        this.data.forEach(portal => portal.update());
        
        // Check if current wave should end (all portals expired)
        if (this.waveActive && this.data.length > 0) {
            const anyPortalsVisible = this.data.some(portal => portal.isVisible());
            if (!anyPortalsVisible) {
                // All portals in current wave have expired
                console.log('[INFO] Portal wave ended - all portals expired');
                this.data = []; // Clear all expired portals
                this.waveActive = false;
                this.lastWaveSpawnTime = now; // Start cooldown timer
            }
        }
        
        // Check if we should spawn a new wave
        const timeSinceLastWave = now - this.lastWaveSpawnTime;
        
        if (!this.waveActive && timeSinceLastWave >= config.portal.waveSpawnInterval) {
            
            this.spawnWave(config);
            this.waveActive = true;
            this.lastWaveSpawnTime = now;
        }
        

    }

    spawnWave(config) {
        // Clear any existing portals before spawning new wave
        this.data = [];
        
        // Spawn all portals for this wave simultaneously
        for (let i = 0; i < config.portal.maxSimultaneous; i++) {
            const mass = util.randomInRange(config.portal.defaultMass.from, config.portal.defaultMass.to);
            const radius = util.massToRadius(mass);
            
            let position;
            if (config.portal.uniformDisposition) {
                position = util.uniformPosition(this.data, radius);
            } else {
                position = util.randomPosition(radius);
            }

            if (position) {
                const portal = new exports.Portal(position, mass, config.portal);
                this.data.push(portal);
                console.log('[INFO] Wave portal', i + 1, 'spawned at', position.x, position.y, 'with mass', mass);
            } else {
                console.log('[WARNING] Failed to find position for wave portal', i + 1);
            }
        }
        
        console.log('[INFO] Portal wave spawned with', this.data.length, 'portals');
    }

    // Get only visible portals for clients
    getVisiblePortals() {
        const visiblePortals = this.data
            .filter(portal => portal.isVisible())
            .map(portal => portal.getClientData());
        
        // if (visiblePortals.length > 0) {
        //     console.log('[DEBUG] Wave visible portals:', visiblePortals.length, 'states:', visiblePortals.map(p => p.state));
        // }
        
        return visiblePortals;
    }

    // Get only active (deadly) portals for collision detection
    getActivePortals() {
        return this.data.filter(portal => portal.isActive());
    }

    addNew(spawnAttempts, config) {
        // This method is kept for compatibility but wave spawning handles portal creation
    }

    delete(portalIndexes) {
        if (portalIndexes.length > 0) {
            this.data = util.removeIndexes(this.data, portalIndexes);
        }
    }

    removePortalByIndex(index) {
        this.data.splice(index, 1);
    }

    removeExcess(amount) {
        while (this.data.length > 0 && amount > 0) {
            this.data.shift();
            amount--;
        }
    }
}; 