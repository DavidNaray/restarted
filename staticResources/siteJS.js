import * as THREE from "three";
import {OrbitControls} from 'https://cdn.jsdelivr.net/npm/three@0.176.0/examples/jsm/controls/OrbitControls.js';

const socket = io();

var controls,renderer,camera;
const scene = new THREE.Scene();
const loader = new THREE.TextureLoader();

let heightTexture = null;
let colourTexture = null;
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
        scene.add(mesh);

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
            const width = this.heightmap.image.width;
            const height = this.heightmap.image.height;
        
            const geometry = new THREE.PlaneGeometry(1, 1, width - 1, height - 1);
            geometry.rotateX(-Math.PI / 2);
    
            const material = new THREE.MeshToonMaterial({
                map: this.texture,
                displacementMap: this.heightmap,
                displacementScale: 1,
            });
        
            const terrain = new THREE.Mesh(geometry, material);
            const terrainHeight=10;
            const terrainWidth=10;
            terrain.scale.set(terrainWidth, 1, terrainHeight);
            scene.add(terrain);
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

}

//track all tiles 
class GlobalInstanceManager {
    constructor() {
        this.tiles = new Map();         // tileCoord => TileInstancePool
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


function sceneSetup(tiles){
    console.log("YOOO")
    scene.background = new THREE.Color('hsl(194, 100%, 71%)');
    
    renderer = new THREE.WebGLRenderer();
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
    
    let ambientLight = new THREE.AmbientLight(new THREE.Color('hsl(0, 100%, 100%)'), 3);
    scene.add(ambientLight);



    const globalmanager=new GlobalInstanceManager();
    const tileyay=new Tile(0,0,globalmanager,'../colourMap.png','../heightmap.png');

    tileyay.addcubeInstance(1);
    tileyay.addcubeInstance(2);
    tileyay.addcubeInstance(3);
    tileyay.addcubeInstance(4);
    console.log("DIVISION, NOW IN REMOVAL process")
    tileyay.removecubeInstance(0);
    tileyay.removecubeInstance(1);
    // tileyay.removecubeInstance(2);
    // tileyay.removecubeInstance(3);

    // tileyay.addcubeInstance(0);
    // tileyay.addcubeInstance(1);
    // tileyay.addcubeInstance(2);
    // tileyay.addcubeInstance(3);
    // tileyay.addcubeInstance(4);
    // tileyay.addcubeInstance(5);
    // tileyay.addcubeInstance(6);
    // tileyay.addcubeInstance(7);


}


function animate() {
	// raycaster.setFromCamera( pointer, camera );
	requestAnimationFrame( animate );
	controls.update();
    // renderer.clear();
	renderer.render( scene, camera );
}

window.onresize=function(){//resize the canvas
    renderer.setSize( window.innerWidth, window.innerHeight );
    camera.aspect = renderer.domElement.width/renderer.domElement.height;
    camera.updateProjectionMatrix();
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
        console.log('Tiles:', data.tiles);
        // Call your Three.js scene setup with the tile data here
        } else {
        console.error(data.message);
        }
    })
    .catch(err => console.error('Error fetching tiles:', err));
}


sceneSetup();
// addTerrain();
animate();

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








