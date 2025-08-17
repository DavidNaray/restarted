const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username: { type: String, unique: true },
  passwordHash: String,  // store hashed password here
  OriginTile:[Number],//which tile is centered on 0,0, the rest of the tiles built around
  refreshTokens: [String],  // Store issued refresh tokens (optional)
  Resources:{
    Gold:{
        Total:{ type: Number, default: 0 },
        Rate:{type: Number, default: 0}, 
    },
    
    Stone:{
        Total:{ type: Number, default: 0 },
        Rate:{type: Number, default: 0}, 
    },

    Wood:{
        Total:{ type: Number, default: 0 },
        Rate:{type: Number, default: 0}, 
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
        TotalPopulation:{type: Number, default: 0},
        PopulationRate:{type: Number, default: 0},
        RecruitableFactor:{type: Number, default: 0.1},
        MaxPopulation:{type: Number, default: 0},
    },

    

  },
  lastClaimDate: { type: String, default: null }, // e.g. "2025-08-16"
});

module.exports=userSchema;