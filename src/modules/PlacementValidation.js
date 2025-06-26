const sharp = require('sharp');

const walkMapWidth=1536//512*3
const walkMapHeight=1536//512*3

// Scale and position setup
const worldTileSize = 7.5;//7.5; // world units → corresponds to full width/height of walkMap
const pixelsPerUnit = walkMapWidth / worldTileSize;

async function SharpImgPointVerification(Imglocation,selectedPoint){
    //selectedPoint of form [x,z,y]
    const X=selectedPoint[0]
    const Y=selectedPoint[2]
    
    const imgX = Math.round(walkMapWidth / 2 + X * pixelsPerUnit);
    const imgY =   Math.round(walkMapHeight / 2 + Y * pixelsPerUnit);
    
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
    }
    return false;//by default or if !isWhite, placement is not valid
}

async function SharpImgBuildingPlacementVerification(MaskImglocation,Imglocation,MetaData){
    //selectedPoint of form [x,z,y]
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

module.exports={SharpImgBuildingPlacementVerification,SharpImgPointVerification}