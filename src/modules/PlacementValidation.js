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

    const CHUNK_SIZE=1536

    const pathIntro=path.join(__dirname,'../../Assets/Asset_Masks/')
    const MaskLocation=`${pathIntro}${BuildingName}.png`
    // console.log("MaskLocation",MaskLocation)

    const { data:MaskData, info:maskInfo } = await sharp(MaskLocation, { interpolate: 'nearest' })
    .rotate(45,{ background: { r: 0, g: 0, b: 0, alpha: 0 } })//PlacementOrigin.rotation)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

    const palette = [//163 && mg === 73 && mb === 164
        { r: 163, g: 73,   b: 164 }, // purple
        { r: 255, g: 174, b: 201 }  // rose
    ];

    for (let i = 0; i < MaskData.length; i += 4) {
        if (MaskData[i+3] < 128) continue; // transparent, skip

        // Find closest palette color
        let best = palette[0], bestDist = Infinity;
        for (const c of palette) {
            const dr = MaskData[i]   - c.r;
            const dg = MaskData[i+1] - c.g;
            const db = MaskData[i+2] - c.b;
            const dist = dr*dr + dg*dg + db*db;
            if (dist < bestDist) { bestDist = dist; best = c; }
        }

        MaskData[i]   = best.r;
        MaskData[i+1] = best.g;
        MaskData[i+2] = best.b;
    }

    const originChunkX=PlacementOrigin.chunk[0];const originChunkY=PlacementOrigin.chunk[1]
    const originPixel={x:PlacementOrigin.pixel[0],y:PlacementOrigin.pixel[1]}


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
            // const mr = MaskData[mi], mg = MaskData[mi+1], mb = MaskData[mi+2];

            //placement only on white or rose (rose is building buffer which is to create gap between building and terrain)
            
            const iswhite=(r === 255 && g === 255 && b === 255)
            const isRose=(r === 255 && g === 174 && b === 201)
            if (!(iswhite || isRose)) {
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

                // Extract mask + target pixel colors
                const mr = MaskData[mi], mg = MaskData[mi + 1], mb = MaskData[mi + 2];
                const tr = buf[wi], tg = buf[wi + 1], tb = buf[wi + 2];

                const isMaskPurple = (mr === 163 && mg === 73 && mb === 164);   // purple #A349A4
                const isTargetPurple = (tr === 163 && tg === 73 && tb === 164);

                if(isMaskPurple){//purple overwrites rose
                    buf[wi] = MaskData[mi]
                    buf[wi + 1] = MaskData[mi+1]
                    buf[wi + 2] = MaskData[mi+2]
                }else{
                    if(!isTargetPurple){//if the target is not purple, draw rose buffer
                        buf[wi] = MaskData[mi]
                        buf[wi + 1] = MaskData[mi+1]
                        buf[wi + 2] = MaskData[mi+2]
                    }
                }

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


module.exports={SharpImgBuildingPlacementVerification,getPosWithHeight,BuildingPlacement}