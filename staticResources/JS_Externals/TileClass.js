import * as THREE from "three";

import {TileInstancePool} from "./InstancePoolClass.js"
import {scene,requestRenderIfNotRequested} from "../siteJS.js"
import {superHeightMapTexture,superColourMapTexture,superWalkMapTexture} from "./SuperCanvas.js"

// responsible for generating the tile and holding the instancePools objects that track units and buildings
export class Tile{
    constructor(x,y,texUrl,HeightUrl,centralTile){
        
        this.instancePooling=new TileInstancePool(this);
        this.meshes=new Map();//what makes up the terrain tile, to allow frustrum cull

        this.x=x;
        this.y=y;
        //get the difference between this tile and the central
        this.offSet=[centralTile[0]-x,centralTile[1]-y]
        
        this.HeightUrl=HeightUrl;
        this.heightmap;
        this.heightMapCanvas;

        this.texUrl=texUrl;
        this.texture;
        this.TextureMapCanvas;
    }

    async loadtextures(){

        async function loadTextureWithAuth(url, token) {

            const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }});
            if (!response.ok) {throw new Error(`Failed to load texture: ${response.statusText}`);}

            const blob = await response.blob();
            const imageBitmap = await createImageBitmap(blob);

            const canvas = document.createElement('canvas');
            canvas.width = imageBitmap.width;
            canvas.height = imageBitmap.height;


            const ctx = canvas.getContext('2d');
            ctx.drawImage(imageBitmap, 0, 0);

            const texture = new THREE.Texture(canvas )
            texture.wrapS = THREE.ClampToEdgeWrapping;
            texture.wrapT = THREE.ClampToEdgeWrapping;
            texture.generateMipmaps = false;
            texture.minFilter = THREE.LinearFilter;
            texture.magFilter = THREE.LinearFilter;
            texture.needsUpdate = true;
            return {texture,canvas,imageBitmap};
        }

        const [height, colour] = await Promise.all([
            loadTextureWithAuth(this.HeightUrl, localStorage.getItem('accessToken')),
            loadTextureWithAuth(this.texUrl, localStorage.getItem('accessToken'))
        ]);

        // Assign heightmap
        this.heightmap = height.texture;
        this.heightMapCanvas = height.canvas;
        // Assign colourmap
        this.texture = colour.texture;
        this.TextureMapCanvas = colour.canvas;

        // Wait for BOTH superTexture operations to finish
        await Promise.all([
            new Promise(resolve => superHeightMapTexture.addTile(
                -this.offSet[0], -this.offSet[1], height.imageBitmap, this, resolve
            )),
            new Promise(resolve => superColourMapTexture.addTile(
                -this.offSet[0], -this.offSet[1], colour.imageBitmap, this, resolve
            ))
        ]);
        return true;
    }
    
    BuildTileBase(){
        const TERRAIN_SIZE = 30; // World size for scaling
        const totalTiles=16

        const tilesPerSide = 4.0; // 4x4 grid => 16 tiles total
        const segmentsPerTile = 128

        // const uvScale = 0.25
        for (let y = 0; y < tilesPerSide; y++) {
            for (let x = 0; x < tilesPerSide; x++) {
                // Create a plane geometry for this tile
                const geometry = new THREE.PlaneGeometry(1, 1, segmentsPerTile,segmentsPerTile );//segmentsPerTile
                geometry.rotateX(-Math.PI / 2);

                const placeholderMaterial=new THREE.MeshBasicMaterial({ color: 0x0000ff })

                const mesh = new THREE.Mesh(geometry, placeholderMaterial);
                // Position tile in world space
                const worldTileSize = TERRAIN_SIZE / totalTiles;
                const totalSize = worldTileSize * tilesPerSide; // == TERRAIN_SIZE, but explicit
                mesh.position.set(
                    ((x + 0.5) * worldTileSize - totalSize / 2)-(this.offSet[0]*totalSize),
                    0,
                    ((y + 0.5) * worldTileSize - totalSize / 2)-(this.offSet[1]*totalSize)
                );
                mesh.scale.set(worldTileSize, 1, worldTileSize);
                // mesh.matrixAutoUpdate = false;

                this.meshes.set(`${x},${y}`,mesh);
                scene.add(mesh);
            }          
        }
        return this.meshes
    }

    //called by the supercanvas to adjust the offsets and scaling the tile picks from the supercanvas
    async BuildMaterials(){
        // console.log("hello?")
        const HEIGHT_SCALE = 0.6;
        const heightTexToUse=superHeightMapTexture.texture
        const ColourTexToUse=superColourMapTexture.texture

        const Rect=superHeightMapTexture.getTileUVRect(-this.offSet[0],-this.offSet[1])
        const uvOffset=Rect[0]
        const uvScale=Rect[1]
        this.meshes.forEach((mesh,key)=>{
            // console.log("pairing",key, mesh)
            const processedKey=key.split(",")
            const x=Number(processedKey[0])
            const y=Number(processedKey[1])
            // console.log(x,y,"split up key")

            // console.log(uvOffset,this.x,this.y,uvScale)
            const subgridOffset=new THREE.Vector2(
                (uvOffset.x + x*(uvScale.x/4)),
                uvOffset.y  - (y+1)*(uvScale.y/4)
            )
            const subgridScale=new THREE.Vector2(
                uvScale.x/4,
                uvScale.y/4
            )


            const material = new THREE.ShaderMaterial({
                uniforms: {
                    heightmap: { value:heightTexToUse },
                    textureMap: { value: ColourTexToUse },
                    heightScale: { value: HEIGHT_SCALE },
                    uvOffset: { value: subgridOffset},//uvOffset },
                    uvScale: { value: subgridScale}//uvScale }
                },
                vertexShader: `
                    precision highp  float;
                    precision highp  int;

                    uniform sampler2D heightmap;
                    uniform float heightScale;
                    uniform vec2 uvOffset;
                    uniform vec2 uvScale;
                    varying vec2 vUv;

                    void main() {
                        vUv = uvOffset + uv * uvScale;
                        float height = texture2D(heightmap, vUv).r * heightScale;
                        vec3 newPosition = position + normal * height;
                        gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
                    }
                `,
                fragmentShader: `
                    precision lowp float;
                    precision mediump int;

                    uniform sampler2D textureMap;
                    uniform sampler2D heightmap;
                    varying vec2 vUv;

                    void main() {
                        vec3 color = texture2D(textureMap, vUv).rgb;
                        vec3 Hcolor = texture2D(heightmap, vUv).rgb;
                        gl_FragColor = vec4(color, 1.0);//vec4(color, 1.0);
                    }
                `,
                side: THREE.FrontSide
            });
            mesh.material=material
            mesh.material.needsUpdate=true


        });
        requestRenderIfNotRequested();
    }


    //addToScene and objectLoad work as a pair, objectLoad checks if the object wanting to be added exists
    //this means that objectLoad should always be called, not addToScene, that is a utlity function of objectLoad

    async addToScene(Obj_Identifier,MetaData){
        const rawPosition=MetaData.position//these are in pixel coords for this tile
        // console.log("so called rawpos:", rawPosition)
        // console.log("raw position: ",rawPosition)
        const xyz=superHeightMapTexture.getXYZ(-this.offSet[0],-this.offSet[1],rawPosition)//MetaData.position
        // console.log("FIRING FIRING",xyz)
        const transform = new THREE.Matrix4();
        const position = new THREE.Vector3(xyz[0], xyz[1], xyz[2]);
        const quaternion = new THREE.Quaternion();  // No rotation
        const scale = new THREE.Vector3(0.2, 0.2, 0.2);
        transform.compose(position, quaternion, scale);

        this.instancePooling.GeneralAddInstance(Obj_Identifier,transform,MetaData);//.metaData
    }

    moveUnit(pixelLocation,theserverId){
        const xyz=superHeightMapTexture.getXYZ(-this.offSet[0],-this.offSet[1],pixelLocation)//MetaData.position
        // console.log("FIRING FIRING",xyz)
        const transform = new THREE.Matrix4();
        const position = new THREE.Vector3(xyz[0], xyz[1], xyz[2]);
        const quaternion = new THREE.Quaternion();  // No rotation
        const scale = new THREE.Vector3(0.2, 0.2, 0.2);
        transform.compose(position, quaternion, scale);

        this.instancePooling.moveUnit(theserverId,transform)
    }

    removeUnit(serverId){this.instancePooling.removeInstance(serverId)}

}