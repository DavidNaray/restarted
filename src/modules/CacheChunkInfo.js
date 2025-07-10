class GlobalChunkManager {
    constructor() {
        this.tiles = new Map();//tiles have utility
    }
    getTile(x, y) {
        return this.tiles.get(`${x},${y}`);
    }
    RegisterChunk(tiles){
        const returnDict={
            "owner":[],
            "allies":[],
            "involvedUsers":[],
            "Neighbours":[]
        }
        for (const [key, value] of Object.entries(tiles)) {
            for(const tile of value){
                if(this.getTile(tile.x,tile.y)){
                    returnDict[key].push(this.getTile(tile.x,tile.y))
                    continue;
                }
                const tileDict={
                    x:tile.x,
                    y:tile.y,
                    freeIndices:tile.freeIndices,
                    topIndice:tile.topIndice,
                    owner:tile.owner,
                    allies:tile.allies,
                    involvedUsers:tile.involvedUsers,
                    AbstractMap:tile.AbstractMap,
                    textures:tile.textures,
                    units:tile.units,
                    buildings:tile.buildings,
                    updatedAt:tile.updatedAt,
                    _id:tile._id,
                }
                this.tiles.set(`${tile.x},${tile.y}`,tileDict)
                returnDict[key].push(tileDict)
            }
        }
        return returnDict;
    }
}
// const ChunkManager=new GlobalChunkManager()
module.exports=new GlobalChunkManager()