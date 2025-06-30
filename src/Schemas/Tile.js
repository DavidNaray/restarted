const mongoose = require('mongoose');

const tileSchema = new mongoose.Schema({
    x:Number,
    y:Number,

    freeIndices:[Number],
    topIndice:{type:Number,default:0},

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
                ServerId:Number,
                health: Number,
                state: String,     // e.g., "under_construction", "built", etc.
            }
        }]
    }],

    units: {
        type:Map,
        of:new mongoose.Schema({
            // username: String,       // who owns these units, used in the key
            // assetId: String,        // what type of unit they are
            instances: {
                type:Map,
                of:new mongoose.Schema({
                    templateId: { type: mongoose.Schema.Types.ObjectId, ref: 'Template', default: null },
                    health: Number,
                    state: String,// e.g., "idle", "moving", "attacking"
                    position: [Number], // [x, y]
                }),default:{}
            }
        }),default:{}
    },


    updatedAt: { type: Date, default: Date.now }
});

const TileScheme = mongoose.model('Tiles', tileSchema)

module.exports=TileScheme//tileSchema