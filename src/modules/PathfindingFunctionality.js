const {convertMongoPortalGraphToMap}=require("./MongoAbstractConversions.js")
const path = require('path')
const sharp = require('sharp');
        
//reading tiles abstract portal info...
// const graphMap = convertMongoPortalGraphToMap(tile.AbstractMap);


const dimensions={
    "archer":[1,1]
}

const movementOrderObjects=new Map()//iterate over and progress movement orders

const TilePixelOccupancyMap=new Map()//tile -> rgba data array, alpha for if pixel has unit on it
const UnitPixelLocations=new Map()//tile -> {unit serverId -> [owner,unitType,[pixels]]}
const UsersSeeingTileMap=new Map()


async function updateOccupancyMap(tile,UserId){
    const MapContainsTile=TilePixelOccupancyMap.has(`${tile.x},${tile.y}`)
    if(!MapContainsTile){
        UsersSeeingTileMap.set(`${tile.x},${tile.y}`,[UserId])

        const imgLocation=path.join(__dirname,"../../Tiles/WalkMaps/"+tile.x.toString()+tile.y.toString()+".png")
        // console.log(imgLocation, "plz bruh")
        const p = sharp(imgLocation)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true })
        .then(({ data, info }) => {
            const width = info.width;
            // const height = info.height;
            // const occupancy = new Uint32Array(width * height);
            // occupancy.fill(0); // 0 means no unit
            
            TilePixelOccupancyMap.set(`${tile.x},${tile.y}`,{
                walkMap:data,//access the colour by getting index and then looking it up +1,2,3 for rgba, alpha for unit occupancy
                // UnitOccupancy:occupancy
            });

            const collate=new Map()
            const editRGBAData=TilePixelOccupancyMap.get(`${tile.x},${tile.y}`).walkMap
            // console.log("did fetch?",editRGBAData)
            tile.units.forEach((UnitsOwned, key) => {
                const splitting=key.split(",")
                const unitOwner=splitting[0]
                const unitType=splitting[1]
                //use the unitType to adjust which pixels are set to 0 onload
                UnitsOwned.instances.forEach((UnitMetaData, ServerIdUnit) => {
                    collate.set(Number(ServerIdUnit),[unitOwner,unitType,UnitMetaData.position])
                    
                    const x=Number(UnitMetaData.position[0])
                    const y=Number(UnitMetaData.position[1])
                    const index = (y * width + x) * 4;
                    // console.log(index)
                    // console.log(editRGBAData[index + 3], "alpha")
                    editRGBAData[index + 3]=0;//255 is default ie open, 0 is to say it is occupied
                });
            });
            UnitPixelLocations.set(`${tile.x},${tile.y}`,collate)

        })
        .catch(err => {
            console.error(`Error loading tile image ${tile.x},${tile.y}:`, err);
        });

        // const index = (y * width + x) * 4;
        // const r = walkmap[index];
        // const g = walkmap[index + 1];
        // const b = walkmap[index + 2];
        // const a = walkmap[index + 3];

        //process the unit info of the tile
        


    }else{
        UsersSeeingTileMap.get(`${tile.x},${tile.y}`).push(UserId)
    }
}

async function addMovementOrder(TheObj){
    // movementOrderObjects.push(TheObj)
    const itsId=movementOrderObjects.size
    movementOrderObjects.set(itsId,TheObj)
    TheObj.ident=itsId
}

async function removeMovementOrder(theObj){
    movementOrderObjects.delete(theObj.ident)
}

async function ProgressOrders(){
    for(const [key,order] of movementOrderObjects){
        order.ProgressMovement();
    }
}

async function getUserIdArrayForTile(tilekey){
    return UsersSeeingTileMap.get(tilekey);
}

async function getPixelLocationsForTile(tileKey){
    return UnitPixelLocations.get(tileKey)
}

async function getDataOfTile(tileKey){
    try{
        const dataToReturn=TilePixelOccupancyMap.get(tileKey).walkMap
        return dataToReturn
    }catch(poppy){
        return false
    }
    
}


async function updatePixelLocAndOcc(chunkX,chunkY,serverId,UnitType,pixelCoords,owner){
    //inserting of form tile-> userIdUnitType ->{serverId->metadata}
    //UnitPixelLocations of form tile -> {unit serverId -> [unitType,[pixels]]}
    const chunkentry=UnitPixelLocations.get(`${chunkX},${chunkY}`)
    if(chunkentry){
        chunkentry.set(Number(serverId),[owner,UnitType,pixelCoords])
    }
}

async function confirmOwner(userId,tileKey,UnitSId,UnitType){
    const tileEntry=UnitPixelLocations.get(tileKey).get(Number(UnitSId))
    if(tileEntry){
        const confirmOwnerId=tileEntry[0]==userId
        // console.log(confirmOwnerId,tileEntry[0],userId)

        const confirmUnitType=tileEntry[1]==UnitType
        // console.log(confirmUnitType,tileEntry[1],UnitType)

        if(confirmOwnerId && confirmUnitType){
            return true
        }
    }
    return false
}


module.exports={updateOccupancyMap,addMovementOrder,getPixelLocationsForTile,updatePixelLocAndOcc,confirmOwner,getDataOfTile,
    ProgressOrders,getUserIdArrayForTile,removeMovementOrder
}