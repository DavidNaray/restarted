const mongoose = require('mongoose');

const templateSchema = new mongoose.Schema({
    name: { type: String, required: true },           // Name of the template
    owner: { type: String, required: true },          // Username of the creator/owner
    
    composition: [{
        // unitAsset: { type: String, required: true },  // Which unit asset/model this refers to
        assetId: { type: String, required: true },        // what type of unit they are
        count: { type: Number, required: true },      // Number of this unit in the template
        // config: { type: mongoose.Schema.Types.Mixed } // Optional: equipment, formation, etc.
    }],
    
    createdAt: { type: Date, default: Date.now }
});

module.exports = templateSchema;