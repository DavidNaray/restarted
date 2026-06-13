const {convertMongoPortalGraphToMap}=require("./MongoAbstractConversions.js")

class GlobalChunkManager {
    constructor() {
        this.tiles = new Map();//tiles have utility
        this.AbstractMaps=new Map();

        this.users = new Map();//users have utility
        this.UsersSeeingTileMap=new Map()
        this.userSockets=new Map();// userId -> Set of socket IDs
    }
    getTile(x, y) {
        try{return this.tiles.get(`${x},${y}`)}

        catch(poppy){return false}
    }

    setUserSocket(userId,socketId){
        if (!this.userSockets.has(userId)) {this.userSockets.set(userId, new Set());}
        this.userSockets.get(userId).add(socketId);
    }

    RemoveUserSocket(userId,socketId){
        if (this.userSockets.has(userId)) {
            this.userSockets.get(userId).delete(socketId);
            const zeroSize=this.userSockets.get(userId).size === 0
            if (zeroSize){this.userSockets.delete(userId)} 
        }
    }

    getUserSockets(userId){
        return this.userSockets.get(userId);
    }

    getSockets(){
        return this.userSockets
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

    UpdateUnitPosition(tileKey,serverID,ownerID,NewPosition){
        serverID=serverID.toString();

        const tile = this.tiles.get(tileKey);
        const ownerGroup= tile.units.get(ownerID)
        ownerGroup.instances.get(serverID).position=NewPosition
    }

    GetUnitTypeAndClass(tileKey,serverID,ownerID){
        serverID=serverID.toString();

        const tile = this.tiles.get(tileKey);
        const ownerGroup= tile.units.get(ownerID)
        // console.log("ownerGroup, exists!",ownerGroup)
        const Unit=ownerGroup.instances.get(serverID)
        // console.log("Unit, exists!",Unit)

        return [Unit.UnitType,"Unit"];
    }

    UpdateUnit(tileKey,serverID,ownerID, targetTile,NewPosition){
        serverID=serverID.toString();
        const tile = this.tiles.get(tileKey);
        const ownerGroup= tile.units.get(ownerID)
        const unitCopy=ownerGroup.instances.get(serverID)

        ownerGroup.instances.delete(serverID)
        tile.freeIndices.push(serverID)

        if (ownerGroup.instances.size === 0) {
            tile.units.delete(ownerID);
        }

        const newTile = this.tiles.get(targetTile);
        if (!newTile.units.has(ownerID)) {
            newTile.units.set(ownerID, { instances: new Map() });
        }
        const newOwnerGroup = newTile.units.get(ownerID);
        unitCopy.position = NewPosition;
        
        let IdToUse=null;
        if(newTile.freeIndices.length>0){
            IdToUse=newTile.freeIndices.shift()
        }else{
            IdToUse=newTile.topIndice
            newTile.topIndice+=1
        }
        IdToUse=IdToUse.toString()
        newOwnerGroup.instances.set(IdToUse, unitCopy);

        return IdToUse;
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
        if(this.users.has(userId)){return this.users.get(userId);}
        return false;
    }

    CreateNewRegimen(userId,UnitType){
        const content=this.users.get(userId)
        if(!content){return false}

        const Rid = content.nextRegimenId++;

        console.log("i want to make it:", UnitType)
        const RUnits={
            [UnitType]:{
                progress:500,
                finish:500  // seconds
            }
        }

        const newRegimen={
            units:RUnits,
            count:1,
            deployTile:null,
            deployPixel:null
        }

        // console.log("CURRENT REGIMENS",content.Regimens,Rid)
        content.Regimens[Rid]=newRegimen
        return Rid
    }

    getRegiment(userId,Rid){
        const content=this.users.get(userId)
        if(!content){return false}
        
        return content.Regimens[Rid]
    }
    setDeplotRegimen(userId,Rid,chunk,pixels){
        const content=this.users.get(userId)
        if(!content){return false}
        
        const reg=content.Regimens[Rid]
        reg.deployTile=chunk
        reg.deployPixel=pixels
    }

    deleteRegiment(userId,Rid){
        const content=this.users.get(userId)
        if(!content){return false}

        delete content.Regimens[Rid]
        return true
    }


}

module.exports=new GlobalChunkManager()