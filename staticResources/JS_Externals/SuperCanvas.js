import * as THREE from "three";

class SuperTextureManager{
    constructor(scaleFactor){
        this.tileSize = 512*scaleFactor;
        this.canvas = document.createElement('canvas');

        this.ctx = this.canvas.getContext('2d');
        this.texture = new THREE.Texture(this.canvas);

        this.minimumChunkX=0;
        this.maximumChunkX=0;

        this.minimumChunkY=0;
        this.maximumChunkY=0;
        
        this.tiles = new Map(); //a mapping to see if canvas has been updated for a tile
    }

    resizeIfNeeded(x, y) {
        // console.log(x,y,"bruh, xy",this.minimumChunkX)
        const oldMinX = this.minimumChunkX;
        const oldMinY = this.minimumChunkY;

        if (x < this.minimumChunkX) this.minimumChunkX = x;
        if (x > this.maximumChunkX) this.maximumChunkX = x;
        if (y < this.minimumChunkY) this.minimumChunkY = y;
        if (y > this.maximumChunkY) this.maximumChunkY = y;

        const shiftX = oldMinX - this.minimumChunkX;
        const shiftY = oldMinY - this.minimumChunkY;
        // console.log(shiftX,shiftY, "shifty")


        const magX=this.maximumChunkX-this.minimumChunkX
        const magY=this.maximumChunkY-this.minimumChunkY
        const requiredWidth = (magX+ 1) * this.tileSize
        const requiredHeight = (magY + 1) * this.tileSize
        // console.log("required",requiredWidth,requiredHeight)
        if (requiredWidth <= this.canvas.width && requiredHeight <= this.canvas.height)
            return;

        const newWidth = Math.max(requiredWidth, this.canvas.width);
        const newHeight = Math.max(requiredHeight, this.canvas.height);

        const oldCanvas = this.canvas;

        const newCanvas = document.createElement('canvas');
        newCanvas.width = newWidth;
        newCanvas.height = newHeight;

        const newCtx = newCanvas.getContext('2d');
        // Clear new canvas to avoid leftover artifacts
        newCtx.clearRect(0, 0, newWidth, newHeight);
        
        // console.log("the shift", shiftX*this.tileSize,shiftY*this.tileSize)
        newCtx.drawImage(oldCanvas, shiftX*this.tileSize,shiftY*this.tileSize ); // preserve existing content

        this.canvas = newCanvas;
        this.ctx = newCtx;

        // Update texture
        this.texture.image = newCanvas;
        this.texture.needsUpdate = true;
    }

    addTile(x, y, tileImageBitmap,TileClassObject) {
        // console.log(`${x},${y}`,"tile requesting updating supertexture")
        // if(this.tiles.get(`${x},${y}`)){return;}
        // console.log(this.tiles.get(`${x},${y}`),"in?")
        this.resizeIfNeeded(x, y);
        
        const px = (x-this.minimumChunkX) * this.tileSize;
        const py = (y - this.minimumChunkY) * this.tileSize;
        // console.log(x,y,"addtile",px,py)
        this.ctx.drawImage(tileImageBitmap,px, py);
        
        this.texture.needsUpdate = true;
        // console.log(this.texture.image.width, "image width")

        this.tiles.set(`${x},${y}`, TileClassObject);

        // console.log("set?",this.tiles)
        //go through this.tiles and run BuildMaterials for each object
        // for (const [key, tileObj] of Object.entries(this.tiles)) {
        //     console.log(key, "key?")
        //     // tileObj.BuildMaterials();
        // }
        this.tiles.forEach((tileObj)=>{
            // console.log(tileObj)
            tileObj.BuildMaterials();
        })
    }

    getUVOffset(x, y) {
        const widthInTiles = this.canvas.width / this.tileSize;
        const heightInTiles = this.canvas.height / this.tileSize;
        // console.log(x,y,"difference",x- this.minimumChunkX)
        return new THREE.Vector2(//0.001 +512*x,0.999
            ((x- this.minimumChunkX) /widthInTiles),
            1 - ( y -this.minimumChunkY )/(heightInTiles) 
        );
    }

    getUVScale() {
        const widthInTiles = this.canvas.width / this.tileSize;
        const heightInTiles = this.canvas.height / this.tileSize;

        return new THREE.Vector2(
            //1/width so that focus on scope of one tile, then /4 because each tile split into 4 subtiles
            ( 1.0 / (widthInTiles) ) / (4),
            (1.0 / (heightInTiles)) / 4

        );
    }

    getTileUVRect(x, y){
        return [this.getUVOffset(x,y),this.getUVScale()]
    }

    getXYZ(chunkX,chunkY,pixelCoords){
        //each tile is 7.5, centered around 0,0,0 so -3.75 
        //each walkMap is 1536 pixels so each pixel is 7.5/1536, since unit positions are based on walkmap
            //must reduce to heightmapscale to sample the heightmap
        const pixelToWorldConversion=7.5/ 1536
        const HeightScale=0.6

        const x=chunkX*7.5 - 3.75 + pixelToWorldConversion*pixelCoords[0];
        const z=chunkY*7.5 - 3.75 + pixelToWorldConversion*pixelCoords[1];
        
        const pointX=chunkX*this.tileSize + Math.round(pixelCoords[0]/3)
        const pointY=chunkY*this.tileSize + Math.round(pixelCoords[1]/3)
        const y=((this.ctx.getImageData(pointX,pointY,1,1).data[0]) / (7.5*30))*HeightScale;
        
        // console.log(y,chunkX,chunkY,pointX,pointY,x,y, "sampled y coord")
        
        return [x,y,z]
    }
}

export const superHeightMapTexture=new SuperTextureManager(1);
export const superColourMapTexture=new SuperTextureManager(1);
export const superWalkMapTexture=new SuperTextureManager(3);

// document.getElementById("canvas_debug").appendChild(superHeightMapTexture.canvas)