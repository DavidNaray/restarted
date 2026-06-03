const sharp = require('sharp');
const {MinHeap,PriorityQueue}=require("../Pathfinding/MinH_PQ.js")
const ChunkManager=require("../CacheChunkInfo.js")
const {convertMongoPortalGraphToMap}=require("../MongoAbstractConversions.js")

const {combineSegments,extractRegion}=require("./ImageStitching.js")
const {AstarPathCost}=require("./AStarCost.js")

const subgridSize=32;

async function generatePortalMap(Imglocation,debug) {
    const { data, info } = await sharp(Imglocation)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

    const gridCols = Math.ceil(info.width / subgridSize);
    const gridRows = Math.ceil(info.height / subgridSize);

    const portalMap = new Map();

    function isWalkable(x, y) {
        if (x < 0 || y < 0 || x >= info.width || y >= info.height) return false;
        const index = (y * info.width + x) * 4;
        const r = data[index], g = data[index + 1], b = data[index + 2];

        const isWhite = r > 240 && g > 240 && b > 240;   // near white
        const isYellow = r > 240 && g > 240 && b < 15;   // near yellow
        return isWhite || isYellow;
    }

    function floodFillSubgrid(subgridX, subgridY) {
        const startX = subgridX * subgridSize;
        const startY = subgridY * subgridSize;

        const visited = new Uint8Array(subgridSize * subgridSize);
        const regions = [];

        const directions = [
            [1, 0], [-1, 0], [0, 1], [0, -1]
        ];

        function idx(x, y) {
            return y * subgridSize + x;
        }

        for (let y = 0; y < subgridSize; y++) {
            for (let x = 0; x < subgridSize; x++) {
                const globalX = startX + x;
                const globalY = startY + y;
                const index = idx(x, y);

                if (visited[index] || !isWalkable(globalX, globalY)) continue;

                // Start new region
                const stack = [[x, y]];
                visited[index] = 1;

                let pixels = [];

                while (stack.length) {
                    const [cx, cy] = stack.pop();
                    const gx = startX + cx;
                    const gy = startY + cy;

                    pixels.push([gx, gy]);

                    for (const [dx, dy] of directions) {
                        const nx = cx + dx;
                        const ny = cy + dy;
                        if (nx < 0 || ny < 0 || nx >= subgridSize || ny >= subgridSize) continue;

                        const nIndex = idx(nx, ny);
                        if (!visited[nIndex] && isWalkable(startX + nx, startY + ny)) {
                            visited[nIndex] = 1;
                            stack.push([nx, ny]);
                        }
                    }
                }

                // Compute approximate center
                let avgX = Math.floor(pixels.reduce((sum, p) => sum + p[0], 0) / pixels.length);
                let avgY = Math.floor(pixels.reduce((sum, p) => sum + p[1], 0) / pixels.length);

                // Ensure the center is walkable, otherwise pick nearest walkable from region
                if (!isWalkable(avgX, avgY)) {
                    let minDist = Infinity;
                    let bestPixel = pixels[0];
                    for (const [px, py] of pixels) {
                        const dx = px - avgX;
                        const dy = py - avgY;
                        const dist = dx * dx + dy * dy;
                        if (dist < minDist) {
                            minDist = dist;
                            bestPixel = [px, py];
                        }
                    }
                    avgX = bestPixel[0];
                    avgY = bestPixel[1];
                }
                // Final safety check (optional but good practice)
                if (!isWalkable(avgX, avgY)) {
                    console.error(`Unexpected: fallback picked non-walkable pixel at (${avgX},${avgY})`);
                }
                regions.push({
                    x: avgX,
                    y: avgY
                });
                
                // If debug mode, paint this pixel orange
                if (debug) {
                    const idxRGBA = (avgY * info.width + avgX) * 4;
                    data[idxRGBA] = 255;     // R
                    data[idxRGBA + 1] = 165; // G
                    data[idxRGBA + 2] = 0;   // B
                    data[idxRGBA + 3] = 255; // A
                }
            }
        }

        return regions;

    }

    for (let gridY = 0; gridY < gridRows; gridY++) {
        for (let gridX = 0; gridX < gridCols; gridX++) {
            // if(gridX==9){
            //     console.log(gridY)
            // }
            
            const regions = floodFillSubgrid(gridX, gridY);
            portalMap.set(`${gridX},${gridY}`, regions);
        }
    }

    if (debug) {
        console.log("?,should be oing something",Imglocation)
        await sharp(data, {
            raw: { width: info.width, height: info.height, channels: 4 }
        })
        .toFile(Imglocation); // overwrite original image
    }

    return [portalMap, data,debug];
}

async function addEdgeToAbstractGraph(abstractMap,subgrid,start, end, cost,subgridBuffer){

    //abstractmap structure should be subgrid -> (start -> (end->cost))

    var SubgridRecord=abstractMap.get(subgrid)

    if(!SubgridRecord){//if subgridRecord is undefined then make a record for it
        abstractMap.set(subgrid,new Map())
        SubgridRecord=abstractMap.get(subgrid)
    }
    if(!SubgridRecord.has("buffer")){
        SubgridRecord.set("buffer",subgridBuffer)
    }

    if(!SubgridRecord.has("connections")){
        SubgridRecord.set("connections",new Map())
    }

    const StartTarget=SubgridRecord.get("connections").get(start)
    // const existsStart=abstractMap.get(subgrid).has(start)
    if(StartTarget){
        
        if(!StartTarget.has(end)){
            StartTarget.set(end,cost)
        }
    }else{
        const valueSet=new Map();
        valueSet.set(end,cost)
        SubgridRecord.get("connections").set(start,valueSet)

    }

    // const exists=abstractMap.has(start)

    // if(exists){
    //     //then check if end already in it
    //     const target=abstractMap.get(start)
        
    //     if(!target.has(end)){
    //         target.set(end,cost)
    //     }
    // }else{
    //     const valueSet=new Map();
    //     valueSet.set(end,cost)
    //     abstractMap.set(start,valueSet)
    // }

}

//now to build the connectivity of portals within a subsection
async function PortalConnectivity(Imglocation,debug=false){

    // For subgrid (X,Y)
    // console.log("hello?")
    const portalMapPlusDataPlusWidth=await generatePortalMap(Imglocation,debug);
    const portalMap=portalMapPlusDataPlusWidth[0]
    const rawData=portalMapPlusDataPlusWidth[1]
    
    const abstractMap=new Map();
    // console.log(portalMap)    
    const visited=new Set();
    for (const [subgridKey, portals] of portalMap.entries()) {
        // console.log(subgridKey)
        visited.add(subgridKey);//since it connects to all ajacent subgrids, we can skip it, when something connects to it
        const subgridXY=subgridKey.split(',');
        // console.log(portals)
        const subgridX=Number(subgridXY[0])
        const subgridY=Number(subgridXY[1])


        const adjacentGrids=[ 
            [subgridX,(subgridY-1),"startBottom"] , [subgridX,(subgridY+1),"startTop"] , 
            [(subgridX-1),subgridY,"startRight"] , [(subgridX+1),subgridY,"startLeft"] 
        ]
        //portals within a subgrid do not connect to each other since they represent open regions 
        // that are disconnected from each other
        //however that does not mean they cant connect to portals in adjacent subgrids
        for (let i = 0; i < portals.length; i++) {
            const startPortal = portals[i];
            const starty=startPortal.x +","+startPortal.y
            
            // const startkey=`${0},${0}|${Math.floor(startPortal.x/32)},${Math.floor(startPortal.y/32)}|${startPortal.x},${startPortal.y}`
            for(const dirAdj of adjacentGrids){
                if(visited.has(dirAdj[0]+","+dirAdj[1])){
                    continue; //skip if we already visited this subgrid
                }
                const accessSubgrid=portalMap.get(dirAdj[0]+","+dirAdj[1])
                if(accessSubgrid){

                    for (const goalPortalAdj of accessSubgrid) {
                        // console.log(goalPortalAdj,dirAdj[0]*32,dirAdj[1]*32,dirAdj[2],dirAdj[3])
                        const goalPAdj=goalPortalAdj.x +","+goalPortalAdj.y

                        const extractedstart=Buffer.from(await extractRegion(rawData,4,subgridX*32,subgridY*32,32,32))
                        const extractedend=Buffer.from(await extractRegion(rawData,4,dirAdj[0]*32,dirAdj[1]*32,32,32))

                        const entry={x:subgridX*32,y:subgridY*32}
                        const exit={x:dirAdj[0]*32,y:dirAdj[1]*32}
                        var combinedbuffer;
                        try{
                            combinedbuffer=await combineSegments(extractedstart,extractedend,entry,exit)//dirAdj[2])
                        }catch(e){
                            console.log("Error combining segments",e)
                        }
                        

                        const originX = combinedbuffer.origin.x//Math.min(subgridX, dirAdj[0]) * 32;
                        const originY = combinedbuffer.origin.y//Math.min(subgridY, dirAdj[1]) * 32;
                        const originstart={x:startPortal.x - originX,y:startPortal.y - originY}
                        const originend={x:goalPortalAdj.x - originX,y:goalPortalAdj.y - originY}
                        
                        try{
                            // console.log("start cost calc",originstart,originend);
                            let costy=await AstarPathCost(
                                combinedbuffer.buffer,//[0],
                                originstart,
                                originend,
                                {x:0,y:0},
                                combinedbuffer.width,
                                combinedbuffer.height,
                                debug
                            )
                            // console.log("end cost calc",costy);
                            if(debug){
                                const extractedCost=costy.cost;
                                if (extractedCost !== Infinity) {
                                    const extractedPath=costy.path;
                                    // console.log("extractedPath",extractedPath)

                                    // Path is in local coords of combinedbuffer
                                    for (const point of extractedPath) {
                                        // console.log(x,y,"extractedPath coords")
                                        const [x,y]=point.split(",").map(Number);
                                        // const x=
                                        // const y=point[1]
                                        // console.log(x,y,"extractedPath coords")
                                        
                                        const globalX = originX + x;
                                        const globalY = originY + y;
                                        const idx = (globalY * 1536 + globalX) * 4;
                                        rawData[idx] = 128;   // R
                                        rawData[idx+1] = 0;   // G
                                        rawData[idx+2] = 128; // B
                                        rawData[idx+3] = 255; // Alpha
                                    }

                                    const [firstX,firstY]=extractedPath[0].split(",").map(Number);
                                    const [LastX,LastY]=extractedPath[extractedPath.length-1].split(",").map(Number);
                                    const startIdx = ((originY+firstY) * 1536 + (originX+firstX)) * 4;
                                    const endIdx = ((originY+LastY) * 1536 + (originX+LastX)) * 4;
                                    rawData[startIdx] = 255;   // R
                                    rawData[startIdx+1] = 165;   // G
                                    rawData[startIdx+2] = 0; // B
                                    rawData[startIdx+3] = 255; // Alpha
                                    
                                    rawData[endIdx] = 255;   // R
                                    rawData[endIdx+1] = 165;   // G
                                    rawData[endIdx+2] = 0; // B
                                    rawData[endIdx+3] = 255; // Alpha

                                    await addEdgeToAbstractGraph(abstractMap,subgridKey,starty, goalPAdj, extractedCost,extractedstart);
                                    await addEdgeToAbstractGraph(abstractMap,`${dirAdj[0]},${dirAdj[1]}`,goalPAdj,starty, extractedCost,extractedend);
                                }
                            }else{
                                if (costy !== Infinity) {
                                    await addEdgeToAbstractGraph(abstractMap,subgridKey,starty, goalPAdj, costy,extractedstart);
                                    await addEdgeToAbstractGraph(abstractMap,`${dirAdj[0]},${dirAdj[1]}`,goalPAdj,starty, costy,extractedend);
                                }
                            }

                        }catch(b){
                            console.log("error here...",b)
                        }

                        
                    }
                }
            }
        }
        
    }
    if(debug){
        await sharp(rawData, {
            raw: {
                width: 1536,
                height: 1536,
                channels: 4
            }
        }).toFile(Imglocation);
    }
    console.log("YIPEE abstractmap creates")
    // console.log(abstractMap)
    return abstractMap;
}


module.exports={PortalConnectivity}