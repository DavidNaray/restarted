const ChunkManager=require("../CacheChunkInfo.js")
const {
    parseChunkKey,
    parseSubgridKey,
    reconstructPath}=require("./PathfindingUtils.js")

const {connectBorder}=require("../TerrainGeneration/ImageStitching.js")
const {MinHeap,PriorityQueue}=require("./MinH_PQ.js")


const TILE_SIZE = 1536;
const SUBGRID_SIZE = 32;
const deltas = {
    "left": [-1, 0],
    "right": [1, 0],
    "top": [0, -1],
    "bottom": [0, 1]
};


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

function extendCoords(set,chunkKey){
    const mapping=new Map();
    for (const [key, cost] of set.entries()) {
        const PixelPoint = key.split(",");
        const [neighPX, neighPY] = PixelPoint.map(Number);
        
        const subgridX = Math.floor(neighPX / SUBGRID_SIZE);
        const subgridY = Math.floor(neighPY / SUBGRID_SIZE);

        const neighborKey = `${chunkKey}|${subgridX},${subgridY}|${neighPX},${neighPY}`;
        mapping.set(neighborKey,cost)
    }
    return mapping;
}


//go over abstractMaps to find a path from the closest portal to the portal closest to the goal
async function AbstractAStar(start, goal, startChunkAbstractMap) {

    // Initialize loaded maps with start chunk map
    const loadedChunkMaps = new Map();
    const startChunkKey = parseChunkKey(start);
    loadedChunkMaps.set(startChunkKey, startChunkAbstractMap);


    const openSet = new PriorityQueue(); // MinHeap by fScore = gScore + heuristic
    const cameFrom = new Map();
    const gScore = new Map();

    gScore.set(start, 0);
    openSet.enqueue(start, heuristic(start, goal));

    while (!openSet.isEmpty()) {
        const current = openSet.dequeue();
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
            const newMap = ChunkManager.getAbstractMap(chunkKey)
            if (!newMap) continue;
            loadedChunkMaps.set(chunkKey, newMap);
        }

        const graph = loadedChunkMaps.get(chunkKey)
        if (!graph) continue;

        const subgridMap = graph.get(subgridKey).get("connections");
        if (!subgridMap) continue;


        const preNeighbours=subgridMap.get(current.split('|')[2]);
        const neighbors = extendCoords(preNeighbours,chunkKey);//subgridMap.get(current.split('|')[2]);
        if (!neighbors) continue;

        const [CCX, CCY] = chunkKey.split(",").map(Number);
        const [SubgridXC, SubgridYC] = current.split('|')[1].split(",").map(Number);
        const [pixelXC, pixelYC] = current.split('|')[2].split(",").map(Number);

        // Check for cross-chunk adjacency edges
        const edges = [];
        if (SubgridXC === 0) edges.push("left");
        else if (SubgridXC === 47) edges.push("right");
        if (SubgridYC === 0) edges.push("top");
        else if (SubgridYC === 47) edges.push("bottom");


        for (const edge of edges) {
            if (!(edge in deltas)) continue;
            const adjChunkKey = `${CCX + deltas[edge][0]},${CCY + deltas[edge][1]}`;

            let accessAbstractMap = loadedChunkMaps.get(adjChunkKey);
            if (!accessAbstractMap) {
                accessAbstractMap = await ChunkManager.getAbstractMap(adjChunkKey);
                if (!accessAbstractMap) continue;
                loadedChunkMaps.set(adjChunkKey, accessAbstractMap);
            }

            let adjNeighbours;
            try{
                adjNeighbours= await connectBorder(
                    current.split('|')[0],//tileAkey
                    adjChunkKey,//tileBkey
                    [pixelXC, pixelYC],//start
                    [SubgridXC, SubgridYC],//startingsubgrid
                    edge,//direction
                    accessAbstractMap//the abtractmap of the adjacent tile
                )
            }catch(err){continue}
            if(!adjNeighbours){continue}

            for (const [portalKey, cost] of adjNeighbours) {
                neighbors.set(portalKey, cost);
            }
        }

        // Process all neighbors
        for (const [neighborKey, cost] of neighbors.entries()) {

            const breakdown = neighborKey.split("|");

            if (breakdown.length != 3) {
                console.log("Invalid neighbor key:", neighborKey);
                continue;
            }
            
            const [CCX, CCY] = breakdown[0].split(",").map(Number);
            const [SubgridXC, SubgridYC] = breakdown[1].split(",").map(Number);
            const [pixelXC, pixelYC] = breakdown[2].split(",").map(Number);

            const chunkKeyStr = breakdown[0];
            const subgridStr = breakdown[1];
            const pixelStr = breakdown[2];

            var tileData = loadedChunkMaps.get(chunkKeyStr)
            if(!tileData){console.log("no abtract map?")}
            
            tileData=tileData.get(subgridStr);
            if(!tileData){console.log("no subgrid on;", subgridStr);continue}
             
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

module.exports={AbstractAStar}