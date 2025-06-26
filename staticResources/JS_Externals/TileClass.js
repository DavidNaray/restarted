import * as THREE from "three";
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.176.0/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'https://cdn.jsdelivr.net/npm/three@0.176.0/examples/jsm/utils/BufferGeometryUtils.js';

import {TileInstancePool} from "./InstancePoolClass.js"
import {MinHeap,PriorityQueue} from "./MinH_PQ.js"
import {scene,requestRenderIfNotRequested} from "../siteJS.js"


const loader = new GLTFLoader();//new THREE.TextureLoader();
const fileLoader = new THREE.FileLoader(loader.manager);
fileLoader.setResponseType('arraybuffer'); // GLB is binary
fileLoader.setRequestHeader({'Authorization': `Bearer ${localStorage.getItem('accessToken')}`});

export var OBJECTS=new Map(); 

// responsible for generating the tile and holding the instancePools objects that track units and buildings
export class Tile{
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
        this.instanceManager.registerTile(this)
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
                    const geometry = new THREE.PlaneGeometry(1, 1, segmentsPerTile,segmentsPerTile );//segmentsPerTile
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