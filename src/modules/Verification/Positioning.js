const ChunkManager=require("../CacheChunkInfo.js")

//returns the pixel clicked on, along with the clicked on chunk
function SpecificChunkPoint(CenterChunk, clickedPoint, debug = false) {
    const CHUNK_SIZE = 7.5;           // World units per chunk
    const CHUNK_RESOLUTION = 1536;    // Pixels per chunk
    const HALF_CHUNK = CHUNK_SIZE / 2;

    // Local world coordinates relative to the visual center
    const localX = clickedPoint[0];
    const localZ = clickedPoint[2];

    // Determine chunk offset relative to the center chunk
    const chunkOffsetX = Math.floor((localX + HALF_CHUNK) / CHUNK_SIZE);
    const chunkOffsetZ = Math.floor((localZ + HALF_CHUNK) / CHUNK_SIZE);

    // Compute actual chunk coordinates in global chunk grid
    const chunkX = CenterChunk[0] + chunkOffsetX;
    const chunkZ = CenterChunk[1] + chunkOffsetZ;

    // Compute the visual origin of this chunk relative to the screen center
    // This accounts for the center chunk offset in world space
    const chunkOriginX = chunkOffsetX * CHUNK_SIZE;
    const chunkOriginZ = chunkOffsetZ * CHUNK_SIZE;

    // Compute local position inside this chunk
    const localInChunkX = localX - chunkOriginX + HALF_CHUNK;
    const localInChunkZ = localZ - chunkOriginZ + HALF_CHUNK;

    // Clamp to chunk bounds
    const clampedX = Math.min(Math.max(localInChunkX, 0), CHUNK_SIZE);
    const clampedZ = Math.min(Math.max(localInChunkZ, 0), CHUNK_SIZE);

    // Convert to pixel coordinates (1536×1536)
    const pixelX = Math.floor((clampedX / CHUNK_SIZE) * CHUNK_RESOLUTION);
    const pixelZ = Math.floor((clampedZ / CHUNK_SIZE) * CHUNK_RESOLUTION);

    if (debug) {
        console.log("=== IdentifySpecificChunkPoint Debug ===");
        console.log("CenterChunk:", CenterChunk);
        console.log("ClickedPoint (local world):", clickedPoint);
        console.log("ChunkOffset:", [chunkOffsetX, chunkOffsetZ]);
        console.log("ChunkCoords:", [chunkX, chunkZ]);
        console.log("ChunkOrigin (relative to center):", [chunkOriginX, chunkOriginZ]);
        console.log("LocalInChunk:", [localInChunkX, localInChunkZ]);
        console.log("PixelCoords:", [pixelX, pixelZ]);
        console.log("========================================");
    }

    return {
        chunkCoords: [chunkX, chunkZ],
        pixelCoords: [pixelX, pixelZ]
    };
}

function validateclickedPoint(pixelpoint, TChunk){
    
    const y=pixelpoint[1]//this.destinationPoint[1]
    const x=pixelpoint[0]//this.destinationPoint[0]
    
    const subgridX=Math.floor(x/32)
    const subgridY=Math.floor(y/32)

    const localisedX=x-32*subgridX
    const localisedY=y-32*subgridY
    
    var data=ChunkManager.getAbstractMap(`${TChunk[0]},${TChunk[1]}`)
    // console.log("target chunk man, ",data,"....")
    data=data.get(`${subgridX},${subgridY}`).get("buffer")


    const index = (localisedY * 32 + localisedX) * 4;
    const r = data[index], g = data[index + 1], b = data[index + 2];

    if(r === Number(255) && g === Number(255) && (b === Number(255) || b === Number(0))){
        // console.log(r,g,b,"valid",subgridX,subgridY)
        // console.log("ok, destination point actually valid")
        return "ValidPoint"
    }else{
        // console.log(r,g,b,"invalid destination point",subgridX,subgridY,data)
        return "InvalidPoint"
    }
}

module.exports={
    SpecificChunkPoint,
    validateclickedPoint
}