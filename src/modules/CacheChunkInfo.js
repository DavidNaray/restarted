const {updateOccupancyMap}=require("./PathfindingFunctionality.js")
const {convertMongoPortalGraphToMap}=require("./MongoAbstractConversions.js")

class GlobalChunkManager {
    constructor() {
        this.tiles = new Map();//tiles have utility
        this.AbstractMaps=new Map();

        this.users = new Map();//users have utility
        this.UsersSeeingTileMap=new Map()
    }
    getTile(x, y) {
        try{return this.tiles.get(`${x},${y}`)}

        catch(poppy){return false}
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
            
            const abtractMapOfTile=convertMongoPortalGraphToMap(tile.AbstractMap)
            this.AbstractMaps.set(`${tile.x},${tile.y}`,abtractMapOfTile)
        }
        
        await this.addUserToTileWatch(`${tile.x},${tile.y}`,userId)
        return tileDict;
    }

    async addUserToTileWatch(tilekey,userId){
        if(this.UsersSeeingTileMap.get(tilekey)){
            this.UsersSeeingTileMap.get(tilekey).push(userId);
        }else{
            this.UsersSeeingTileMap.set(tilekey,[userId])
        }
            
    }

    getAbstractMap(tileKey){
        const [chunkX, chunkY] = tileKey.split(",").map(Number);
        try {
            return this.AbstractMaps.get(tileKey)
        } catch {
            return false;
        }
    }

    getUserIdArrayForTile(tilekey){
        return this.UsersSeeingTileMap.get(tilekey);
    }

    AddUnitToTile(tileKey,xyPos,serverID,ownerId,UType,TId){
        const tile = this.tiles.get(tileKey);
        if (!tile) return false;
        serverID=serverID.toString();

        if (!tile.units.has(ownerId)) {
            tile.units.set(ownerId, {
                instances: new Map()
            });
        }

        //tile -> owner -> unitID -> {template,health,state,position,type}
        const ownerGroup = tile.units.get(ownerId);
        ownerGroup.instances.set(serverID, {
            templateId: TId,
            health: 100,
            state: "idle",
            position: xyPos,
            UnitType:UType
        });
    }

    GetUnitPosition(tileKey,serverID,ownerID){
        serverID=serverID.toString();

        const tile = this.tiles.get(tileKey);
        const ownerGroup= tile.units.get(ownerID)
        const Unit=ownerGroup.instances.get(serverID)

        return Unit.position;
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