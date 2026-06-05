const UnitPixelLocations=new Map()//tile -> {unit serverId -> [owner,unitType,[pixels]]}

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


module.exports={confirmOwner}