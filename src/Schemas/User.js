const mongoose = require('mongoose');
const { WaterRefractionShader } = require('three/examples/jsm/Addons.js');

const userSchema = new mongoose.Schema({
  username: { type: String, unique: true },
  passwordHash: String,  // store hashed password here
  OriginTile:[Number],//which tile is centered on 0,0, the rest of the tiles built around
  refreshTokens: [String],  // Store issued refresh tokens (optional)
  Resources:{
    Gold:{
        Total:{ type: Number, default: 0 },
        Rate:{type: Number, default: 1}, 
    },
    
    Stone:{
        Total:{ type: Number, default: 0 },
        Rate:{type: Number, default: 0}, 
    },

    Wood:{
        Total:{ type: Number, default: 0 },
        Rate:{type: Number, default: 1}, 
    },
    
    Political:{
        Total:{ type: Number, default: 0 },
        Rate:{type: Number, default: 0}, 
    },
    

    Stability:{
        Total:{ type: Number, default: 50 },
        Influence:{type: String, default: "Base: 50%"}, 
    },

    WarSupport:{
        Total:{ type: Number, default: 50 },
        Influence:{type: String, default: "Base: 50%"}, 
    },

    ManPower:{
        TotalManPower:{type: Number, default: 0},
        TotalPopulation:{type: Number, default: 50},
        PopulationRate:{type: Number, default: 0.1},
        RecruitableFactor:{type: Number, default: 0.1},
        MaxPopulation:{type: Number, default: 100},
    },

    lastUpdated: { type: Date, default: Date.now }

  },
  Technology:{
    Bows: { type: Boolean, default: true },
    Swords: { type: Boolean, default: true },
    Shields: { type: Boolean, default: true },
    Spears: { type: Boolean, default: true },
    LeatherArmour: { type: Boolean, default: true },
    BatteringRam: { type: Boolean, default: true },
    WagonFort: { type: Boolean, default: true },

    WoodWall: { type: Boolean, default: true },
    StoneWall: { type: Boolean, default: true },
    WoodGate: { type: Boolean, default: true },
    StoneGate: { type: Boolean, default: true },
    WoodenTower: { type: Boolean, default: true },
    StoneTower: { type: Boolean, default: true },
    WoodenKeep: { type: Boolean, default: true },
    StoneKeep: { type: Boolean, default: true },
    WoodHouse: { type: Boolean, default: true },
    StoneHouse: { type: Boolean, default: true },
    Pavement: { type: Boolean, default: true },

    CivilianFactory: { type: Boolean, default: true },
    MilitaryFactory: { type: Boolean, default: true },
    Farm: { type: Boolean, default: true },
    Quarry: { type: Boolean, default: true },
    LumberMill: { type: Boolean, default: true },
    Barracks: { type: Boolean, default: true },
    SiegeWorkshop: { type: Boolean, default: true },
    Market: { type: Boolean, default: true },
    TownHall: { type: Boolean, default: true },
    Warehouse: { type: Boolean, default: true },


    ChainArmour: { type: Boolean, default: false },
    PlateArmour: { type: Boolean, default: false },
    Crossbows: { type: Boolean, default: false },
    Trebuchet: { type: Boolean, default: false },
    Catapult: { type: Boolean, default: false },
    Ballista: { type: Boolean, default: false },

    StandardisedParts: { type: Boolean, default: false },
    RobustSupplyChains: { type: Boolean, default: false },
    WorkerShifts: { type: Boolean, default: false },
    FortifiedSettlements: { type: Boolean, default: false },
    CropRotation: { type: Boolean, default: false },




  },
  lastClaimDate: { type: String, default: null }, // e.g. "2025-08-16"
});

module.exports=userSchema;