
const ChunkManager=require("../CacheChunkInfo.js")
const {AstarPathCost}=require("./AStarCost.js")

const walkMapWidth=1536//512*3
const walkMapHeight=1536//512*3
const subgridSize=32;

async function extractRegion(rawData, channels, x, y, width, height) {
    const region = Buffer.alloc(width * height * channels);

    for (let row = 0; row < height; row++) {
        const srcStart = ((y + row) * walkMapWidth + x) * channels;
        const srcEnd = srcStart + width * channels;
        const dstStart = row * width * channels;

        rawData.copy(region, dstStart, srcStart, srcEnd);
    }

    return region;
}

async function combineSegments(bufA, bufB, posA, posB) {
    // posA and posB are the WORLD coords of the top-left corner of each buffer in pixels

    const minX = Math.min(posA.x, posB.x);
    const minY = Math.min(posA.y, posB.y);

    const maxX = Math.max(posA.x, posB.x);
    const maxY = Math.max(posA.y, posB.y);

    const width  = 32+(maxX - minX);
    const height = 32+(maxY - minY);
    // console.log(width,height,"?")
    const combined = Buffer.alloc(width * height * 4, 0);

    function copyBuffer(src, srcW, srcH, destX, destY) {
        for (let y = 0; y < srcH; y++) {
            const srcOffset = y * srcW * 4;
            const destOffset = ((destY + y) * width + destX) * 4;
            combined.set(src.subarray(srcOffset, srcOffset + srcW * 4), destOffset);
        }
    }

    // Place each buffer at correct position relative to minX/minY
    
    // console.log(posA.x - minX, posA.y - minY)
    // console.log(posB.x - minX, posB.y - minY)
    copyBuffer(bufA, 32, 32, posA.x - minX, posA.y - minY);
    copyBuffer(bufB, 32, 32, posB.x - minX, posB.y - minY);

    return {
        buffer: combined,
        origin: { x: minX, y: minY },
        width,
        height
    };
}

async function connectBorder(
    tileAKey,tileBKey,
    startPixel,
    subgridStart,
    direction,
    targetAbstractMap){

    const [sx, sy] = subgridStart;
    let bx = sx, by = sy;
    switch (direction) {
        case "left":   bx = 47; break;//going left (start on right)
        case "right":  bx = 0;  break;
        case "top":    by = 47; break;
        case "bottom": by = 0;  break;
    }


    const dataA=ChunkManager.getAbstractMap(tileAKey)
    const dataB=ChunkManager.getAbstractMap(tileBKey)



    //the buffers of the 2 neighbouring segments
    const bufA = dataA.get(`${sx},${sy}`).get("buffer");
    const bufB = dataB.get(`${bx},${by}`).get("buffer");

    const [Ax,Ay]=tileAKey.split(',').map(Number);
    const [Bx,By]=tileBKey.split(',').map(Number);
    const DeltaX=(Ax - Bx)*walkMapWidth;
    const DeltaY=(Ay - By)*walkMapHeight;

    const posA = { x: sx * subgridSize, y: sy * subgridSize };
    const posB = { x: bx * subgridSize - DeltaX, y: by * subgridSize - DeltaY};

    var originA={x: 0, y: 0}//start
    var originB={x: 32, y: 32}//goal
    if(posB.x<posA.x){originA.x= 32;originB.x=0}
    else if(posB.x==posA.x){originA.x= 0;originB.x= 0}else{}

    if(posB.y<posA.y){originA.y= 32;originB.y=0}
    else if(posB.y==posA.y){originA.y= 0;originB.y=0}else{}

    // console.log("originA",originA,"originB",originB, direction)
    const { buffer, origin, width, height }= await combineSegments(bufA, bufB, originA, originB);
    // console.log(width, height, "buffer",buffer)

    //startpixel in buffer coord
    const startInput = {
        x: startPixel[0] - posA.x + originA.x, //origin.x,
        y: startPixel[1] - posA.y + originA.y  //- origin.y
    };
    

    const goalKey = `${bx},${by}`;
    const portalsOfGoal = targetAbstractMap.get(goalKey).get("connections");
    
    const neighbors = [];

    for (const [portalPixelKey] of portalsOfGoal.entries()) {

        const [px, py] = portalPixelKey.split(",").map(Number);

        // goal portal in buffer coord 
        //make it local to subgrid, then adjust for tile offset, then buffer offset
        const goalInput = {
            x: px - posB.x - DeltaX + originB.x, //origin.x,
            y: py - posB.y - DeltaY + originB.y  //origin.y
        };
        // console.log("startInput",startInput,"goalInput",goalInput)

        const cost = await AstarPathCost(
            buffer,
            startInput,
            goalInput,
            { x: 0, y: 0 },
            width,
            height
        );

        if (cost !== Infinity) {
            const subgridBit=`${Math.floor(px / subgridSize)},${Math.floor(py / subgridSize)}`
            const pixelBit=`${px},${py}`

            const canonicalKey =`${tileBKey}|${subgridBit}|${pixelBit}`;

            neighbors.push([canonicalKey, cost]);
        }
    }

    // console.log("neighbours",neighbors)
    return neighbors;
}

async function StitchPath(Nodes){

    const Mapping=new Set();
    // new Map();

    const stitched={
        buffer:null,
        origin:null,
        width:0,
        height:0
    }

    for (const node of Nodes) {
        if (!node) continue; // skip undefined nodes

        const [ChunkKey,SubgridKey,Pixels]=node.split("|");
        const Key=`${ChunkKey}|${SubgridKey}`;
        if(Mapping.has(Key)){continue}

        const [cx, cy] = ChunkKey.split(",").map(Number);
        const [sx, sy] = SubgridKey.split(",").map(Number);

        const Data=ChunkManager.getAbstractMap(ChunkKey);
        const buffer = Data.get(SubgridKey).get("buffer");


        const worldX = cx * walkMapWidth  + sx * subgridSize;
        const worldY = cy * walkMapHeight + sy * subgridSize;

        if(stitched.buffer == null){
            stitched.buffer = buffer;
            stitched.origin = { x: worldX, y: worldY };
            stitched.width  = 32;
            stitched.height = 32;
            continue;
        }

        const newMinX = Math.min(stitched.origin.x, worldX);
        const newMinY = Math.min(stitched.origin.y, worldY);

        const newMaxX = Math.max(stitched.origin.x + stitched.width,worldX + 32);
        const newMaxY = Math.max(stitched.origin.y + stitched.height,worldY + 32);

        const newWidth  = newMaxX - newMinX;
        const newHeight = newMaxY - newMinY;

        //create a new buffer 
        const newBuf = Buffer.alloc(newWidth * newHeight * 4, 0);

        const offX = stitched.origin.x - newMinX;
        const offY = stitched.origin.y - newMinY;

        //copy the stiched buffer into the new buffer
        for (let y = 0; y < stitched.height; y++) {
            const src = stitched.buffer.subarray(
                y * stitched.width * 4,
                (y+1) * stitched.width * 4
            );

            const destOffset = ((offY + y) * newWidth + offX) * 4;
            newBuf.set(src, destOffset);
        }

        //get offsets to place the subgrids buffer into the new buffer
        const subOffX = worldX - newMinX;
        const subOffY = worldY - newMinY;

        for (let y = 0; y < 32; y++) {
            const src = buffer.subarray(y * 32 * 4, (y+1) * 32 * 4);
            const destOffset = ((subOffY + y) * newWidth + subOffX) * 4;
            newBuf.set(src, destOffset);
        }

        stitched.buffer = newBuf;
        stitched.origin = { x: newMinX, y: newMinY };
        stitched.width  = newWidth;
        stitched.height = newHeight;



        Mapping.add(Key)//{buffer, origin:WorldOrigin})
    }

    return stitched
}

module.exports={combineSegments,extractRegion,connectBorder,StitchPath}