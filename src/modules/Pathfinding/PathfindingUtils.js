const ChunkManager=require("../CacheChunkInfo.js")
const {AstarPathCost}=require("../TerrainGeneration/AStarCost.js")


function parseChunkKey(fullKey) {
    return fullKey.split('|')[0]; // "chunkX,chunkY"
}

function parseSubgridKey(fullKey) {
    return fullKey.split('|')[1]; // "subgridX,subgridY"
}


function reconstructPath(cameFrom, current) {
    const path = [current];
    while (cameFrom.has(current)) {
        current = cameFrom.get(current);
        path.push(current);
    }
    return path.reverse();
}

function determineSubgrid(PixelPoint){
    //PixelPoint of form [x,y]
    //texture is 1536x1536 and split into 48x48 subgrids starting at 0,0

    const subgridX=Math.floor(PixelPoint[0]/32)
    const subgridY=Math.floor(PixelPoint[1]/32)

    return [subgridX,subgridY]
}

async function getClosestAccessiblePortal(point){
    const x=point.chunkX
    const y=point.chunkY
    const graphMap=ChunkManager.getAbstractMap(`${x},${y}`);

    const subgridKey=determineSubgrid([point.x,point.y])

    //get the array of portals for a subgrid
    const portalPixels=graphMap.get(`${subgridKey[0]},${subgridKey[1]}`).get("connections")

    const TheData=graphMap.get(`${subgridKey[0]},${subgridKey[1]}`).get("buffer")

    const startPixel={
        x:point.x - 32*Number(subgridKey[0]),
        y:point.y - 32*Number(subgridKey[1])
    }

    let cheapestPortal={pixelVal:"",cost:Infinity,chunk:{x:x,y:y},subgrid:{x:subgridKey[0],y:subgridKey[1]}};
    for(const bing of portalPixels){

        const [goalX,goalY]=bing[0].split(",")
        
        const goalPixel={
            x:Number(goalX) - 32*Number(subgridKey[0]),
            y:Number(goalY) - 32*Number(subgridKey[1])
        }

        const cost=await AstarPathCost(TheData,startPixel,goalPixel,{x:0,y:0},32,32)

        if(cost< cheapestPortal.cost){cheapestPortal={pixelVal:{x:Number(goalX),y:Number(goalY)},cost:cost,chunk:{x:x,y:y},subgrid:{x:subgridKey[0],y:subgridKey[1]}}}

    }
    return cheapestPortal;
}






module.exports={
    parseChunkKey,
    parseSubgridKey,
    reconstructPath,
    getClosestAccessiblePortal,
    determineSubgrid
}
