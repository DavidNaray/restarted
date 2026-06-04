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

function determineChunk(PixelPoint){
    const chunkX=Math.floor(PixelPoint[0]/1536)
    const chunkY=Math.floor(PixelPoint[1]/1536)

    return [chunkX,chunkY]
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

function RealignPath(bufferOrigin,Path,Count){

    Count+=1 //units current position always in path

    var toReturn=[];

    for(let i = 0; i < Count; i++){
        try{
            //bufferCoord into Global pixel Coord
            var [pX,pY]=Path[i].split(",").map(Number);
            pX+=bufferOrigin.x
            pY+=bufferOrigin.y

            //get the chunk
            const [cX,cY]=determineChunk([pX,pY])

            //transform the pixel location into tile scale
            pX-=cX*1536
            pY-=cY*1536

            //get the subgrid for the now tile-scale pixel coords
            const [sX,sY]=determineSubgrid([pX,pY])

            const key=`${cX},${cY}|${sX},${sY}|${pX},${pY}`
            toReturn.push(key)
        }catch(err){break}

    }
    return toReturn;
}




module.exports={
    parseChunkKey,
    parseSubgridKey,
    reconstructPath,
    getClosestAccessiblePortal,
    determineSubgrid,
    determineChunk,
    RealignPath
}
