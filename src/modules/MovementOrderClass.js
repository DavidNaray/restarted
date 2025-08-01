const {addMovementOrder,getPixelLocationsForTile,getDataOfTile,getUserIdArrayForTile,removeMovementOrder}=require("./PathfindingFunctionality.js")
const ChunkManager=require("./CacheChunkInfo.js")
const {convertMongoPortalGraphToMap}=require("./MongoAbstractConversions.js")
const {AstarPathCost,abstractMapAstarMultiTileCapable,TotalSubgridCombining,AstarPathCostPathIncluded}= require("./AbtractMapGeneration.js")
const {unitPositionChangeForUsers}=require("./TickMessages.js")
class MovementOrder{
    constructor(selectedUnits,ClickedPixel,TargetChunk){
        console.log("destination",TargetChunk,ClickedPixel)
        this.destinationPoint=ClickedPixel;
        this.targetChunk=TargetChunk;
        this.UnitsInvolved=selectedUnits;//tile-> serverIds, becomes... tile -> id ->[type, pos]
        
        this.OrderCenter;
        this.chunkHoldingCenter;
        this.formationPoints=[]
        
        this._progressMovementRunning=false

        this.orderSetup()
        addMovementOrder(this)
    }
    //ChunkManager.getTile(x,y).AbstractMap
    async calculateMedian(){
        //take the UnitsInvolved and find the pixel that is the median of all of them
        const pixelPositions = [];
        const newMapping=new Map();

        for (const chunkID in this.UnitsInvolved) {
            // console.log(chunkID,"hmm chunkId")
            newMapping.set(chunkID,new Map())

            const [chunkX, chunkY] = chunkID.split(',').map(Number);
            const offsetX = chunkX * 1536;
            const offsetY = chunkY * 1536;

            const unitTypes = this.UnitsInvolved[chunkID];
            const pixelMap = await getPixelLocationsForTile(chunkID)
            if (!pixelMap) continue;//skip if not found, prevents death
            // console.log(pixelMap, "pixelMap")
            // console.log("exists for it!",pixelMap)

            //since unitT
            for (const unitType in unitTypes) {
                const serverIds = unitTypes[unitType].ServerIds;
                for (const id of serverIds) {
                    // console.log
                    const pos = pixelMap.get(id)[2];
                    // console.log(pos,id)
                    if (pos) {
                        newMapping.get(chunkID).set(id,[unitType,pos])
                        pixelPositions.push({ x: pos[0] +offsetX, y: pos[1] +offsetY});
                    }
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

        // console.log(this.OrderCenter,this.chunkHoldingCenter)
    }

    createFormation(){//called every time the order center moves/calculated
        //take the OrderCenter and go over the units, generating the offsets for them to make the formation

        //for now just make the target the orderc center
        for (let [key, value] of this.UnitsInvolved) {
            for (let [unitId, valueunit] of value) {
                valueunit[2]=`${this.chunkHoldingCenter[0]},${this.chunkHoldingCenter[1]}|${this.determineSubgrid(this.OrderCenter)[0]},${this.determineSubgrid(this.OrderCenter)[1]}|${this.OrderCenter[0]},${this.OrderCenter[1]}`
            }
            
        }
    }

    determineSubgrid(PixelPoint){
        //PixelPoint of form [x,y]
        //texture is 1536x1536 and split into 48x48 subgrids starting at 0,0

        const subgridX=Math.floor(PixelPoint[0]/32)
        // console.log(subgridX)
        const subgridY=Math.floor(PixelPoint[1]/32)

        return [subgridX,subgridY]//`${subgridX},${subgridY}`
    }

    async getClosestAccessiblePortal(point){
        function isWalkableColor(r, g, b) {
            return r == Number(255) && g == Number(255) && (b == Number(255) || b == Number(0));
        }

        function findClosestWalkablePixel(goalPixel, data, segmentWidth, segmentHeight) {
            if (goalPixel.x >= 0 && goalPixel.x < segmentWidth && goalPixel.y >= 0 && goalPixel.y < segmentHeight) {
                const idx = (goalPixel.y * segmentWidth + goalPixel.x) * 4;
                const r = data[idx], g = data[idx + 1], b = data[idx + 2];
                if (isWalkableColor(r, g, b)) {
                    return { x: goalPixel.x, y: goalPixel.y };
                }
            }

            const maxRadius = 10; // You can tune this
            for (let radius = 1; radius <= maxRadius; radius++) {
                for (let dy = -radius; dy <= radius; dy++) {
                    for (let dx = -radius; dx <= radius; dx++) {
                        const nx = goalPixel.x + dx;
                        const ny = goalPixel.y + dy;
                        if (nx < 0 || nx >= segmentWidth || ny < 0 || ny >= segmentHeight) continue;
                        const idx = (ny * segmentWidth + nx) * 4;
                        const r = data[idx], g = data[idx + 1], b = data[idx + 2];
                        if (isWalkableColor(r, g, b)) {
                            return { x: nx, y: ny,chunkX: point.chunkX,chunkY:point.chunkY};
                        }
                    }
                }
            }
            return null; // No walkable found (rare, means it's surrounded by blue)
        }
        // const [x,y]=this.chunkHoldingCenter
        const x=point.chunkX//this.chunkHoldingCenter[0]
        const y=point.chunkY//this.chunkHoldingCenter[1]
        const theAbstractMapForCenterPointTile=ChunkManager.getTile(x,y).AbstractMap;
        //theAbstractMapForCenterPointTile is an array, this is because mongoDB doesnt support map, must convert

        const graphMap = convertMongoPortalGraphToMap(theAbstractMapForCenterPointTile);
        const subgridKey=this.determineSubgrid([point.x,point.y])//this.OrderCenter)

        //get the array of portals for a subgrid
        const portalPixels=graphMap.get(`${subgridKey[0]},${subgridKey[1]}`)
        // console.log("portalPixels",portalPixels)
        //perform A* from OrderCenter to the different portalPixels and select the portal with the least cost
        //since the direction is to the next portal after the one it is on
        
        //get the rgba data for the tile which is necessary for the pathfinding
        const TheData=await getDataOfTile(`${x},${y}`)
        //start pixel is where the median is, so orderCenter
        const startPixel={
            x:point.x,//Number(this.OrderCenter[0]),
            y:point.y//Number(this.OrderCenter[1])
        }

        let cheapestPortal={pixelVal:"",cost:Infinity,chunk:{x:x,y:y},subgrid:{x:subgridKey[0],y:subgridKey[1]}};
        for(const bing of portalPixels){
            // console.log(bing)
            const [goalX,goalY]=bing[0].split(",")

            const goalPixel={
                x:Number(goalX),
                y:Number(goalY)
            }
            // const fuzzyGoalPixel = findClosestWalkablePixel(goalPixel, TheData, 1536, 1536);
            // if (!fuzzyGoalPixel) {
            //     // No reachable pixel near portal, skip this portal
            //     continue;
            // }
            const X=Number(subgridKey[0])
            const Y=Number(subgridKey[1])

            const cost=await AstarPathCost(TheData,startPixel,goalPixel,{x:X*32,y:Y*32},32,32)

            if(cost< cheapestPortal.cost){cheapestPortal={pixelVal:goalPixel,cost:cost,chunk:{x:x,y:y},subgrid:{x:subgridKey[0],y:subgridKey[1]}}}

        }
        // console.log("WOO, cheapest baby thats reachable!",cheapestPortal.pixelVal,cheapestPortal.cost)
        return cheapestPortal;

    }

    async PathFromStartPortalToEndSubgrid(CP,goalKey){//CP:cheapest portal
        // console.log("aight",CP)
        // const CX=cheapestPortal
        const startKey=`${CP.chunk.x},${CP.chunk.y}|${CP.subgrid.x},${CP.subgrid.y}|${CP.pixelVal.x},${CP.pixelVal.y}`
        // const goalSubgrid=this.determineSubgrid(this.destinationPoint)
        // const goalKey=`${this.targetChunk[0]},${this.targetChunk[1]}|${goalSubgrid[0]},${goalSubgrid[1]}|${this.destinationPoint[0]},${this.destinationPoint[1]}`
        
        // console.log("start,goal:",startKey,goalKey)

        const x=CP.chunk.x//this.chunkHoldingCenter[0]
        const y=CP.chunk.y//this.chunkHoldingCenter[1]
        const startingAbstractMapArray=ChunkManager.getTile(x,y).AbstractMap;
        const MapAbstractStarting = convertMongoPortalGraphToMap(startingAbstractMapArray);
        // console.log(MapAbstractStarting)


        const path=await abstractMapAstarMultiTileCapable(startKey,goalKey,MapAbstractStarting)
        // console.log("path?",path)
        return path;
    }

    async getCombinedSubgridsDataForPath(pathnodes,point,goalKey){
        //startPoint is of form chunk|subgrid|pixel

        var startIndex = 0
        var windowSize = 5
        // pathnodes.push(goalKey)
        var localGoal=false
        var localStart;
        var bufferRes;
        while(localGoal==false){
            const windowNodes = pathnodes.slice(startIndex, startIndex + windowSize);
            
            // Ensure unit's current subgrid is included
            const currentSubgridKey = `${point.chunkX},${point.chunkY}|${this.determineSubgrid([point.x, point.y]).join(",")}|${point.x},${point.y}`;

            // windowNodes.unshift(currentSubgridKey)
            windowNodes[0]=currentSubgridKey//replace first since it shares the same subgrid as the point 
            // console.log(windowNodes.length)
            bufferRes=await TotalSubgridCombining(windowNodes)

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
                return r == Number(255) && g == Number(255) && (b == Number(255) || b == Number(0));
            }


            //convert the coordinates into a global space and then subtract the origin which will localise it to the buffer
            localStart = {
                x: Math.floor(unitPositionPixel.x - bufferRes.origin.x) ,
                y: Math.floor(unitPositionPixel.y - bufferRes.origin.y)
            };

            localGoal = {
                x: Math.floor(endPixel.x - bufferRes.origin.x),
                y: Math.floor(endPixel.y - bufferRes.origin.y) 
            };

            const idxg = (localGoal.y * bufferRes.width + localGoal.x) * 4;
            const rg = bufferRes.buffer[idxg], gg = bufferRes.buffer[idxg + 1], bg = bufferRes.buffer[idxg + 2];
            if (!isWalkableColor(rg, gg, bg)) {
                // return [Infinity,null]//{ x: goalPixel.x, y: goalPixel.y };
                localGoal=false
                //remove that node from the path
                const indexremove=windowNodes.length -1
                pathnodes.splice(indexremove,1)

            }
        }
        

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
        console.log("width, height bruh",bufferRes.width,bufferRes.height)
        const costplease=await AstarPathCostPathIncluded(
            bufferRes.buffer,
            localStart,localGoal,
            {x:0,y:0},
            bufferRes.width,
            bufferRes.height
        )
        // console.log("costplease",costplease)
        if(costplease[1]===null){return false}
        // console.log("pos",bufferRes.origin.x+costplease[1].x,bufferRes.origin.y+costplease[1].y)
        return {x:bufferRes.origin.x+costplease[1].x,y:bufferRes.origin.y+costplease[1].y}
        
    }

    async orderSetup(){
        //calc the center of the order
        await this.calculateMedian();
        this.createFormation()

    }


    async getTheNextPixel(CX,CY,PX,PY,goalKey){
        const centerpoint={
            chunkX:CX,chunkY:CY,
            x:PX,y:PY
        }
        const cheapestPortal=await this.getClosestAccessiblePortal(centerpoint)//closest to order center point
        // const goalSubgrid=this.determineSubgrid(this.destinationPoint)
        // const goalKey=`${this.targetChunk[0]},${this.targetChunk[1]}|${goalSubgrid[0]},${goalSubgrid[1]}|${this.destinationPoint[0]},${this.destinationPoint[1]}`
        
        const pathnodesCentral=await this.PathFromStartPortalToEndSubgrid(cheapestPortal,goalKey)
        // console.log("pathnodesCentral",pathnodesCentral)
        if(pathnodesCentral==null || pathnodesCentral==false){
            console.log("path impossible, killing order")
            // await removeMovementOrder(this)
            return false;
        }
        //have to append the actual clicked on point to the end of the path
        // const subby=this.determineSubgrid([this.destinationPoint[0],this.destinationPoint[1]])
        // const finalformatted=`${this.targetChunk[0]},${this.targetChunk[1]}|${subby[0]},${subby[1]}|${this.destinationPoint[0]},${this.destinationPoint[1]}`
        pathnodesCentral.push(goalKey)

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
                            mutate=false

                            const xPart=Math.floor(globalNextForUnit.x / 1536)
                            const yPart=Math.floor(globalNextForUnit.y / 1536)
                            const chunkUnit=`${xPart},${yPart}`

                            const pixelsUnit=[globalNextForUnit.x % 1536,globalNextForUnit.y % 1536]
                            
                            if (!freshMap.has(chunkUnit)) {freshMap.set(chunkUnit, new Map());}

                            freshMap.get(chunkUnit).set(unitId,[valueunit[0],pixelsUnit,formationPoint])//
                            
                            

                            //get the userids array for the tile
                            const thoseIds=await getUserIdArrayForTile(chunkUnit)
                            await unitPositionChangeForUsers(thoseIds,{unitId:unitId,ChunkX:xPart,ChunkY:yPart,x:pixelsUnit[0],y:pixelsUnit[1]})
                        }else{console.log("on top of formation")}
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
                    console.log("to the next!", globalNext)
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