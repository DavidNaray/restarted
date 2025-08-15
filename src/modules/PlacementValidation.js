const sharp = require('sharp');

const walkMapWidth=1536//512*3
const walkMapHeight=1536//512*3

const HeightMapWidth=512
const HeightMapHeight=512
// Scale and position setup
const worldTileSize = 7.5;//7.5; // world units → corresponds to full width/height of walkMap
const pixelsPerUnit = walkMapWidth / worldTileSize;
const pixelsPerHeightmap=HeightMapWidth / worldTileSize;

async function getPosWithHeight(selectedPoint,HeightImglocation){
    //selectedPoint of form [x,y,z]
    const X=selectedPoint[0]
    const Y=selectedPoint[2]

    const imgX = Math.round(HeightMapWidth / 2 + X * pixelsPerHeightmap);//pixelsPerUnit);
    const imgY =   Math.round(HeightMapHeight / 2 + Y * pixelsPerHeightmap);//pixelsPerUnit);

    const { data, info } = await sharp(HeightImglocation)//'walkmap.png'
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
    
    const index = (imgY * info.width + imgX) * 4; // 4 bytes per pixel (RGBA)
    // console.log(info.width, info.height); // dimensions
    // console.log(data); // raw pixel buffer (RGBA)
    
    const r=data[index];
    // const g=data[index+1];
    // const b=data[index+2];
    // const a=data[index+3];

    const Heightscale=0.6; //from tile terrain builder material
    const height=(r*Heightscale)/(30*worldTileSize)

    return [X,height,Y];
}

async function SharpImgBuildingPlacementVerification(MaskImglocation,Imglocation,MetaData){
    //selectedPoint of form [x,y,z]
    const X=MetaData.position[0]//selectedPoint[0]
    const Y=MetaData.position[2]//selectedPoint[2]
    
    const BuildingRotation=MetaData.rotation || 0;

    const imgX = Math.round(walkMapWidth / 2 + X * pixelsPerUnit);
    const imgY =   Math.round(walkMapHeight / 2 + Y * pixelsPerUnit);

    const cos = Math.cos(BuildingRotation);
    const sin = Math.sin(BuildingRotation);

    const { data:MaskData, info:maskInfo } = await sharp(MaskImglocation)//'walkmap.png'
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

    const { data:WalkMapData, info:WalkMapInfo } = await sharp(Imglocation)//'walkmap.png'
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
    
    const maskHeight=maskInfo.height
    const maskWidth= maskInfo.width
    
    for (let y = 0; y < maskHeight; y++) {
        for (let x = 0; x < maskWidth; x++) {
            const maskIndex = (y * maskWidth + x) * 4;
            const maskR = MaskData[maskIndex];
            const maskG = MaskData[maskIndex + 1];
            const maskB = MaskData[maskIndex + 2];
            const maskA = MaskData[maskIndex + 3];

            // Only check fully white parts of the mask
            if (maskR === 255 && maskG === 255 && maskB === 255 && maskA === 255) {
                // Centered offset in *pixels*
                const offsetX = x - maskWidth / 2;
                const offsetY = y - maskHeight / 2;

                // Apply rotation (still in pixels)
                const rotatedX = offsetX * cos - offsetY * sin;
                const rotatedY = offsetX * sin + offsetY * cos;

                const mapX = Math.round(imgX + rotatedX);
                const mapY = Math.round(imgY + rotatedY);

                // Check bounds
                if (mapX < 0 || mapY < 0 || mapX >= walkMapWidth || mapY >= walkMapHeight) {
                    return false; // Mask pixel rotated outside walkMap → invalid
                }

                const walkIndex = (mapY * walkMapWidth + mapX) * 4;
                const wr = WalkMapData[walkIndex];
                const wg = WalkMapData[walkIndex + 1];
                const wb = WalkMapData[walkIndex + 2];
                const wa = WalkMapData[walkIndex + 3];

                const walkable = (wr === 255 && wg === 255 && wb === 255 && wa === 255);
                if (!walkable) {
                    // console.log("CANNOT PLACE HERE MAN");
                    return false;//invalid placement
                }
            }
        }
    }

    return true;//managed to get through the mask parsing step, must be valid

}

//returns the pixel clicked on, along with the clicked on chunk
async function IdentifySpecificChunkPoint(CenterChunk, clickedPoint, debug = false) {
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

async function PointPlacementVerification(pixelCoord,Imglocation){
    const imgX=pixelCoord[0]
    const imgY=pixelCoord[1]
    
    const { data, info } = await sharp(Imglocation)//'walkmap.png'
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

    const index = (imgY * info.width + imgX) * 4; // 4 bytes per pixel (RGBA)
    // console.log(info.width, info.height); // dimensions
    // console.log(data); // raw pixel buffer (RGBA)
    
    const r=data[index];
    const g=data[index+1];
    const b=data[index+2];
    const a=data[index+3];

    const isWhite = (r === 255 && g === 255 && b === 255 && a === 255);
    
    if(isWhite){
        return true;//placement is valid
    }else{
        return false;//by default or if !isWhite, placement is not valid
    }
}


module.exports={PointPlacementVerification,IdentifySpecificChunkPoint,SharpImgBuildingPlacementVerification,getPosWithHeight}