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

    async resizeIfNeeded(x, y) {
        // console.log(x,y,"bruh, xy",this.minimumChunkX)
        const oldMinX = this.minimumChunkX;
        const oldMinY = this.minimumChunkY;

        if (x < this.minimumChunkX) this.minimumChunkX = x;
        if (x > this.maximumChunkX) this.maximumChunkX = x;
        if (y < this.minimumChunkY) this.minimumChunkY = y;
        if (y > this.maximumChunkY) this.maximumChunkY = y;


        const magX=this.maximumChunkX-this.minimumChunkX
        const magY=this.maximumChunkY-this.minimumChunkY
        const requiredWidth = (magX+ 1) * this.tileSize
        const requiredHeight = (magY + 1) * this.tileSize
        // console.log("required",requiredWidth,requiredHeight)

        // if (requiredWidth <= this.canvas.width && requiredHeight <= this.canvas.height){return;}
            
        if (requiredWidth > this.canvas.width || requiredHeight > this.canvas.height) {
            // const newWidth = Math.max(requiredWidth, this.canvas.width);
            // const newHeight = Math.max(requiredHeight, this.canvas.height);

            const oldCanvas = this.canvas;
            const newCanvas = document.createElement('canvas');
            
            newCanvas.width = requiredWidth//newWidth;
            newCanvas.height = requiredHeight//newHeight;

            const newCtx = newCanvas.getContext('2d');
            // Clear new canvas to avoid leftover artifacts
            // newCtx.clearRect(0, 0, newWidth, newHeight);
            
            // console.log("the shift", shiftX*this.tileSize,shiftY*this.tileSize)
            // newCtx.drawImage(oldCanvas, shiftX*this.tileSize,shiftY*this.tileSize ); // preserve existing content
            const offsetX = (oldMinX - this.minimumChunkX) * this.tileSize;
            const offsetY = (oldMinY - this.minimumChunkY) * this.tileSize;
            newCtx.drawImage(oldCanvas, offsetX, offsetY);


            this.canvas = newCanvas;
            this.ctx = newCtx;

            // Update texture
            // this.texture.image=newCanvas;
            this.texture = new THREE.Texture(newCanvas);//newCanvas;
            // this.texture.wrapS = THREE.ClampToEdgeWrapping;
            // this.texture.wrapT = THREE.ClampToEdgeWrapping;
            this.texture.magFilter = THREE.LinearFilter//THREE.NearestFilter;
            this.texture.minFilter = THREE.LinearFilter//THREE.NearestFilter;
            this.texture.generateMipmaps = false; // optional, avoids mip sea
            this.texture.needsUpdate = true;
        }
    }

    async addTile(x, y, tileImageBitmap,TileClassObject) {

        // console.log(x,y, "TILEEEEEEEEE")
        await this.resizeIfNeeded(x, y);
        
        const px = (x-this.minimumChunkX) * this.tileSize;
        const py = (y - this.minimumChunkY) * this.tileSize;

        this.ctx.drawImage(tileImageBitmap,px, py);
        
        this.texture.needsUpdate = true;
        // console.log(this.texture.image.width, "image width")

        this.tiles.set(`${x},${y}`, { imageBitmap: tileImageBitmap, obj: TileClassObject });

        const p = 1; // 1-pixel strip

        this.tiles.forEach((tileObj,key)=>{
            const [xx,yy]=key.split(",").map(Number)
            const img = tileObj.imageBitmap; // use the correct tile’s bitmap
            const px = (xx - this.minimumChunkX) * this.tileSize;
            const py = (yy - this.minimumChunkY) * this.tileSize;

            // left neighbor missing
            if (!this.tiles.has(`${xx+1},${yy}`) ){//&& xx !=this.minimumChunkX ) {//&&  xx < this.maximumChunkX
                console.log("bruh",xx,yy)
                this.ctx.drawImage(img, 0, 0, 1, this.tileSize, px - 1, py, 1, this.tileSize);
            }
            
            // right neighbor missing
            if (!this.tiles.has(`${xx-1},${yy}`) ){//&& xx > this.maximumChunkX) {
                // Copy leftmost column
                this.ctx.drawImage(img, this.tileSize-1, 0, 1, this.tileSize, px + this.tileSize, py, 1, this.tileSize);
                // this.ctx.drawImage(tileImageBitmap, 0, 0, 1, this.tileSize, px - p, py, 1, this.tileSize);
            }

            // Bottom neighbor missing
            if (!this.tiles.has(`${xx},${yy+1}`) ){//&& yy < this.maximumChunkY) {
                this.ctx.drawImage(img, 0, this.tileSize-1, this.tileSize, 1, px, py + this.tileSize, this.tileSize, 1);
            }

            // Top neighbor missing
            if (!this.tiles.has(`${xx},${yy-1}`) ){//&& yy != this.minimumChunkY) {
                this.ctx.drawImage(img, 0, 0, this.tileSize, 1, px, py - p, this.tileSize, 1);
            }
        })



        this.tiles.forEach((tileObj)=>{tileObj.obj.BuildMaterials();})
    }

    getUVOffset(x, y) {
        const widthInTiles  = (this.maximumChunkX - this.minimumChunkX + 1);
        const heightInTiles = (this.maximumChunkY - this.minimumChunkY + 1);

        //if a chunk does not have a chunk to its left and its > than the minimum X, it needs to be shifted right
        // console.log("DOES IT HAVE ",`${x+1},${y}`,x,y,x<this.minimumChunkX,this.maximumChunkX)
        
        return new THREE.Vector2(
            ((x - this.minimumChunkX) / widthInTiles),
            1 - (y - this.minimumChunkY) / heightInTiles
        );
        // const widthInTiles = this.canvas.width / this.tileSize;
        // const heightInTiles = this.canvas.height / this.tileSize;
        // // console.log(x,y,"difference",x- this.minimumChunkX)
        // return new THREE.Vector2(//0.001 +512*x,0.999
        //     ((x- this.minimumChunkX) /widthInTiles),
        //     1 - ( y -this.minimumChunkY )/(heightInTiles) 
        // );
    }

    getUVScale() {
        // const widthInTiles = this.canvas.width / this.tileSize;
        // const heightInTiles = this.canvas.height / this.tileSize;
        const widthInTiles  = (this.maximumChunkX - this.minimumChunkX + 1);
        const heightInTiles = (this.maximumChunkY - this.minimumChunkY + 1);

        return new THREE.Vector2(
            //1/width so that focus on scope of one tile, then /4 because each tile split into 4 subtiles
            ( 1.0 / (widthInTiles) ), /// (4),
            (1.0 / (heightInTiles)),// / 4

        );
    }

    getTileUVRect(x, y){
        // return [this.getUVOffset(x,y),this.getUVScale()]
        const texWidth = this.canvas.width;
        const texHeight = this.canvas.height;

        let uvOffset =  this.getUVOffset(x,y)

        let uvScale = this.getUVScale()


        // Apply half-texel correction ONCE per chunk
        const texelX = 1.0 / texWidth;
        const texelY = 1.0 / texHeight;

        // uvOffset.x += texelX * 0.5;
        // uvOffset.y += texelY * 0.5;
        // uvScale.x -= texelX;
        // uvScale.y -= texelY;
        // var xAdjust=0
        // console.log(x,y,this.minimumChunkX)
        // if(!this.tiles.has(`${x+1},${y}`) && x<this.maximumChunkX){
        //     console.log("erm")
        //     xAdjust=0.1//texelX
        //     // uvScale.x -= texelX;
        // }
        // uvOffset.y+=xAdjust
        return [uvOffset, uvScale];
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