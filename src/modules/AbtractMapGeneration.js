const sharp = require('sharp');
const {MinHeap,PriorityQueue}=require("./MinH_PQ.js")
const ChunkManager=require("./CacheChunkInfo.js")
const {convertMongoPortalGraphToMap}=require("./MongoAbstractConversions.js")
const {getDataOfTile}=require("./PathfindingFunctionality.js")

const walkMapWidth=1536//512*3
const walkMapHeight=1536//512*3

// Scale and position setup
const worldTileSize = 7.5;//7.5; // world units → corresponds to full width/height of walkMap
const pixelsPerUnit = walkMapWidth / worldTileSize;

const subgridSize=32;

async function generatePortalMap(Imglocation) {
    // Load the walkmap
    const { data, info } = await sharp(Imglocation)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

    const gridCols = Math.ceil(info.width / subgridSize);
    const gridRows = Math.ceil(info.height / subgridSize);

    const portalMap = new Map();

    // Walkable check (white or yellow)
    function isWalkable(x, y) {
        if (x < 0 || y < 0 || x >= info.width || y >= info.height) return false;
        const index = (y * info.width + x) * 4;
        const r = data[index], g = data[index + 1], b = data[index + 2];
        return (r === 255 && g === 255 && (b === 255 || b === 0));
    }

    // Detect portals for one subgrid
    function detectPortalsForSubgrid(subgridX, subgridY) {
        const startX = subgridX * subgridSize;
        const startY = subgridY * subgridSize;

        const portals = [];

        // Helper: process one edge
        function processEdge(edge, fixedCoord, variableStart, variableEnd, horizontal) {
            let segmentStart = null;

            for (let i = variableStart; i <= variableEnd; i++) {
                const x = horizontal ? i : fixedCoord;
                const y = horizontal ? fixedCoord : i;

                if (isWalkable(x, y)) {
                    if (segmentStart === null) segmentStart = i;
                } else {
                    if (segmentStart !== null) {
                        const mid = Math.floor((segmentStart + i - 1) / 2);
                        const portalX = horizontal ? mid : fixedCoord;
                        const portalY = horizontal ? fixedCoord : mid;
                        portals.push({ x: portalX, y: portalY, edge });
                        segmentStart = null;
                    }
                }
            }

            if (segmentStart !== null) {
                const mid = Math.floor((segmentStart + variableEnd) / 2);
                const portalX = horizontal ? mid : fixedCoord;
                const portalY = horizontal ? fixedCoord : mid;
                portals.push({ x: portalX, y: portalY, edge });
            }
        }

        // Process edges: top, bottom, left, right
        processEdge('top', startY, startX, startX + subgridSize - 1, true);
        processEdge('bottom', startY + subgridSize - 1, startX, startX + subgridSize - 1, true);
        processEdge('left', startX, startY, startY + subgridSize - 1, false);
        processEdge('right', startX + subgridSize - 1, startY, startY + subgridSize - 1, false);

        return portals;
    }

    // Loop through subgrids
    for (let gridY = 0; gridY < gridRows; gridY++) {
        for (let gridX = 0; gridX < gridCols; gridX++) {
            const portals = detectPortalsForSubgrid(gridX, gridY);
            portalMap.set(`${gridX},${gridY}`, portals);
        }
    }

    return [portalMap, data];
}

async function addEdgeToAbstractGraph(abstractMap,subgrid,start, end, cost){

    //abstractmap structure should be subgrid -> (start -> (end->cost))

    var SubgridRecord=abstractMap.get(subgrid)

    if(!SubgridRecord){//if subgridRecord is undefined then make a record for it
        abstractMap.set(subgrid,new Map())
        SubgridRecord=abstractMap.get(subgrid)
    }

    const StartTarget=SubgridRecord.get(start)
    // const existsStart=abstractMap.get(subgrid).has(start)
    if(StartTarget){
        
        if(!StartTarget.has(end)){
            StartTarget.set(end,cost)
        }
    }else{
        const valueSet=new Map();
        valueSet.set(end,cost)
        SubgridRecord.set(start,valueSet)

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

async function extractRegion(rawData, channels, x, y, width, height) {
  const region = new Uint8Array(width * height * channels);

  for (let row = 0; row < height; row++) {
    const srcStart = ((y + row) * walkMapWidth + x) * channels;
    const srcEnd = srcStart + width * channels;

    const dstStart = row * width * channels;

    region.set(rawData.subarray(srcStart, srcEnd), dstStart);
  }

  return region;
}

async function AstarPathCost(rawData,startPixel, goalPixel, segmentOrigin, segmentWidth, segmentHeight) {
    const data = (Buffer.isBuffer(rawData) && rawData.length === segmentWidth * segmentHeight * 4)
        ? rawData
        : await extractRegion(rawData, 4, segmentOrigin.x, segmentOrigin.y, segmentWidth, segmentHeight);

    function getTerrainCost(x, y) {
        if (x < 0 || x >= segmentWidth || y < 0 || y >= segmentHeight) return Infinity;
        const index = (y * segmentWidth + x) * 4;
        const r = data[index], g = data[index + 1], b = data[index + 2];

        if (r == Number(255) && g == Number(255) && b == Number(255)) return 1;      // White → Normal
        if (r == Number(255) && g == Number(255) && b == Number(0)) {return 1.5};      // Yellow → Shallow water
        return Infinity;                                        // Everything else → Blocked
    }

    function heuristic(x1, y1, x2, y2) {
        const dx = x2 - x1, dy = y2 - y1;
        return Math.sqrt(dx * dx + dy * dy);
    }

    const start = { x: startPixel.x - segmentOrigin.x, y: startPixel.y - segmentOrigin.y };
    const goal = { x: goalPixel.x - segmentOrigin.x, y: goalPixel.y - segmentOrigin.y };

    const openSet = new MinHeap((a, b) => a.f - b.f);

    const size = segmentWidth * segmentHeight;
    const gScore = new Float32Array(size).fill(Infinity);
    const fScore = new Float32Array(size).fill(Infinity);

    const startIndex = start.y * segmentWidth + start.x;
    const goalIndex = goal.y * segmentWidth + goal.x;

    gScore[startIndex] = 0;
    fScore[startIndex] = heuristic(start.x, start.y, goal.x, goal.y);

    openSet.push({ index: startIndex, x: start.x, y: start.y, f: fScore[startIndex] });

    const directions = [
        [0, -1], [1, 0], [0, 1], [-1, 0], // 4-way
        [1, -1], [1, 1], [-1, 1], [-1, -1] // 8-way
    ];

    while (!openSet.isEmpty()) {
        const current = openSet.pop();
        if (current.index === goalIndex) return gScore[current.index];

        for (const [dx, dy] of directions) {
            const nx = current.x + dx, ny = current.y + dy;
            if (nx < 0 || nx >= segmentWidth || ny < 0 || ny >= segmentHeight) continue;

            // Diagonal check
            if (Math.abs(dx) + Math.abs(dy) === 2) {
                if (getTerrainCost(current.x + dx, current.y) === Infinity ||
                    getTerrainCost(current.x, current.y + dy) === Infinity) {
                    continue;
                }
            }

            const cost = getTerrainCost(nx, ny);
            if (cost === Infinity) continue;

            const neighborIndex = ny * segmentWidth + nx;
            const tentativeG = gScore[current.index] + cost;
            if (tentativeG < gScore[neighborIndex]) {
                gScore[neighborIndex] = tentativeG;
                fScore[neighborIndex] = tentativeG + heuristic(nx, ny, goal.x, goal.y);
                openSet.push({ index: neighborIndex, x: nx, y: ny, f: fScore[neighborIndex] });
            }
        }
    }

    return Infinity;
}

//now to build the connectivity of portals within a subsection
async function PortalConnectivity(Imglocation){
    // For subgrid (X,Y)
    // console.log("hello?")
    const portalMapPlusDataPlusWidth=await generatePortalMap(Imglocation);
    const portalMap=portalMapPlusDataPlusWidth[0]
    const rawData=portalMapPlusDataPlusWidth[1]
    
    const abstractMap=new Map();
    
    for (const [key, portals] of portalMap.entries()) {
        // console.log(portals,key)
        const XY=key.split(',');
        // console.log(portals)
        const X=Number(XY[0])
        const Y=Number(XY[1])
        // console.log(X*32,Y*32)
        for (let i = 0; i < portals.length; i++) {
            const startPortal = portals[i];
            const starty=startPortal.x +","+startPortal.y
            //this loop makes sure each portal node in a subgrid has its cost measured to each other node in the subgrid
            for (let j = i + 1; j < portals.length; j++) {
                
                const goalPortal = portals[j];
                // console.log("goalPortal structure: ",goalPortal)
                let cost = await AstarPathCost(rawData,startPortal, goalPortal, {x:X*32,y:Y*32},32,32);
                // console.log (cost )
                if (cost !== Infinity) {
                    
                    const goaly=goalPortal.x +","+goalPortal.y
                    //adds edge relationship with other portals in the subgrid
                    await addEdgeToAbstractGraph(abstractMap,key,starty, goaly, cost);
                    await addEdgeToAbstractGraph(abstractMap,key,goaly, starty, cost);
                }
                
            }
            // deal with connectivity to nodes in the adjacent grid
            switch(startPortal.edge){
                case "top":
                    //for now, if Y is 0 then it skips but otherwise this means it has to check the next tile
                    if(Y==0){break};

                    // console.log(X+","+(Y-1), "SHOULD BE above")
                    const aboveSubgrid=portalMap.get(X+","+(Y-1))
                    if(aboveSubgrid){
                        for (const goalPortalAbove of aboveSubgrid) {
                            // console.log(goalPortalAbove)
                            if(goalPortalAbove.edge=="bottom"){
                                // console.log(value)
                                let cost = await AstarPathCost(rawData,startPortal, goalPortalAbove, {x:X*32,y:(Y-1)*32},32,64);//32*2
                                // console.log(cost)
                                const goalPAbove=goalPortalAbove.x +","+goalPortalAbove.y
                                if (cost !== Infinity) {
                                    await addEdgeToAbstractGraph(abstractMap,key,starty, goalPAbove, cost);

                                    // await addEdgeToAbstractGraph(abstractMap,key,goalPAbove,starty, cost);
                                }
                            }
                        }
                    }

                    break;
                case "bottom":
                    // console.log(key)
                    //for now, if Y is 47 then it skips but otherwise this means it has to check the next tile
                    
                    if(Y==47){break};
                    // const YNext=Y+1 

                    const BelowSubgrid=portalMap.get(X+","+(Y+1))
                    if(BelowSubgrid){//subgrid locations with no portals dont actually exist in PortalMap
                        for (const goalPortalBelow of BelowSubgrid) {
                            if(goalPortalBelow.edge=="top"){
                                //{x:X*32,y:(Y)*32} because the startPortal is the top subgrid matching topedge of below
                                let cost = await AstarPathCost(rawData,startPortal, goalPortalBelow, {x:X*32,y:(Y)*32},32,64);//32*2
                                const goalPBelow=goalPortalBelow.x +","+goalPortalBelow.y//+","+goalPortalBelow.edge
                                if (cost !== Infinity) {
                                    await addEdgeToAbstractGraph(abstractMap,key,starty, goalPBelow, cost);

                                    // await addEdgeToAbstractGraph(abstractMap,key,goalPBelow,starty , cost);
                                }
                            }
                        }
                    }

                    break;
                case "left":
                    //that means the startPortal is the "right" subgrid
                        //origin is that of the (X-1)*32
                    if(X==0){break};

                    const LeftSubgrid=portalMap.get((X-1)+","+Y);
                    if(LeftSubgrid){
                        for (const goalPortalLeft of LeftSubgrid) {
                            // console.log(goalPortalAbove)
                            if(goalPortalLeft.edge=="right"){
                                // console.log(value)
                                let cost = await AstarPathCost(rawData,startPortal, goalPortalLeft, {x:(X-1)*32,y:Y*32},64,32);//32*2
                                const goalPLeft=goalPortalLeft.x +","+goalPortalLeft.y//+","+goalPortalLeft.edge
                                if (cost !== Infinity) {
                                    await addEdgeToAbstractGraph(abstractMap,key,starty, goalPLeft, cost);

                                    // await addEdgeToAbstractGraph(abstractMap,key,goalPLeft,starty , cost);
                                }
                            }
                        }  
                    }


                    break;
                case "right":
                    if(X==47){break};

                    const RightSubgrid=portalMap.get((X+1)+","+Y);
                    if(RightSubgrid){
                        for (const goalPortalRight of RightSubgrid) {
                            // console.log(goalPortalAbove)
                            if(goalPortalRight.edge=="left"){
                                // console.log(value)
                                let cost = await AstarPathCost(rawData,startPortal, goalPortalRight, {x:X*32,y:Y*32},64,32);//32*2
                                const goalPRight=goalPortalRight.x +","+goalPortalRight.y//+","+goalPortalRight.edge
                                if (cost !== Infinity) {
                                    await addEdgeToAbstractGraph(abstractMap,key,starty, goalPRight, cost);

                                    // await addEdgeToAbstractGraph(abstractMap,key,goalPRight, starty, cost);
                                }
                            }
                        }
                    }

                    break;
                default:
                    console.log("hmm, this shouldnt be running")
                    break;
            }

        }
    }

    
    console.log("YIPEE abstractmap creates")
    return abstractMap;
}

//above is creating the abstract map, finding the portals of the image
//--------------------------------------
//combine 3 subgrids of the path into a big buffer and run A* over it
async function TotalSubgridCombining(windowNodes){
        const TILE_SIZE = 1536;
    const SUBGRID_SIZE = 32;

    // Parse nodes → unique subgrids
    const seen = new Set();
    const positions = [];

    for (const node of windowNodes) {
        const [chunkPart, subgridPart] = node.split('|');
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

    // Compute bounding box (aligned to SUBGRID_SIZE)
    let minX = Math.min(...positions.map(p => p.worldX));
    let minY = Math.min(...positions.map(p => p.worldY));
    let maxX = Math.max(...positions.map(p => p.worldX));
    let maxY = Math.max(...positions.map(p => p.worldY));

    const originX = Math.floor(minX / SUBGRID_SIZE) * SUBGRID_SIZE;
    const originY = Math.floor(minY / SUBGRID_SIZE) * SUBGRID_SIZE;

    const countX = Math.ceil((maxX - originX + SUBGRID_SIZE) / SUBGRID_SIZE);
    const countY = Math.ceil((maxY - originY + SUBGRID_SIZE) / SUBGRID_SIZE);

    const width = countX * SUBGRID_SIZE;
    const height = countY * SUBGRID_SIZE;

    const combinedBuffer = Buffer.alloc(width * height * 4, 0);

    // Copy each subgrid into combined buffer
    for (const pos of positions) {
        const tileKey = `${pos.chunkX},${pos.chunkY}`;
        const tileData = await getDataOfTile(tileKey); // Full 1536×1536 RGBA

        const subgridData = await extractRegion(
            tileData,
            4,
            pos.sgX * SUBGRID_SIZE,
            pos.sgY * SUBGRID_SIZE,
            SUBGRID_SIZE,
            SUBGRID_SIZE
        );

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
    if (startPixel.x === goalPixel.x && startPixel.y === goalPixel.y) {
        return [0, null]; // cost = 0, no next pixel, already at destination
    }
    
    let data;
    if (Buffer.isBuffer(rawData) && rawData.length === segmentWidth * segmentHeight * 4) {
        data = rawData; // Already cropped region
    } else {
        console.log("extracting?")
        data = await extractRegion(rawData, 4, segmentOrigin.x, segmentOrigin.y, segmentWidth, segmentHeight);
    }

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
                        return { x: nx, y: ny };
                    }
                }
            }
        }
        return null; // No walkable found (rare, means it's surrounded by blue)
    }
    // const adjustedGoal=findClosestWalkablePixel(goalPixel, data, segmentWidth, segmentHeight)
    // if (!adjustedGoal) {
    //     return [Infinity, null]; // Surrounded by water or impassable
    // }
    // goalPixel = adjustedGoal;
    const idxg = (goalPixel.y * segmentWidth + goalPixel.x) * 4;
    const rg = data[idxg], gg = data[idxg + 1], bg = data[idxg + 2];
    if (!isWalkableColor(rg, gg, bg)) {
        return [Infinity,null]//{ x: goalPixel.x, y: goalPixel.y };
    }

    const goalIndex = (goalPixel.y * segmentWidth + goalPixel.x) * 4;
    const r = data[goalIndex], g = data[goalIndex + 1], b = data[goalIndex + 2];
    console.log("Goal pixel color:",goalPixel, r, g, b);

    function getTerrainCost(localX, localY) {
        if (localX < 0 || localX >= segmentWidth || localY < 0 || localY >= segmentHeight) return Infinity;
        const index = (localY * segmentWidth + localX) * 4;
        const r = data[index], g = data[index + 1], b = data[index + 2];
        // if(b==Number(0)){
        // console.log(b, "mmmmmmmmmm.")
        // }
        
        if (r == Number(255) && g == Number(255) && b == Number(255)) return 1;     // White → Normal
        if (r == Number(255) && g == Number(255) && b == Number(0)){   return 1.5};   // Yellow → Shallow water
        return Infinity;                                      // Others → Impassable
    }

    function heuristic(x1, y1, x2, y2) {
        const dx = x2 - x1, dy = y2 - y1;
        return Math.sqrt(dx * dx + dy * dy);
    }

    const start = {
        x: startPixel.x - segmentOrigin.x,
        y: startPixel.y - segmentOrigin.y
    };
    const goal = {
        x: goalPixel.x, //- segmentOrigin.x,
        y: goalPixel.y,// - segmentOrigin.y
    };

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

    const segmentXS=subgridStart[0]*32
    const segmentYS=subgridStart[1]*32
    const startSegmentExtract=await extractRegion(dataA,4,segmentXS,segmentYS,32,32)
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

    const XendSeg=endSubgrid[0]*32
    const YendSeg=endSubgrid[1]*32
    const endSegmentExtract=await extractRegion(dataB,4,XendSeg,YendSeg,32,32)
    // console.log("aight... we running")
    //return cost

    const combined=combineSubgridRegions(startSegmentExtract,endSegmentExtract,direction)
    const combinedIndex = (16 * combined.width + 32) * 4;
    // console.log("Pixel at {x:32, y:16}:", 
    //     combined.buffer[combinedIndex],
    //     combined.buffer[combinedIndex + 1],
    //     combined.buffer[combinedIndex + 2],
    //     combined.buffer[combinedIndex + 3]
    // );

    const goalKey=`${endSubgrid[0]},${endSubgrid[1]}`
    const portalsOfGoalSegment=targetAbtractMap.get(goalKey)

    const startInput={
        x:startPixel[0] - segmentXS +shifts.startshiftX,
        y:startPixel[1] - segmentYS +shifts.startshiftY
    }
    //segment origin should be 00 since you want the whole buffer
    const segmentOrigin={
        x:0,
        y:0
    }
    const neighbourObjs=[]
    //iterate over the portals in the goal segment, if the portal shares the edge with the start, calc cost!
    for (const [key, portals] of portalsOfGoalSegment.entries()){
        // console.log("key",key)
        const [keyx,keyy]=key.split(",")
        // console.log(keyx,keyy,"keys components")
        const goalInput={
            x:Number(keyx) - XendSeg + shifts.endshiftX,
            y:Number(keyy) - YendSeg + shifts.endshiftY
        }
        // console.log(startInput,goalInput,direction, "input pixels man")
        switch(direction){
            case "left":
                if(Number(keyx)==1535){
                    // startInput.x=startInput.x-1
                    // console.log(combined.buffer,"buffman")
                    const cost=await AstarPathCost(combined.buffer,startInput,goalInput,segmentOrigin,64,32)
                    // console.log("cost",cost)
                    // neighbourObjs.push([key,cost])
                    // Only add if reachable
                    if (cost === Infinity) {
                        neighbourObjs.push([key, 9999]); // Or some huge cost to discourage but allow fallback
                    } else {
                        neighbourObjs.push([key, cost]);
                    }
                }
                break;
            case "right":
                if(Number(keyx)==0){
                    
                    const cost=await AstarPathCost(combined.buffer,startInput,goalInput,segmentOrigin,64,32)
                    // console.log("cost",cost)
                    // neighbourObjs.push([key,cost])
                    // Only add if reachable
                    if (cost === Infinity) {
                        neighbourObjs.push([key, 9999]); // Or some huge cost to discourage but allow fallback
                    } else {
                        neighbourObjs.push([key, cost]);
                    }
                }
                break;
            case "top":
                if(Number(keyy)==1535){
                    // startInput.y=startInput.y-1
                    const cost=await AstarPathCost(combined.buffer,startInput,goalInput,segmentOrigin,32,64)
                    // console.log("cost",cost)
                    // neighbourObjs.push([key,cost])
                    // Only add if reachable
                    if (cost === Infinity) {
                        neighbourObjs.push([key, 9999]); // Or some huge cost to discourage but allow fallback
                    } else {
                        neighbourObjs.push([key, cost]);
                    }
                }
                break;
            case "bottom":
                if(Number(keyy)==0){

                    const cost=await AstarPathCost(combined.buffer,startInput,goalInput,segmentOrigin,32,64)
                    // console.log("cost",cost)
                    // neighbourObjs.push([key,cost])
                    // Only add if reachable
                    if (cost === Infinity) {
                        neighbourObjs.push([key, 9999]); // Or some huge cost to discourage but allow fallback
                    } else {
                        neighbourObjs.push([key, cost]);
                    }
                }
                break;
        }
    }
    return neighbourObjs
}

async function abstractMapAstarMultiTileCapable(start, goal, startChunkAbstractMap) {
    // console.log("what are you at failure",start)
    // if(start ==goal){
    //     return false
    // }
    if (start.split('|')[1] === goal.split('|')[1] && start.split('|')[0] === goal.split('|')[0]){
        return [start]
    }

    function loadChunkAbstractMap(tileKey) {
        const [chunkX, chunkY] = tileKey.split(",").map(Number);
        // console.log("really looking?",tileKey)
        try{
            const abstractMapObject = ChunkManager.getTile(chunkX, chunkY).AbstractMap;
            const toReturnAB=convertMongoPortalGraphToMap(abstractMapObject)
            return toReturnAB;
        }catch(poppy){
            return false
        }
        
        

    }

    function parseChunkKey(fullKey) {
        return fullKey.split('|')[0]; // "chunkX,chunkY"
    }

    function parseSubgridKey(fullKey) {
        // return fullKey.split('|').slice(0, 2).join('|'); // "chunkX,chunkY|subgridX,subgridY"
        return fullKey.split('|')[1];
    }

    function reconstructPath(cameFrom, current) {
        // console.log("HELLO TRIES TO END")
        const path = [current];
        while (cameFrom.has(current)) {
            current = cameFrom.get(current);
            path.push(current);
        }
        
        return path.reverse();
    }

    function heuristic(a, b) {
        if (!a || !b) {
            console.warn("heuristic received undefined input", { a, b });
            return Infinity; // or some large cost
        }

        const [cxA, cyA, sxA, syA, pxA, pyA] = a.split('|').flatMap(s => s.split(',')).map(Number);
        const [cxB, cyB, sxB, syB, pxB, pyB] = b.split('|').flatMap(s => s.split(',')).map(Number);

        const worldXA = cxA * 1536 + pxA;
        const worldYA = cyA * 1536 + pyA;
        const worldXB = cxB * 1536 + pxB;
        const worldYB = cyB * 1536 + pyB;

        return Math.hypot(worldXA - worldXB, worldYA - worldYB);
    }



    // Initialize the loaded chunk abstract maps with the start chunk
    const loadedChunkMaps = new Map();
    const startChunkKey = parseChunkKey(start);
    loadedChunkMaps.set(startChunkKey, startChunkAbstractMap);

    const openSet = new PriorityQueue(); // MinHeap by fScore
    const cameFrom = new Map();
    const gScore = new Map();
    const fScore = new Map();
    const visited = new Set();

    gScore.set(start, 0);
    fScore.set(start, heuristic(start, goal));
    openSet.enqueue(start, fScore.get(start));
    // console.log("After enqueue, isEmpty?", openSet.isEmpty());

    while (!openSet.isEmpty()) {
        const current = openSet.dequeue();

        if (visited.has(current)) continue;
        visited.add(current);

        if (current.split('|')[1] === goal.split('|')[1] && current.split('|')[0] === goal.split('|')[0]){
        // if(current===goal){ 
            // console.log("current",current,goal)

            //check if the portal can actually reach the goal

            // if(possiblecost !=Infinity){
            const toreturn=reconstructPath(cameFrom, current)
            return toreturn;
            // }

        }
            
        // if (current === goal) {
        //     return reconstructPath(cameFrom, current);
        // }

        const chunkKey = parseChunkKey(current);
        const subgridKey = parseSubgridKey(current);

        // Ensure the current chunk abstract map is loaded
        if (!loadedChunkMaps.has(chunkKey)) {
            const newMap = await loadChunkAbstractMap(chunkKey);
            loadedChunkMaps.set(chunkKey, newMap);
        }

        // console.log("ChunkKey:", chunkKey);
        // console.log("Loaded chunk maps keys:", Array.from(loadedChunkMaps.keys()));
        // console.log("Graph for chunkKey:", loadedChunkMaps.get(chunkKey));

        const graph = loadedChunkMaps.get(chunkKey);
        if (!graph) continue;
        else{"woahhh not in man, chunky!"}

        const subgridMap = graph.get(subgridKey);
        if (!subgridMap) continue;
        else{"woahhh not in man"}


        const neighbors = subgridMap.get(current.split('|')[2]);
        if (!neighbors) continue;

        // console.log("neighbors",neighbors)
        const currentChunk=chunkKey.split(",")
        const CCX=Number(currentChunk[0])
        const CCY=Number(currentChunk[1])
        
        const currentpixel=current.split('|')[2].split(",")
        const pixelXC=Number(currentpixel[0])
        const pixelYC=Number(currentpixel[1])

        const currentSubgrid=current.split('|')[1].split(",")
        const SubgridXC=Number(currentSubgrid[0])
        const SubgridYC=Number(currentSubgrid[1])

        //check which edge the current pixel is on
        var edges=[]
        if(pixelXC==0){edges.push("left")}
        else if(pixelXC==1535){edges.push("right")}//1535 since pixels start at 0
        
        if(pixelYC==0){edges.push("top")}
        else if(pixelYC==1535){edges.push("bottom")}

        const deltas={
            "left":[-1,0],
            "right":[1,0],
            "top":[0,1],
            "bottom":[0,-1]
        }
        
        for(const edge of edges){
            if (!(edge in deltas)) {
                console.warn("Unexpected edge direction:", edge);
                continue; // skip it to avoid crashing
            }
            const usingKey=`${CCX+deltas[edge][0]},${CCY+deltas[edge][1]}`
            var accessAbstractMap=loadedChunkMaps.get(usingKey)
            if(!accessAbstractMap){
                
                //loadChunkAbstractMap should be the function to really dig for the information, tell the server to dig it up
                    //from the db if necessary, its not there only then can you ignore but whatever for now...
                accessAbstractMap=await loadChunkAbstractMap(usingKey)
                // console.log(usingKey,accessAbstractMap, "we got this far man")
                //if false then its a dead end edge, skip, there are no neighbours to be had
                if(accessAbstractMap==false){continue;}
                loadedChunkMaps.set(usingKey,accessAbstractMap)
            }

            // const keyGoalTile=`${SubgridXC+deltas[edge][0]},${SubgridYC+deltas[edge][1]}`
            const adjNeighbours=await combineDataOfSubgridsForSearch(current.split('|')[0],usingKey,[pixelXC,pixelYC],[SubgridXC,SubgridYC],edge,accessAbstractMap)
        
            // console.log("adjNeighbours",adjNeighbours)
            for (var i=0;i<adjNeighbours.length;i++){
                const setKey=`${usingKey}|${adjNeighbours[i][0]}`
                neighbors[setKey]=adjNeighbours[i][1]
            }
        }


        for (const [neighborPixel, cost] of Object.entries(neighbors)) {
            const breakdown=neighborPixel.split("|")
            
            var newChunkX=CCX
            var newChunkY=CCY

            var PixelPoint;

            if(breakdown.length==1){
                PixelPoint=breakdown[0].split(",")
            }else if(breakdown.length==2){
                const breakit=breakdown[0].split(",")
                // console.log("breakit",breakit)
                newChunkX=Number(breakit[0])
                newChunkY=Number(breakit[1])
                PixelPoint=breakdown[1].split(",")//neighborPixel.split(",")
                // console.log(breakdown,"PixelPoint",PixelPoint)
            }else{
                console.log("woah, we got a problem here")
            }

            // if(breakdown.length>1){
            //     const breakit=breakdown[0].split(",")
            //     // console.log("breakit",breakit)
            //     newChunkX=Number(breakit[0])
            //     newChunkY=Number(breakit[1])
            //     PixelPoint=breakdown[1].split(",")//neighborPixel.split(",")
            //     // console.log(breakdown,"PixelPoint",PixelPoint)
            // }else{
            //     PixelPoint=breakdown[0].split(",")
            // }
            
            
            const neighPX=Number(PixelPoint[0])
            const neighPY=Number(PixelPoint[1])
            


            const subgridX=Math.floor(neighPX/32)
            const subgridY=Math.floor(neighPY/32)

            const neighborKey = `${newChunkX},${newChunkY}|${subgridX},${subgridY}|${neighPX},${neighPY}`;//neighborPixel
            // console.log("neighborKey",neighborKey)
            const tentativeG = gScore.get(current) + cost;
            if (!gScore.has(neighborKey) || tentativeG < gScore.get(neighborKey)) {
                cameFrom.set(neighborKey, current);
                gScore.set(neighborKey, tentativeG);
                const f = tentativeG + heuristic(neighborKey, goal);
                fScore.set(neighborKey, f);
                openSet.enqueue(neighborKey, f);
            }
        }
    }

    return null; // No path found
}

module.exports={PortalConnectivity,AstarPathCost,abstractMapAstarMultiTileCapable,TotalSubgridCombining,AstarPathCostPathIncluded}