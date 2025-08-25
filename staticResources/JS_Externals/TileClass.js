import * as THREE from "three";
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.176.0/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'https://cdn.jsdelivr.net/npm/three@0.176.0/examples/jsm/utils/BufferGeometryUtils.js';

import {TileInstancePool} from "./InstancePoolClass.js"
import {scene,requestRenderIfNotRequested} from "../siteJS.js"
import {superHeightMapTexture,superColourMapTexture,superWalkMapTexture} from "./SuperCanvas.js"

const loader = new GLTFLoader();//new THREE.TextureLoader();
const fileLoader = new THREE.FileLoader(loader.manager);
fileLoader.setResponseType('arraybuffer'); // GLB is binary
fileLoader.setRequestHeader({'Authorization': `Bearer ${localStorage.getItem('accessToken')}`});

export var OBJECTS=new Map(); 

// responsible for generating the tile and holding the instancePools objects that track units and buildings
export class Tile{
    constructor(x,y,GInstanceManager,texUrl,HeightUrl,WalkMapUrl,centralTile){//TileRelationship, 
        this.instanceManager=GInstanceManager
        
        this.instancePooling=new TileInstancePool(this);
        // this.UnitInstancePooling=new TileInstancePool(this);
        this.meshes=new Map();//what makes up the terrain tile, to allow frustrum cull

        this.x=x;
        this.y=y;

        this.texUrl=texUrl;
        this.HeightUrl=HeightUrl;
        this.WalkMapUrl=WalkMapUrl;
        this.texture;
        this.heightmap;
        this.walkMap;//used for building placement confirmation and pathfinding (its a canvas)

        this.heightMapCanvas;
        // this.walkMapCanvas;
        this.TextureMapCanvas;
        
        this.PortalMap;
        this.abstractMap=new Map();

        this.loadtextures();
        this.instanceManager.registerTile(this)
    
        //get the difference between this tile and the central
        this.offSet=[centralTile[0]-x,centralTile[1]-y]
        
        this.BuildTileBase()
    }

    async loadtextures(){
        // console.log("REQUEST THESE FILES",this.HeightUrl,this.texUrl)
         
        async function loadTextureWithAuth(url, token) {
            const response = await fetch(url, {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (!response.ok) {
                throw new Error(`Failed to load texture: ${response.statusText}`);
            }

            const blob = await response.blob();
            const imageBitmap = await createImageBitmap(blob);

            const canvas = document.createElement('canvas');
            canvas.width = imageBitmap.width;
            canvas.height = imageBitmap.height;
            // console.log("actual width",canvas.width)

            const ctx = canvas.getContext('2d');
            ctx.drawImage(imageBitmap, 0, 0);



            const texture = new THREE.Texture(canvas )//imageBitmap);
            // texture.flipY = true;
            texture.wrapS = THREE.ClampToEdgeWrapping;
            texture.wrapT = THREE.ClampToEdgeWrapping;
            texture.generateMipmaps = false;
            texture.minFilter = THREE.LinearFilter;
            texture.magFilter = THREE.LinearFilter;
            texture.needsUpdate = true;
            return [texture,canvas,imageBitmap];
        }


        // Usage:
        try{
            const texCanv=await loadTextureWithAuth(this.HeightUrl, localStorage.getItem('accessToken'))
            // .then(texCanv => {
            this.heightmap = texCanv[0];
            this.heightMapCanvas =texCanv[1];
            await superHeightMapTexture.addTile(-this.offSet[0],-this.offSet[1],texCanv[2],this)
            // console.log(superHeightMapTexture.canvas.width, "canvas width!",superHeightMapTexture.canvas.height)
            // this.BuildTileBase();
        }catch(p){console.error('Texture load error:')}
        // .catch(err => {console.error('Texture load error:', err);});

        // -------------------------------//
        try{
            const texture=await loadTextureWithAuth(this.texUrl, localStorage.getItem('accessToken'))

            this.texture = texture[0];
            this.TextureMapCanvas=texture[1];
            //negated parameter of offset since "to the right", -1 for offset so yeah...
            await superColourMapTexture.addTile(-this.offSet[0],-this.offSet[1],texture[2],this)

        }catch(pp){console.error('Texture load error:')}
        // .catch(err => {console.error('Texture load error:', err);});

        // -------------------------------//
        // loadWalkMapWithAuth(this.WalkMapUrl, localStorage.getItem('accessToken'))
        // .then(texture => {
        //     this.walkMap=texture;

        // })
        // .catch(err => {console.error('Texture load error:', err);});
    }
    BuildTileBase(){
        // if (this.heightmap && this.texture) {

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
                this.instanceManager.meshToTiles.set(mesh,this)
                this.instanceManager.allTileMeshes.push(mesh)
                scene.add(mesh);

            }
                  
            // requestRenderIfNotRequested();
        }
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

    removeUnit(serverId){
        this.instancePooling.removeInstance(serverId)//.moveUnit(theserverId,transform)
    }

    async objectLoad(assetId,MetaData,AssetClass,){
        // console.log("TRYNA LOAD IN:",assetId,MetaData,AssetClass)
        //AssetClass is if the asset being loaded should be considered a building or unit etc

        const has=OBJECTS.has(assetId)
        if(has){return true}

        return new Promise((resolve, reject) => {
            fileLoader.load(
                `Assets/GLB_Exports/${assetId}.glb`,
                (data) => {
                    const loader = new GLTFLoader();
                    loader.parse(
                        data,
                        '',
                        (gltf) => {
                            const geometries = [];
                            const materials = [];

                            gltf.scene.traverse((child) => {
                                if (child.isMesh) {
                                    geometries.push(child.geometry);

                                    if (Array.isArray(child.material)) {
                                        child.material.forEach(mat => {
                                            if (!materials.includes(mat)) materials.push(mat);
                                        });
                                    } else {
                                        if (!materials.includes(child.material)) materials.push(child.material);
                                    }
                                }
                            });

                            if (geometries.length === 0) {
                                console.error("No meshes found in gltf scene");
                                resolve(false);
                                return;
                            }

                            const mergedGeometry = mergeGeometries(geometries, true);
                            const mergedMesh = new THREE.Mesh(mergedGeometry, materials);
                            mergedMesh.scale.set(2, 2, 2);
                            mergedMesh.updateMatrix();

                            OBJECTS.set(assetId, {
                                AssetClass,
                                Mesh: mergedMesh
                            });

                            resolve(true);
                        },
                        (error) => {
                            console.error("GLTF parse failed", error);
                            resolve(false);
                        }
                    );
                },
                undefined, // onProgress
                (error) => {
                    console.error("GLTF load failed", error);
                    resolve(false);
                }
            );
        });

        
    }

}