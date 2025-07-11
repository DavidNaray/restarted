const {addMovementOrder,getPixelLocationsForTile}=require("./PathfindingFunctionality.js")

class MovementOrder{
    constructor(selectedUnits,ClickedPixel,TargetChunk){
        this.destinationPoint=ClickedPixel;
        this.targetChunk=TargetChunk;
        this.UnitsInvolved=selectedUnits;//tile-> serverIds
        
        this.OrderCenter;
        this.chunkHoldingCenter;
        this.formationPoints=[]
        addMovementOrder(this)
    }

    async calculateMedian(){
        //take the UnitsInvolved and find the pixel that is the median of all of them
        const pixelPositions = [];

        for (const chunkID in this.UnitsInvolved) {
            console.log(chunkID,"hmm chunkId")
            const [chunkX, chunkY] = chunkID.split(',').map(Number);
            const offsetX = chunkX * 1536;
            const offsetY = chunkY * 1536;

            const unitTypes = this.UnitsInvolved[chunkID];
            const pixelMap = await getPixelLocationsForTile(chunkID)
            if (!pixelMap) continue;//skip if not found, prevents death
            console.log(pixelMap, "pixelMap")
            // console.log("exists for it!",pixelMap)

            //since unitT
            for (const unitType in unitTypes) {
                const serverIds = unitTypes[unitType].ServerIds;
                for (const id of serverIds) {
                    // console.log
                    const pos = pixelMap.get(id);
                    console.log(pos,id)
                    if (pos) {
                        pixelPositions.push({ x: pos.x +offsetX, y: pos.y +offsetY});
                    }
                }

            }

        }

        if (pixelPositions.length === 0) {this.OrderCenter = null;return;}

        const xs = pixelPositions.map(p => p.x).sort((a, b) => a - b);
        const ys = pixelPositions.map(p => p.y).sort((a, b) => a - b);
        const mid = Math.floor(pixelPositions.length / 2);

        const medianX = xs.length % 2 === 0 ? Math.floor((xs[mid - 1] + xs[mid]) / 2) : xs[mid];
        const medianY = ys.length % 2 === 0 ? Math.floor((ys[mid - 1] + ys[mid]) / 2) : ys[mid];

        // Convert back to chunk-relative position
        const chunkX = Math.floor(medianX / chunkSize);
        const chunkY = Math.floor(medianY / chunkSize);
        const localX = medianX % chunkSize;
        const localY = medianY % chunkSize;

        this.OrderCenter=`${localX},${localY}`;
        this.chunkHoldingCenter=`${chunkX},${chunkY}`

        console.log(this.OrderCenter,this.chunkHoldingCenter)
    }

    createFormation(){
        //take the OrderCenter and go over the units, generating the offsets for them to make the formation
    }
}

module.exports=MovementOrder