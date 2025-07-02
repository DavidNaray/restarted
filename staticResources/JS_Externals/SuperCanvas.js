import * as THREE from "three";

class SuperTextureManager{
    constructor(){
        this.tileSize = 512;
        this.canvas = document.createElement('canvas');
        // this.canvas.width=0;
        // this.canvas.height=0;
        this.ctx = this.canvas.getContext('2d');
        this.texture = new THREE.Texture(this.canvas);

        // this.horizontalShift=0;
        // this.verticalShift=0;
        this.minimumChunkX=0;
        this.maximumChunkX=0;

        this.minimumChunkY=0;
        this.maximumChunkY=0;
        
        
        // this.texture.magFilter = THREE.NearestFilter;
        // this.texture.minFilter = THREE.NearestFilter;
        this.tiles = new Map(); //a mapping to see if canvas has been updated for a tile
    }

    resizeIfNeeded(x, y) {
        console.log(x,y,"bruh, xy",this.minimumChunkX)
        const oldMinX = this.minimumChunkX;
        const oldMinY = this.minimumChunkY;

        if (x < this.minimumChunkX) this.minimumChunkX = x;
        if (x > this.maximumChunkX) this.maximumChunkX = x;
        if (y < this.minimumChunkY) this.minimumChunkY = y;
        if (y > this.maximumChunkY) this.maximumChunkY = y;

        const shiftX = oldMinX - this.minimumChunkX;
        const shiftY = oldMinY - this.minimumChunkY;
        console.log(shiftX,shiftY, "shifty")


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
        // const oldCtx = this.ctx;

        const newCanvas = document.createElement('canvas');
        newCanvas.width = newWidth;
        newCanvas.height = newHeight;

        const newCtx = newCanvas.getContext('2d');
        // Clear new canvas to avoid leftover artifacts
        newCtx.clearRect(0, 0, newWidth, newHeight);
        
        console.log("the shift", shiftX*this.tileSize,shiftY*this.tileSize)
        newCtx.drawImage(oldCanvas, shiftX*this.tileSize,shiftY*this.tileSize ); // preserve existing content

        this.canvas = newCanvas;
        this.ctx = newCtx;

        // Update texture
        this.texture.image = newCanvas;
        this.texture.needsUpdate = true;
    }

    addTile(x, y, tileImageBitmap) {
        // console.log(`${x},${y}`,"tile requesting updating supertexture")
        // if(this.tiles.get(`${x},${y}`)){return;}
        // console.log(this.tiles.get(`${x},${y}`),"in?")
        this.resizeIfNeeded(x, y);
        
        const px = (x-this.minimumChunkX) * this.tileSize;
        const py = (y - this.minimumChunkY) * this.tileSize;
        console.log(x,y,"addtile",px,py)
        this.ctx.drawImage(tileImageBitmap,px, py);
        
        this.texture.needsUpdate = true;
        console.log(this.texture.image.width, "image width")

        this.tiles.set(`${x},${y}`, true);
    }

    getUVOffset(x, y) {
        const widthInTiles = this.canvas.width / this.tileSize;
        const heightInTiles = this.canvas.height / this.tileSize;
        console.log(x,y,"difference",x- this.minimumChunkX)
        return new THREE.Vector2(//0.001 +512*x,0.999
            ((x- this.minimumChunkX) /widthInTiles),
            1 - ( y -this.minimumChunkY )/(heightInTiles) 
        );
    }

    getUVScale(x,y) {
        const widthInTiles = this.canvas.width / this.tileSize;
        const heightInTiles = this.canvas.height / this.tileSize;
        console.log(x,y,"WH",widthInTiles,heightInTiles)
        const WidthInSubTiles=(0.25 /widthInTiles);//0.25 because each tile is split into 4x4 subtiles
        const HeightInSubTiles=0.25/heightInTiles;
        // console.log(WidthInSubTiles,HeightInSubTiles, "Width...",widthInTiles,heightInTiles)
        return new THREE.Vector2(
            //1/width so that focus on scope of one tile, then /4 because each tile split into 4 subtiles
            ( 1.0 / (widthInTiles) ) / (4),
            (1.0 / (heightInTiles)) / 4
            // (WidthInSubTiles),
            // (HeightInSubTiles)
        );
    }

    getTileUVRect(x, y){
        return [this.getUVOffset(x,y),this.getUVScale(x,y)]
    }
}

export const superHeightMapTexture=new SuperTextureManager();
export const superColourMapTexture=new SuperTextureManager();

// document.getElementById("canvas_debug").appendChild(superHeightMapTexture.canvas)