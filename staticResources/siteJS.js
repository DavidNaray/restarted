import * as THREE from "three";
import {OrbitControls} from 'https://cdn.jsdelivr.net/npm/three@0.176.0/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.176.0/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'https://cdn.jsdelivr.net/npm/three@0.176.0/examples/jsm/utils/BufferGeometryUtils.js';

import {getUserTileData,setupSocketConnection} from "./JS_Externals/SceneInitiation.js"
import {MakeToolTips} from "./JS_Externals/ResourceTips.js"
import {addEventListenersToButtons} from "./JS_Externals/DropDownUI.js"
import {updateGridColumns} from "./JS_Externals/Utils.js"

var controls,renderer,camera,renderRequested;
const scene = new THREE.Scene();

const loader = new GLTFLoader();//new THREE.TextureLoader();
const fileLoader = new THREE.FileLoader(loader.manager);
fileLoader.setResponseType('arraybuffer'); // GLB is binary
fileLoader.setRequestHeader({'Authorization': `Bearer ${localStorage.getItem('accessToken')}`});

const raycaster = new THREE.Raycaster();
const pointer  = new THREE.Vector2();

var isPlacingBuilding=false;
var BuildingAssetName=null;

const tileSize=1;


//objects, stores all the assets like soldiers etc

var OBJECTS=new Map(); 
var OBJECTS_MASKS=new Map();

class MinHeap {
    constructor(compare) {
        this.heap = [];
        this.compare = compare; // (a, b) => number, like (a, b) => a.f - b.f
    }

    push(value) {
        this.heap.push(value);
        this._heapifyUp();
    }

    pop() {
        if (this.heap.length === 1) return this.heap.pop();
        const top = this.heap[0];
        this.heap[0] = this.heap.pop();
        this._heapifyDown();
        return top;
    }

    isEmpty() {
        return this.heap.length === 0;
    }

    _heapifyUp() {
        let index = this.heap.length - 1;
        const element = this.heap[index];
        while (index > 0) {
            const parentIndex = Math.floor((index - 1) / 2);
            const parent = this.heap[parentIndex];
            if (this.compare(element, parent) >= 0) break;
            this.heap[index] = parent;
            index = parentIndex;
        }
        this.heap[index] = element;
    }

    _heapifyDown() {
        let index = 0;
        const length = this.heap.length;
        const element = this.heap[0];
        while (true) {
            let leftIndex = 2 * index + 1;
            let rightIndex = 2 * index + 2;
            let smallest = index;
            if (leftIndex < length && this.compare(this.heap[leftIndex], this.heap[smallest]) < 0) smallest = leftIndex;
            if (rightIndex < length && this.compare(this.heap[rightIndex], this.heap[smallest]) < 0) smallest = rightIndex;
            if (smallest === index) break;
            this.heap[index] = this.heap[smallest];
            index = smallest;
        }
        this.heap[index] = element;
    }
}

class PriorityQueue {
  constructor() {
    this.heap = new MinHeap((a, b) => a.priority - b.priority);
  }

  enqueue(node, priority) {
    this.heap.push({ node, priority });
  }

  dequeue() {
    if (this.heap.isEmpty()) return null;
    return this.heap.pop().node;
  }

  isEmpty() {
    return this.heap.isEmpty();
  }
}

class Template{
    constructor(name, structure = {}) {
        this.id = generateUniqueId();
        this.name = name;
        this.structure = structure; // { infantry: 20, artillery: 5 }
        this.instanceGroups = new Set(); // All instance groups (from many tiles)
        this.division = null;            // Assigned division (optional)
    }
}


class TileInstancePool { 
    constructor(tile) {
        this.tile = tile; // 👈 Full reference to the Tile instance
        this.dummyMatrix = new THREE.Matrix4(); // Globally or per class
        this.instanceGroups = new Map(); // objectType → instanceObject (for that objectType) 
        


    }

    getTileCoord() {
        return [this.tile.x,this.tile.y]; // or directly access this.tile.x, this.tile.y, etc.
    }

    GeneralAddInstance(objectType, transform,meta={}){
        //instance Objects are then given a meta-data tag
        //form of meta will vary, buildings may have name, type of building, under construction, resistances etc
        //units may have health, damage, weaknesses etc 
        //most importantly a reference to a template object if its part of a template
        let mesh=this.instanceGroups.get(objectType);
        if(!mesh){
            console.log("didnt exist, make it!")
            //if there was no key of objectType then there wont be a value
            mesh=this.createInstanceObjectOfCount(objectType,3);
            mesh.metadata=new Map();
            mesh.freeIndices=new Set([0,1,2])//every index is free 
            // mesh.scale.set(0.2,0.2,0.2)
            this.instanceGroups.set(objectType,mesh)
            scene.add(mesh);
        }else{//exists, 
            console.log("exists")

            const trueMax=mesh.instanceMatrix.count

            if(mesh.count >= trueMax){
                console.log("need to make bigger!")
                //create a new instanceObject that is larger
                const newMesh=this.createInstanceObjectOfCount(objectType,trueMax+16,mesh);
                newMesh.metadata=mesh.metadata;
                //need to copy over the information from the current mesh, +16 so it doesnt replace too often
                scene.remove(mesh)
                mesh = newMesh;
                scene.add(mesh);
                this.instanceGroups.set(objectType,mesh);
            }
        }


        let index;

        if (mesh.freeIndices.size > 0) {
            
            index = mesh.freeIndices.values().next().value; // Reuse a free index
            console.log("woah, free indice!", index)
            mesh.freeIndices.delete(index);
        } else {
            index = mesh.count++;

        }

        mesh.setMatrixAt(index, transform);
        mesh.metadata.set(index,meta);
        mesh.instanceMatrix.needsUpdate = true;
        if (index >= mesh.count) {
            mesh.count = index + 1;
        }
        console.log(mesh.freeIndices)
        
        requestRenderIfNotRequested();
    }


    createInstanceObjectOfCount(objectType,count,oldMesh = null){
        const objectTypeMesh=OBJECTS.get(objectType);
        const geometry = objectTypeMesh.geometry;//refers to the geometry
        const material = objectTypeMesh.material;
        const mesh = new THREE.InstancedMesh( geometry, material, count );
        const freeIndices=new Set();
        for(let j = 0; j < count; j++){
            freeIndices.add(j)
        }
        mesh.freeIndices=freeIndices;
        // If upgrading an old mesh, copy transforms
        if (oldMesh) {
            
            for (let i = 0; i < oldMesh.count; i++) { 
                freeIndices.delete(i)
                oldMesh.getMatrixAt(i, this.dummyMatrix);
                mesh.setMatrixAt(i, this.dummyMatrix);
            }
            mesh.count = oldMesh.count;
            
            
        } else {//ie when oldMesh is null
            mesh.count = 0; // Start fresh
        }


        return mesh;
    }

    removeInstance(objectType, index) {
        let mesh=this.instanceGroups.get(objectType);

        if (!mesh) return false;
    
        if (index >= mesh.count) return false; // Invalid index

        const lastIndex = mesh.count - 1;

        //so when count is decremented, it chops off the top instance, so we swap the index to be removed with the lastindex
        if (index !== lastIndex) {
            // Move last matrix into the removed slot
            mesh.getMatrixAt(lastIndex, this.dummyMatrix);
            mesh.setMatrixAt(index, this.dummyMatrix);
    
            // Update metadata
            const lastMeta = mesh.metadata.get(lastIndex);
            mesh.metadata.set(index, lastMeta);
            mesh.metadata.delete(lastIndex);
            
        } else {
            // If you're removing the last one directly since index ==last
            mesh.metadata.delete(index);
            
        }
        //you do not add the last index to free-indices because count is decremented

        mesh.count--;
        mesh.instanceMatrix.needsUpdate = true;

        
        // Compact every 10 removals (adjustable)
        if (mesh.freeIndices.size>=10) {
            console.log("trigger compact")
            this.compactInstanceObject(objectType, mesh);
        }
        requestRenderIfNotRequested();
        return true;
    }

    compactInstanceObject(objectType, oldMesh) {
        const usedIndices = new Set();
        for (let i = 0; i <= oldMesh.count; i++) {
            if (!oldMesh.freeIndices.has(i)) {
                usedIndices.add(i);
            }
        }
    
        // Nothing to compact if it's full or only a couple used
        if (usedIndices.size === oldMesh.instanceMatrix.count) return;
    
        //creating newMesh, not updating hence no oldMesh 3rd param into this, have to define freeIndices here, empty cus full
        const newMesh = this.createInstanceObjectOfCount(objectType, usedIndices.size);
        // newMesh.scale.set(0.2,0.2,0.2)
        newMesh.metadata=new Map();
        newMesh.freeIndices = new Set();
        
        let j = 0;
        for (const i of usedIndices) {
            oldMesh.getMatrixAt(i, this.dummyMatrix);
            newMesh.setMatrixAt(j, this.dummyMatrix);
            
            const meta=oldMesh.metadata.get(i);
            if(meta){
                newMesh.metadata.set(j, meta);
            }
            j++;
        }
        newMesh.count = usedIndices.size;
        newMesh.instanceMatrix.needsUpdate = true;
    
        scene.remove(oldMesh);
        scene.add(newMesh);
    
        // targetMap.set(objectType, newMesh);
        this.instanceGroups.set(objectType,newMesh);
    }


    transferInstance(targetTile, index, objectType, targetMap){

    }
}

// responsible for generating the tile and holding the instancePools objects that track units and buildings
class Tile{
    constructor(x,y,GInstanceManager,texUrl,HeightUrl,WalkMapUrl){
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
    }

    async loadtextures(){
        console.log("REQUEST THESE FILES",this.HeightUrl,this.texUrl)
         
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

            const ctx = canvas.getContext('2d');
            ctx.drawImage(imageBitmap, 0, 0);



            const texture = new THREE.Texture(canvas )//imageBitmap);
            // texture.flipY = true;
            texture.needsUpdate = true;
            return [texture,canvas];
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
            this.heightMapCanvas =texCanv[1] 
            this.BuildTileBase();
        })
        .catch(err => {
            console.error('Texture load error:', err);
        });

        // -------------------------------//
        loadTextureWithAuth(this.texUrl, localStorage.getItem('accessToken'))
        .then(texture => {
            this.texture = texture[0];
            this.TextureMapCanvas=texture[1];
            this.BuildTileBase();
        })
        .catch(err => {
            console.error('Texture load error:', err);
        });

        // -------------------------------//
        loadWalkMapWithAuth(this.WalkMapUrl, localStorage.getItem('accessToken'))
        .then(texture => {
            this.walkMap=texture;
            // const startpixel={x:40,y:40}
            // const goalpixel={x:80,y:80}

            // this.AstarPathCost(startpixel,goalpixel,startpixel,80,80)
            this.PortalConnectivity()
        })
        .catch(err => {
            console.error('Texture load error:', err);
        });
    }
    async BuildTileBase(){
        console.log("tried!!!")
        if (this.heightmap && this.texture) {
            // const width = this.heightmap.image.width;
            // const height = this.heightmap.image.height;

            const TERRAIN_SIZE = 30; // World size for scaling
            const HEIGHT_SCALE = 0.6;
            const totalTiles=16

            // ----
            const tilesPerSide = 4; // 4x4 grid => 16 tiles total
            // const tileSize = 1; // Each tile covers part of the 1x1 plane
            const segmentsPerTile = ((this.heightmap.image.width/2) / tilesPerSide) - 1; // 128 segments for 512px heightmap

            for (let y = 0; y < tilesPerSide; y++) {
                for (let x = 0; x < tilesPerSide; x++) {
                    // Create a plane geometry for this tile
                    const geometry = new THREE.PlaneGeometry(tileSize, tileSize, segmentsPerTile,segmentsPerTile );//segmentsPerTile
                    geometry.rotateX(-Math.PI / 2);

                    const uvOffset = new THREE.Vector2(x / tilesPerSide, 1.0 - (y + 1) / tilesPerSide);
                    const uvScale = 1 / tilesPerSide;

                    const material = new THREE.ShaderMaterial({
                        uniforms: {
                            heightmap: { value: this.heightmap },
                            textureMap: { value: this.texture },
                            heightScale: { value: HEIGHT_SCALE },
                            uvOffset: { value: uvOffset },
                            uvScale: { value: uvScale }
                        },
                        vertexShader: `
                            precision mediump float;
                            precision mediump int;

                            uniform sampler2D heightmap;
                            uniform float heightScale;
                            uniform vec2 uvOffset;
                            uniform float uvScale;
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
                            varying vec2 vUv;

                            void main() {
                                vec3 color = texture2D(textureMap, vUv).rgb;
                                gl_FragColor = vec4(color, 1.0);
                            }
                        `,
                        side: THREE.FrontSide
                    });

                    const mesh = new THREE.Mesh(geometry, material);
                    // Position tile in world space
                    const worldTileSize = TERRAIN_SIZE / totalTiles;
                    const totalSize = worldTileSize * tilesPerSide; // == TERRAIN_SIZE, but explicit
                    mesh.position.set(
                        (x + 0.5) * worldTileSize - totalSize / 2,
                        0,
                        (y + 0.5) * worldTileSize - totalSize / 2
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

    async addcubeInstance(increment){
        const geometry = new THREE.BoxGeometry( 0.5, 0.5, 0.5 );
        const material = new THREE.MeshLambertMaterial({color: 0x00ff00, transparent: false, opacity: 0.5}) 
        const cube = new THREE.Mesh( geometry, material );
        // scene.add( cube );
        OBJECTS.set("cube",cube);


        const transform = new THREE.Matrix4();
        // transform.makeTranslation(0, 1, 0); // Sets position (x, y, z)
        const position = new THREE.Vector3(0, increment, 0);
        const quaternion = new THREE.Quaternion();  // No rotation
        const scale = new THREE.Vector3(1, 1, 1);
        transform.compose(position, quaternion, scale);
        this.instancePooling.GeneralAddInstance("cube",transform);
    }
    async removecubeInstance(index){
        this.instancePooling.removeInstance("cube",index);
    }

    //addToScene and objectLoad work as a pair, objectLoad checks if the object wanting to be added exists
    //this means that objectLoad should always be called, not addToScene, that is a utlity function of objectLoad

    async addToScene(Obj_Identifier,MetaData){
        


        const xyz=MetaData.position
        console.log("FIRING FIRING",xyz)
        const transform = new THREE.Matrix4();
        const position = new THREE.Vector3(xyz[0], xyz[1], xyz[2]);
        const quaternion = new THREE.Quaternion();  // No rotation
        const scale = new THREE.Vector3(0.2, 0.2, 0.2);
        transform.compose(position, quaternion, scale);

        this.instancePooling.GeneralAddInstance(Obj_Identifier,transform,MetaData);//.metaData
    }

    async objectLoad(assetId,MetaData){
        // const OBJ_Name=OBJ_ENTRY.assetId
        // console.log("OBJ ENTRY !!!!!!!!!!!!!",OBJ_Name)
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
                            OBJECTS.set(assetId, mergedMesh);

                            // OBJ_ENTRY.instances.forEach(inst => {
                            //     this.addToScene(OBJ_Name, inst);
                            // });
                            this.addToScene(assetId, MetaData)


                        },
                    );
                },
                // called while loading is progressing
                ( xhr ) =>{

                    console.log( ( xhr.loaded / xhr.total * 100 ) + '% loaded' );

                },
                // called when loading has errors
                ( error ) =>{

                    console.log( 'An error happened',error );

                }
            );
        }else{
            this.addToScene(assetId, MetaData)
            // OBJ_ENTRY.instances.forEach(inst => {
            //     // this.addToScene(OBJ_Name, inst);
            //     this.addToScene(assetId, MetaData)
            // });
        }

        
    }

    async getPlacementMask(assetId){
        if (OBJECTS_MASKS.has(assetId)) {
            return OBJECTS_MASKS.get(assetId);
        }
        async function loadPlacementMasksWithAuth(url, token) {
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

            return canvas;
        }

        return new Promise((resolve, reject) => {
            loadPlacementMasksWithAuth("Assets/Asset_Masks/" + assetId + "_Mask.png", localStorage.getItem('accessToken'))
            .then(texture => {
                // this.walkMap=texture;
                // const startpixel={x:40,y:40}
                // const goalpixel={x:80,y:80}
                const maskObject = {
                    "canvas": texture,
                    "width": texture.width,
                    "height": texture.height,
                };
                OBJECTS_MASKS.set(assetId, maskObject);
                // return maskObject;//OBJECTS_MASKS.get(assetId);
                resolve(maskObject);
                // this.AstarPathCost(startpixel,goalpixel,startpixel,80,80)
                // this.PortalConnectivity()
            })
            .catch(err => {
                console.error('Texture load error:', err);
                reject(new Error("Failed to load mask for assetId: " + assetId));
            });
        
        });

    }

    //used for placing buildings, since check validity, then call objectLoad etc
    async checkValidityOfAssetPlacement(assetId,MetaData){
        const worldPos = MetaData.position; // [x, y, z]
        const rotation = MetaData.rotation || 0; // radians

        const walkMapCanvas =this.walkMap; // the canvas you originally loaded the walkmap onto
        // console.log(walkMapCanvas, "REALLY MAN")
        const walkMapWidth = walkMapCanvas.width;
        const walkMapHeight = walkMapCanvas.height;

        // Use a temporary canvas for safe pixel reading
        const walkTempCanvas = document.createElement('canvas');
        walkTempCanvas.width = walkMapWidth;
        walkTempCanvas.height = walkMapHeight;

        const walkTempCtx = walkTempCanvas.getContext('2d');
        walkTempCtx.drawImage(walkMapCanvas, 0, 0);

        const walkMapData = walkTempCtx.getImageData(0, 0, walkMapWidth, walkMapHeight).data;

        // Load the object mask
        const objectMask = await this.getPlacementMask(assetId);
        console.log(objectMask, "OBJ MASK NEW SYSTEM")
        const maskCanvas = objectMask.canvas;
        const maskWidth = maskCanvas.width;
        const maskHeight = maskCanvas.height;

        const maskCtx = maskCanvas.getContext('2d');
        const maskData = maskCtx.getImageData(0, 0, maskWidth, maskHeight).data;

        // Scale and position setup
        const worldTileSize = 7.5;//7.5; // world units → corresponds to full width/height of walkMap
        const pixelsPerUnit = walkMapWidth / worldTileSize;

        // Convert world coordinates to pixel coordinates on walkMap
        const imgX = Math.round(walkMapWidth / 2 + worldPos[0] * pixelsPerUnit);
        const imgY = Math.round(walkMapHeight / 2 + worldPos[2] * pixelsPerUnit);

        console.log(imgX,imgY, "THINKS I AM SELECTING THESE")


        const cos = Math.cos(rotation);
        const sin = Math.sin(rotation);

        // // Bounds check
        // if (imgX < 0 || imgY < 0 || imgX >= walkMapWidth || imgY >= walkMapHeight) {
        //     console.log("Out of bounds.");
        //     return false;
        // }

        // const walkData = walkTempCtx.getImageData(imgX, imgY, 1, 1).data;
        // const [r, g, b, a] = walkData;

        // const isWhite = (r === 255 && g === 255 && b === 255 && a === 255);
        // if(!isWhite){
        //     console.log("YOU CANNOT!!!!!! PLACE A BUILDING HERE MY DAMN")
        // }else{
        //     console.log("YOU CAN PLACE A BUILDING HERE MY DAMN")
        // }

        // // Validation loop
        for (let y = 0; y < maskHeight; y++) {
            for (let x = 0; x < maskWidth; x++) {
                const maskIndex = (y * maskWidth + x) * 4;
                const maskR = maskData[maskIndex];
                const maskG = maskData[maskIndex + 1];
                const maskB = maskData[maskIndex + 2];
                const maskA = maskData[maskIndex + 3];

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
                    const wr = walkMapData[walkIndex];
                    const wg = walkMapData[walkIndex + 1];
                    const wb = walkMapData[walkIndex + 2];
                    const wa = walkMapData[walkIndex + 3];

                    const walkable = (wr === 255 && wg === 255 && wb === 255 && wa === 255);
                    if (!walkable) {
                        console.log("CANNOT PLACE HERE MAN");
                        return false;
                    }
                }
            }
        }
        console.log("YOU CAN PLACE HERE MAN");
        this.objectLoad(assetId,MetaData)
        return true;
    
    }

    async isPointValid(selectedPoint){//selectedPoint is the raycast point
        // console.log(selectedPoint, "the selected point tbh")
        const worldPos = selectedPoint//[selectedPoint.x,selectedPoint.y,selectedPoint.z]; // [x, y, z]
        
        const walkMapCanvas =this.walkMap; // the canvas you originally loaded the walkmap onto
        // console.log(walkMapCanvas, "REALLY MAN")
        const walkMapWidth = walkMapCanvas.width;
        const walkMapHeight = walkMapCanvas.height;

        // Use a temporary canvas for safe pixel reading
        const walkTempCanvas = document.createElement('canvas');
        walkTempCanvas.width = walkMapWidth;
        walkTempCanvas.height = walkMapHeight;

        const walkTempCtx = walkTempCanvas.getContext('2d');
        walkTempCtx.drawImage(walkMapCanvas, 0, 0);
        // walkTempCtx.scale(-1,1)

        // const walkMapData = walkTempCtx.getImageData(0, 0, walkMapWidth, walkMapHeight).data;

        // Scale and position setup
        const worldTileSize = 7.5;//7.5; // world units → corresponds to full width/height of walkMap
        const pixelsPerUnit = walkMapWidth / worldTileSize;

        // Convert world coordinates to pixel coordinates on walkMap
        const imgX = Math.round(walkMapWidth / 2 + worldPos[0] * pixelsPerUnit);
        const imgY =   Math.round(walkMapHeight / 2 + worldPos[2] * pixelsPerUnit);
        console.log(imgX,imgY, "THINK IM CLICKING HERE")

        const walkData = walkTempCtx.getImageData(imgX, imgY, 1, 1).data;
        const [r, g, b, a] = walkData;

        const isWhite = (r === 255 && g === 255 && b === 255 && a === 255);
        if(!isWhite){
            return false;
            console.log("YOU CANNOT!!!!!! PLACE A BUILDING HERE MY DAMN")
        }else{
            return true;
            console.log("YOU CAN PLACE A BUILDING HERE MY DAMN")
        }
    }

    async getPosWithHeight(selectedPoint){
        const worldPos = selectedPoint//[selectedPoint.x,selectedPoint.y,selectedPoint.z]; // [x, y, z]


        const HeightMapcanvas = this.heightMapCanvas
        console.log(HeightMapcanvas, "COME ON BABYYYYYY, HEIGTH CANVASSS");
        const HeightMapWidth = HeightMapcanvas.width;
        const HeightMapHeight = HeightMapcanvas.height;

        const HeightMapTempCanvas = document.createElement('canvas');
        HeightMapTempCanvas.width = HeightMapWidth;
        HeightMapTempCanvas.height = HeightMapHeight;
        
        // console.log(this.heightmap, "bro this gotta be valid")
        const ctx = HeightMapcanvas.getContext('2d');
        // ctx.drawImage(HeightMapcanvas, 0, 0);

        // Scale and position setup
        const worldTileSize = 7.5;//7.5; // world units → corresponds to full width/height of walkMap
        const pixelsPerUnit = HeightMapWidth / worldTileSize;

        // Convert world coordinates to pixel coordinates on walkMap
        const imgX = Math.round(HeightMapWidth / 2 + worldPos[0] * pixelsPerUnit);
        const imgY = Math.round(HeightMapHeight / 2 + worldPos[2] * pixelsPerUnit);

        const HeightData = ctx.getImageData(imgX, imgY, 1, 1).data;
        const [r, g, b, a] = HeightData;

        const Heightscale=0.6; //from tile terrain builder material
        //secondly, only the R value so basically its
        const height=(r*Heightscale)/(30*7.5)

        console.log(height, "muaahahahahahahaha")
        return [selectedPoint[0],height,selectedPoint[2]];

         
    }
    //Pathfinding functionality

    async DetermineSubgrid(MetaData){//determine which subgrid a unit belongs to
        //walkmap is 1536, if we make subgrids 32 pixels in size, thats 48x48 subgrids 

        const worldPos = MetaData.position; // [x, y, z]

        const walkMapCanvas =this.walkMap; // the canvas you originally loaded the walkmap onto
        const walkMapWidth = walkMapCanvas.width;
        const walkMapHeight = walkMapCanvas.height;

        // Scale and position setup
        const worldTileSize = 7.5;//7.5; // world units → corresponds to full width/height of walkMap
        const pixelsPerUnit = walkMapWidth / worldTileSize;

        // Convert world coordinates to pixel coordinates on walkMap
        const imgX = Math.round(walkMapWidth / 2 + worldPos[0] * pixelsPerUnit);
        const imgY = Math.round(walkMapHeight / 2 + worldPos[2] * pixelsPerUnit);


        //first grid would be [0,0] last grid would be [47,47]
        const gridAlong=Math.floor(imgX/32)
        const gridDown=Math.floor(imgY/32)

        return gridAlong+","+gridDown

    }

    async generatePortalMap() {//generate the portals of the subgrids for the abstract map
        const subgridSize = 32;
        const walkMapCanvas=this.walkMap;

        const ctx = walkMapCanvas.getContext('2d');
        const imgData = ctx.getImageData(0, 0, walkMapCanvas.width, walkMapCanvas.height);
        const data = imgData.data; // RGBA array

        const gridCols = Math.ceil(walkMapCanvas.width / subgridSize);
        const gridRows = Math.ceil(walkMapCanvas.height / subgridSize);

        const portalMap = new Map(); // or use a plain object if you prefer

        // Use your updated isWalkable inside here
        
        function isWalkable(x, y) {
            const index = (y * walkMapCanvas.width + x) * 4;
            const r = data[index];
            const g = data[index + 1];
            const b = data[index + 2];
            return (r === 255 && g === 255 && (b === 255 || b === 0)); // white or yellow
        }

        function detectPortalsForSubgrid(subgridX, subgridY) {
            const startX = subgridX * subgridSize;
            const startY = subgridY * subgridSize;

            const portals = [];

            function scanEdge(edge) {
                let lastWasWalkable = false;
                let walkableStart = -1;
                const edgePixels = [];

                for (let i = 0; i < subgridSize; i++) {
                    let x, y;

                    switch (edge) {
                        case 'top':    x = startX + i; y = startY; break;
                        case 'bottom': x = startX + i; y = startY + subgridSize - 1; break;
                        case 'left':   x = startX; y = startY + i; break;
                        case 'right':  x = startX + subgridSize - 1; y = startY + i; break;
                    }

                    if (x >= walkMapCanvas.width || y >= walkMapCanvas.height) continue; // out of bounds

                    if (isWalkable(x, y)) {
                        if (!lastWasWalkable) walkableStart = i;
                        lastWasWalkable = true;
                    } else {
                        if (lastWasWalkable && walkableStart !== -1) {
                            const portalMid = walkableStart + Math.floor((i - walkableStart) / 2);
                            edgePixels.push(portalMid);
                        }
                        lastWasWalkable = false;
                        walkableStart = -1;
                    }
                }

                if (lastWasWalkable && walkableStart !== -1) {
                    const portalMid = walkableStart + Math.floor((subgridSize - walkableStart) / 2);
                    edgePixels.push(portalMid);
                }

                for (const i of edgePixels) {
                    let portalX, portalY;
                    switch (edge) {
                        case 'top':    portalX = startX + i; portalY = startY; break;
                        case 'bottom': portalX = startX + i; portalY = startY + subgridSize - 1; break;
                        case 'left':   portalX = startX; portalY = startY + i; break;
                        case 'right':  portalX = startX + subgridSize - 1; portalY = startY + i; break;
                    }
                    portals.push({ x: portalX, y: portalY, edge });
                }
            }

            ['top', 'right', 'bottom', 'left'].forEach(scanEdge);

            return portals;
        }

        for (let gridY = 0; gridY < gridRows; gridY++) {
            for (let gridX = 0; gridX < gridCols; gridX++) {
                const portals = detectPortalsForSubgrid(gridX, gridY);
                // if (portals.length > 0) {
                //     portalMap.set(`${gridX},${gridY}`, portals);
                // }
                portalMap.set(`${gridX},${gridY}`, portals);
            }
        }

        this.PortalMap=portalMap;
        // this.PortalConnectivity();
        console.log(this.PortalMap, "THESE ARE THE PORTALs!!!!")
        // return portalMap; // Map with keys like "0,0" → [{x, y, edge}, ...]
    }

    //used to calculate the cost from start to goal within a segment of the walkMap
    //used for calculating costs between portals
    async AstarPathCost(startPixel, goalPixel, segmentOrigin, segmentWidth, segmentHeight) {
        const walkMapCanvas=this.walkMap;
        const ctx = walkMapCanvas.getContext('2d');
        const imgData = ctx.getImageData(segmentOrigin.x, segmentOrigin.y, segmentWidth, segmentHeight);
        const data = imgData.data;

        function getTerrainCost(localX, localY) {
            if (localX < 0 || localX >= segmentWidth || localY < 0 || localY >= segmentHeight) return Infinity;
            const index = (localY * segmentWidth + localX) * 4;
            const r = data[index], g = data[index + 1], b = data[index + 2];

            if (r === 255 && g === 255 && b === 255) return 1;     // White → Normal
            if (r === 255 && g === 255 && b === 0)   return 1.5;   // Yellow → Shallow water
            return Infinity;                                      // Red/Black or anything else → Impassable
        }

        function heuristic(x1, y1, x2, y2) {
            const dx = x2 - x1, dy = y2 - y1;
            return Math.sqrt(dx * dx + dy * dy);
        }

        const start = {
            x: startPixel.x - segmentOrigin.x,
            y: startPixel.y - segmentOrigin.y
        };
        const goal = {
            x: goalPixel.x - segmentOrigin.x,
            y: goalPixel.y - segmentOrigin.y
        };

        const openSet = new MinHeap((a, b) => a.f - b.f);
        const cameFrom = new Map();

        const gScore = Array.from({ length: segmentHeight }, () => Array(segmentWidth).fill(Infinity));
        const fScore = Array.from({ length: segmentHeight }, () => Array(segmentWidth).fill(Infinity));

        gScore[start.y][start.x] = 0;
        fScore[start.y][start.x] = heuristic(start.x, start.y, goal.x, goal.y);

        openSet.push({ x: start.x, y: start.y, f: fScore[start.y][start.x] });

        const directions = [
            [0, -1], [1, 0], [0, 1], [-1, 0], // 4-way
            [1, -1], [1, 1], [-1, 1], [-1, -1] // 8-way
        ];

        while (!openSet.isEmpty()) {
            const current = openSet.pop();
            if (current.x === goal.x && current.y === goal.y) {
                // console.log("THIS IS THE COST!!!!!!!!",gScore[current.y][current.x])
                return gScore[current.y][current.x]; // Return total cost to reach goal
            }

            for (const [dx, dy] of directions) {
                const nx = current.x + dx, ny = current.y + dy;
                if (nx < 0 || nx >= segmentWidth || ny < 0 || ny >= segmentHeight) continue;

                const cost = getTerrainCost(nx, ny);
                if (cost === Infinity) continue;

                const tentativeG = gScore[current.y][current.x] + cost;
                if (tentativeG < gScore[ny][nx]) {
                    cameFrom.set(`${nx},${ny}`, `${current.x},${current.y}`);
                    gScore[ny][nx] = tentativeG;
                    fScore[ny][nx] = tentativeG + heuristic(nx, ny, goal.x, goal.y);
                    openSet.push({ x: nx, y: ny, f: fScore[ny][nx] });
                }
            }
        }

        return Infinity; // No path found
    }

    //now to build the connectivity of portals within a subsection
    async PortalConnectivity(){
        // For subgrid (X,Y)
        this.generatePortalMap();
        
        const waitForCompletion = async () => {
            while (!this.PortalMap.has("47,47")) {
                await new Promise(r => setTimeout(r, 10));  // wait 10ms
            }

            for (const [key, portals] of this.PortalMap.entries()) {
                // console.log(portals,key)
                const XY=key.split(',');
                // console.log(portals)
                const X=Number(XY[0])
                const Y=Number(XY[1])
                // console.log(X*32,Y*32)
                for (let i = 0; i < portals.length; i++) {
                    const startPortal = portals[i];
                    const starty=startPortal.x +","+startPortal.y
                    //this loop makes sure each portal node in a subgrid has its cost measured to each other node in the subgrid
                    for (let j = i + 1; j < portals.length; j++) {
                        
                        const goalPortal = portals[j];
                        let cost = await this.AstarPathCost(startPortal, goalPortal, {x:X*32,y:Y*32},32,32);
                        // console.log (cost )
                        if (cost !== Infinity) {
                            
                            const goaly=goalPortal.x +","+goalPortal.y
                            //adds edge relationship with other portals in the subgrid
                            this.addEdgeToAbstractGraph(starty, goaly, cost);
                            this.addEdgeToAbstractGraph(goaly, starty, cost);
                        }
                        
                    }
                    // deal with connectivity to nodes in the adjacent grid
                    switch(startPortal.edge){
                        case "top":
                            //for now, if Y is 0 then it skips but otherwise this means it has to check the next tile
                            if(Y==0){break};

                            // console.log(X+","+(Y-1), "SHOULD BE above")
                            const aboveSubgrid=this.PortalMap.get(X+","+(Y-1))
                            if(aboveSubgrid){
                                for (const goalPortalAbove of aboveSubgrid) {
                                    // console.log(goalPortalAbove)
                                    if(goalPortalAbove.edge=="bottom"){
                                        // console.log(value)
                                        let cost = await this.AstarPathCost(startPortal, goalPortalAbove, {x:X*32,y:(Y-1)*32},32,64);//32*2
                                        // console.log(cost)
                                        const goalPAbove=goalPortalAbove.x +","+goalPortalAbove.y
                                        if (cost !== Infinity) {
                                            this.addEdgeToAbstractGraph(starty, goalPAbove, cost);
                                        }
                                    }
                                }
                            }

                            break;
                        case "bottom":
                            // console.log(key)
                            //for now, if Y is 47 then it skips but otherwise this means it has to check the next tile
                            
                            if(Y==47){break};
                            // const YNext=Y+1 

                            const BelowSubgrid=this.PortalMap.get(X+","+(Y+1))
                            if(BelowSubgrid){//subgrid locations with no portals dont actually exist in PortalMap
                                for (const goalPortalBelow of BelowSubgrid) {
                                    if(goalPortalBelow.edge=="top"){
                                        //{x:X*32,y:(Y)*32} because the startPortal is the top subgrid matching topedge of below
                                        let cost = await this.AstarPathCost(startPortal, goalPortalBelow, {x:X*32,y:(Y)*32},32,64);//32*2
                                        const goalPBelow=goalPortalBelow.x +","+goalPortalBelow.y//+","+goalPortalBelow.edge
                                        if (cost !== Infinity) {
                                            this.addEdgeToAbstractGraph(starty, goalPBelow, cost);
                                        }
                                    }
                                }
                            }

                            break;
                        case "left":
                            //that means the startPortal is the "right" subgrid
                                //origin is that of the (X-1)*32
                            if(X==0){break};

                            const LeftSubgrid=this.PortalMap.get((X-1)+","+Y);
                            if(LeftSubgrid){
                                for (const goalPortalLeft of LeftSubgrid) {
                                    // console.log(goalPortalAbove)
                                    if(goalPortalLeft.edge=="right"){
                                        // console.log(value)
                                        let cost = await this.AstarPathCost(startPortal, goalPortalLeft, {x:(X-1)*32,y:Y*32},64,32);//32*2
                                        const goalPLeft=goalPortalLeft.x +","+goalPortalLeft.y//+","+goalPortalLeft.edge
                                        if (cost !== Infinity) {
                                            this.addEdgeToAbstractGraph(starty, goalPLeft, cost);
                                        }
                                    }
                                }  
                            }


                            break;
                        case "right":
                            if(X==47){break};

                            const RightSubgrid=this.PortalMap.get((X+1)+","+Y);
                            if(RightSubgrid){
                                for (const goalPortalRight of RightSubgrid) {
                                    // console.log(goalPortalAbove)
                                    if(goalPortalRight.edge=="left"){
                                        // console.log(value)
                                        let cost = await this.AstarPathCost(startPortal, goalPortalRight, {x:X*32,y:Y*32},64,32);//32*2
                                        const goalPRight=goalPortalRight.x +","+goalPortalRight.y//+","+goalPortalRight.edge
                                        if (cost !== Infinity) {
                                            this.addEdgeToAbstractGraph(starty, goalPRight, cost);
                                        }
                                    }
                                }
                            }

                            break;
                        default:
                            console.log("hmm, this shouldnt be running")
                            // break;
                    }

                }
            }

            console.log(this.abstractMap)
        };
        
        waitForCompletion();
        

    }


    async addEdgeToAbstractGraph(start, end, cost){

        const exists=this.abstractMap.has(start)

        if(exists){
            //then check if end already in it
            const target=this.abstractMap.get(start)
            // console.log(target, "TARGET TARGET COME ON")
            if(!target.has(end)){
                target.set(end,cost)
            }
        }else{
            const valueSet=new Map();
            valueSet.set(end,cost)
            this.abstractMap.set(start,valueSet)
        }

    }

    async abstractMapAstar(start, goal) {//start, goal must be pixels that are in the abstractMap
        function reconstructPath(cameFrom, current) {
            const path = [current];
            while (cameFrom.has(current)) {
                current = cameFrom.get(current);
                path.push(current);
            }
            path.reverse();
            return path;
        }
        function heuristic(nodeA, nodeB) {
            // For example, Euclidean distance ignoring edge types
            const [xA, yA] = nodeA.split(',').map(Number);
            const [xB, yB] = nodeB.split(',').map(Number);
            return Math.hypot(xA - xB, yA - yB);
        }
        const graph=this.abstractMap;

        const openSet = new PriorityQueue(); // Min-heap keyed by f(n)
        const cameFrom = new Map();
        const gScore = new Map();

        gScore.set(start, 0);
        openSet.enqueue(start, heuristic(start, goal));

        while (!openSet.isEmpty()) {
            const current = openSet.dequeue();

            if (current === goal) {
                return reconstructPath(cameFrom, current);
            }

            const neighbors = graph.get(current) || new Map();

            for (const [neighbor, cost] of neighbors.entries()) {
            const tentativeG = gScore.get(current) + cost;

            if (!gScore.has(neighbor) || tentativeG < gScore.get(neighbor)) {
                cameFrom.set(neighbor, current);
                gScore.set(neighbor, tentativeG);
                const fScore = tentativeG + heuristic(neighbor, goal);
                openSet.enqueue(neighbor, fScore);
            }
            }
        }

        return null; // No path found
    }

    async pathfindingSetup(){
        //assuming abstract map is setup, which means costs etc between nodes have been made....

        //loop over selected units
    }


}

//track all tiles 
class GlobalInstanceManager {
    constructor() {
        this.tiles = new Map();//tiles have utility
        this.meshToTiles=new WeakMap();      //for mesh -> tile lookup
        this.allTileMeshes=[];          //for raycast intersects
        this.divisions = new Map();     // divisionName → DivisionInfo (only *unassigned* divisions here)
        this.armies = new Map();        // armyName => Map<divisionName, DivisionInfo>
    }
    getTile(x, y) {
        return this.tiles.get(`${x},${y}`);
    }
    
    registerTile(tile) {
        this.tiles.set(tile.tileCoord, tile);
    }

    getTileByWorldPosition(x, z) {
        const tileX = Math.floor(x / tileSize); // tileSize known
        const tileY = Math.floor(z / tileSize);
        return this.getTile(tileX, tileY);
    }

    createDivision(divisionName, metadata = {}) {
        if (this.divisions.has(divisionName) || this.findDivisionInArmies(divisionName)) {
            throw new Error(`Division '${divisionName}' already exists globally.`);
        }
        const division = {
            name: divisionName,
            instanceGroups: new Set(),
            army: null,
            metadata
        };
        this.divisions.set(divisionName, division);
        return division;
    }

    assignDivisionToArmy(divisionName, armyName) {
        const division = this.divisions.get(divisionName);
        if (!division) throw new Error(`Division '${divisionName}' does not exist in unassigned divisions.`);

        let army = this.armies.get(armyName);
        if (!army) {
            army = new Map();
            this.armies.set(armyName, army);
        }

        division.army = armyName;
        army.set(divisionName, division);
        this.divisions.delete(divisionName); // REMOVE from unassigned
    }

    findDivisionInArmies(divisionName) {
        for (const army of this.armies.values()) {
            if (army.has(divisionName)) return army.get(divisionName);
        }
        return null;
    }

    unassignDivisionFromArmy(armyName,divisionName) {
        const army = this.armies.get(armyName);
        if (!army) throw new Error(`Army '${armyName}' does not exist.`);
    
        const division = army.get(divisionName);
        if (!division) throw new Error(`Division '${divisionName}' does not exist in Army '${armyName}'.`);
    
        if (this.divisions.has(divisionName)) {
            throw new Error(`Cannot unassign division '${divisionName}' because an unassigned division with that name already exists.`);
        }
    
        army.delete(divisionName);
        division.army = null;
        this.divisions.set(divisionName, division);
    }

    getDivisionAnywhere(divisionName) {
        return this.divisions.get(divisionName) || this.findDivisionInArmies(divisionName);
    }

}

const globalmanager=new GlobalInstanceManager();

function sceneSetup(tiles){
    scene.background = new THREE.Color('hsl(194, 100%, 71%)');
    
    renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false,powerPreference: "high-performance" });
    renderer.shadowMap.enabled = false;
    renderer.setSize( window.innerWidth, window.innerHeight );
    renderer.setPixelRatio(window.devicePixelRatio * 0.75); // Half the normal pixel ratio

    document.getElementById("ThreeBlock").appendChild(renderer.domElement)

    
    camera = new THREE.PerspectiveCamera( 75, renderer.domElement.width / renderer.domElement.height, 0.1, 10000 );//window.innerWidth / window.innerHeight
    camera.position.z = 5;
    camera.position.y = 1;
    camera.lookAt(new THREE.Vector3(0,0,0))
    
    controls = new OrbitControls( camera, renderer.domElement );
    controls.addEventListener( 'change', requestRenderIfNotRequested );
    
    let ambientLight = new THREE.AmbientLight(new THREE.Color('hsl(0, 100%, 100%)'), 3);
    scene.add(ambientLight);

    const userData=tiles[0];
    console.log(userData,"THIS IS THE X")
    
    const tileyay=new Tile(userData.x,userData.y,globalmanager,userData.textures.texturemapUrl,userData.textures.heightmapUrl,userData.textures.WalkMapURL);

    // loop over the buildings
    userData.buildings.forEach(buildingEntry =>{
        //buildingEntry is of form:
            // const B_TownHall={
            //     "userId":user._id,
            //     "assetId": "DATC",
            //     "instances":[{
            //         "position":[0,0,0],
            //         "metaData":{
            //             "health":100,
            //             "state":"Built"
            //         }
            //     }]
            // }
        const assetID=buildingEntry.assetId;
        const userID=buildingEntry.userId;
        buildingEntry.instances.forEach(instanceEntry =>{
        
            const newMetaData={
                "position":instanceEntry.position,
                "userId":userID,
                "health":instanceEntry.health,
                "state":instanceEntry.state,
            }

            tileyay.objectLoad(assetID,newMetaData);

        });

        // tileyay.objectLoad(buildingEntry)

    })


    // tileyay.addcubeInstance(1);
    // tileyay.addcubeInstance(2);
    // tileyay.addcubeInstance(3);
    // tileyay.addcubeInstance(4);
    // console.log("DIVISION, NOW IN REMOVAL process")
    // tileyay.removecubeInstance(0);
    // tileyay.removecubeInstance(1);

    // tileyay.addcubeInstance(0);
    // window.addEventListener( 'pointermove', onPointerMove );
}

function render(){
    renderRequested = false;
    // raycaster.setFromCamera( pointer, camera );
    controls.update();
    renderer.render(scene, camera);
}

function requestRenderIfNotRequested() {
  if (!renderRequested) {
    renderRequested = true;
    requestAnimationFrame(render);
  }
}

// function updateGridColumns() {
//     try{
//         // console.log("RAHHHHHHHHHHHHHHHHHHHHHHHHHH")
//         const IndiOrTemplateButtons=document.getElementById("IndiOrTemplateButtons");
//         if (window.innerWidth < 800) {
//             IndiOrTemplateButtons.style.gridTemplateColumns = "auto auto 0";
//         } else {
//             IndiOrTemplateButtons.style.gridTemplateColumns = "auto auto 30%";
//         }
//     }catch(m){}
// }

window.onresize=function(){//resize the canvas
    renderer.setSize( window.innerWidth, window.innerHeight );
    camera.aspect = renderer.domElement.width/renderer.domElement.height;
    camera.updateProjectionMatrix();
    updateGridColumns();
    requestRenderIfNotRequested();
}

window.onload=async function(){
    async function  startAutoRefresh() {
        const res = await fetch('/token', { method: 'POST', credentials: 'include' });
        if (res.ok) {
            const data = await res.json();
            localStorage.setItem('accessToken', data.accessToken);
            console.log("Access token refreshed.");
        }
        setInterval(async () => {
            const res = await fetch('/token', { method: 'POST', credentials: 'include' });
            if (res.ok) {
                const data = await res.json();
                localStorage.setItem('accessToken', data.accessToken);
                console.log("Access token refreshed.");
            }else {
                console.error("Failed to refresh token", await res.text());
            }
        }, 14 * 60 * 1000); // Every 14 minutes (if access token expires in 15m)
    }
    //if you refresh it asks to check the accesstoken, restart that timer so the user should be set
    await startAutoRefresh()

    //UserTileData is the world information for their account
    const UserTileData=await getUserTileData(localStorage.getItem('accessToken'));
    
    //setupSocketConnection allows for resource value updates & world change updates 
    setupSocketConnection();
    
    //run the function that sets up the three.js scene, traverses the UserTileData and populates the scene with it
    sceneSetup(UserTileData)
    
    //the resource bar needs an overlay with some functionality, calling an emit for whichever resource
    //  and creating a display box for the user to see details about that resource
    MakeToolTips()

}




function onPointerMove(event) {
    pointer .x = (event.clientX / window.innerWidth) * 2 - 1;
    pointer .y = -(event.clientY / window.innerHeight) * 2 + 1;
    
    raycaster.setFromCamera( pointer, camera );
    // console.log("MOVING MOUSE")
}

function onclickBuilding(event){
    console.log("CLICKED!!!!!!!!!!!!!!!!!!!!!!!!!")

    const intersects = raycaster.intersectObjects(globalmanager.allTileMeshes, true);

    if (intersects.length > 0) {
        const intersectedMesh = intersects[0].object;
        const foundTile =  globalmanager.meshToTiles.get(intersectedMesh);

        if (foundTile) {
            console.log("Clicked tile:", foundTile.x, foundTile.y);

            //found the tile, add the building
            //create an asset_dictionary to use as a parameter for the tile.objectLoad(asset_dictionary)

            const IntersectPoint=intersects[0].point
            const processedPoint=[IntersectPoint.x,IntersectPoint.y,IntersectPoint.z]
            foundTile.getPosWithHeight(processedPoint).then(val=>{
                const instanceMetaData={
                    "position":val,
                    "userOwner":localStorage.getItem('accessToken').id,//ThisUser._id,
                    "health":100,
                    "state":"Built"
                }
                foundTile.checkValidityOfAssetPlacement(BuildingAssetName,instanceMetaData)
            });
        }
    }

    //the user clicked, the building has been placed, remove eventListeners
    renderer.domElement.removeEventListener( 'pointermove', onPointerMove );
    renderer.domElement.removeEventListener( 'click', onclickBuilding );
}

function PlaceBuilding(event){

    //on renderer.domElement so that placement doesnt follow when users mouse is over the overlay
    renderer.domElement.addEventListener( 'pointermove', onPointerMove );
    renderer.domElement.addEventListener( 'click', onclickBuilding );

    BuildingAssetName=event.currentTarget.myParam

    // console.log("CLICKED TO BUILD", assetName)
    //identify which tile the building is being placed on via raycast and then traversal of global-manager
    

    
    isPlacingBuilding=true;



}

function deploymentPoint(divToChangevalue){
    renderer.domElement.addEventListener( 'pointermove', onPointerMove );
    renderer.domElement.addEventListener( 'click', onTileClick );
    function onTileClick(ev){
        const intersects = raycaster.intersectObjects(globalmanager.allTileMeshes, true);

        if (intersects.length > 0) {
            const intersectedMesh = intersects[0].object;
            const foundTile =  globalmanager.meshToTiles.get(intersectedMesh);

            if (foundTile) {
                // console.log("Clicked tile:", foundTile.x, foundTile.y);

                const IntersectPoint=intersects[0].point
                const convertPoint=[IntersectPoint.x,IntersectPoint.y,IntersectPoint.z]
                foundTile.isPointValid(convertPoint).then(isvalid=>{
                    // console.log(isvalid, "SELECT POint deployment???")
                    if(isvalid){
                        divToChangevalue.innerText=convertPoint[0].toFixed(2)+","+convertPoint[0].toFixed(1)+","+convertPoint[2].toFixed(2)
                        divToChangevalue.myParam=[convertPoint,foundTile]
                    }
                })
                
            }
        }
        //the user clicked, the building has been placed, remove eventListeners
        renderer.domElement.removeEventListener( 'pointermove', onPointerMove );
        renderer.domElement.removeEventListener( 'click',  onTileClick);
    }
    // renderer.domElement.addEventListener( 'click', )
        
}

function IterateOverDeploy(regimenEnvelope,DeployPoint,Obj_Identifier){
    // console.log(regimenEnvelope.children.length)
    //loop for deploying all units in regimen
    try{
        if(DeployPoint.myParam[0]==undefined){return}
    }catch(plu){return}
    
    //because the terrain is gpu drawn, need to get the height from the heightmap at the a,y position!

    for(let i=1;i<regimenEnvelope.children.length;i++){
        regimenEnvelope.removeChild(regimenEnvelope.children[i])
        // const IntersectPoint=intersects[0].point
        DeployPoint.myParam[1].getPosWithHeight(DeployPoint.myParam[0]).then(val=>{
            console.log(val, "should be the point.....")
            const instanceMetaData={
                "position":val,
                "userId":localStorage.getItem('accessToken').id,//ThisUser._id,
                "health":100,
                // "state":"Built"
            }
            DeployPoint.myParam[1].objectLoad(Obj_Identifier,instanceMetaData)
        
        })

    }
    // console.log(regimenEnvelope.parentElement)
    regimenEnvelope.parentElement.removeChild(regimenEnvelope)
    console.log(DeployPoint.myParam,"yes param")
}

function createUnitRegime(event){
    const whichUnit=event.currentTarget.myParam
    console.log(whichUnit, "THIS UNIT!!!!")

    //add to PieceRegimen
    const component=document.getElementById("PieceRegimen");

    const regimenEnvelope=document.createElement("div");
    {
        regimenEnvelope.style.width="100%";
        regimenEnvelope.style.aspectRatio="10/1"
        regimenEnvelope.style.marginTop="4px";
        regimenEnvelope.style.marginBottom="max(2vw,2vh)";
        regimenEnvelope.style.backgroundColor="gray";
        regimenEnvelope.style.borderBottom="solid 4px black"
    }
    component.appendChild(regimenEnvelope)

    const TopInfo=document.createElement("div");
    {
        TopInfo.style.display="grid"
        TopInfo.style.gridTemplateColumns="1fr 4fr 2fr"
        TopInfo.style.columnGap="4px";
        TopInfo.style.borderBottom="solid 4px black"
        // TopInfo.style.borderTop="solid 4px black"
    }
    regimenEnvelope.appendChild(TopInfo)
    const ImageHolder=document.createElement("div");
    {
        ImageHolder.style.width="calc(100% - 4px)";
        ImageHolder.style.aspectRatio="1/1";
        ImageHolder.style.padding="4px"
        ImageHolder.style.paddingRight="0"
    }
    TopInfo.appendChild(ImageHolder)
    const ImageIcon=document.createElement("div");
    {
        ImageIcon.style.backgroundColor="white";
        ImageIcon.className="IconGeneral"
        ImageIcon.style.backgroundImage="url('Icons/"+whichUnit +"Icon.png')"
        ImageIcon.style.width="100%"
        ImageIcon.style.height="100%"
    }
    ImageHolder.appendChild(ImageIcon)

    const midTopSection=document.createElement("div");
    {
        midTopSection.style.display="grid"
        midTopSection.style.gridTemplateRows="1fr 1fr"
        midTopSection.style.width="100%"
    }
    TopInfo.appendChild(midTopSection)

    const UnitType=document.createElement("div");
    {
        // midTopSection.style.gridTemplateRows="1fr 1fr"
        UnitType.style.width="calc(100%)"
        UnitType.style.backgroundColor="white"
        UnitType.style.color="black"
        UnitType.style.margin="4px 0 2px 0px"
        UnitType.style.overflow="hidden"
        UnitType.style.whiteSpace="nowrap"
        UnitType.innerText=whichUnit
        UnitType.style.textAlign="center"
        UnitType.style.alignContent="center"
        UnitType.style.fontSize="max(1.5vw,1.5vh)"
    }
    midTopSection.appendChild(UnitType)

    const DeployPoint=document.createElement("div");
    {
        // midTopSection.style.gridTemplateRows="1fr 1fr"
        DeployPoint.style.width="100%"
        DeployPoint.style.backgroundColor="white"
        DeployPoint.style.margin="2px 0 4px 0px"
        DeployPoint.innerText="Select A Position"
        DeployPoint.style.overflow="hidden"
        DeployPoint.style.whiteSpace="nowrap"
        DeployPoint.style.textAlign="center"
        DeployPoint.style.alignContent="center"
        DeployPoint.style.fontSize="max(1.5vw,1.5vh)"
    }
    DeployPoint.addEventListener("click",function(ev){
        deploymentPoint(DeployPoint)
    })
    midTopSection.appendChild(DeployPoint)

    const RightTopSection=document.createElement("div");
    {
        RightTopSection.style.display="grid"
        RightTopSection.style.gridTemplateRows="1fr 1fr"
        RightTopSection.style.width="100%"
    }
    TopInfo.appendChild(RightTopSection)
    
    const AddSubSection=document.createElement("div");
    {
        AddSubSection.style.width="calc(100% - 4px)"
        // AddSubSection.style.backgroundColor="white"
        AddSubSection.style.margin="4px 4px 2px 0px"
        // AddSubSection.style.alignContent="center"
        AddSubSection.style.display="flex"
        AddSubSection.style.flexDirection="row"
    }
    RightTopSection.appendChild(AddSubSection)

    const SubtractBut=document.createElement("div");
    {
        // SubtractBut.style.height="100%"
        SubtractBut.style.aspectRatio="1/1"
        // SubtractBut.style.left="0"
        SubtractBut.style.backgroundColor="white"
        SubtractBut.style.backgroundImage="url('Icons/Subtract.png')"
        SubtractBut.className="IconGeneral"
    }
    AddSubSection.appendChild(SubtractBut)

    const middle = document.createElement("div");
    {
        // middle.style.flex = "1";
        middle.style.aspectRatio="1/2"
        middle.style.minWidth = "0"; // important to allow shrinking
        middle.style.background = "rgb(98, 98, 98)";
        middle.style.overflow="hidden"
    }

    AddSubSection.appendChild(middle)
    const AddBut=document.createElement("div");
    {
        // SubtractBut.style.height="100%"
        AddBut.style.aspectRatio="1/1"
        // AddBut.style.right="0"
        AddBut.style.backgroundColor="white"
        AddBut.style.backgroundImage="url('Icons/Add.png')"
        AddBut.className="IconGeneral"
    }
    AddSubSection.appendChild(AddBut)


    const AddDeploySection=document.createElement("div");
    {
        AddDeploySection.style.width="calc(100% - 4px)"
        // AddDeploySection.style.backgroundColor="white"
        AddDeploySection.style.margin="2px 4px 4px 0px"
        // AddDeploySection.style.alignContent="center"
        AddDeploySection.style.display="flex"
        AddDeploySection.style.flexDirection="row"
    }
    RightTopSection.appendChild(AddDeploySection)

    const countHolder = document.createElement("div");
    {
        countHolder.style.flex = "1";
        // countHolder.style.aspectRatio="1/2"
        countHolder.style.minWidth = "0"; // important to allow shrinking
        countHolder.style.background = "white";
        countHolder.style.overflow="hidden"
        countHolder.style.whiteSpace="nowrap"
        countHolder.innerText="1"
        countHolder.style.textAlign="center"
        countHolder.style.alignContent="center"
        countHolder.style.fontSize="max(1.5vw,1.5vh)"
    }
    AddDeploySection.appendChild(countHolder)

    const DeployBut=document.createElement("div");
    {
        // SubtractBut.style.height="100%"
        DeployBut.style.aspectRatio="1/1"
        // AddBut.style.right="0"
        DeployBut.style.backgroundColor="white"
        DeployBut.style.backgroundImage="url('Icons/Deploy.png')"
        DeployBut.className="IconGeneral"
        DeployBut.style.marginLeft="4px"
    }
    DeployBut.addEventListener("click",function(){
        IterateOverDeploy(regimenEnvelope,DeployPoint,whichUnit);
    })
    AddDeploySection.appendChild(DeployBut)
    
    //adding the section for the specific units within the regimen
    const soldierTrack=document.createElement("div");
    {
        soldierTrack.style.width="calc(100% - 8px)"
        soldierTrack.style.aspectRatio="10/1"
        soldierTrack.style.backgroundColor="gray"
        soldierTrack.style.padding="4px"
        
        soldierTrack.style.display="flex"
        soldierTrack.style.flexDirection="row"
        soldierTrack.style.columnGap="4px"
    }
    regimenEnvelope.appendChild(soldierTrack)

    const SoldierSpecifics=document.createElement("div");
    {
        // DeploySpecific.style.aspectRatio="1/1"
        SoldierSpecifics.style.backgroundColor="white"
        SoldierSpecifics.style.flex = "1";
        SoldierSpecifics.style.minWidth = "0";
    }
    soldierTrack.appendChild(SoldierSpecifics)

    const DeploySpecific=document.createElement("div");
    {
        DeploySpecific.style.aspectRatio="1/1"
        DeploySpecific.style.backgroundColor="white"
    }
    soldierTrack.appendChild(DeploySpecific)

    const cancelTrain=document.createElement("div");
    {
        cancelTrain.style.aspectRatio="1/1"
        cancelTrain.style.backgroundColor="white"
    }
    soldierTrack.appendChild(cancelTrain)







    AddBut.addEventListener("click",function(e){
        try{
            const val=Number(countHolder.innerText)
            countHolder.innerText=val+1
            // console.log(, "THIS IS THE PARENT")
            // const rootRegimen=e.target.parentElement.parentElement.parentElement.parentElement
            const soldierTrack=document.createElement("div");
            {
                soldierTrack.style.width="calc(100% - 8px)"
                soldierTrack.style.aspectRatio="10/1"
                soldierTrack.style.backgroundColor="gray"
                soldierTrack.style.padding="4px"
                
                soldierTrack.style.display="flex"
                soldierTrack.style.flexDirection="row"
                soldierTrack.style.columnGap="4px"
            }
            regimenEnvelope.appendChild(soldierTrack)

            const SoldierSpecifics=document.createElement("div");
            {
                // DeploySpecific.style.aspectRatio="1/1"
                SoldierSpecifics.style.backgroundColor="white"
                SoldierSpecifics.style.flex = "1";
                SoldierSpecifics.style.minWidth = "0";
            }
            soldierTrack.appendChild(SoldierSpecifics)

            const DeploySpecific=document.createElement("div");
            {
                DeploySpecific.style.aspectRatio="1/1"
                DeploySpecific.style.backgroundColor="white"
            }
            soldierTrack.appendChild(DeploySpecific)

            const cancelTrain=document.createElement("div");
            {
                cancelTrain.style.aspectRatio="1/1"
                cancelTrain.style.backgroundColor="white"
            }
            soldierTrack.appendChild(cancelTrain)
        }catch(p){}
        
    });
    SubtractBut.addEventListener("click",function(){
        try{
            const val=Number(countHolder.innerText)
            if(val > 1){
                countHolder.innerText=val-1
                regimenEnvelope.removeChild(regimenEnvelope.lastChild)
            }
            
        }catch(p){}
    });
}

function MilTrainingElements(){
    const contentBox=document.getElementById("Dropdown_Content_Box");
    const MilTraincontentBox=document.getElementById("MilTraincontentBox");
    if(!MilTraincontentBox){
        const creatingMTCB=document.createElement("div");
        {
            creatingMTCB.style.width="100%";
            creatingMTCB.id="MilTraincontentBox"
        }
        contentBox.appendChild(creatingMTCB)

        const TrainingOptionsBox=document.createElement("div");
        {
            TrainingOptionsBox.style.width="100%";
            TrainingOptionsBox.style.display="grid";
            TrainingOptionsBox.style.gridTemplateRows="auto auto"
        }
        creatingMTCB.appendChild(TrainingOptionsBox)

        const IndiOrTemplateButtons=document.createElement("div");
        {
            // IndiOrTemplateButtons.style.backgroundColor="red";
            IndiOrTemplateButtons.id="IndiOrTemplateButtons"
            IndiOrTemplateButtons.style.width="calc(100% - 8px)"
            IndiOrTemplateButtons.style.aspectRatio="12/1"
            IndiOrTemplateButtons.style.display="grid";
            IndiOrTemplateButtons.style.gridTemplateColumns="auto auto 0"
            IndiOrTemplateButtons.style.columnGap="4px"
            IndiOrTemplateButtons.style.marginLeft="4px"
            IndiOrTemplateButtons.style.marginRight="4px"
            // IndiOrTemplateButtons.style.maxWidth="calc(100% - 8px)"
            IndiOrTemplateButtons.style.minWidth = "0"; // ⚠️ Important for shrinking
            IndiOrTemplateButtons.style.borderBottom="solid 0.25vw gray"
        }
        TrainingOptionsBox.appendChild(IndiOrTemplateButtons)

        const TemplateBut=document.createElement("div");
        {
            TemplateBut.style.backgroundColor="red";
            // TemplateBut.style.width="calc(100% - 8px)"
            TemplateBut.style.height="calc(100% - 8px)"
            TemplateBut.style.margin="4px"
            TemplateBut.style.marginRight="0"
            TemplateBut.style.marginLeft="0"

            TemplateBut.innerText="Template"
            TemplateBut.style.fontSize="max(1.5vw,1.5vh)"
            TemplateBut.style.alignContent="center"
            TemplateBut.style.textAlign="center"
        }
        IndiOrTemplateButtons.appendChild(TemplateBut)

        const IndepBut=document.createElement("div");
        {
            IndepBut.style.backgroundColor="red";
            // IndepBut.style.width="calc(100% - 8px)"
            IndepBut.style.height="calc(100% - 8px)"
            IndepBut.style.margin="4px"
            IndepBut.style.marginLeft="0"
            IndepBut.style.marginRight="0px"
            IndepBut.innerText="Individual"
            IndepBut.style.fontSize="max(1.5vw,1.5vh)"
            IndepBut.style.alignContent="center"
            IndepBut.style.textAlign="center"
        }
        IndiOrTemplateButtons.appendChild(IndepBut)


        
        //create the box that houses these options
        const IndiTemplateOptionHolder=document.createElement("div");
        {
            IndiTemplateOptionHolder.style.width="calc(100% - 8px)";
            IndiTemplateOptionHolder.style.height="calc(100% - 8px)";
            // IndiTemplateOptionHolder.style.backgroundColor="pink"
            IndiTemplateOptionHolder.style.margin="4px"
            IndiTemplateOptionHolder.style.borderBottom="solid 0.25vw gray"
        }
        TrainingOptionsBox.appendChild(IndiTemplateOptionHolder)
        
        const IndiOptionHolder=document.createElement("div");
        {
            IndiOptionHolder.style.width="100%";
            IndiOptionHolder.id="IndiOptionHolder"
            IndiOptionHolder.style.display="grid";
            IndiOptionHolder.style.gridTemplateColumns="1fr 1fr 1fr 1fr 1fr 1fr 1fr"
            // IndiOptionHolder.style.backgroundColor="pink"
            IndiOptionHolder.style.columnGap="4px"
            IndiOptionHolder.style.rowGap="4px"
        }
        IndiTemplateOptionHolder.appendChild(IndiOptionHolder)
        
        // create the options for individual units
        const indiUnits=[["archer","url('Icons/ArcherIcon.png')"],["spearman","url('Icons/SpearManIcon.png')"],]
        indiUnits.forEach((param)=>{
            const unitHolder=document.createElement("div");
            {
                unitHolder.style.width="calc(100% - 1vw)"

                unitHolder.style.aspectRatio="1/1"
                unitHolder.style.padding="0.5vw"
            }
            IndiOptionHolder.appendChild(unitHolder)
            const unit=document.createElement("div");
            {
                unit.style.width="100%"
                unit.style.height="100%"
                // unit.style.height="calc(100% - 1vw)"
                unit.myParam=param[0]
                unit.style.aspectRatio="1/1"
                unit.style.backgroundImage=param[1]||"";
                unit.style.backgroundColor="gray";
                unit.className="IconGeneral"
            }
            unit.addEventListener("click",createUnitRegime)
            unitHolder.appendChild(unit)
        })

        const TemplateOptionHolder=document.createElement("div");
        {
            TemplateOptionHolder.style.width="100%";
            TemplateOptionHolder.id="TemplateOptionHolder"
            TemplateOptionHolder.style.display="none";
            TemplateOptionHolder.style.gridTemplateColumns="1fr 1fr 1fr 1fr 1fr 1fr 1fr"
            // TemplateOptionHolder.style
            TemplateOptionHolder.style.columnGap="4px"
            TemplateOptionHolder.style.rowGap="4px"
        }
        IndiTemplateOptionHolder.appendChild(TemplateOptionHolder)
        
        indiUnits.forEach((param)=>{//placeholder purposes
            const Template=document.createElement("div");
            {
                Template.style.width="100%"
                Template.myParam=param
                Template.style.aspectRatio="1/1"
                Template.style.backgroundColor="green"
                // soldier.style.
            }
            TemplateOptionHolder.appendChild(Template)
        })


        //section that displays the training regimens

        const titlePieceRegimen=document.createElement("div");
        {
            titlePieceRegimen.style.maxWidth="calc(100% - 8px)";
            titlePieceRegimen.style.height="100%";
            titlePieceRegimen.style.display="inline-block"
            // IndiTemplateOptionHolder.style.backgroundColor="pink"
            titlePieceRegimen.style.margin="4px"
            titlePieceRegimen.style.marginTop="1vw"
            titlePieceRegimen.style.borderBottom="solid 0.25vw gray"
            titlePieceRegimen.innerText="Training Regimens"
            titlePieceRegimen.style.color="white"
            titlePieceRegimen.style.fontSize="max(1.5vw,1.5vh)"
            titlePieceRegimen.style.alignContent="center"
            titlePieceRegimen.style.textAlign="left"
        }
        creatingMTCB.appendChild(titlePieceRegimen)

        const PieceRegimen=document.createElement("div");
        {
            PieceRegimen.id="PieceRegimen"
            PieceRegimen.style.width="calc(100% - 8px)";
            // PieceRegimen.style.minHeight="20px"
            // PieceRegimen.style.height="100%";
            PieceRegimen.style.display="block"
            // PieceRegimen.style.backgroundColor="pink"
            PieceRegimen.style.margin="4px"
            // titlePieceRegimen.style.marginTop="1vw"
            // titlePieceRegimen.style.borderBottom="solid 0.25vw gray"
            // titlePieceRegimen.innerText="Training Regimens"
            // titlePieceRegimen.style.color="white"
            // titlePieceRegimen.style.fontSize="max(1.5vw,1.5vh)"
            // titlePieceRegimen.style.alignContent="center"
            // titlePieceRegimen.style.textAlign="left"
        }
        creatingMTCB.appendChild(PieceRegimen)

        IndepBut.addEventListener('click',function(){
            // console.log("MMMM, yesss")
            TemplateOptionHolder.style.display="none"
            IndiOptionHolder.style.display="grid"
        })
        TemplateBut.addEventListener('click',function(){
            // console.log("MMMM, yesss")
            IndiOptionHolder.style.display="none"
            TemplateOptionHolder.style.display="grid"
        })
    }else{
        MilTraincontentBox.style.display="block"
    }
    updateGridColumns();
}

function ConstructionElements(){
    const contentBox=document.getElementById("Dropdown_Content_Box");
    const ConstructioncontentBox=document.getElementById("ConstructioncontentBox");
    if(!ConstructioncontentBox){
        
        const creatingCCB=document.createElement("div");
        {
            creatingCCB.style.width="100%";
            creatingCCB.id="ConstructioncontentBox"
        }
        contentBox.appendChild(creatingCCB)

        const BuildOptionsTitle=document.createElement("div");
        {
            BuildOptionsTitle.style.width="calc(100% - 1vw)";
            BuildOptionsTitle.style.aspectRatio="11/1";
            BuildOptionsTitle.style.margin="0 0.5vw 0 0.5vw";
            BuildOptionsTitle.style.alignContent="center";
            BuildOptionsTitle.innerText="Build Options";
            BuildOptionsTitle.style.fontSize="max(1vw,1vh)";
            BuildOptionsTitle.style.color="white"
            BuildOptionsTitle.style.borderBottom="solid gray 0.25vw"
            // BuildOptionsTitle.style.marginBottom="0.5vw"
        }
        creatingCCB.appendChild(BuildOptionsTitle)

        const BuildOptionsBox=document.createElement("div");
        {
            BuildOptionsBox.style.width="100%";
            // BuildOptionsTitle.style.aspectRatio="5/1";
            // BuildOptionsTitle.style.backgroundColor="white"
            BuildOptionsBox.style.display="grid";
            BuildOptionsBox.style.gridTemplateColumns="1fr 1fr 1fr 1fr 1fr 1fr 1fr";
        }
        creatingCCB.appendChild(BuildOptionsBox)

        //important to keep up to date with asset names/ will change depending on research level to get the up-to-date assets
        const optionObjNames=["ArmsFactory","CivilianFactory","Mine","SawMill","Mill","Storage","House"]

        const ColouroptionTags=[
            "url('Icons/arms-factory.png')","url('Icons/civilian-factory.png')",
            "url('Icons/quarry.png')","url('Icons/Sawmill.png')",
            "url('Icons/Farm.png')","url('Icons/Warehouse.png')",
            "url('Icons/House.png')",
            
        ]

        for(let i=0;i<7;i++){
            const option=document.createElement("div");
            {
                // option.style.innerHTML=optionTags[i];
                option.style.aspectRatio="1/1";
                // option.style.backgroundColor=ColouroptionTags[i];
                option.style.padding="0.75vw 0.75vw 0.75vw 0.75vw";
            }  

            const optionButton=document.createElement("div");
            {
                // option.style.innerHTML=optionTags[i];
                optionButton.className="IconGeneral"
                optionButton.style.width="100%";
                optionButton.style.height="100%";
                optionButton.style.backgroundImage=ColouroptionTags[i];
                optionButton.style.backgroundColor="gray";//ColouroptionTags[i];
                
                optionButton.myParam=optionObjNames[i];//"Mill";
                optionButton.addEventListener("click",PlaceBuilding)
            } 


            option.appendChild(optionButton)
            BuildOptionsBox.appendChild(option)

        };

        const BuildQueueTitleBox=document.createElement("div");
        {
            BuildQueueTitleBox.style.width="calc(100% - 1vw)";
            BuildQueueTitleBox.style.aspectRatio="13/1";
            BuildQueueTitleBox.style.display="grid";
            BuildQueueTitleBox.style.gridTemplateColumns="1.5fr 1fr ";
            BuildQueueTitleBox.style.margin="0 0.5vw 0 0.5vw";
            BuildQueueTitleBox.style.borderBottom="solid gray 0.25vw"
            BuildQueueTitleBox.style.paddingBottom="0.5vw"
            
        }
        creatingCCB.appendChild(BuildQueueTitleBox)

        const BuildingTypeName=document.createElement("div");
        {
            BuildingTypeName.style.width="calc(100% - 1vw)";
            BuildingTypeName.style.padding="0 0.5vw 0 0.5vw";
            BuildingTypeName.style.alignContent="center";
            BuildingTypeName.innerText="Building Type";
            BuildingTypeName.style.fontSize="max(1vw,1vh)";
            BuildingTypeName.style.color="white"
            // BuildingTypeName.style.backgroundColor="red"
            
        }
        BuildQueueTitleBox.appendChild(BuildingTypeName)

        const ManpowerAllocation=document.createElement("div");
        {
            ManpowerAllocation.style.width="calc(100% - 1vw)";
            ManpowerAllocation.style.padding="0 0.5vw 0 0.5vw";
            ManpowerAllocation.style.alignContent="center";
            ManpowerAllocation.innerText="Allocate Manpower";
            ManpowerAllocation.style.fontSize="max(1vw,1vh)";
            ManpowerAllocation.style.color="white"
            // ManpowerAllocation.style.backgroundColor="brown"
            
        }
        BuildQueueTitleBox.appendChild(ManpowerAllocation)
        
    }else{
        ConstructioncontentBox.style.display="block"
    }
}


addEventListenersToButtons();









