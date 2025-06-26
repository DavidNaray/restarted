//track all tiles 
class GlobalInstanceManager {
    constructor() {
        this.tiles = new Map();//tiles have utility
        this.meshToTiles=new WeakMap();      //for mesh -> tile lookup
        this.allTileMeshes=[];          //for raycast intersects
        this.divisions = new Map();     // divisionName → DivisionInfo (only *unassigned* divisions here)
        this.armies = new Map();        // armyName => Map<divisionName, DivisionInfo>
    }
    getTile(x, y) {
        return this.tiles.get(`${x},${y}`);
    }
    
    registerTile(tile) {
        this.tiles.set(`${tile.x},${tile.y}`, tile);
    }

    getTileByWorldPosition(x, z) {
        const tileX = Math.floor(x / tileSize); // tileSize known
        const tileY = Math.floor(z / tileSize);
        return this.getTile(tileX, tileY);
    }

    createDivision(divisionName, metadata = {}) {
        if (this.divisions.has(divisionName) || this.findDivisionInArmies(divisionName)) {
            throw new Error(`Division '${divisionName}' already exists globally.`);
        }
        const division = {
            name: divisionName,
            instanceGroups: new Set(),
            army: null,
            metadata
        };
        this.divisions.set(divisionName, division);
        return division;
    }

    assignDivisionToArmy(divisionName, armyName) {
        const division = this.divisions.get(divisionName);
        if (!division) throw new Error(`Division '${divisionName}' does not exist in unassigned divisions.`);

        let army = this.armies.get(armyName);
        if (!army) {
            army = new Map();
            this.armies.set(armyName, army);
        }

        division.army = armyName;
        army.set(divisionName, division);
        this.divisions.delete(divisionName); // REMOVE from unassigned
    }

    findDivisionInArmies(divisionName) {
        for (const army of this.armies.values()) {
            if (army.has(divisionName)) return army.get(divisionName);
        }
        return null;
    }

    unassignDivisionFromArmy(armyName,divisionName) {
        const army = this.armies.get(armyName);
        if (!army) throw new Error(`Army '${armyName}' does not exist.`);
    
        const division = army.get(divisionName);
        if (!division) throw new Error(`Division '${divisionName}' does not exist in Army '${armyName}'.`);
    
        if (this.divisions.has(divisionName)) {
            throw new Error(`Cannot unassign division '${divisionName}' because an unassigned division with that name already exists.`);
        }
    
        army.delete(divisionName);
        division.army = null;
        this.divisions.set(divisionName, division);
    }

    getDivisionAnywhere(divisionName) {
        return this.divisions.get(divisionName) || this.findDivisionInArmies(divisionName);
    }

}

export const globalmanager=new GlobalInstanceManager();