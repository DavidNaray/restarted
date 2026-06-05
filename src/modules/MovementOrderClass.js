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
                    newMapping.get(chunkID).set(id,[])
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
            for (let [unitId, Target] of Mapping) {
                const pos = ChunkManager.GetUnitPosition(chunk,unitId,this.owner)

                const Ordchunk=`${this.chunkHoldingCenter[0]},${this.chunkHoldingCenter[1]}`
                const OrdSubgrid=`${determineSubgrid(this.OrderCenter)[0]},${determineSubgrid(this.OrderCenter)[1]}`
                const OrdPixel=`${this.OrderCenter[0]},${this.OrderCenter[1]}`

                const TargetKey=`${Ordchunk}|${OrdSubgrid}|${OrdPixel}`
                this.UnitsInvolved.get(chunk).set(unitId,TargetKey)
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

    CutPathBuffer(AbstractPath){

        //get the first <=3 points of the abstract map
        const snippedPath=AbstractPath.slice(0,3);
        if(snippedPath.length ==1){return "OnTarget"}

        //create the buffer of the snippedPath
        const Combined=StitchPath(snippedPath)

        return Combined;
    }

    startGoalPoints(cut,origin){
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

        return [StartPixel,GoalPixel]
    }

    async getSliceBufferForUnit(sX,sY,chunkID,UnitPos,goalkey){
        const subgrid=determineSubgrid(UnitPos)
        const StartKey=`${chunkID}|${subgrid[0]},${subgrid[1]}|${UnitPos[0]},${UnitPos[1]}`

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
            return ["NoPath","NoPath"]}

        AbstractPath[0]=StartKey
        AbstractPath[AbstractPath.length -1]=goalkey
        // console.log("unit Abstract path",AbstractPath)
        const SliceBuffer=await this.CutPathBuffer(AbstractPath);
        return [SliceBuffer,AbstractPath]
    }

    async UnitMovement(){
        const makeChanges=[]

        for (let [chunkID, TypePos] of this.UnitsInvolved) {
            const [sX,sY]=chunkID.split(",").map(Number);

            for (let [unitId, goalkey] of TypePos) {
                const unitSpeed=1;

                const UnitPos=ChunkManager.GetUnitPosition(chunkID,unitId,this.owner)
                const [subx,suby]=determineSubgrid(UnitPos);
                const unitSnipKey=`${chunkID}|${subx},${suby}`
                const unitKey= `${unitSnipKey}|${UnitPos[0]},${UnitPos[1]}`

                const brokenGoal=goalkey.split("|")
                const goalSnipKey=`${brokenGoal[0]}|${brokenGoal[1]}`

                if(unitKey==goalkey){console.log("unit hit goal");continue}

                const[  SliceBuffer,
                        AbstractPath
                    ]=await this.getSliceBufferForUnit(sX,sY,chunkID,UnitPos,goalkey)
                
                // console.log(SliceBuffer,AbstractPath)
                let Buffer=SliceBuffer.buffer
                let origin=SliceBuffer.origin
                let width=SliceBuffer.width
                let height=SliceBuffer.height

                if( SliceBuffer=="NoPath"){console.log("BOOM",SliceBuffer);continue}
                else if(SliceBuffer=="OnTarget"){ 
                    // console.log("remaining",AbstractPath,"target",goalkey);
                    AbstractPath.unshift(unitKey)
                    Buffer=ChunkManager.getAbstractMap(chunkID).get(`${subx},${suby}`).get("buffer")
                    width=32
                    height=32
                    origin={
                        x:sX*1536 + subx*32,
                        y:sY*1536 + suby*32
                    }
                    // continue
                }


                const cut = AbstractPath.slice(0, Math.min(3, AbstractPath.length));
                
                const [StartPixel,GoalPixel]=this.startGoalPoints(cut,origin);

                
                
                const Returned= await AstarPathCost(Buffer,StartPixel,GoalPixel,{x:0,y:0},width,height,true);
                // console.log("Returned",Returned)

                const NextCoords=RealignPath(origin,Returned.path,unitSpeed);
                let NextPosition=NextCoords[NextCoords.length -1]
                
                const [A,B,C]=NextPosition.split("|")
                const segA=`${A}|${B}`
                const [AA,BB,CC]=AbstractPath[1].split("|")
                const segB=`${AA}|${BB}`
                
                const newXY=C.split(",").map(Number)
                if(chunkID!=A){
                    //remove unit from current tile, free up its serverID
                    //create new unit in tile A with same stats but new position
                    const newID=ChunkManager.UpdateUnit(chunkID,unitId,this.owner,A,newXY)
                    // console.log("newID",newID)
                    //record that this.UnitsInvolved needs changes
                    makeChanges.push([chunkID,unitId,newID,A])

                }
                else{
                    ChunkManager.UpdateUnitPosition(chunkID,unitId,this.owner,newXY)
                }
                console.log("unit",NextPosition,cut)
            }
        }

        for(const change of makeChanges){
            
            this.UnitsInvolved.get(change[0]).delete(change[1])
            
            const empty=this.UnitsInvolved.get(change[0]).size==0
            if(empty){this.UnitsInvolved.delete(change[0])}

            if (!this.UnitsInvolved.has(change[3])) {
                this.UnitsInvolved.set(change[3], new Map());
            }

            this.UnitsInvolved.get(change[3]).set(change[2],[])
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
        
        const [StartPixel,GoalPixel]=this.startGoalPoints(cut,origin);

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
            console.log("Central reached goal position", this.CentralPath[0])
        }else{
            this.CentralPath[0] = NextPosition;

            const brokenNext=NextPosition.split("|")
            this.OrderCenter=brokenNext[2].split(",").map(Number);
            this.chunkHoldingCenter=brokenNext[0].split(",").map(Number);
        }

    }

    async ProgressMovement(){

        if (this._progressMovementRunning) return;
        this._progressMovementRunning = true;
        
        try{
            await this.CentralMovement();
            
            await this.createFormation();

            await this.UnitMovement();
        }
        finally {
            this._progressMovementRunning = false;
        }
    }

    
}

module.exports=MovementOrder