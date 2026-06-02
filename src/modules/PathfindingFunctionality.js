const {convertMongoPortalGraphToMap}=require("./MongoAbstractConversions.js")
const path = require('path')
const sharp = require('sharp');

const dimensions={
    "archer":[1,1]
}

const TilePixelOccupancyMap=new Map()//tile -> rgba data array, alpha for if pixel has unit on it
const UnitPixelLocations=new Map()//tile -> {unit serverId -> [owner,unitType,[pixels]]}


async function updateOccupancyMap(tile,UserId){
    // console.log("hello?")
    const MapContainsTile=TilePixelOccupancyMap.has(`${tile.x},${tile.y}`)
    if(!MapContainsTile){
        console.log("loading tile to cache")

        const abtractMapOfTile=convertMongoPortalGraphToMap(tile.AbstractMap)
        
        //makes it of form tile -> subgrid -> {buffer, connections}
        TilePixelOccupancyMap.set(`${tile.x},${tile.y}`, abtractMapOfTile)

        const collate=new Map()
        const editRGBAData=TilePixelOccupancyMap.get(`${tile.x},${tile.y}`)
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

                const subgridX=Math.floor(x/32)
                const subgridY=Math.floor(y/32)

                const localisedX=x-32*subgridX
                const localisedY=y-32*subgridY

                const index = (localisedY * 32 + localisedX) * 4;
                // console.log(index)
                // console.log(editRGBAData[index + 3], "alpha")
                console.log("yo....",editRGBAData.get(`${subgridX},${subgridY}`))
                editRGBAData.get(`${subgridX},${subgridY}`).get("buffer")[index + 3]=0;//255 is default ie open, 0 is to say it is occupied
            });
        });
        UnitPixelLocations.set(`${tile.x},${tile.y}`,collate)

    }else{}
}

async function getPixelLocationsForTile(tileKey){
    return UnitPixelLocations.get(tileKey)
}


async function updatePixelLocAndOcc(chunkX,chunkY,serverId,UnitType,pixelCoords,owner,deletey=false){
    //inserting of form tile-> userIdUnitType ->{serverId->metadata}
    //UnitPixelLocations of form tile -> {unit serverId -> [unitType,[pixels]]}
    const chunkentry=UnitPixelLocations.get(`${chunkX},${chunkY}`)
    if(chunkentry){
        if(deletey){
            chunkentry.delete(Number(serverId))
        }else{chunkentry.set(Number(serverId),[owner,UnitType,pixelCoords])}
        
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


module.exports={updateOccupancyMap,getPixelLocationsForTile,updatePixelLocAndOcc,confirmOwner}