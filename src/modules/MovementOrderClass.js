const {getPixelLocationsForTile,updatePixelLocAndOcc}=require("./PathfindingFunctionality.js")

const {TotalSubgridCombining,AstarPathCostPathIncluded}= require("./TerrainGeneration/AbtractMapGeneration.js")
const {unitPositionChangeForUsers,unitChunkCrossHandleForUsers}=require("./TickMessages.js")

const TileScheme=require("../Schemas/Tile")
const ChunkManager=require("./CacheChunkInfo.js")
const {getClosestAccessiblePortal,determineSubgrid}=require("./Pathfinding/PathfindingUtils.js")
const {addMovementOrder,removeMovementOrder}=require("./UnitsAndMovement/OrderTracking.js")
const {AbstractAStar}=require("./Pathfinding/AbstractAStar.js")

class MovementOrder{
    constructor(selectedUnits,values,ownerId){
        
        this.owner=ownerId;
        this.destinationPoint=values.pixelCoords;
        this.targetChunk=values.chunkCoords;
        this.UnitsInvolved=selectedUnits;//tile-> serverIds, becomes... tile -> id ->[type, pos]
        
        this.OrderCenter;
        this.chunkHoldingCenter;
        this.formationPoints=[]
        
        this._progressMovementRunning=false

        addMovementOrder(this);
        
    }

    async calculateMedian(){
        //take the UnitsInvolved and find the pixel that is the median of all of them
        const pixelPositions = [];
        const newMapping=new Map();

        for (const chunkID in this.UnitsInvolved) {

            newMapping.set(chunkID,new Map())

            const [chunkX, chunkY] = chunkID.split(',').map(Number);
            const offsetX = chunkX * 1536;
            const offsetY = chunkY * 1536;

            const unitTypes = this.UnitsInvolved[chunkID];

            for (const unitType in unitTypes) {
                const serverIds = unitTypes[unitType].ServerIds;
                for (const id of serverIds) {
                    const pos = ChunkManager.GetUnitPosition(chunkID,id,this.owner)
  
                    newMapping.get(chunkID).set(id,[unitType,pos])
                    pixelPositions.push({ x: pos[0] +offsetX, y: pos[1] +offsetY});
                }
            }
        }

        this.UnitsInvolved=newMapping;

        if (pixelPositions.length === 0) {this.OrderCenter = null;return;}

        const xs = pixelPositions.map(p => p.x).sort((a, b) => a - b);
        const ys = pixelPositions.map(p => p.y).sort((a, b) => a - b);
        const mid = Math.floor(pixelPositions.length / 2);

        const medianX = xs.length % 2 === 0 ? Math.floor((xs[mid - 1] + xs[mid]) / 2) : xs[mid];
        const medianY = ys.length % 2 === 0 ? Math.floor((ys[mid - 1] + ys[mid]) / 2) : ys[mid];

        // Convert back to chunk-relative position
        const chunkX = Math.floor(medianX / 1536);
        const chunkY = Math.floor(medianY / 1536);
        const localX = medianX % 1536;
        const localY = medianY % 1536;

        this.OrderCenter=[localX,localY];
        this.chunkHoldingCenter=[chunkX,chunkY]
        
        // console.log("MEDIAN",this.OrderCenter,this.chunkHoldingCenter)
    }

    createFormation(){//called every time the order center moves/calculated
        //take the OrderCenter and go over the units, generating the offsets for them to make the formation

        //set their target in the mapping

        //for now just make the target the orderc center
        for (let [chunk, Mapping] of this.UnitsInvolved) {
            for (let [unitId, TypePos] of Mapping) {
                const Ordchunk=`${this.chunkHoldingCenter[0]},${this.chunkHoldingCenter[1]}`
                const OrdSubgrid=`${determineSubgrid(this.OrderCenter)[0]},${determineSubgrid(this.OrderCenter)[1]}`
                const OrdPixel=`${this.OrderCenter[0]},${this.OrderCenter[1]}`

                TypePos[2]=`${Ordchunk}|${OrdSubgrid}|${OrdPixel}`
                // console.log("formation",TypePos[2])
            }
            
        }
    }

    async PathFromStartPortalToEndSubgrid(CP,goal){

        const startKey=`${CP.chunk.x},${CP.chunk.y}|${CP.subgrid.x},${CP.subgrid.y}|${CP.pixelVal.x},${CP.pixelVal.y}`
        const goalKey=`${goal.chunk.x},${goal.chunk.y}|${goal.subgrid.x},${goal.subgrid.y}|${goal.pixelVal.x},${goal.pixelVal.y}`

        const x=CP.chunk.x
        const y=CP.chunk.y
        const startingAbstractMap=await ChunkManager.getAbstractMap(`${x},${y}`);

        const path=await AbstractAStar(startKey,goalKey,startingAbstractMap)

        return path;
    }

    async orderSetup(){
        //calc the center of the order
        await this.calculateMedian();
        this.createFormation()

        const StartSubgrid=determineSubgrid([Number(this.OrderCenter[0]),Number(this.OrderCenter[1])])
        const s={
            CKey:`${this.chunkHoldingCenter[0]},${this.chunkHoldingCenter[1]}`,
            PKey:`${Number(this.OrderCenter[0])},${Number(this.OrderCenter[1])}`,
            subKey:`${StartSubgrid[0]},${StartSubgrid[1]}`
        }
        
        const GoalSubgrid=determineSubgrid([this.destinationPoint[0],this.destinationPoint[1]])
        const g={
            gCKey:`${this.targetChunk[0]},${this.targetChunk[1]}`,
            gPKey:`${this.destinationPoint[0]},${this.destinationPoint[1]}`,
            gsubKey:`${GoalSubgrid[0]},${GoalSubgrid[1]}`
        }

        const StartKey=`${s.CKey}|${s.subKey}|${s.PKey}`
        const goalkey=`${g.gCKey}|${g.gsubKey}|${g.gPKey}`
        
        const StartPoint={
            chunkX:this.chunkHoldingCenter[0],
            chunkY:this.chunkHoldingCenter[1],
            x:Number(this.OrderCenter[0]),
            y:Number(this.OrderCenter[1])}

        const Goalpoint={
            chunkX:this.targetChunk[0],
            chunkY:this.targetChunk[1],
            x:this.destinationPoint[0],
            y:this.destinationPoint[1]}

        const cheapestPortalStart=await getClosestAccessiblePortal(StartPoint)
        const cheapestPortalGoal=await getClosestAccessiblePortal(Goalpoint)


        const pathnodesCentral=await this.PathFromStartPortalToEndSubgrid(cheapestPortalStart,cheapestPortalGoal)
        if(pathnodesCentral==null || pathnodesCentral==false){
            console.log("path impossible, killing order")
            return false;}

        //replace the start with the actual starting pixel
        pathnodesCentral[0]=StartKey
        pathnodesCentral[pathnodesCentral.length -1]=goalkey
        console.log("actual first Abstract path....",pathnodesCentral)
    }

    async getCombinedSubgridsDataForPath(pathnodes,point,goalKey){
        //startPoint is of form chunk|subgrid|pixel
        const currentSubgridKey = `${point.chunkX},${point.chunkY}|${determineSubgrid([point.x, point.y]).join(",")}|${point.x},${point.y}`;
        var startIndex = 0
        var windowSize = 3
        // pathnodes.push(goalKey)//actual clicked on final point
        
        // pathnodes.unshift(currentSubgridKey) //add the point the unit is actually on rn
        pathnodes[0]=currentSubgridKey
        pathnodes[pathnodes.length-1]=goalKey
        var localGoal=false
        var localStart;
        var bufferRes;
        while(localGoal==false){
            const windowNodes = [... new Set(pathnodes.slice(startIndex, startIndex + windowSize))];
            localGoal=true
            // Ensure unit's current subgrid is included
            

            // windowNodes.unshift(currentSubgridKey)
            // windowNodes[0]=currentSubgridKey//replace first since it shares the same subgrid as the point 
            // console.log(windowNodes.length)
            // windowNodes.push(goalKey)
            bufferRes=await TotalSubgridCombining(windowNodes)
            // console.log("windowNodes",windowNodes)
            // console.log("bufferRes!",bufferRes)
            const endsplit=windowNodes.pop().split("|")
            const [endXpix,endYpix]=endsplit[2].split(",")
            const [endXChunk,endYChunk]=endsplit[0].split(",")
            
            const endX=1536*Number(endXChunk)+Number(endXpix)
            const endY=1536*Number(endYChunk)+Number(endYpix) 

            const startX=1536*point.chunkX+point.x
            const startY=1536*point.chunkY+point.y
            const unitPositionPixel={x:startX,y:startY};
            const endPixel={x:endX,y:endY}
            
            function isWalkableColor(r, g, b) {
                return r === Number(255) && g === Number(255) && (b === Number(255) || b === Number(0));
            }


            //convert the coordinates into a global space and then subtract the origin which will localise it to the buffer
            localStart = {
                x: Math.floor(unitPositionPixel.x - bufferRes.origin.x) ,
                y: Math.floor(unitPositionPixel.y - bufferRes.origin.y)
            };

            localGoal = {
                x: Math.floor(endPixel.x - bufferRes.origin.x) ,
                y: Math.floor(endPixel.y - bufferRes.origin.y) 
            };
                
            const idxg = (localGoal.y * bufferRes.width + localGoal.x) * 4;
            const rg = bufferRes.buffer[idxg], gg = bufferRes.buffer[idxg + 1], bg = bufferRes.buffer[idxg + 2];
            if (!isWalkableColor(rg, gg, bg)) {
                // return [Infinity,null]//{ x: goalPixel.x, y: goalPixel.y };
                // endPixel,rg,gg,bg,localGoal,bufferRes,
                console.log("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA")
                localGoal=false
                windowSize+=1
                if(pathnodes.length==0 || windowSize==pathnodes.length){
                    console.log("zamn buddy")
                    return false;
                }
            }
        }
                //         
        //         //remove that node from the path
        //         const indexremove=windowNodes.length -1
        //         
        //         pathnodes.splice(indexremove,1)
        //         if(pathnodes.length==0 || windowSize>pathnodes.length){
        //             return false;
        //         }

        //     }
        // }
        

        if (localStart.x < 0 || localStart.y < 0 || localStart.x >= bufferRes.width || localStart.y >= bufferRes.height) {
            console.error("Local start out of bounds:", localStart, "Buffer origin:", bufferRes.origin, "Buffer size:", bufferRes.width, bufferRes.height);
            // return false or handle gracefully
            return false;
        }
        if (localGoal.x < 0 || localGoal.y < 0 || localGoal.x >= bufferRes.width || localGoal.y >= bufferRes.height) {
            console.error("Local goal out of bounds:", localGoal, "Buffer origin:", bufferRes.origin, "Buffer size:", bufferRes.width, bufferRes.height);
            // return false or handle gracefully
            return false;
        }
        // console.log(localStart,localGoal,bufferRes.origin,bufferRes.width,bufferRes.height)
        // console.log("width, height bruh",bufferRes.width,bufferRes.height)
        const costplease=await AstarPathCostPathIncluded(
            bufferRes.buffer,
            localStart,localGoal,
            {x:0,y:0},
            bufferRes.width,
            bufferRes.height
        )
        // console.log("costplease",costplease)
        if(costplease[1]===null){return false}//console.log("cost is null man");
        // console.log("pos",bufferRes.origin.x+costplease[1].x,bufferRes.origin.y+costplease[1].y)
        return {x:bufferRes.origin.x+costplease[1].x,y:bufferRes.origin.y+costplease[1].y}
        
    }

    async getTheNextPixel(CX,CY,PX,PY,goalKey){
        const centerpoint={
            chunkX:CX,chunkY:CY,
            // subgridX:0,subgridY:0,
            x:PX,y:PY
        }
        const cheapestPortal=await getClosestAccessiblePortal(centerpoint)//closest to order center point

        const breakgoal=goalKey.split("|")
        const goalCC=breakgoal[0].split(",")
        const goalPC=breakgoal[2].split(",")
        if(goalPC[0]==undefined || goalPC[1]==undefined){
            console.log("path impossible, killing order")
            return false;
        }
        const cheapestPortalGoal=await getClosestAccessiblePortal({
            chunkX:Number(goalCC[0]),chunkY:Number(goalCC[1]),
            x:Number(goalPC[0]),y:Number(goalPC[1])
        })
        // const goalSubgrid=this.determineSubgrid(this.destinationPoint)
        // const goalKey=`${this.targetChunk[0]},${this.targetChunk[1]}|${goalSubgrid[0]},${goalSubgrid[1]}|${this.destinationPoint[0]},${this.destinationPoint[1]}`
        // const WSG=this.determineSubgrid([PX,PY])
        // const instead=`${CX},${CY}|${WSG[0]},${WSG[1]}|${PX},${PX}`
        // let instead={pixelVal:{x:PX,y:PY},cost:1,chunk:{x:CX,y:CY},subgrid:{x:WSG[0],y:WSG[1]}};
        const pathnodesCentral=await this.PathFromStartPortalToEndSubgrid(cheapestPortal,cheapestPortalGoal)//cheapestPortal
        
        // console.log("pathnodesCentral",pathnodesCentral)
        if(pathnodesCentral==null || pathnodesCentral==false){
            console.log("path impossible, killing order")
            // await removeMovementOrder(this)
            return false;
        }
        // if(pathnodesCentral[pathnodesCentral.length-1]==goalKey ){//stops units from oscillating
        //     console.log("made it, killing potential oscillation")
        //     return false;
        // }
        //have to append the actual clicked on point to the end of the path
        // const subby=this.determineSubgrid([this.destinationPoint[0],this.destinationPoint[1]])
        // const finalformatted=`${this.targetChunk[0]},${this.targetChunk[1]}|${subby[0]},${subby[1]}|${this.destinationPoint[0]},${this.destinationPoint[1]}`
        // pathnodesCentral.push(goalKey)

        // ✅ Prepend the unit's actual position
        // const unitSubgrid = this.determineSubgrid([centerpoint.x, centerpoint.y]);
        // const unitKey = `${centerpoint.chunkX},${centerpoint.chunkY}|${unitSubgrid[0]},${unitSubgrid[1]}|${centerpoint.x},${centerpoint.y}`;
        // pathnodesCentral.unshift(unitKey);


        const globalNext=await this.getCombinedSubgridsDataForPath(pathnodesCentral,centerpoint,goalKey)
        return globalNext
    }

    async ProgressMovement(){

        if (this._progressMovementRunning) return;
        this._progressMovementRunning = true;
        
        try{
            //all units need to reach their formation positions before centerpoint moves
            var allowCenterMove=true        
            const unitPart = async () =>{
                const freshMap=new Map()
                var mutate=true;
                for (let [key, value] of this.UnitsInvolved) {
                    const [keyX,keyY]=key.split(",")
                    
                    for (let [unitId, valueunit] of value) {
                        const formationPoint=valueunit[2]//of form chunk|subgrid|pixel, goal point for the unit
                        if (!formationPoint) continue; // Safety check

                        const CX=Number(keyX)
                        const CY=Number(keyY)
                        const PX=Number(valueunit[1][0])
                        const PY=Number(valueunit[1][1])
                        // console.log(PX,PY,"PLEASE",this.OrderCenter)

                        const globalNextForUnit=await this.getTheNextPixel(CX,CY,PX,PY,formationPoint);
                        
                        // if()
                        if(globalNextForUnit !=false ){
                            // console.log("globalNextForUnit",globalNextForUnit)
                            mutate=false

                            const xPart=Math.floor(globalNextForUnit.x / 1536)
                            const yPart=Math.floor(globalNextForUnit.y / 1536)
                            const chunkUnit=`${xPart},${yPart}`

                            const pixelsUnit=[globalNextForUnit.x % 1536,globalNextForUnit.y % 1536]
                            
                            if (!freshMap.has(chunkUnit)) {freshMap.set(chunkUnit, new Map());}

                            
                            
                            //get the userids array for the tile unit is now on
                            const thoseIds=ChunkManager.getUserIdArrayForTile(chunkUnit)
                            if(CX!=xPart || CY!=yPart){//unit has moved to a different chunk

                                console.log("unit moved to a different chunk",chunkUnit,CX,CY,xPart,yPart)
                                //create a new entry for the unit in the new chunk
                                var chosenServerIndices;
                                const tile = ChunkManager.getTile(xPart,yPart)//TileScheme.findOne({x: xPart,y: yPart});
                                // var tileFreeIndices=tile.freeIndices
                                // var TileTopIndice=tile.topIndice

                                if(tile.freeIndices.length>0){
                                    const freeIndice=tile.freeIndices.shift().toString();//pops first element in array
                                    chosenServerIndices=freeIndice
                                }else{
                                    chosenServerIndices=tile.topIndice
                                    tile.topIndice+=1
                                }
                                //add info to the pixel location
                                
                                updatePixelLocAndOcc(xPart,yPart,chosenServerIndices,valueunit[0],pixelsUnit,this.owner)

                                // tile.freeIndices=tileFreeIndices
                                // tile.topIndice=TileTopIndice
                                // tile.save()

                                const oldTile = await ChunkManager.getTile(CX,CY)//TileScheme.findOne({x: CX,y: CY});
                                // var OldtileFreeIndices=oldTile.freeIndices
                                // var OldTileTopIndice=oldTile.topIndice
                                if(unitId==oldTile.topIndice-1){
                                    oldTile.topIndice-=1;
                                }else{
                                    oldTile.freeIndices.push(unitId)
                                }
                                updatePixelLocAndOcc(CX,CY,unitId,valueunit[0],pixelsUnit,this.owner,true)
                                // oldTile.freeIndices=OldtileFreeIndices
                                // oldTile.topIndice=OldTileTopIndice
                                // oldTile.save()
                                //send command to remove the unit from the old chunk

                                await unitChunkCrossHandleForUsers(thoseIds,
                                    {   unitId:unitId,//what the current unit serverId is
                                        ChunkX:CX,ChunkY:CY,//what the old chunk was, so is the target to remove the unit from
                                        newChunkX:xPart,newChunkY:yPart,//the new chunk to add the unit to
                                        serverId:chosenServerIndices,//what id to give that unit
                                        x:pixelsUnit[0],y:pixelsUnit[1],//where to place it
                                        unitType:valueunit[0],//what type of unit it is
                                        owner: this.owner,//who owns the unit
                                        AssetClass: "Unit"//what type of asset it is
                                    }
                                )

                                //remove that same unit from involved units, replace it with the new one
                                // this.UnitsInvolved.get(chunkUnit).set(chosenServerIndices,[valueunit[0],pixelsUnit,formationPoint])
                                // this.UnitsInvolved.get(key).delete(unitId)
                                freshMap.get(chunkUnit).set(chosenServerIndices,[valueunit[0],pixelsUnit,formationPoint])
                            }else{
                                // console.log("order to move within a chunk")
                                updatePixelLocAndOcc(xPart,yPart,unitId,valueunit[0],pixelsUnit,this.owner)
                                freshMap.get(chunkUnit).set(unitId,[valueunit[0],pixelsUnit,formationPoint])
                                await unitPositionChangeForUsers(thoseIds,{unitId:unitId,ChunkX:xPart,ChunkY:yPart,x:pixelsUnit[0],y:pixelsUnit[1]})
                            }
                            
                        }else{
                            // console.log("on top of formation")
                        }
                    }
                }
                // return freshMap
                if(!mutate){this.UnitsInvolved=freshMap;}//this.createFormation()
                return mutate
            }

            allowCenterMove=await unitPart()

            
            
            // console.log(this.UnitsInvolved)
            if(allowCenterMove){

                const CX=this.chunkHoldingCenter[0]
                const CY=this.chunkHoldingCenter[1]
                const PX=Number(this.OrderCenter[0])
                const PY=Number(this.OrderCenter[1])
                const GoalSubgrid=this.determineSubgrid([this.destinationPoint[0],this.destinationPoint[1]])
                const goalkey=`${this.targetChunk[0]},${this.targetChunk[1]}|${GoalSubgrid[0]},${GoalSubgrid[1]}|${this.destinationPoint[0]},${this.destinationPoint[1]}`

                const globalNext=await this.getTheNextPixel(CX,CY,PX,PY,goalkey);
                // const globalNext=await this.getCombinedSubgridsDataForPath(pathnodesCentral,centerpoint)
                if(globalNext!=false){
                    // console.log("to the next!", globalNext)
                    this.chunkHoldingCenter=[Math.floor(globalNext.x / 1536),Math.floor(globalNext.y / 1536)]
                    this.OrderCenter=[globalNext.x % 1536,globalNext.y % 1536]
                    
                    //calc the formation since those points have to move with the central since central moved
                    this.createFormation()
                    
                    await unitPart()
            
                    // if(!allowCenterMove){this.UnitsInvolved=freshMap;this.createFormation()}

                }else{                    
                    //center reached the end so kill the order from the list
                    console.log("destination reache or invalid, removing order",globalNext,this.targetChunk,this.destinationPoint,this.chunkHoldingCenter,this.OrderCenter)
                    // console.log()
                    await removeMovementOrder(this)
                }
            
                
                
            }
        }finally {
            this._progressMovementRunning = false;
        }

        

    }

    
}

module.exports=MovementOrder