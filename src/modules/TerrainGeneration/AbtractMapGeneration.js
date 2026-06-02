const sharp = require('sharp');
const {MinHeap,PriorityQueue}=require("../Pathfinding/MinH_PQ.js")
const ChunkManager=require("../CacheChunkInfo.js")
const {convertMongoPortalGraphToMap}=require("../MongoAbstractConversions.js")

const {combineSegments,extractRegion}=require("./ImageStitching.js")


// Scale and position setup
const worldTileSize = 7.5;//7.5; // world units → corresponds to full width/height of walkMap

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

async function AstarPathCost(rawData, startPixel, goalPixel, segmentOrigin, segmentWidth, segmentHeight, flag = false) {
    const data = rawData;

    function getTerrainCost(x, y) {
        const idx = (y * segmentWidth + x) * 4;
        const r = data[idx], g = data[idx + 1], b = data[idx + 2];
        if (r === 255 && g === 255 && b === 255) return 1;   // White
        if (r === 255 && g === 255 && b === 0) return 1;     // Yellow
        if (r === 255 && g === 165 && b === 0) return 1;     // Orange
        if (r === 128 && g === 0 && b === 128) return 1;     // Purple
        return Infinity;
    }

    function heuristic(x1, y1, x2, y2) {
        const dx = x2 - x1, dy = y2 - y1;
        return Math.sqrt(dx * dx + dy * dy);
    }

    const startX = startPixel.x, startY = startPixel.y;
    const goalX = goalPixel.x, goalY = goalPixel.y;

    if (
        startX < 0 || startX >= segmentWidth || startY < 0 || startY >= segmentHeight ||
        goalX < 0 || goalX >= segmentWidth || goalY < 0 || goalY >= segmentHeight
    ) {
        return flag ? { cost: Infinity, path: [] } : Infinity;
    }

    const size = segmentWidth * segmentHeight;
    const gScore = new Float32Array(size).fill(Infinity);
    const fScore = new Float32Array(size).fill(Infinity);
    const cameFromX = new Int16Array(size).fill(-1);
    const cameFromY = new Int16Array(size).fill(-1);
    const closedSet = new Uint8Array(size); // 0 = not visited, 1 = visited

    function idx(x, y) { return y * segmentWidth + x; }

    const startIdx = idx(startX, startY);
    const goalIdx = idx(goalX, goalY);

    gScore[startIdx] = 0;
    fScore[startIdx] = heuristic(startX, startY, goalX, goalY);

    const openSet = new MinHeap((a, b) => a.f - b.f);
    openSet.push({ x: startX, y: startY, f: fScore[startIdx] });

    const directions = [
        [0, -1, 1], [1, 0, 1], [0, 1, 1], [-1, 0, 1],
        [1, -1, Math.SQRT2], [1, 1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]
    ];

    while (!openSet.isEmpty()) {
        const current = openSet.pop();
        const curIdx = idx(current.x, current.y);

        if (closedSet[curIdx]) continue; // already processed
        closedSet[curIdx] = 1;

        if (current.x === goalX && current.y === goalY) {
            const totalCost = gScore[curIdx];
            if (!flag) return totalCost;

            // Reconstruct path
            const path = [];
            let cx = goalX, cy = goalY, guard = 0;
            while (!(cx === startX && cy === startY)) {
                path.push(`${cx},${cy}`);
                const prevX = cameFromX[idx(cx, cy)];
                const prevY = cameFromY[idx(cx, cy)];
                if (prevX === -1 || ++guard > size) break;
                cx = prevX;
                cy = prevY;
            }
            path.push(`${startX},${startY}`);
            path.reverse();
            return { cost: totalCost, path };
        }

        for (const [dx, dy, moveCost] of directions) {
            const nx = current.x + dx, ny = current.y + dy;
            if (nx < 0 || nx >= segmentWidth || ny < 0 || ny >= segmentHeight) continue;

            // Prevent diagonal corner cutting
            if (dx !== 0 && dy !== 0) {
                if (getTerrainCost(current.x + dx, current.y) === Infinity ||
                    getTerrainCost(current.x, current.y + dy) === Infinity) {
                    continue;
                }
            }

            const tCost = getTerrainCost(nx, ny);
            if (tCost === Infinity) continue;

            const nIdx = idx(nx, ny);
            const tentativeG = gScore[curIdx] + tCost * moveCost;
            if (tentativeG < gScore[nIdx]) {
                cameFromX[nIdx] = current.x;
                cameFromY[nIdx] = current.y;
                gScore[nIdx] = tentativeG;
                fScore[nIdx] = tentativeG + heuristic(nx, ny, goalX, goalY);
                openSet.push({ x: nx, y: ny, f: fScore[nIdx] });
            }
        }
    }

    return flag ? { cost: Infinity, path: [] } : Infinity;
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

//above is creating the abstract map, finding the portals of the image
//--------------------------------------
//combine 3 subgrids of the path into a big buffer and run A* over it
async function TotalSubgridCombining(windowNodes, InputTileData=null){
    const TILE_SIZE = 1536;
    const SUBGRID_SIZE = 32;

    // Parse nodes → unique subgrids
    const seen = new Set();
    const positions = [];

    for (const node of windowNodes) {
        const [chunkPart, subgridPart,pixelPart] = node.split('|');
        // console.log("subgridPart",subgridPart)
        const [chunkX, chunkY] = chunkPart.split(',').map(Number);
        const [sgX, sgY] = subgridPart.split(',').map(Number);

        const key = `${chunkX},${chunkY},${sgX},${sgY}`;
        if (!seen.has(key)) {
            seen.add(key);
            positions.push({
                chunkX, chunkY, sgX, sgY,
                worldX: chunkX * TILE_SIZE + sgX * SUBGRID_SIZE,
                worldY: chunkY * TILE_SIZE + sgY * SUBGRID_SIZE
            });
        }
    }

    if (positions.length === 0) return null;

    let minX = Math.floor(Math.min(...positions.map(p => p.worldX)) / SUBGRID_SIZE) * SUBGRID_SIZE;
    let minY = Math.floor(Math.min(...positions.map(p => p.worldY)) / SUBGRID_SIZE) * SUBGRID_SIZE;
    let maxX = (Math.floor(Math.max(...positions.map(p => p.worldX)) / SUBGRID_SIZE)) * SUBGRID_SIZE;
    let maxY = (Math.floor(Math.max(...positions.map(p => p.worldY)) / SUBGRID_SIZE)) * SUBGRID_SIZE;

    // Add extra subgrid padding
    const EXTRA_SUBGRIDS = 0; // Adds 64px on each side if SUBGRID_SIZE = 32
    const originX = minX//Math.max(0, minX - (EXTRA_SUBGRIDS * SUBGRID_SIZE));
    const originY = minY//Math.max(0, minY - (EXTRA_SUBGRIDS * SUBGRID_SIZE));

    const width = (maxX - minX)*32 +32//+ (EXTRA_SUBGRIDS * 2 * SUBGRID_SIZE);
    const height = (maxY - minY)*32 +32 //+ (EXTRA_SUBGRIDS * 2 * SUBGRID_SIZE);
    // const width = countX //* SUBGRID_SIZE;
    // const height = countY //* SUBGRID_SIZE;
    // console.log("buffer ",width,height)
    const combinedBuffer = Buffer.alloc(width * height * 4, 0);

    // Copy each subgrid into combined buffer
    for (const pos of positions) {
        const tileKey = `${pos.chunkX},${pos.chunkY}`;
        var tileData;
        if(InputTileData==null){
            tileData = await getDataOfTile(tileKey); // Full abstract map
        }else{
            tileData=InputTileData
        }
        

        // const subgridData = await extractRegion(
        //     tileData,
        //     4,
        //     pos.sgX * SUBGRID_SIZE,
        //     pos.sgY * SUBGRID_SIZE,
        //     SUBGRID_SIZE,
        //     SUBGRID_SIZE
        // );
        const subgridData=tileData.get(`${pos.sgX},${pos.sgY}`).get("buffer")

        const destX = pos.worldX - originX;
        const destY = pos.worldY - originY;

        for (let y = 0; y < SUBGRID_SIZE; y++) {
            const srcOffset = y * SUBGRID_SIZE * 4;
            const destOffset = ((destY + y) * width + destX) * 4;
            combinedBuffer.set(subgridData.subarray(srcOffset, srcOffset + SUBGRID_SIZE * 4), destOffset);
        }
    }

    return {
        buffer: combinedBuffer,
        origin: { x: originX, y: originY },
        width,
        height
    };
}




async function AstarPathCostPathIncluded(rawData, startPixel, goalPixel, segmentOrigin, segmentWidth, segmentHeight) {
    // If start == goal, no move needed
    // if (startPixel.x === goalPixel.x && startPixel.y === goalPixel.y) {
    //     console.log("reached final grid, stick",)
    //     return [startPixel]//null // cost = 0, no next pixel, already at destination
    // }
    
    let data;
    if (Buffer.isBuffer(rawData) && rawData.length === segmentWidth * segmentHeight * 4) {//
        // console.log("ok")
        data = rawData; // Already cropped region
    } else {
        console.log("extracting?")
        data = await extractRegion(rawData, 4, segmentOrigin.x, segmentOrigin.y, segmentWidth, segmentHeight);
    }

    function isWalkableColor(r, g, b) {
        return r === Number(255) && g === Number(255) && (b === Number(255) || b === Number(0));
    }


    const idxg = (goalPixel.y * segmentWidth + goalPixel.x) * 4;
    const rg = data[idxg], gg = data[idxg + 1], bg = data[idxg + 2];
    if (!isWalkableColor(rg, gg, bg)) {
        return [Infinity,null]//{ x: goalPixel.x, y: goalPixel.y };
    }



    // const startIndex = (startPixel.y * segmentWidth + startPixel.x) * 4;
    // const r = data[startIndex], g = data[startIndex + 1], b = data[startIndex + 2];
    // if(r==Number(0) && g==Number(0) && b==Number(0)){
    //     console.log("oh, tragedy")
    // }
    // console.log("Goal pixel color:",goalPixel, r, g, b);

    function getTerrainCost(localX, localY) {
        if (localX < 0 || localX >= segmentWidth || localY < 0 || localY >= segmentHeight) return Infinity;
        const index = (localY * segmentWidth + localX) * 4;
        const r = data[index], g = data[index + 1], b = data[index + 2];
        // if(b==Number(0)){
        // console.log(b, "mmmmmmmmmm.")
        // }
        
        if (r === Number(255) && g === Number(255) && b === Number(255)) return 1;     // White → Normal
        if (r === Number(255) && g === Number(255) && b === Number(0)){   return 1};   // Yellow → Shallow water
        return Infinity;                                      // Others → Impassable
    }

    function heuristic(x1, y1, x2, y2) {
        const dx = x2 - x1, dy = y2 - y1;
        return Math.sqrt(dx * dx + dy * dy);
    }

    const start = {
        x: startPixel.x,// - segmentOrigin.x,
        y: startPixel.y,// - segmentOrigin.y
    };
    const goal = {
        x: goalPixel.x, //- segmentOrigin.x,
        y: goalPixel.y,// - segmentOrigin.y
    };
    // console.log('A* origin:', segmentOrigin, 'Combined origin:', origin, originY);
    // console.log('Start pixel:', startPixel, 'Goal pixel:', goalPixel);

    const openSet = new MinHeap((a, b) => a.f - b.f);
    const cameFrom = new Map();

    const gScore = Array.from({ length: segmentHeight }, () => Array(segmentWidth).fill(Infinity));
    const fScore = Array.from({ length: segmentHeight }, () => Array(segmentWidth).fill(Infinity));

    if (start.x < 0 || start.x >= segmentWidth || start.y < 0 || start.y >= segmentHeight) {
        throw new Error(`Start out of bounds: start=(${start.x},${start.y}), segment=(0..${segmentWidth-1}, 0..${segmentHeight-1}), origin=${segmentOrigin.x},${segmentOrigin.y}`);
    }
    if (goal.x < 0 || goal.x >= segmentWidth || goal.y < 0 || goal.y >= segmentHeight) {
        throw new Error(`goal out of bounds: start=(${start.x},${start.y}), segment=(0..${segmentWidth-1}, 0..${segmentHeight-1}), origin=${segmentOrigin.x},${segmentOrigin.y}`);
    }

    gScore[start.y][start.x] = 0;
    fScore[start.y][start.x] = heuristic(start.x, start.y, goal.x, goal.y);

    openSet.push({ x: start.x, y: start.y, f: fScore[start.y][start.x] });

    const directions = [
        [0, -1], [1, 0], [0, 1], [-1, 0],    // 4-way
        [1, -1], [1, 1], [-1, 1], [-1, -1]  // 8-way
    ];

    while (!openSet.isEmpty()) {
        const current = openSet.pop();
        if (current.x === goal.x && current.y === goal.y) {
            const totalCost = gScore[current.y][current.x];

            // Trace back one step: goal → start
            let node = `${goal.x},${goal.y}`;
            let prev = cameFrom.get(node);

            // If goal is the same as start, no move needed
            if (!prev) {
                return [totalCost, null];
            }

            // Walk back until prev = start
            while (prev && prev !== `${start.x},${start.y}`) {
                node = prev;
                prev = cameFrom.get(node);
            }

            // node now holds the first move after start
            const [nx, ny] = node.split(',').map(Number);
            const nextPixel = {
                x: nx, //+ segmentOrigin.x,
                y: ny,// + segmentOrigin.y
            };

            return [totalCost, nextPixel];
        }

        for (const [dx, dy] of directions) {
            const nx = current.x + dx, ny = current.y + dy;
            if (nx < 0 || nx >= segmentWidth || ny < 0 || ny >= segmentHeight) continue;

            const cost = getTerrainCost(nx, ny);
            if (cost === Infinity) continue;

            const tentativeG = gScore[current.y][current.x] + cost;
            if (tentativeG < gScore[ny][nx]) {
                cameFrom.set(`${nx},${ny}`, `${current.x},${current.y}`);
                gScore[ny][nx] = tentativeG;
                fScore[ny][nx] = tentativeG + heuristic(nx, ny, goal.x, goal.y);
                openSet.push({ x: nx, y: ny, f: fScore[ny][nx] });
            }
        }
    }

    return [Infinity, null]; // No path found
}


//generate the path over the abstract map
//combineDataOfSubgridsForSearch use to get cost over tile borders
async function combineDataOfSubgridsForSearch(tileAKey,tileBKey,startPixel,subgridStart,direction,targetAbtractMap){
    // console.log("trying to make a conenction over chunk borders")
    function combineSubgridRegions(regionA, regionB, direction) {
        const width = (direction === "left" || direction === "right") ? 64 : 32;
        const height = (direction === "top" || direction === "bottom") ? 64 : 32;
        const channels = 4;

        const combined = Buffer.alloc(width * height * channels);

        const writeRegion = (src, offsetX, offsetY) => {
            for (let y = 0; y < 32; y++) {
                for (let x = 0; x < 32; x++) {
                    const destX = offsetX + x;
                    const destY = offsetY + y;

                    const destIndex = (destY * width + destX) * channels;
                    const srcIndex = (y * 32 + x) * channels;

                    for (let c = 0; c < channels; c++) {
                        combined[destIndex + c] = src[srcIndex + c];
                    }
                }
            }
        };

        if (direction === "left") {
            writeRegion(regionB, 0, 0);       // left subgrid from other chunk
            writeRegion(regionA, 32, 0);      // current subgrid
        } else if (direction === "right") {
            writeRegion(regionA, 0, 0);       // current subgrid
            writeRegion(regionB, 32, 0);      // right subgrid from other chunk
        } else if (direction === "top") {
            writeRegion(regionB, 0, 0);       // top subgrid from other chunk
            writeRegion(regionA, 0, 32);      // current subgrid
        } else if (direction === "bottom") {
            writeRegion(regionA, 0, 0);       // current subgrid
            writeRegion(regionB, 0, 32);      // bottom subgrid from other chunk
        }

        return {
            buffer: combined,
            width,
            height
        };
    }

    const dataA=await getDataOfTile(tileAKey);
    const dataB=await getDataOfTile(tileBKey);
    // console.log(dataA.le)
    // console.log("dataA",tileAKey,tileBKey)

    const segmentXS=subgridStart[0]
    const segmentYS=subgridStart[1]
    const startSegmentExtract=dataA.get(`${segmentXS},${segmentYS}`).get("buffer")//await extractRegion(dataA,4,segmentXS,segmentYS,32,32)
    // console.log(startSegmentExtract.length,"hmm, hopefully 4096")
    

    var endSubgrid=[0,0]
    //depending on direction 0,0 is on the start or the end, so pixel locations need to be shifted
    const shifts={
        startshiftX:0,
        startshiftY:0,
        endshiftX:0,
        endshiftY:0
    }

    switch(direction){
        case "left":
            endSubgrid=[47,subgridStart[1]]
            shifts.startshiftX=32
            break;
        case "right":
            endSubgrid=[0,subgridStart[1]]
            shifts.endshiftX=32
            break;
        case "top":
            endSubgrid=[subgridStart[0],47]
            shifts.startshiftY=32
            break;
        case "bottom":
            endSubgrid=[subgridStart[0],0]
            shifts.endshiftY=32
            break;
    }

    const XendSeg=endSubgrid[0]
    const YendSeg=endSubgrid[1]
    // console.log("end and start.... ",[XendSeg,YendSeg],[segmentXS,segmentYS])
    const endSegmentExtract=dataB.get(`${XendSeg},${YendSeg}`).get("buffer")//await extractRegion(dataB,4,XendSeg,YendSeg,32,32)
    // console.log("aight... we running")
    //return cost

    const combined=combineSubgridRegions(startSegmentExtract,endSegmentExtract,direction)

    const goalKey=`${endSubgrid[0]},${endSubgrid[1]}`
    const portalsOfGoalSegment=targetAbtractMap.get(goalKey).get("connections")

    const startInput={
        x:startPixel[0] - segmentXS*32 +shifts.startshiftX,
        y:startPixel[1] - segmentYS*32 +shifts.startshiftY
    }
    //segment origin should be 00 since you want the whole buffer
    const segmentOrigin={
        x:0,
        y:0
    }
    const neighbourObjs=[]
    //iterate over the portals in the goal segment, if the portal shares the edge with the start, calc cost!
    for (const [key, portals] of portalsOfGoalSegment.entries()){
        
        const [keyx,keyy]=key.split(",")

        //key is the portal that is within the goal subgrid, portals is the array of portals that connect to it
        const goalInput={
            x:Number(keyx) - XendSeg*32 + shifts.endshiftX,
            y:Number(keyy) - YendSeg*32 + shifts.endshiftY
        }
        // console.log(startInput,goalInput,direction, "input pixels man")
        switch(direction){
            case "left":
                if(Number(keyx)>32){
                    // startInput.x=startInput.x-1
                    // console.log(combined.buffer,"buffman")
                    const cost=await AstarPathCost(combined.buffer,startInput,goalInput,segmentOrigin,64,32)
                    // console.log("cost",cost)
                    // neighbourObjs.push([key,cost])
                    // Only add if reachable else {
                    if (cost != Infinity) {
                        neighbourObjs.push([key, cost]);
                    }
                }
                break;
            case "right":
                if(Number(keyx)<1512){//1536-32=1512
                    
                    const cost=await AstarPathCost(combined.buffer,startInput,goalInput,segmentOrigin,64,32)
                    // console.log("cost",cost)
                    // neighbourObjs.push([key,cost])
                    // Only add if reachable
                    if (cost != Infinity) {
                        neighbourObjs.push([key, cost]);
                    }
                }
                break;
            case "top":
                if(Number(keyy)>32){
                    // startInput.y=startInput.y-1
                    const cost=await AstarPathCost(combined.buffer,startInput,goalInput,segmentOrigin,32,64)
                    // console.log("cost",cost)
                    // neighbourObjs.push([key,cost])
                    // Only add if reachable
                    if (cost != Infinity) {
                        neighbourObjs.push([key, cost]);
                    }
                }
                break;
            case "bottom":
                if(Number(keyy)<1512){

                    const cost=await AstarPathCost(combined.buffer,startInput,goalInput,segmentOrigin,32,64)
                    // console.log("cost",cost)
                    // neighbourObjs.push([key,cost])
                    // Only add if reachable
                    if (cost != Infinity) {
                        neighbourObjs.push([key, cost]);
                    }
                }
                break;
        }
    }
    // console.log("neighbourObjs",neighbourObjs,"neighbourObjs")
    return neighbourObjs
}

async function abstractMapAstarMultiTileCapable(start, goal, startChunkAbstractMap) {
    // console.log("gets here, ",start,goal)
    const TILE_SIZE = 1536;
    const SUBGRID_SIZE = 32;

    async function loadChunkAbstractMap(tileKey) {
        const [chunkX, chunkY] = tileKey.split(",").map(Number);
        try {
            const abstractMapObject = await getDataOfTile(`${chunkX},${chunkY}`)//ChunkManager.getTile(chunkX, chunkY).AbstractMap;
            return abstractMapObject//convertMongoPortalGraphToMap(abstractMapObject);
        } catch {
            return false;
        }
    }

    function parseChunkKey(fullKey) {
        return fullKey.split('|')[0]; // "chunkX,chunkY"
    }

    function parseSubgridKey(fullKey) {
        return fullKey.split('|')[1]; // "subgridX,subgridY"
    }

    function heuristic(aKey, bKey) {
        const [aChunk, aSubgrid, aPixel] = aKey.split('|');
        const [aChunkX, aChunkY] = aChunk.split(',').map(Number);
        const [aSubX, aSubY] = aSubgrid.split(',').map(Number);
        const [aPX, aPY] = aPixel.split(',').map(Number);

        const [bChunk, bSubgrid, bPixel] = bKey.split('|');
        const [bChunkX, bChunkY] = bChunk.split(',').map(Number);
        const [bSubX, bSubY] = bSubgrid.split(',').map(Number);
        const [bPX, bPY] = bPixel.split(',').map(Number);

        const ax = aChunkX * TILE_SIZE + aSubX * SUBGRID_SIZE + aPX;
        const ay = aChunkY * TILE_SIZE + aSubY * SUBGRID_SIZE + aPY;

        const bx = bChunkX * TILE_SIZE + bSubX * SUBGRID_SIZE + bPX;
        const by = bChunkY * TILE_SIZE + bSubY * SUBGRID_SIZE + bPY;

        return Math.hypot(bx - ax, by - ay);
    }

    function reconstructPath(cameFrom, current) {
        const path = [current];
        while (cameFrom.has(current)) {
            current = cameFrom.get(current);
            path.push(current);
        }
        return path.reverse();
    }

    // Initialize loaded maps with start chunk map
    const loadedChunkMaps = new Map();
    const startChunkKey = parseChunkKey(start);
    loadedChunkMaps.set(startChunkKey, startChunkAbstractMap);
    // console.log("fails to copy?",loadedChunkMaps.get(startChunkKey),"fails to copy?")
    // const loadedTileData = new Map();
    // loadedTileData.set(startChunkKey, await getDataOfTile(startChunkKey));

    const openSet = new PriorityQueue(); // MinHeap by fScore = gScore + heuristic
    const cameFrom = new Map();
    const gScore = new Map();

    gScore.set(start, 0);
    openSet.enqueue(start, heuristic(start, goal));

    while (!openSet.isEmpty()) {
        const current = openSet.dequeue();
        // console.log("current",current)
        // Skip if this is an outdated node with worse gScore
        const currentG = gScore.get(current);
        if (currentG === undefined) continue;

        if (current === goal) {
            return reconstructPath(cameFrom, current);
        }

        const chunkKey = parseChunkKey(current);
        const subgridKey = parseSubgridKey(current);

        // Load chunk map if missing
        if (!loadedChunkMaps.has(chunkKey)) {
            const newMap = await loadChunkAbstractMap(chunkKey);
            if (!newMap) continue;
            loadedChunkMaps.set(chunkKey, newMap);
        }
        // console.log(chunkKey,"chunkKey current")
        const graph = loadedChunkMaps.get(chunkKey)//.get("connections");
        // console.log(graph,"graph")
        if (!graph) continue;

        const subgridMap = graph.get(subgridKey).get("connections");
        // console.log(subgridMap,"subgridMap")
        if (!subgridMap) continue;

        const neighbors = subgridMap.get(current.split('|')[2]);
        if (!neighbors) continue;

        const [CCX, CCY] = chunkKey.split(",").map(Number);
        const [pixelXC, pixelYC] = current.split('|')[2].split(",").map(Number);
        const [SubgridXC, SubgridYC] = current.split('|')[1].split(",").map(Number);

        // Check for cross-chunk adjacency edges
        const edges = [];
        if (SubgridXC === 0) edges.push("left");
        else if (pixelXC === 47) edges.push("right");
        if (SubgridYC === 0) edges.push("top");
        else if (SubgridYC === 47) edges.push("bottom");

        const deltas = {
            "left": [-1, 0],
            "right": [1, 0],
            "top": [0, -1],
            "bottom": [0, 1]
        };

        for (const edge of edges) {
            if (!(edge in deltas)) continue;
            const adjChunkKey = `${CCX + deltas[edge][0]},${CCY + deltas[edge][1]}`;

            let accessAbstractMap = loadedChunkMaps.get(adjChunkKey);
            if (!accessAbstractMap) {
                accessAbstractMap = await loadChunkAbstractMap(adjChunkKey);
                if (!accessAbstractMap) continue;
                loadedChunkMaps.set(adjChunkKey, accessAbstractMap);
            }

            const adjNeighbours = await combineDataOfSubgridsForSearch(
                current.split('|')[0],//tileAkey
                adjChunkKey,//tileBkey
                [pixelXC, pixelYC],//start
                [SubgridXC, SubgridYC],//startingsubgrid
                edge,//direction
                accessAbstractMap//the abtractmap of the adjacent tile
            );

            for (const [portalKey, cost] of adjNeighbours) {
                // console.log("portalKey",portalKey,"cost",cost)
                const setKey = `${adjChunkKey}|${portalKey}`;
                // neighbors[setKey] = cost;
                neighbors.set(setKey, cost);
            }
        }

        // console.log("something to do with processing neighbours,",current,neighbors)
        // Process all neighbors
        for (const [neighborPixel, cost] of neighbors.entries()) {
            // console.log(neighborPixel,cost)
            const breakdown = neighborPixel.split("|");

            let newChunkX = CCX;
            let newChunkY = CCY;
            let PixelPoint;

            if (breakdown.length === 1) {
                PixelPoint = breakdown[0].split(",");
            } else if (breakdown.length === 2) {
                const [cx, cy] = breakdown[0].split(",").map(Number);
                newChunkX = cx;
                newChunkY = cy;
                PixelPoint = breakdown[1].split(",");
                // console.log("bruh come on, ",newChunkX,newChunkY,PixelPoint,"PixelPoint")
            } else {
                console.warn("Unexpected neighbor key format:", neighborPixel);
                continue;
            }

            const [neighPX, neighPY] = PixelPoint.map(Number);
            const subgridX = Math.floor(neighPX / SUBGRID_SIZE);
            const subgridY = Math.floor(neighPY / SUBGRID_SIZE);
            const neighborKey = `${newChunkX},${newChunkY}|${subgridX},${subgridY}|${neighPX},${neighPY}`;

            // Load tile data if missing
            const chunkKeyStr = `${newChunkX},${newChunkY}`;
            // console.log("chunkKeyStr",chunkKeyStr)
            // if (!loadedTileData.has(chunkKeyStr)) {
            //     const tileDataObj = await getDataOfTile(chunkKeyStr);
            //     if (!tileDataObj) {
            //         // Unable to load tile data, skip neighbor
            //         continue;
            //     }
            //     loadedTileData.set(chunkKeyStr, tileDataObj);
            // }
            // console.log(chunkKeyStr,"chunkKeyStr",`${subgridX},${subgridY}`,"subgrid of neigh")
            var tileData = loadedChunkMaps.get(chunkKeyStr)//.get('buffer')//loadedTileData.get(chunkKeyStr)//.get();
            if(!tileData){console.log("no abtract map?")}
            
            tileData=tileData.get(`${subgridX},${subgridY}`)
            if(!tileData){console.log("no subgrid on;", `${subgridX},${subgridY}`);continue;}
             
            tileData=tileData.get("buffer")
            if(!tileData){continue;}

            const tentativeG = currentG + cost;
            if (!gScore.has(neighborKey) || tentativeG < gScore.get(neighborKey)) {
                // console.log("even into the boom")
                cameFrom.set(neighborKey, current);
                gScore.set(neighborKey, tentativeG);
                const fScore = tentativeG + heuristic(neighborKey, goal);
                openSet.enqueue(neighborKey, fScore);
            }
        }
    }

    // No path found
    return null;
}

module.exports={PortalConnectivity,AstarPathCost,abstractMapAstarMultiTileCapable,TotalSubgridCombining,AstarPathCostPathIncluded}