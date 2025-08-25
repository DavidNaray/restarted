const sharp = require('sharp');
const path = require('path')
const fs = require("fs");

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

async function BuildingPlacement(BuildingName,PlacementOrigin){
    //Farm and Pavement are buildings but it will be a unique cases
    //wood and stone walls too...
    const CHUNK_SIZE=1536

    const pathIntro=path.join(__dirname,'../../Assets/Asset_Masks/')
    const MaskLocation=`${pathIntro}${BuildingName}.png`
    // console.log("MaskLocation",MaskLocation)

    const { data:MaskData, info:maskInfo } = await sharp(MaskLocation)
    .rotate(45,{ background: { r: 0, g: 0, b: 0, alpha: 0 } })//PlacementOrigin.rotation)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });


    const originChunkX=PlacementOrigin.chunk[0];const originChunkY=PlacementOrigin.chunk[1]
    const originPixel={x:PlacementOrigin.pixel[0],y:PlacementOrigin.pixel[1]}

    // const OriginChunkIntro=path.join(__dirname,'../../Tiles/WalkMaps/')
    // const OriginChunkLocation=`${OriginChunkIntro}${originChunkX}${originChunkY}.png`

    // Collect chunks to update
    const touchedChunks = new Map();

    const offsetX = Math.floor(maskInfo.width / 2);
    const offsetY = Math.floor(maskInfo.height / 2);
    // Step 1: Validation pass (check collisions)
    for (let my = 0; my < maskInfo.height; my++) {
        for (let mx = 0; mx < maskInfo.width; mx++) {
            const mi = (my * maskInfo.width + mx) * 4;
            const maskAlpha = MaskData[mi + 3];
            if (maskAlpha < 128) continue; // ignore transparent

            // --- Center mask on placement origin ---
            let localX = originPixel.x + (mx - offsetX);
            let localY = originPixel.y + (my - offsetY);

            let targetChunkX = originChunkX;
            let targetChunkY = originChunkY;

            // Spillover handling
            if (localX < 0) {
                targetChunkX -= 1;
                localX += CHUNK_SIZE;
            } else if (localX >= CHUNK_SIZE) {
                targetChunkX += 1;
                localX -= CHUNK_SIZE;
            }

            if (localY < 0) {
                targetChunkY -= 1;
                localY += CHUNK_SIZE;
            } else if (localY >= CHUNK_SIZE) {
                targetChunkY += 1;
                localY -= CHUNK_SIZE;
            }

            const chunkKey = `${targetChunkX},${targetChunkY}`;

            // Load walkmap if needed
            if (!touchedChunks.has(chunkKey)) {
                const walkmapPath = path.join(
                    __dirname,
                    "../../Tiles/WalkMaps/",
                    `${targetChunkX}${targetChunkY}.png`
                );

                let walkmapBuf, walkmapInfo;
                try {

                    if (!fs.existsSync(walkmapPath)) {
                        return {
                            success: false,
                            reason: "missing-chunk",
                            at: { chunk: chunkKey }
                        };
                    }

                    const { data, info } = await sharp(walkmapPath)
                        .ensureAlpha()
                        .raw()
                        .toBuffer({ resolveWithObject: true });
                    walkmapBuf = data;
                    walkmapInfo = info;
                } catch {
                    return {
                        success: false,
                        reason: "missing-chunk",
                        at: { chunk: chunkKey }
                    };
                }

                touchedChunks.set(chunkKey, { buf: walkmapBuf, info: walkmapInfo,filePath:walkmapPath });
            }

            const { buf, info } = touchedChunks.get(chunkKey);
            const wi = (localY * info.width + localX) * 4;

            // collision check: must be white
            const r = buf[wi], g = buf[wi+1], b = buf[wi+2];
            if (!(r === 255 && g === 255 && b === 255)) {
                return { 
                    success: false, 
                    reason: "collision", 
                    at: { chunk: chunkKey, pixel: [localX, localY] } 
                };
            }
        }
    }
    // console.log("we gone through ")
    
    // --- Step 2: Application Pass ---
    try{
        for (let my = 0; my < maskInfo.height; my++) {
            for (let mx = 0; mx < maskInfo.width; mx++) {
                const mi = (my * maskInfo.width + mx) * 4;
                const maskAlpha = MaskData[mi + 3];
                if (maskAlpha < 128) continue;

                let localX = originPixel.x + (mx - offsetX);
                let localY = originPixel.y + (my - offsetY);

                let targetChunkX = originChunkX;
                let targetChunkY = originChunkY;

                if (localX < 0) { targetChunkX -= 1; localX += CHUNK_SIZE; }
                else if (localX >= CHUNK_SIZE) { targetChunkX += 1; localX -= CHUNK_SIZE; }

                if (localY < 0) { targetChunkY -= 1; localY += CHUNK_SIZE; }
                else if (localY >= CHUNK_SIZE) { targetChunkY += 1; localY -= CHUNK_SIZE; }

                const chunkKey = `${targetChunkX},${targetChunkY}`;
                const { buf, info } = touchedChunks.get(chunkKey);

                const wi = (localY * info.width + localX) * 4;

                // overwrite pixel → black (impassable)
                buf[wi] = MaskData[mi]//0;
                buf[wi + 1] = MaskData[mi+1]//0;
                buf[wi + 2] = MaskData[mi+2]//0;
                buf[wi + 3] = 255;
            }
        }
    }catch(f){
        console.log("failed step 2")
    }

    // --- Step 3: Save Updated Chunks ---
    try{
        for (const [chunkKey, { buf, info, filePath }] of touchedChunks) {
            await sharp(buf, {
                raw: {
                    width: info.width,
                    height: info.height,
                    channels: 4
                }
            }).toFile(filePath);
        }
    }catch(fg){
        console.log("failed step 3")
    }

    return { success: true };


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


module.exports={PointPlacementVerification,IdentifySpecificChunkPoint,SharpImgBuildingPlacementVerification,getPosWithHeight,BuildingPlacement}