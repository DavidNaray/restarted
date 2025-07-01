import * as THREE from "three";
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.176.0/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'https://cdn.jsdelivr.net/npm/three@0.176.0/examples/jsm/utils/BufferGeometryUtils.js';

import {TileInstancePool} from "./InstancePoolClass.js"
import {scene,requestRenderIfNotRequested} from "../siteJS.js"
import {superHeightMapTexture,superColourMapTexture} from "./SuperCanvas.js"

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
        this.meshes=new Set();//what makes up the terrain tile, to allow frustrum cull

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

        // this.viewLevel=TileRelationship;
        //get the difference between this tile and the central
        this.offSet=[centralTile[0]-x,centralTile[1]-y]
        // console.log(this.offSet.length,"offset")
    }

    loadtextures(){
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
            texture.needsUpdate = true;
            return [texture,canvas,imageBitmap];
        }
        async function loadWalkMapWithAuth(url, token) {
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

            const ctx = canvas.getContext('2d');
            ctx.drawImage(imageBitmap, 0, 0);
            // ctx.rotate((-90 * Math.PI) / 180);
            // ctx.setTransform(1, 0, 0, 1, 0, 0);

            return canvas;
        }

        // Usage:
        loadTextureWithAuth(this.HeightUrl, localStorage.getItem('accessToken'))
        .then(texCanv => {
            this.heightmap = texCanv[0];
            this.heightMapCanvas =texCanv[1];
            superHeightMapTexture.addTile(this.x,this.y,texCanv[2])
            // console.log(superHeightMapTexture.canvas.width, "canvas width!",superHeightMapTexture.canvas.height)
            this.BuildTileBase();
        })
        .catch(err => {console.error('Texture load error:', err);});

        // -------------------------------//
        loadTextureWithAuth(this.texUrl, localStorage.getItem('accessToken'))
        .then(texture => {
            this.texture = texture[0];
            this.TextureMapCanvas=texture[1];
            superColourMapTexture.addTile(this.x,this.y,texture[2])
            this.BuildTileBase();
        })
        .catch(err => {console.error('Texture load error:', err);});

        // -------------------------------//
        loadWalkMapWithAuth(this.WalkMapUrl, localStorage.getItem('accessToken'))
        .then(texture => {
            this.walkMap=texture;
            // const startpixel={x:40,y:40}
            // const goalpixel={x:80,y:80}

            // this.AstarPathCost(startpixel,goalpixel,startpixel,80,80)

            // this.PortalConnectivity()

        })
        .catch(err => {console.error('Texture load error:', err);});
    }
    BuildTileBase(){
        if (this.heightmap && this.texture) {

            const heightTexToUse=superHeightMapTexture.texture
            const ColourTexToUse=superColourMapTexture.texture

            const uvScale=superHeightMapTexture.getUVScale(this.x,this.y)//OffsetAndScale[1]
            
            const TERRAIN_SIZE = 30; // World size for scaling
            const HEIGHT_SCALE = 0.6;
            const totalTiles=16

            const tilesPerSide = 4.0; // 4x4 grid => 16 tiles total
            const segmentsPerTile = 128

            // const uvScale = 0.25
            for (let y = 0; y < tilesPerSide; y++) {
                for (let x = 0; x < tilesPerSide; x++) {
                    // Create a plane geometry for this tile
                    const geometry = new THREE.PlaneGeometry(1, 1, segmentsPerTile,segmentsPerTile );//segmentsPerTile
                    geometry.rotateX(-Math.PI / 2);

                    const uvOffset=superHeightMapTexture.getUVOffset(this.x,this.y)//OffsetAndScale[0]
                    uvOffset.x=uvOffset.x + x*uvScale.x//+x/512                    
                    uvOffset.y=1.0 - (y+1)*uvScale.y//+y*uvScale.y

                    const material = new THREE.ShaderMaterial({
                        uniforms: {
                            heightmap: { value:heightTexToUse },
                            textureMap: { value: ColourTexToUse },
                            heightScale: { value: HEIGHT_SCALE },
                            uvOffset: { value: uvOffset },
                            uvScale: { value: uvScale }
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

                    const mesh = new THREE.Mesh(geometry, material);
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

                    this.meshes.add(mesh);
                    this.instanceManager.meshToTiles.set(mesh,this)
                    this.instanceManager.allTileMeshes.push(mesh)
                    scene.add(mesh);

                }
            }
                  
            requestRenderIfNotRequested();
        }
    }

    //addToScene and objectLoad work as a pair, objectLoad checks if the object wanting to be added exists
    //this means that objectLoad should always be called, not addToScene, that is a utlity function of objectLoad

    async addToScene(Obj_Identifier,MetaData){

        const xyz=MetaData.position
        // console.log("FIRING FIRING",xyz)
        const transform = new THREE.Matrix4();
        const position = new THREE.Vector3(xyz[0], xyz[1], xyz[2]);
        const quaternion = new THREE.Quaternion();  // No rotation
        const scale = new THREE.Vector3(0.2, 0.2, 0.2);
        transform.compose(position, quaternion, scale);

        this.instancePooling.GeneralAddInstance(Obj_Identifier,transform,MetaData);//.metaData
    }

    async objectLoad(assetId,MetaData,AssetClass){
        // console.log("TRYNA LOAD IN:",assetId,MetaData,AssetClass)
        //AssetClass is if the asset being loaded should be considered a building or unit etc

        const has=OBJECTS.has(assetId)

        if(!has){
            // const loader = new GLTFLoader();
            fileLoader.load(
                // resource URL
                'Assets/GLB_Exports/'+assetId+'.glb',
                // called when the resource is loaded
                (data) => {
                    loader.parse(
                        data,
                        '', // path to resolve external resources, '' is okay for embedded
                        (gltf) => {
                            const geometries = [];
                            // let material = null;
                            const materials = [];
                            // gltf.scene.scale.set(0.00002, 0.00002, 0.00002);
                            gltf.scene.traverse((child) => {
                                if (child.isMesh) {
                                    // Make sure the geometry is updated to world transform if needed:
                                    // const geom = child.geometry.clone();
                                    // geom.applyMatrix4(child.matrixWorld);
                                    // geometries.push(geom);
                                    geometries.push(child.geometry);

                                    // if (!material) {
                                    //     material = child.material;
                                    // }
                                    // Collect material(s)
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
                                return;
                            }

                            // Merge all geometries into one
                            const mergedGeometry = mergeGeometries(geometries, true);

                            // Create a single mesh with merged geometry and one material
                            const mergedMesh = new THREE.Mesh(mergedGeometry, materials);
                            mergedMesh.scale.set(2,2, 2);
                            mergedMesh.updateMatrix();
                            OBJECTS.set(assetId, {"AssetClass":AssetClass, "Mesh":mergedMesh});

                            // OBJ_ENTRY.instances.forEach(inst => {
                            //     this.addToScene(OBJ_Name, inst);
                            // });
                            this.addToScene(assetId, MetaData)


                        },
                    );
                },
                // called while loading is progressing
                ( xhr ) =>{// console.log( ( xhr.loaded / xhr.total * 100 ) + '% loaded' );
                },
                // called when loading has errors
                ( error ) =>{console.log( 'An error happened',error );}
            );
        }else{
            this.addToScene(assetId, MetaData)
            // OBJ_ENTRY.instances.forEach(inst => {
            //     // this.addToScene(OBJ_Name, inst);
            //     this.addToScene(assetId, MetaData)
            // });
        }

        
    }

}