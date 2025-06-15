import * as THREE from "three";
import {OrbitControls} from 'https://cdn.jsdelivr.net/npm/three@0.176.0/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.176.0/examples/jsm/loaders/GLTFLoader.js';

// import { mergeGeometries  } from 'https://cdn.jsdelivr.net/npm/three@0.176.0/examples/jsm/utils/BufferGeometryUtils.js';
// import * as BufferGeometryUtils from './node_modules/three/examples/jsm/utils/BufferGeometryUtils.js';
import { mergeGeometries } from 'https://cdn.jsdelivr.net/npm/three@0.176.0/examples/jsm/utils/BufferGeometryUtils.js';

const socket = io();
let ThisUser;
var controls,renderer,camera,renderRequested;
const scene = new THREE.Scene();
const loader = new THREE.TextureLoader();
const raycaster = new THREE.Raycaster();
const pointer  = new THREE.Vector2();

var isPlacingBuilding=false;
var BuildingAssetName=null;

const tileSize=10;


//objects, stores all the assets like soldiers etc

var OBJECTS=new Map(); 

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
    constructor(x,y,GInstanceManager,texUrl,HeightUrl){
        this.instanceManager=GInstanceManager
        this.meshes=new Set();
        this.x=x;
        this.y=y;
        this.texUrl=texUrl;
        this.HeightUrl=HeightUrl;
        this.texture;
        this.heightmap;

        this.instancePooling=new TileInstancePool(this);
        // this.instancePoolUnits = new TileInstancePool(this);     // Track units here
        // this.instancePoolBuildings = new TileInstancePool(this); // Track buildings here


        this.loadtextures();
    }

    async loadtextures(){
        console.log("REQUEST THESE FILES",this.HeightUrl,this.texUrl)
        loader.load(this.HeightUrl, (texture) => {//'../heightmap.png'
            this.heightmap = texture;
            this.BuildTileBase();
        });
          
        loader.load(this.texUrl, (texture) => {//'../colourMap.png'
            this.texture = texture;
            this.BuildTileBase();
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
            const tileSize = 1; // Each tile covers part of the 1x1 plane
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

    //addToScene and objectLoad responsible for loading in initial data structure 
    //should probably refactor to just make it one thing and have a seperate function for setup
    async addToScene(Obj_Identifier,instToAdd){
        


        const xyz=instToAdd.position
        console.log("FIRING FIRING",xyz)
        const transform = new THREE.Matrix4();
        const position = new THREE.Vector3(xyz[0], xyz[1], xyz[2]);
        const quaternion = new THREE.Quaternion();  // No rotation
        const scale = new THREE.Vector3(1, 1, 1);
        transform.compose(position, quaternion, scale);

        this.instancePooling.GeneralAddInstance(Obj_Identifier,transform,instToAdd.metaData);
    }

    async objectLoad(OBJ_ENTRY){
        const OBJ_Name=OBJ_ENTRY.assetId
        // console.log("OBJ ENTRY !!!!!!!!!!!!!",OBJ_Name)
        const has=OBJECTS.has(OBJ_Name)

        if(!has){
            const loader = new GLTFLoader();
            loader.load(
                // resource URL
                'Assets/GLB_Exports/'+OBJ_Name+'.glb',
                // called when the resource is loaded
                (gltf) => {
                    const geometries = [];
                    // let material = null;
                    const materials = [];

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

                    OBJECTS.set(OBJ_Name, mergedMesh);

                    OBJ_ENTRY.instances.forEach(inst => {
                        this.addToScene(OBJ_Name, inst);
                    });
                    


                },
                // called while loading is progressing
                function ( xhr ) {

                    console.log( ( xhr.loaded / xhr.total * 100 ) + '% loaded' );

                },
                // called when loading has errors
                function ( error ) {

                    console.log( 'An error happened',error );

                }
            );
        }else{
            OBJ_ENTRY.instances.forEach(inst => {
                this.addToScene(OBJ_Name, inst);
            });
        }

        
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
    // console.log("YOOO",tiles)
    scene.background = new THREE.Color('hsl(194, 100%, 71%)');
    
    renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false,powerPreference: "high-performance" });
    renderer.shadowMap.enabled = false;
    renderer.setSize( window.innerWidth, window.innerHeight );
    renderer.setPixelRatio(window.devicePixelRatio * 0.75); // Half the normal pixel ratio

    document.getElementById("ThreeBlock").appendChild(renderer.domElement)
    // insertBefore(renderer.domElement, document.getElementById("ThreeBlock").firstChild)
    // document.getElementById("container").insertBefore(renderer.domElement, document.getElementById("container").firstChild)
    
    camera = new THREE.PerspectiveCamera( 75, renderer.domElement.width / renderer.domElement.height, 0.1, 10000 );//window.innerWidth / window.innerHeight
    camera.position.z = 5;
    camera.position.y = 1;
    camera.lookAt(new THREE.Vector3(0,0,0))
    
    controls = new OrbitControls( camera, renderer.domElement );
    controls.addEventListener( 'change', requestRenderIfNotRequested );
    
    let ambientLight = new THREE.AmbientLight(new THREE.Color('hsl(0, 100%, 100%)'), 3);
    scene.add(ambientLight);

    const userData=tiles[0];
    console.log(userData.buildings,"THIS IS THE X")
    
    const tileyay=new Tile(userData.x,userData.y,globalmanager,userData.textures.texturemapUrl,userData.textures.heightmapUrl);

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


        tileyay.objectLoad(buildingEntry)

    })


    tileyay.addcubeInstance(1);
    tileyay.addcubeInstance(2);
    tileyay.addcubeInstance(3);
    tileyay.addcubeInstance(4);
    console.log("DIVISION, NOW IN REMOVAL process")
    tileyay.removecubeInstance(0);
    tileyay.removecubeInstance(1);

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


window.onresize=function(){//resize the canvas
    renderer.setSize( window.innerWidth, window.innerHeight );
    camera.aspect = renderer.domElement.width/renderer.domElement.height;
    camera.updateProjectionMatrix();

    requestRenderIfNotRequested();
}

window.onload=function(){

    


    const accessToken = localStorage.getItem('accessToken');

    fetch('/tiles', {
        method: 'GET',
        headers: {
        'Authorization': `Bearer ${accessToken}`
        }
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            // console.log('Tiles:', data.tiles);
            // Call your Three.js scene setup with the tile data here
            // console.log("PLEASE BE USER DATA",data.user)
            ThisUser=data.user;
            sceneSetup(data.tiles)
        } else {
            console.error(data.message);
        }
    })
    .catch(err => console.error('Error fetching tiles:', err));
}

function onPointerMove(event) {
    pointer .x = (event.clientX / window.innerWidth) * 2 - 1;
    pointer .y = -(event.clientY / window.innerHeight) * 2 + 1;
    
    raycaster.setFromCamera( pointer, camera );
    console.log("MOVING MOUSE")
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
            const instances=[{
                "position":[IntersectPoint.x,IntersectPoint.y,IntersectPoint.z],
                "metaData":{
                    "health":100,
                    "state":"Built"
                }
            }]

            const asset_dictionary={
                "userId":ThisUser._id,
                "assetId":BuildingAssetName,
                "instances":instances,
            }

            foundTile.objectLoad(asset_dictionary)
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
        const optionObjNames=["ArmsFactory","CivilianFactory","Mine","Farm","Storage","House"]

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
                
                optionButton.myParam="Mill";
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
        
    }
}


function buttonpressed(event){
    // console.log("parameter of pressed button:", event.currentTarget.myParam)
    const dropdownElement=document.getElementById("Button_Dropdown")
    if(dropdownElement.style.display=="none"){
        dropdownElement.style.display="flex";
        dropdownElement.style.visibility="visible"
    }//if they want to close the dropdownElement there will be an X button in the element to do so

    let Title;
    switch(event.currentTarget.myParam){
        case "btn_Decisions":
            Title="Events & Decisions"
            break;
        case "btn_Research":
            Title="Research"
            break;
        case "btn_Finance":
            Title="Trade & Cooperation"
            break;
        case "btn_Construction":
            Title="Construction"
            ConstructionElements()
            break;
        case "btn_Production":
            Title="Production"
            break;
        case "btn_Train":
            Title="Military Training"
            break;
        case "btn_Security":
            Title="Security"
            break;
        default:
            console.log("something has gone wrong with button press")

    }
    console.log(Title, "bruh")
    document.getElementById("Title").innerHTML=Title

}
const addEventsToButtons=   ["btn_Decisions","btn_Research","btn_Finance",
                            "btn_Construction","btn_Production","btn_Train",
"btn_Security"]
addEventsToButtons.forEach(function (item, index) {
//   console.log(item, index);
    const target= document.getElementById(item)
    target.addEventListener("click", buttonpressed)
    target.myParam=item

});

function closeDropdown(){
    const dropdownElement=document.getElementById("Button_Dropdown")
    dropdownElement.style.display="none";
    dropdownElement.style.visibility="hidden"
}

document.getElementById("close_Dropdown").addEventListener("click",closeDropdown)



const peers = {};  // roomId -> { pc, dc }
const pendingCandidates = {}; // e.g., { roomId1: [candidate1, candidate2], roomId2: [...] }
const retryCounts = {};       // roomId -> attempt count
const MAX_RETRIES = 5;        // ✅ you can tune this
const manuallyLeft = {};  // roomId -> boolean
const isReconnecting = {};
const retryTimeout={};

const config = {
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
};

socket.on('joined', roomId => {
    console.log(`Joined room ${roomId}`);
    // Save to localStorage
    const saved = JSON.parse(localStorage.getItem('joinedRooms') || '[]');
    if (!saved.includes(roomId)) {
        saved.push(roomId);
        localStorage.setItem('joinedRooms', JSON.stringify(saved));
    }

});

socket.on('ready', ({ roomId, initiator }) => {
    console.log(`I AM THE INITIATOR ${initiator}`)
    start(roomId, initiator);
});

socket.on('room-full', roomId => {
    console.warn(`Room ${roomId} is full`);
});

socket.on('offer', async ({roomId,offer}) => {
    // await start(roomId, false);  // isInitiator = false
    const { pc } = peers[roomId];

    try {
        
        try {
            await pc.setRemoteDescription(new RTCSessionDescription(offer));
            console.log(`[${roomId}] Remote offer set`);
        } catch (err) {
            console.error(`[${roomId}] Failed to set remote offer:`, err);
            return;
        }
        // ✅ Flush buffered ICE candidates now
        if (pendingCandidates[roomId]) {
            for (const candidate of pendingCandidates[roomId]) {
                try {
                    await pc.addIceCandidate(new RTCIceCandidate(candidate));
                    console.log(`[${roomId}] Flushed buffered ICE candidate`);
                } catch (err) {
                    console.error(`[${roomId}] Error flushing candidate:`, err);
                }
            }
            delete pendingCandidates[roomId];
        }

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('answer', { roomId, answer });


    }catch (err) {
        // Detect glare errors (OperationError is common, but check your browser's error message)
        if (err.name === 'OperationError' && err.message && err.message.toLowerCase().includes('glare')) {
        console.warn(`[${roomId}] Glare detected. Starting recovery.`);

        // Cleanup old peer connection and related data
        cleanupConnection(roomId);

        // Wait a random delay before retrying to avoid collision
        const delay = 500 + Math.random() * 1000;
        setTimeout(() => {
            console.log(`[${roomId}] Retrying connection after glare.`);
            // Restart connection as non-initiator to avoid glare loops
            start(roomId, false);
        }, delay);

        } else {
        console.error(`[${roomId}] Failed to set remote offer:`, err);
        }
    }
});


socket.on('answer', async ({answer,roomId}) => {
    const { pc } = peers[roomId];
    try {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
        console.log(`[${roomId}] Remote answer set`);
    } catch (err) {
        if (err.name === 'OperationError' && err.message && err.message.toLowerCase().includes('glare')) {
            console.warn(`[${roomId}] Glare detected during answer. Starting recovery.`);

            // Cleanup and reconnect as non-initiator
            cleanupConnection(roomId);

            const delay = 500 + Math.random() * 1000;
            setTimeout(() => {
            console.log(`[${roomId}] Retrying connection after glare on answer.`);
            start(roomId, false);
            }, delay);
        } else {
            console.error(`[${roomId}] Failed to set remote answer:`, err);
        }
    }
});

socket.on('ice-candidate', async ({ roomId, candidate }) => {
    const pc = peers[roomId]?.pc;
    if (!pc || !candidate) return;

    if (pc.remoteDescription && pc.remoteDescription.type) {
        try {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
            console.log(`[${roomId}] ICE candidate added immediately`);
        } catch (err) {
            console.error(`[${roomId}] Failed to add ICE candidate:`, err);
        }
    } else {
        // Buffer for later
        if (!pendingCandidates[roomId]) pendingCandidates[roomId] = [];
        pendingCandidates[roomId].push(candidate);
        console.log(`[${roomId}] ICE candidate buffered`);
    }

});

function removeRoomFromStorage(roomId) {
    const saved = JSON.parse(localStorage.getItem('joinedRooms') || '[]');
    const updated = saved.filter(id => id !== roomId);
    localStorage.setItem('joinedRooms', JSON.stringify(updated));
}

socket.on('room-closed', (roomId) => {
    console.log(`[${roomId}] Room closed by server`);
  
    cleanupConnection(roomId);
    removeRoomFromStorage(roomId);
    // Optionally update UI to reflect the closed room
  
    // Also prevent reconnect attempts for this room:
    manuallyLeft[roomId] = true;
    retryCounts[roomId] = 0;
});

socket.on('peer-left', (roomId) => {
    console.log(`[${roomId}] Peer left, cleaning up and stopping reconnect attempts.`);
    // manuallyLeft[roomId] = true;  // flag to stop reconnects
    // cleanupConnection(roomId);    // close pc, data channels, timers, etc
});

socket.on('connect', () => {
    // This runs whenever the socket connects or reconnects
    console.log('Socket connected, joining rooms...or perhaps reconnecting to room');

    // setTimeout(() => {
    //     const rooms = JSON.parse(localStorage.getItem('rooms')) || [];
    //     rooms.forEach(roomId => {
    //         console.log(`Rejoining room ${roomId}`);
    //         socket.emit('join', roomId);
    //     });
    // }, 500); // 500ms is usually enough

    const rooms = JSON.parse(localStorage.getItem('rooms')) || [];
    rooms.forEach(roomId => socket.emit('join', roomId));
});

// // Debounce logic in iceconnectionstatechange:
const iceDisconnectTimeout=new Set();;
// Start connection (caller)  
const startedRooms = new Set(); // roomId -> true/false
async function start(roomId, isInitiator) {


    console.log(`ran start ${isInitiator}`)
    if (peers[roomId] || startedRooms.has(roomId)){ return};
    startedRooms.add(roomId);


    const pc = new RTCPeerConnection(config);
    peers[roomId] = { pc }; // Store early

    pc.oniceconnectionstatechange = () => {
        const state = pc.iceConnectionState;
        console.log(`[${roomId}] ICE state: ${state}`);
    
        if (state === 'failed') {
            console.log(`[${roomId}] ICE failed detected, reconnecting immediately.`);
            // reconnectToRoom(roomId);
            (async () => {
                try {
                    const offer = await pc.createOffer({ iceRestart: true });
                    await pc.setLocalDescription(offer);
                    socket.emit('offer', { roomId, offer });
                    console.log(`[${roomId}] ICE restart offer sent`);
                } catch (err) {
                    console.warn(`[${roomId}] ICE restart failed, falling back to full reconnect`);
                    reconnectToRoom(roomId);
                }
            })();
        }else if(state === 'disconnected'){
            if (iceDisconnectTimeout[roomId]) {
                console.log(`[${roomId}] Debounce timer already running, skipping new one.`);
                return;
            }

            // clearTimeout(iceDisconnectTimeout);
            console.log(`[${roomId}] ICE disconnected detected, starting debounce timer.`);
            iceDisconnectTimeout[roomId] = setTimeout(() => {
                console.log(`[${roomId}] Debounce timeout fired, checking ICE state again.`);
                if (pc.iceConnectionState === 'disconnected') {
                    reconnectToRoom(roomId);
                }else {
                    console.log(`[${roomId}] ICE state changed before debounce finished, no reconnect.`);
                }
                clearTimeout(iceDisconnectTimeout[roomId]);
                delete iceDisconnectTimeout[roomId];
            }, 5000);
        }else{
            if (iceDisconnectTimeout[roomId]) {
                clearTimeout(iceDisconnectTimeout[roomId]);
                delete iceDisconnectTimeout[roomId];
                console.log(`[${roomId}] ICE state changed, cleared debounce timer.`);
            }
        }
    };

    

    pc.onicecandidate = event => {
        if (event.candidate) {
            socket.emit('ice-candidate', { roomId, candidate: event.candidate });
        }
    };



    pc.ondatachannel = (event) => {
        const dc = event.channel;
        peers[roomId].dc = dc;
        // sendJson(1)
        dc.onopen = () => {
            console.log(`[${roomId}] DataChannel opened (non-initiator)`);
            // sendJson(roomId)
        }
        dc.onmessage = (e) => console.log(`[${roomId}] Received:`, e.data);
    };

    if (isInitiator) {
        const dc = pc.createDataChannel("json");
        peers[roomId].dc = dc;

        dc.onopen = () => {
            console.log(`[${roomId}] DataChannel opened (is initiator)`)
            retryCounts[roomId] = 0; // ✅ Reset retries
            sendJson(roomId)
        };
        dc.onmessage = (e) => console.log(`[${roomId}] Received:`, e.data);

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit("offer", { roomId, offer });
    }
    startedRooms.delete(roomId);
}


function cleanupConnection(roomId) {
    const conn = peers[roomId];
    if (!conn) return;

    try {
        conn.pc?.close();
        conn.dc?.close?.();
    }catch (err) {
        console.warn(`[${roomId}] Cleanup error:`, err);
    }

    // Clear pending ICE candidates buffer
    if (pendingCandidates[roomId]) {
        delete pendingCandidates[roomId];
    }

      // Clear any ICE disconnect debounce timer
    if (iceDisconnectTimeout[roomId]) {
        clearTimeout(iceDisconnectTimeout[roomId]);
        delete iceDisconnectTimeout[roomId];
    }

    // Clear any retry timer
    if (retryTimeout[roomId]) {
        clearTimeout(retryTimeout[roomId]);
        delete retryTimeout[roomId];
    }


    // delete peers[roomId];
    delete startedRooms[roomId];
    delete peers[roomId];
}




function reconnectToRoom(roomId) {//not sure how to test this...
    if (manuallyLeft[roomId]) {
        console.log(`[${roomId}] Not reconnecting: user left manually.`);
        return;  // Skip reconnecting
    }
    if (isReconnecting[roomId]) return; // Avoid concurrent reconnects


    retryCounts[roomId] = (retryCounts[roomId] || 0) + 1;
    if (retryCounts[roomId] > MAX_RETRIES) {
        console.warn(`[${roomId}] Reconnect aborted: too many attempts`);
        cleanupConnection(roomId);
        delete retryCounts[roomId]; // Clean up
        isReconnecting[roomId] = false;
        return;
    }
    
    const delay = Math.min(1000 * Math.pow(2, retryCounts[roomId]), 10000); // caps at 10s
    // const delay = 1000 * retryCounts[roomId]; // Exponential-ish backoff (1s, 2s, 3s...)
    console.log(`[${roomId}] Retry #${retryCounts[roomId]} in ${delay}ms...`);

    isReconnecting[roomId] = true;

    // Clear previous timer if any
    if (retryTimeout[roomId]) {
        clearTimeout(retryTimeout[roomId]);
    }

    // cleanupConnection(roomId);

    retryTimeout[roomId] = setTimeout(() => {
        // Clean up before trying to join again
        cleanupConnection(roomId);
        console.log("retrying")
        socket.emit('join', roomId); // Server will reassign initiator
        isReconnecting[roomId] = false;
    }, delay);
}


function waitForDataChannelOpen(roomId) {
    return new Promise((resolve, reject) => {
        const peer = peers[roomId];
        if (peer?.dc?.readyState === 'open') {
            return resolve();  // ✅ Already open — resolve immediately
        }

        const checkInterval = 100;
        const maxWait = 5000;
        let waited = 0;

        const interval = setInterval(() => {
            const peer = peers[roomId];
            if (peer && peer.dc && peer.dc.readyState === 'open') {
                clearInterval(interval);
                resolve();
            }

            waited += checkInterval;
            if (waited >= maxWait) {
                clearInterval(interval);
                reject(new Error(`Timed out waiting for DataChannel in room ${roomId}`));
            }
        }, checkInterval);
    });
}

async function sendJson(roomId) {

    try {
        await waitForDataChannelOpen(roomId);

        const peer = peers[roomId];

        const jsonData = { 
            message: 'Hello from peer!', 
            timestamp: Date.now() 
        };

        peer.dc.send(JSON.stringify(jsonData));
        console.log(`Sent to room ${roomId}:`, jsonData);
    }catch (err) {
        console.error(`Failed to send to ${roomId}:`, err.message);
    }
}

window.addEventListener('beforeunload', () => {//if the user closes the browser
    socket.emit('leave-all');  // Notify server user is leaving all rooms
});

//joins room
// var roomId=1;
// socket.emit('join', roomId);
// roomId=2;
// socket.emit('join', roomId);


//set up rooms in storage, if user refreshes they will attempt to connect to these
document.addEventListener('DOMContentLoaded', () => {
    if (!localStorage.getItem('rooms')) {
        localStorage.setItem('rooms', JSON.stringify(['1', '2']));
    }
});








