const {addMovementOrder,getPixelLocationsForTile,getDataOfTile}=require("./PathfindingFunctionality.js")
const ChunkManager=require("./CacheChunkInfo.js")
const {convertMongoPortalGraphToMap}=require("./MongoAbstractConversions.js")
const {AstarPathCost}= require("./AbtractMapGeneration.js")

class MovementOrder{
    constructor(selectedUnits,ClickedPixel,TargetChunk){
        this.destinationPoint=ClickedPixel;
        this.targetChunk=TargetChunk;
        this.UnitsInvolved=selectedUnits;//tile-> serverIds
        
        this.OrderCenter;
        this.chunkHoldingCenter;
        this.formationPoints=[]
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

        console.log(this.OrderCenter,this.chunkHoldingCenter)
    }

    createFormation(){
        //take the OrderCenter and go over the units, generating the offsets for them to make the formation
    }

    determineSubgrid(PixelPoint){
        //PixelPoint of form [x,y]
        //texture is 1536x1536 and split into 48x48 subgrids starting at 0,0

        const subgridX=Math.floor(PixelPoint[0]/32)
        // console.log(subgridX)
        const subgridY=Math.floor(PixelPoint[1]/32)

        return [subgridX,subgridY]//`${subgridX},${subgridY}`
    }

    async getClosestAccessiblePortal(){
        // const [x,y]=this.chunkHoldingCenter
        const x=this.chunkHoldingCenter[0]
        const y=this.chunkHoldingCenter[1]
        const theAbstractMapForCenterPointTile=ChunkManager.getTile(x,y).AbstractMap;
        //theAbstractMapForCenterPointTile is an array, this is because mongoDB doesnt support map, must convert

        const graphMap = convertMongoPortalGraphToMap(theAbstractMapForCenterPointTile);
        const subgridKey=this.determineSubgrid(this.OrderCenter)

        //get the array of portals for a subgrid
        const portalPixels=graphMap.get(`${subgridKey[0]},${subgridKey[1]}`)

        //perform A* from OrderCenter to the different portalPixels and select the portal with the least cost
        //since the direction is to the next portal after the one it is on
        
        //get the rgba data for the tile which is necessary for the pathfinding
        const TheData=await getDataOfTile(`${x},${y}`)
        //start pixel is where the median is, so orderCenter
        const startPixel={
            x:Number(this.OrderCenter[0]),
            y:Number(this.OrderCenter[1])
        }

        let cheapestPortal={pixelVal:"",cost:Infinity};
        for(const bing of portalPixels){
            const [goalX,goalY]=bing[0].split(",")

            const goalPixel={
                x:Number(goalX),
                y:Number(goalY)
            }

            const X=Number(subgridKey[0])
            const Y=Number(subgridKey[1])

            const cost=await AstarPathCost(TheData,startPixel,goalPixel,{x:X*32,y:Y*32},32,32)

            if(cost< cheapestPortal.cost){cheapestPortal={pixelVal:goalPixel,cost:cost}}

        }
        // console.log("WOO, cheapest baby thats reachable!",cheapestPortal.pixelVal,cheapestPortal.cost)
        return cheapestPortal;

    }
}

module.exports=MovementOrder