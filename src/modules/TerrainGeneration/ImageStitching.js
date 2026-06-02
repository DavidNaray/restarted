
const walkMapWidth=1536//512*3
const walkMapHeight=1536//512*3

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
    const SUBGRID_SIZE = 32;

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

module.exports={combineSegments,extractRegion}