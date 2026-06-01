const {updateOccupancyMap,addUserToTileWatch}=require("./PathfindingFunctionality.js")

class GlobalChunkManager {
    constructor() {
        this.tiles = new Map();//tiles have utility
        this.users = new Map();//users have utility
    }
    getTile(x, y) {
        try{
            const toReturn=this.tiles.get(`${x},${y}`);
            return toReturn
        }catch(poppy){
            return false
        }
        // return 
    }

    async RegisterTile(tile,userId){
        var tileDict=this.getTile(tile.x,tile.y);

        if(!tileDict){
            tileDict={
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
        }
        
        await addUserToTileWatch(`${tile.x},${tile.y}`,userId)
        return tileDict;
    }



    async RegisterUser(userId,user){
        console.log("Registering user:",userId);
        if(this.users.has(userId)){
            return false;
        }
        this.users.set(userId,user);
        return true;
    }

    async getUser(userId){
        if(this.users.has(userId)){
            return this.users.get(userId);
        }
        return false;
    }
}
// const ChunkManager=new GlobalChunkManager()
module.exports=new GlobalChunkManager()