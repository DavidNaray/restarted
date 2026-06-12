const mongoose = require('mongoose');
const { WaterRefractionShader } = require('three/examples/jsm/Addons.js');

const userSchema = new mongoose.Schema({
  username: { type: String, unique: true },
  passwordHash: String,  // store hashed password here
  OriginTile:[Number],//which tile is centered on 0,0, the rest of the tiles built around
  refreshTokens: [String],  // Store issued refresh tokens (optional)
  ProductionLines:{Total:{type: Number, default: 2},Free:{type: Number, default: 2},TotalCiv:{type: Number, default: 2}},
  ProductBlocks: {
    TopBlock:{ type: Number, default: 0 },
    FreeBlocks:[Number],
    Values:{
    type: Map,
    of: {
      FactoryCount: { type: Number, default: 0 },
      MultiplierFactor: { type: Number, default: 1 },
      ItemProduced: { type: String, default: "" }
    }
  }},
  Construction:{Values:{
    type: Map,
    of: {
      start: { type: String, default: null },
      finish:{ type: String, default: null },
      PopAssigned:{ type: Number, default: 0 }
    }
  }},
  WareHouses:{ type: Number, default: 0 },
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
        TotalPopulation:{type: Number, default: 500},
        PopulationRate:{type: Number, default: 0.1},
        RecruitableFactor:{type: Number, default: 0.1},
        MaxPopulation:{type: Number, default: 500},
        FreePopulation:{type: Number, default: 500}
    },

    lastUpdated: { type: Date, default: Date.now }

  },
  Technology:{
    Bows: { Unlocked: {type: Boolean, default: true },Description: {type: String, default: "An archers armament"},
    Capacity: { type: Number, default: 1 },Rate:{ type: Number, default: 1 }},
    
    Swords: { Unlocked:{type: Boolean, default: true }, Description: {type: String, default: "An offensive option for soldiers"},
    Capacity: { type: Number, default: 1 },Rate:{ type: Number, default: 1 } },
    
    Shields: { Unlocked:{type: Boolean, default: true }, Description: {type: String, default: "A defensive option for soldiers"},
    Capacity: { type: Number, default: 1 },Rate:{ type: Number, default: 1 } },
    
    Spears: { Unlocked:{type: Boolean, default: true }, Description: {type: String, default: "An offensive option for soldiers"},
    Capacity: { type: Number, default: 1 },Rate:{ type: Number, default: 1 } },
    
    LeatherArmour: { Unlocked:{type: Boolean, default: true },Description: {type: String, default: "A defensive option for soldiers"},
    Capacity: { type: Number, default: 1 },Rate:{ type: Number, default: 7 } },
    
    BatteringRam: { Unlocked:{type: Boolean, default: true },Description: {type: String, default: "A siege weapon for breaking down structures"},
    Capacity: { type: Number, default: 20 },Rate:{ type: Number, default: 14 } },
    
    WagonFort: { Unlocked:{type: Boolean, default: true },Description: {type: String, default: "A mobile defensive/offensive structure"},
    Capacity: { type: Number, default: 20 },Rate:{ type: Number, default: 14 } },

    WoodWall: { Unlocked:{type: Boolean, default: true },Description: {type: String, default: "A wall of wood"} },
    StoneWall: { Unlocked:{type: Boolean, default: true },Description: {type: String, default: "A wall of stone"} },
    WoodGate: { Unlocked:{type: Boolean, default: true },Description: {type: String, default: "A wooden gate for a wall"} },
    StoneGate: { Unlocked:{type: Boolean, default: true },Description: {type: String, default: "A stone gate for a wall"} },
    WoodenTower: { Unlocked:{type: Boolean, default: true },Description: {type: String, default: "A defensive wooden tower for a wall or to stand alone"} },
    StoneTower: { Unlocked:{type: Boolean, default: true },Description: {type: String, default: "A defensive stone tower for a wall or to stand alone"} },
    WoodenKeep: { Unlocked:{type: Boolean, default: true },Description: {type: String, default: "A formidable defensive structure of wood, essential for holding ground"} },
    StoneKeep: { Unlocked:{type: Boolean, default: true },Description: {type: String, default: "A formidable defensive structure of stone, essential for holding ground"} },
    WoodHouse: { Unlocked:{type: Boolean, default: true },Description: {type: String, default: "Built to increase population capacity, can be placed above a stone house"} },
    StoneHouse: { Unlocked:{type: Boolean, default: true },Description: {type: String, default: "Built to increase population capacity, many stone houses or one wooden house can be placed above"} },
    Pavement: { Unlocked:{type: Boolean, default: true },Description: {type: String, default: "A road to increase movement speed of units or to simply change the texture of the map"} },

    CivilianFactory: { Unlocked:{type: Boolean, default: true}, Description: {type: String, default: "Offsets stability losses of Military factories. Increases stability by 1% each, up to % lost by Military factories total,requires population for full efficiency"} },
    MilitaryFactory: { Unlocked:{type: Boolean, default: true }, Description: {type: String, default: "Produces the goods used by the army, upgrades,weapons and siege engines,requires population for full efficiency"} },
    Farm: { Unlocked:{type: Boolean, default: true}, Description: {type: String, default: "Increases population rate by an amount per farm"} },
    Quarry: { Unlocked:{type: Boolean, default: true }, Description: {type: String, default: "Produces gold and stone, requires population for full efficiency"} },
    LumberMill: { Unlocked:{type: Boolean, default: true },Description: {type: String, default: "Produces wood, requires population for full efficiency"} },
    Barracks: { Unlocked:{type: Boolean, default: true }, Description: {type: String, default: "Need barracks to be able to produce units, units deploy around the barracks"} },
    Market: { Unlocked:{type: Boolean, default: true }, Description: {type: String, default: "A market to trade resources with other players or within your kingdom"} },
    TownHall: { Unlocked:{type: Boolean, default: true }, Description: { type: String, default: "A central building for your kingdom, allows you to make decisions"} },
    Warehouse: { Unlocked:{type: Boolean, default: true },Description: {type: String, default: "A building to store resources, increases storage capacity by 1000"} },


    ChainArmour: { Unlocked:{type: Boolean, default: false },Description: {type: String, default: "A defensive option for soldiers, better than leather"},
    Capacity: { type: Number, default: 1 },Rate:{ type: Number, default: 28 } },
    
    PlateArmour: { Unlocked:{type: Boolean, default: false },Description: {type: String, default: "A defensive option for soldiers, better than chain"},
    Capacity: { type: Number, default: 1 },Rate:{ type: Number, default: 14 }},
    
    Crossbows: { Unlocked:{type: Boolean, default: false },Description: {type: String, default: "An alternative for archers"},
    Capacity: { type: Number, default: 1 },Rate:{ type: Number, default: 1 } },

    Trebuchet: { Unlocked:{type: Boolean, default: false },Description: {type: String, default: "A powerful ranged siege weapon for breaking down structures"},
    Capacity: { type: Number, default: 50 },Rate:{ type: Number, default: 35 } },
    
    Catapult: { Unlocked:{type: Boolean, default: false },Description: {type: String, default: "A siege weapon for bringing down structures or groups of foes"},
    Capacity: { type: Number, default: 40 },Rate:{ type: Number, default: 21 } },
    
    Ballista: { Unlocked:{type: Boolean, default: false }, Description: {type: String, default: "A powerful ranged siege weapon for destroying light structures or targetting the toughest troops"},
    Capacity: { type: Number, default: 20 },Rate:{ type: Number, default: 14 } },

    StandardisedParts: { Unlocked:{type: Boolean, default: false },Description: {type: String, default: "A technology that raises goods produced by 5%"} },
    RobustSupplyChains: { Unlocked:{type: Boolean, default: false },Description: {type: String, default: "A technology that makes goods cheaper to produce by 5%"} },
    WorkerShifts: { Unlocked:{type: Boolean, default: false },Description: {type: String, default: "Reduces the number of population required to reach max efficiency by 10%"} },
    FortifiedSettlements: { Unlocked:{type: Boolean, default: false},Description: {type: String, default: "A technology that increases the health of all buildings by 10%"} },
    CropRotation: { Unlocked:{type: Boolean, default: false },Description: { type: String, default: "A technology that increases the population growth rate by 5%"} },




  },
  Inventory:{
    type: Map,
    of: {
      Total:{ type: Number, default: 0 },
      lastUpdated:{ type: String, default: null }
    }
  },

  nextRegimenId: { type: Number, default: 1 },
  Regimens: {
    type: Map,
    of:{
      id: { type: Number, required: true }, 
      count: { type: Number, default: 0 },  // how many to train   
             
      units: {
        type: Map, // "Archer", "Spearman", etc.
        of:{        
          progress: { type: Number, default: 0 },     // how much time has passed
          finish: { type: Number, default: 0 }        // total time required (ms or seconds)
        },
        default:{}
      },
      deployPos: { type: [Number], default: null },      // [x, y]
      targetPos: { type: [Number], default: null },      // [x, y]
    },default:{}
  },

  lastClaimDate: { type: String, default: null }, // e.g. "2025-08-16"
});

module.exports=userSchema;