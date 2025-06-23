const mongoose = require('mongoose');

const tileSchema = new mongoose.Schema({
    x:Number,
    y:Number,

    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },       // ✅ Full control & vision
    allies: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],    // ✅ Full vision, restricted actions (per owners rules)
    involvedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],// ⚔️ Enemies or visiting users

    textures: {
        heightmapUrl: String,
        texturemapUrl: String,
        WalkMapURL: String,
    },

    buildings: [{
        userId: String,
        assetId: String, // building type
        instances:[{
            position: [Number], // [x, y, z] on the tile
            metaData: {
                health: Number,
                state: String,     // e.g., "under_construction", "built", etc.
            }
        }]
    }],

    units: [{
        username: String,       // who owns these units
        assetId: String,        // what type of unit they are
        instances: [{
            position: [Number], // [x, y]
            metaData: {
                // templateId: { type: String, default: null },  // null = free unit
                templateId: { type: mongoose.Schema.Types.ObjectId, ref: 'Template', default: null },
                health: Number,
                state: String,       // e.g., "idle", "moving", "attacking"

            }
        }]
    }],


    updatedAt: { type: Date, default: Date.now }
});

module.exports=tileSchema