import * as THREE from "three";

class SuperTextureManager{
    constructor(){
        this.tileSize = 512;
        this.canvas = document.createElement('canvas');

        this.ctx = this.canvas.getContext('2d');
        this.texture = new THREE.Texture(this.canvas);
        // this.texture.magFilter = THREE.NearestFilter;
        // this.texture.minFilter = THREE.NearestFilter;
        this.tiles = new Map(); //a mapping to see if canvas has been updated for a tile
    }

    resizeIfNeeded(x, y) {
        const requiredWidth = (x + 1) * this.tileSize;
        const requiredHeight = (y + 1) * this.tileSize;

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
        newCtx.drawImage(oldCanvas, 0, 0); // preserve existing content

        this.canvas = newCanvas;
        this.ctx = newCtx;

        // Update texture
        this.texture.image = newCanvas;
        this.texture.needsUpdate = true;
    }

    addTile(x, y, tileImageBitmap) {
        // console.log(`${x},${y}`,"tile requesting updating supertexture")
        // if(this.tiles.get(`${x},${y}`)){return;}

        this.resizeIfNeeded(x, y);

        const px = x * this.tileSize;
        const py = y * this.tileSize;

        this.ctx.drawImage(tileImageBitmap, px, py);
        
        this.texture.needsUpdate = true;

        this.tiles.set(`${x},${y}`, true);
    }

    getUVOffset(x, y) {
        const widthInTiles = this.canvas.width / this.tileSize;
        const heightInTiles = this.canvas.height / this.tileSize;

        return new THREE.Vector2(
            x / widthInTiles,
            1.0 - (y + 1) / heightInTiles // Y is top-down
        );
    }

    getUVScale() {
        const widthInTiles = this.canvas.width / this.tileSize;
        const heightInTiles = this.canvas.height / this.tileSize;

        const WidthInSubTiles=0.25 / widthInTiles;//0.25 because each tile is split into 4x4 subtiles
        const HeightInSubTiles=0.25/heightInTiles;
        return new THREE.Vector2(
            // (1.0 / widthInTiles),
            // (1.0 / heightInTiles)
            (WidthInSubTiles),
            (HeightInSubTiles)
        );
    }

    getTileUVRect(x, y){
        return [this.getUVOffset(x,y),this.getUVScale()]
    }
}

export const superHeightMapTexture=new SuperTextureManager();
export const superColourMapTexture=new SuperTextureManager();