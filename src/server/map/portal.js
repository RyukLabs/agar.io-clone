"use strict";

const util = require('../lib/util');
const SAT = require('sat');

exports.Portal = class {
    constructor(position, mass) {
        this.id = util.randomInRange(0, 99999);
        this.x = position.x;
        this.y = position.y;
        this.radius = util.massToRadius(mass);
        this.mass = mass;
        this.fill = "#ff0066";
        this.stroke = "#cc0044";
        this.strokeWidth = 25;
    }

    toCircle() {
        return new SAT.Circle(new SAT.Vector(this.x, this.y), this.radius);
    }
};

exports.PortalManager = class {
    constructor() {
        this.data = [];
    }

    addNew(spawnAttempts, config) {
        let success = 0;
        for (let i = 0; i < spawnAttempts && success < spawnAttempts; i++) {
            const mass = util.randomInRange(config.portal.defaultMass.from, config.portal.defaultMass.to);
            
            let position;
            if (config.portal.uniformDisposition) {
                position = util.uniformPosition(this.data, config.gameWidth, config.gameHeight, 100);
            } else {
                position = util.randomPosition(config.gameWidth, config.gameHeight);
            }

            if (position) {
                this.data.push(new exports.Portal(position, mass));
                success++;
            }
        }
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