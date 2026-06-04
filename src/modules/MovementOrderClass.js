const {unitPositionChangeForUsers,unitChunkCrossHandleForUsers}=require("./TickMessages.js")

const TileScheme=require("../Schemas/Tile")
const ChunkManager=require("./CacheChunkInfo.js")
const { getClosestAccessiblePortal,
        determineSubgrid,
        determineChunk,
        RealignPath}=require("./Pathfinding/PathfindingUtils.js")

const {addMovementOrder,removeMovementOrder}=require("./UnitsAndMovement/OrderTracking.js")
const {AbstractAStar}=require("./Pathfinding/AbstractAStar.js")
const {AstarPathCost}=require("./TerrainGeneration/AStarCost.js")
const {StitchPath}= require("./TerrainGeneration/ImageStitching.js")

class MovementOrder{
    constructor(selectedUnits,values,ownerId){
        
        this.owner=ownerId;
        this.destinationPoint=values.pixelCoords;
        this.targetChunk=values.chunkCoords;
        this.UnitsInvolved=selectedUnits;//tile-> serverIds, becomes... tile -> id ->[type, pos]
        
        this.OrderCenter;
        this.chunkHoldingCenter;
        this.CentralPath=null;


        this.formationPoints=[]
        
        this._progressMovementRunning=false
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
                    // console.log("bro:", pos)
                    newMapping.get(chunkID).set(id,[unitType,pos])
                    // console.log("[unitType,pos]",[unitType,pos])
                    pixelPositions.push({ x: pos[0] +offsetX, y: pos[1] +offsetY});
                }
            }
        }

        this.UnitsInvolved=newMapping;
        // console.log("this.UnitsInvolved",this.UnitsInvolved)

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
        
        this.CentralPath=pathnodesCentral;

        addMovementOrder(this);
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

    CutPathBuffer(AbstractPath){

        //get the first <=3 points of the abstract map
        const snippedPath=AbstractPath.slice(0,3);
        if(snippedPath.length ==1){return "OnTarget"}

        //create the buffer of the snippedPath
        const Combined=StitchPath(snippedPath)

        return Combined;
    }

    async UnitMovement(){
        for (let [chunkID, TypePos] of this.UnitsInvolved) {
            const [sX,sY]=chunkID.split(",").map(Number);

            for (let [unitId, UnitPosAndTarget] of TypePos) {
                const [UnitType,UnitPos,goalkey]=UnitPosAndTarget

                //get the abstract Path for the unit to its formation target
                const subgrid=determineSubgrid(UnitPos)
                const StartKey=`${chunkID}|${subgrid[0]},${subgrid[1]}|${UnitPos[0]},${UnitPos[1]}`
                // const goalkey=`${g.gCKey}|${g.gsubKey}|${g.gPKey}`
                
                const brokenGoal=goalkey.split("|");
                const g={
                    chunk:brokenGoal[0].split(",").map(Number),
                    pixel:brokenGoal[2].split(",").map(Number)
                }

                const StartPoint={
                    chunkX:sX,
                    chunkY:sY,
                    x:UnitPos[0],
                    y:UnitPos[1]}

                const Goalpoint={
                    chunkX:g.chunk[0],
                    chunkY:g.chunk[1],
                    x:g.pixel[0],
                    y:g.pixel[1]}

                const cheapestPortalStart=await getClosestAccessiblePortal(StartPoint)
                const cheapestPortalGoal=await getClosestAccessiblePortal(Goalpoint)

                const AbstractPath=await this.PathFromStartPortalToEndSubgrid(cheapestPortalStart,cheapestPortalGoal)
                if(AbstractPath==null || AbstractPath==false){
                    console.log("path impossible, skipping unit")
                    continue}

                AbstractPath[0]=StartKey
                AbstractPath[AbstractPath.length -1]=goalkey

                const SliceBuffer=await this.CutPathBuffer(AbstractPath);
                if(SliceBuffer=="OnTarget"){continue}
                
            }

        }
    }

    async CentralMovement(speed=1){
        const SliceBuffer=await this.CutPathBuffer(this.CentralPath);
        if(SliceBuffer=="OnTarget"){return 0;}

        const Buffer=SliceBuffer.buffer
        const origin=SliceBuffer.origin
        const width=SliceBuffer.width
        const height=SliceBuffer.height

        const cut = this.CentralPath.slice(0, Math.min(3, this.CentralPath.length));
        
        const [sChunkX, sChunkY] = cut[0].split("|")[0].split(",").map(Number);
        const [gChunkX, gChunkY] = cut[cut.length- 1].split("|")[0].split(",").map(Number);
        
        const [fsx,fsy]=cut[0].split("|")[1].split(",").map(Number);
        const [lsx,lsy]=cut[cut.length- 1].split("|")[1].split(",").map(Number);
        
        const [fX,fY]=cut[0].split("|")[2].split(",").map(Number);
        const [lX,lY]=cut[cut.length- 1].split("|")[2].split(",").map(Number);

        const StartPixel = {
            x: sChunkX*1536 + fX -origin.x,
            y: sChunkY*1536 + fY -origin.y
        };

        const GoalPixel = {
            x: gChunkX*1536 + lX - origin.x,
            y: gChunkY*1536 + lY - origin.y
        };

        const Returned= await AstarPathCost(Buffer,StartPixel,GoalPixel,{x:0,y:0},width,height,true);

        const NextCoords=RealignPath(origin,Returned.path,speed);
        let NextPosition=NextCoords[NextCoords.length -1]
        // console.log("NextCoords",NextCoords,"NextPosition",NextPosition)

        const [A,B,C]=NextPosition.split("|")
        const segA=`${A}|${B}`
        const [AA,BB,CC]=this.CentralPath[1].split("|")
        const segB=`${AA}|${BB}`
        if(segA==segB && this.CentralPath.length>2){
            this.CentralPath.shift();
        }else if(this.CentralPath[0] == this.CentralPath[1]){
            this.CentralPath.shift();
            console.log("Central reached goal position")
        }else{this.CentralPath[0] = NextPosition;}

    }

    async ProgressMovement(){

        if (this._progressMovementRunning) return;
        this._progressMovementRunning = true;
        
        try{
            await this.CentralMovement();
            
            await this.UnitMovement();
        }
        finally {
            this._progressMovementRunning = false;
        }
    }

    
}

module.exports=MovementOrder