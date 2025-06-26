const sharp = require('sharp');
const {MinHeap,PriorityQueue}=require("./MinH_PQ.js")

const walkMapWidth=1536//512*3
const walkMapHeight=1536//512*3

// Scale and position setup
const worldTileSize = 7.5;//7.5; // world units → corresponds to full width/height of walkMap
const pixelsPerUnit = walkMapWidth / worldTileSize;

const subgridSize=32;


async function DetermineSubgrid(UnitPosition){//determine which subgrid a unit belongs to
    //walkmap is 1536, if we make subgrids 32 pixels in size, thats 48x48 subgrids 

    // UnitPosition of form [x, y, z]
    const X=UnitPosition[0]
    const Y=UnitPosition[2]

    // Convert world coordinates to pixel coordinates on walkMap
    const imgX = Math.round(walkMapWidth / 2 + X * pixelsPerUnit);
    const imgY = Math.round(walkMapHeight / 2 + Y * pixelsPerUnit);


    //first grid would be [0,0] last grid would be [47,47]
    const SubGridgridAlong=Math.floor(imgX/subgridSize)
    const SubGridgridDown=Math.floor(imgY/subgridSize)

    return SubGridgridAlong+","+SubGridgridDown
}

async function generatePortalMap(Imglocation) {//generate the portals of the subgrids for the abstract map
    
    const { data, info } = await sharp(Imglocation)//'walkmap.png'
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
    

    const gridCols = Math.ceil(info.width / subgridSize);
    const gridRows = Math.ceil(info.height / subgridSize);

    const portalMap = new Map(); // or use a plain object if you prefer

    // Use your updated isWalkable inside here
    
    function isWalkable(x, y) {
        const index = (y * info.width + x) * 4;
        const r = data[index];
        const g = data[index + 1];
        const b = data[index + 2];
        return (r === 255 && g === 255 && (b === 255 || b === 0)); // white or yellow
    }

    function detectPortalsForSubgrid(subgridX, subgridY) {
        const startX = subgridX * subgridSize;
        const startY = subgridY * subgridSize;

        const portals = [];

        function scanEdge(edge) {
            let lastWasWalkable = false;
            let walkableStart = -1;
            const edgePixels = [];

            for (let i = 0; i < subgridSize; i++) {
                let x, y;

                switch (edge) {
                    case 'top':    x = startX + i; y = startY; break;
                    case 'bottom': x = startX + i; y = startY + subgridSize - 1; break;
                    case 'left':   x = startX; y = startY + i; break;
                    case 'right':  x = startX + subgridSize - 1; y = startY + i; break;
                }

                if (x >= info.width || y >= info.height) continue; // out of bounds

                if (isWalkable(x, y)) {
                    if (!lastWasWalkable) walkableStart = i;
                    lastWasWalkable = true;
                } else {
                    if (lastWasWalkable && walkableStart !== -1) {
                        const portalMid = walkableStart + Math.floor((i - walkableStart) / 2);
                        edgePixels.push(portalMid);
                    }
                    lastWasWalkable = false;
                    walkableStart = -1;
                }
            }

            if (lastWasWalkable && walkableStart !== -1) {
                const portalMid = walkableStart + Math.floor((subgridSize - walkableStart) / 2);
                edgePixels.push(portalMid);
            }

            for (const i of edgePixels) {
                let portalX, portalY;
                switch (edge) {
                    case 'top':    portalX = startX + i; portalY = startY; break;
                    case 'bottom': portalX = startX + i; portalY = startY + subgridSize - 1; break;
                    case 'left':   portalX = startX; portalY = startY + i; break;
                    case 'right':  portalX = startX + subgridSize - 1; portalY = startY + i; break;
                }
                portals.push({ x: portalX, y: portalY, edge });
            }
        }

        ['top', 'right', 'bottom', 'left'].forEach(scanEdge);

        return portals;
    }

    for (let gridY = 0; gridY < gridRows; gridY++) {
        for (let gridX = 0; gridX < gridCols; gridX++) {
            const portals = detectPortalsForSubgrid(gridX, gridY);
            // if (portals.length > 0) {portalMap.set(`${gridX},${gridY}`, portals);}//exclude if a subgrid has no portals
            
            portalMap.set(`${gridX},${gridY}`, portals);
        }
    }

    return [portalMap,data,info.width];
}

async function addEdgeToAbstractGraph(abstractMap,start, end, cost){

    const exists=abstractMap.has(start)

    if(exists){
        //then check if end already in it
        const target=abstractMap.get(start)
        // console.log(target, "TARGET TARGET COME ON")
        if(!target.has(end)){
            target.set(end,cost)
        }
    }else{
        const valueSet=new Map();
        valueSet.set(end,cost)
        abstractMap.set(start,valueSet)
    }

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
    // const walkMapCanvas=this.walkMap;
    // const ctx = walkMapCanvas.getContext('2d');
    // const imgData = ctx.getImageData(segmentOrigin.x, segmentOrigin.y, segmentWidth, segmentHeight);
    // const data = imgData.data;
    
    // const { data, info } = await sharp(Imglocation)//'walkmap.png'
    // .ensureAlpha()
    // .extract({
    //     left: segmentOrigin.x,
    //     top: segmentOrigin.y,
    //     width: segmentWidth,
    //     height: segmentHeight
    // })
    // .raw()
    // .toBuffer({ resolveWithObject: true });
    const data=await extractRegion(rawData,segmentOrigin.x,segmentOrigin.y,segmentWidth,segmentHeight)
    // console.log("should be the data.....",data)
    function getTerrainCost(localX, localY) {
        if (localX < 0 || localX >= segmentWidth || localY < 0 || localY >= segmentHeight) return Infinity;
        const index = (localY * segmentWidth + localX) * 4;
        const r = data[index], g = data[index + 1], b = data[index + 2];

        if (r === 255 && g === 255 && b === 255) return 1;     // White → Normal
        if (r === 255 && g === 255 && b === 0)   return 1.5;   // Yellow → Shallow water
        return Infinity;                                      // Red/Black or anything else → Impassable
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
        x: goalPixel.x - segmentOrigin.x,
        y: goalPixel.y - segmentOrigin.y
    };

    const openSet = new MinHeap((a, b) => a.f - b.f);
    const cameFrom = new Map();

    const gScore = Array.from({ length: segmentHeight }, () => Array(segmentWidth).fill(Infinity));
    const fScore = Array.from({ length: segmentHeight }, () => Array(segmentWidth).fill(Infinity));

    gScore[start.y][start.x] = 0;
    fScore[start.y][start.x] = heuristic(start.x, start.y, goal.x, goal.y);

    openSet.push({ x: start.x, y: start.y, f: fScore[start.y][start.x] });

    const directions = [
        [0, -1], [1, 0], [0, 1], [-1, 0], // 4-way
        [1, -1], [1, 1], [-1, 1], [-1, -1] // 8-way
    ];

    while (!openSet.isEmpty()) {
        const current = openSet.pop();
        if (current.x === goal.x && current.y === goal.y) {
            // console.log("THIS IS THE COST!!!!!!!!",gScore[current.y][current.x])
            return gScore[current.y][current.x]; // Return total cost to reach goal
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

    return Infinity; // No path found
}

//now to build the connectivity of portals within a subsection
async function PortalConnectivity(Imglocation){
    // For subgrid (X,Y)
    // console.log("hello?")
    const portalMapPlusDataPlusWidth=await generatePortalMap(Imglocation);
    const portalMap=portalMapPlusDataPlusWidth[0]
    const rawData=portalMapPlusDataPlusWidth[1]
    
    // const ImgWidth=portalMapPlusDataPlusWidth[2]
    // console.log(rawData,"and width",ImgWidth)
    const abstractMap=new Map();
    // console.log(portalMap.has("47,47"), "DOES IT HAVE IT !!!!!")
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
                let cost = await AstarPathCost(rawData,startPortal, goalPortal, {x:X*32,y:Y*32},32,32);
                // console.log (cost )
                if (cost !== Infinity) {
                    
                    const goaly=goalPortal.x +","+goalPortal.y
                    //adds edge relationship with other portals in the subgrid
                    addEdgeToAbstractGraph(abstractMap,starty, goaly, cost);
                    addEdgeToAbstractGraph(abstractMap,goaly, starty, cost);
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
                                    addEdgeToAbstractGraph(abstractMap,starty, goalPAbove, cost);
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
                                let cost = AstarPathCost(rawData,startPortal, goalPortalBelow, {x:X*32,y:(Y)*32},32,64);//32*2
                                const goalPBelow=goalPortalBelow.x +","+goalPortalBelow.y//+","+goalPortalBelow.edge
                                if (cost !== Infinity) {
                                    addEdgeToAbstractGraph(abstractMap,starty, goalPBelow, cost);
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
                                    addEdgeToAbstractGraph(abstractMap,starty, goalPLeft, cost);
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
                                    addEdgeToAbstractGraph(abstractMap,starty, goalPRight, cost);
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

    console.log("YIPEE ABSTRACTMAp")
    
    // waitForCompletion();
    

}


module.exports={PortalConnectivity}