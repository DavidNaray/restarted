const {
    loadChunkAbstractMap,
    parseChunkKey,
    parseSubgridKey,
    reconstructPath}=require("./PathfindingUtils.js")


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

module.exports={AbstractAStar}