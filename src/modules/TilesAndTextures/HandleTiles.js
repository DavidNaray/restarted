const TileScheme=require("../../Schemas/Tile")



const deltas = [
    [-1, 0], [1, 0],  //Left, Right
    [0, -1], [0, 1],  //Below, Top
    [-1, -1], [-1, 1],//TopLeft,BottomLeft
    [1, -1], [1, 1],  //TopRight,BottomRight
];


//gets tile textures
//if tile in cache, get info from there, otherwise from db
async function HandleTiles(User,ChunkManager,userId){

    try{
        const user = await User.findOne({ _id: userId });
        if (!user){return "NoUser"}

        const tiles=await RelevantTiles(user);

        const returnDict={
            "owner":[],
            "allies":[],
            "involvedUsers":[],
            "Neighbours":[]
        }

        for (const [key, value] of Object.entries(tiles)) {
            for(const tile of value){
                const TileRep= await ChunkManager.RegisterTile(tile,user._id.toString());
                returnDict[key].push(TileRep);
            }
        }



        return {"returnDict":returnDict,"OGTile":user.OriginTile};


    }
    catch(err){
        console.log("in handletiles",err)
        return "ERRORTiles"
    }
}

async function RelevantTiles(user){
    const tiles = {
        owner: [],
        allies: [],
        involvedUsers: []
    };

    const relevantTiles = await TileScheme.find({
        $or: [
            { owner: user._id },
            { allies: user._id },
            { involvedUsers: user._id }
        ]
    });

    
    const knownTilesSet = new Set();
    for (const tile of relevantTiles) {
        knownTilesSet.add(`${tile.x},${tile.y}`);


        if (String(tile.owner) === String(user._id)) {
            tiles.owner.push(tile);
        }

        if (tile.allies.some(id => String(id) === String(user._id))) {
            tiles.allies.push(tile);
        }

        if (tile.involvedUsers.some(id => String(id) === String(user._id))) {
            tiles.involvedUsers.push(tile);
        }
    }

    const neighborCoords = new Set();
    for (const category of Object.values(tiles)) {
        for (const tile of category) {
            for (const [dx, dy] of deltas) {
                const nx = tile.x + dx;
                const ny = tile.y + dy;
                const key = `${nx},${ny}`;
                if (!knownTilesSet.has(key)) {//so if you dont find the 'neighbour' key in keys that are interacted by user
                    neighborCoords.add(key);
                }
            }
        }
    }

    const neighborsTiles = await TileScheme.find({
        $or: [...neighborCoords].map(coord => {
            const [x, y] = coord.split(',').map(Number);
            return { x, y };
        })
    });
    tiles["Neighbours"]=neighborsTiles

    return tiles;

}



module.exports={HandleTiles}