const TileScheme=require("../Schemas/Tile")

async function validateUnitOwnership(selectedUnits,UserIdCommandee){
    var CHEATER=false;
    const originTiles=[];

    for (const [AssetClass, TileEtc] of Object.entries(selectedUnits)) {

        for (const [TileXYOrigin, UnitTypeEtc] of Object.entries(TileEtc)) {
            const TileXY=TileXYOrigin.split(",").map(Number);
            const InvestigateTile = await TileScheme.findOne({x:TileXY[0],y:TileXY[1]});
            
            originTiles.push(TileXY)
            
            for (const [UnitType, SIdPos] of Object.entries(UnitTypeEtc)) { 
                const compositeLocalTileKey=`${UserIdCommandee},${UnitType}`
                const LocalPositions=SIdPos.positions
                const LocalServerIds=SIdPos.ServerIds

                const WhatActuallyExistsHere=InvestigateTile.units.get(compositeLocalTileKey)
                if(WhatActuallyExistsHere){
                    const ExistingInstancesHere=WhatActuallyExistsHere.instances
                    
                    LocalServerIds.forEach((SId)=>{
                        //person making request is indeed the owner of the units... at least thats what is checked here
                        const SIdIncluded=ExistingInstancesHere.has(SId.toString())
                        if(SIdIncluded){

                            //ok theyve been verified, continue the scan
                            //need to check that the unit position is within a margin of error of expected location
                            //------------------------------------------
                            //---------assume ok for now----------------
                            //------------------------------------------
                        }else{
                            CHEATER=true;
                            console.log("ALERT. ACTION, referencing Sid that is not under their control on tile")
                        }
                    })
                }else{
                    CHEATER=true;
                    console.log("ALERT ALERT CHEATER.... ACTION, user trying to move units they do not have on the tile")
                }
            }
        }
    }

    // console.log("its figureing it out right....?",CHEATER,originTiles)
    return [CHEATER,originTiles];
}

async function validateUnitPosition(){
    //when a unit is created its position is set to its deployment point
    //..... figure this out another time
}


module.exports={validateUnitOwnership};