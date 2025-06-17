/*jslint bitwise: true, node: true */
'use strict';

/**
 * High-performance Quadtree for spatial partitioning
 * Optimizes collision detection from O(n²) to O(n log n)
 * Designed for AWS production environments
 */

class Rectangle {
    constructor(x, y, width, height) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
    }

    contains(point) {
        return (point.x >= this.x - this.width &&
                point.x <= this.x + this.width &&
                point.y >= this.y - this.height &&
                point.y <= this.y + this.height);
    }

    intersects(range) {
        return !(range.x - range.width > this.x + this.width ||
                 range.x + range.width < this.x - this.width ||
                 range.y - range.height > this.y + this.height ||
                 range.y + range.height < this.y - this.height);
    }
}

class Point {
    constructor(x, y, userData) {
        this.x = x;
        this.y = y;
        this.userData = userData;
    }
}

class QuadTree {
    constructor(boundary, maxPoints = 10, maxDepth = 5, depth = 0) {
        this.boundary = boundary;
        this.maxPoints = maxPoints;
        this.maxDepth = maxDepth;
        this.depth = depth;
        this.points = [];
        this.divided = false;
        
        // Quadrants
        this.northeast = null;
        this.northwest = null;
        this.southeast = null;
        this.southwest = null;
    }

    insert(point) {
        if (!this.boundary.contains(point)) {
            return false;
        }

        if (this.points.length < this.maxPoints && !this.divided) {
            this.points.push(point);
            return true;
        }

        if (!this.divided) {
            this.subdivide();
        }

        return (this.northeast.insert(point) ||
                this.northwest.insert(point) ||
                this.southeast.insert(point) ||
                this.southwest.insert(point));
    }

    subdivide() {
        const x = this.boundary.x;
        const y = this.boundary.y;
        const w = this.boundary.width / 2;
        const h = this.boundary.height / 2;

        const ne = new Rectangle(x + w, y - h, w, h);
        const nw = new Rectangle(x - w, y - h, w, h);
        const se = new Rectangle(x + w, y + h, w, h);
        const sw = new Rectangle(x - w, y + h, w, h);

        this.northeast = new QuadTree(ne, this.maxPoints, this.maxDepth, this.depth + 1);
        this.northwest = new QuadTree(nw, this.maxPoints, this.maxDepth, this.depth + 1);
        this.southeast = new QuadTree(se, this.maxPoints, this.maxDepth, this.depth + 1);
        this.southwest = new QuadTree(sw, this.maxPoints, this.maxDepth, this.depth + 1);

        this.divided = true;

        // Redistribute existing points
        for (let point of this.points) {
            this.northeast.insert(point) ||
            this.northwest.insert(point) ||
            this.southeast.insert(point) ||
            this.southwest.insert(point);
        }
        this.points = [];
    }

    query(range, found = []) {
        if (!this.boundary.intersects(range)) {
            return found;
        }

        for (let point of this.points) {
            if (range.contains(point)) {
                found.push(point);
            }
        }

        if (this.divided) {
            this.northeast.query(range, found);
            this.northwest.query(range, found);
            this.southeast.query(range, found);
            this.southwest.query(range, found);
        }

        return found;
    }

    queryCircle(center, radius, found = []) {
        const range = new Rectangle(center.x, center.y, radius, radius);
        const candidates = this.query(range);
        
        for (let point of candidates) {
            const dx = point.x - center.x;
            const dy = point.y - center.y;
            const distSq = dx * dx + dy * dy;
            if (distSq <= radius * radius) {
                found.push(point);
            }
        }
        
        return found;
    }

    clear() {
        this.points = [];
        this.divided = false;
        this.northeast = null;
        this.northwest = null;
        this.southeast = null;
        this.southwest = null;
    }

    // Get all points in the quadtree
    getAllPoints(found = []) {
        found.push(...this.points);
        
        if (this.divided) {
            this.northeast.getAllPoints(found);
            this.northwest.getAllPoints(found);
            this.southeast.getAllPoints(found);
            this.southwest.getAllPoints(found);
        }
        
        return found;
    }
}

module.exports = {
    QuadTree,
    Rectangle,
    Point
}; 