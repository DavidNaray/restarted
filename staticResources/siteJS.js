import * as THREE from "three";
import {OrbitControls} from 'https://cdn.jsdelivr.net/npm/three@0.176.0/examples/jsm/controls/OrbitControls.js';

const socket = io();

var controls,renderer,camera;
const scene = new THREE.Scene();

function sceneSetup(){
    scene.background = new THREE.Color( 0xff0000 );
    
    renderer = new THREE.WebGLRenderer();
    renderer.setSize(document.getElementById("ThreeBlock").clientWidth, document.getElementById("ThreeBlock").clientHeight);//window.innerWidth, window.innerHeight );
    
    camera = new THREE.PerspectiveCamera( 75, renderer.domElement.width/renderer.domElement.height, 0.1, 10000 );//window.innerWidth / window.innerHeight
    camera.position.z = 5;
    camera.position.y = 1;
    camera.lookAt(new THREE.Vector3(0,0,0))
    
    controls = new OrbitControls( camera, renderer.domElement );
    
    const geometry = new THREE.BoxGeometry( 0.1, 0.1, 0.1 );
    const material = new THREE.MeshLambertMaterial({color: 0x0000ff, transparent: false, opacity: 0.5}) 
    const cube = new THREE.Mesh( geometry, material );
    scene.add( cube );
    
    let ambientLight = new THREE.AmbientLight(new THREE.Color('hsl(0, 0%, 100%)'), 3);
    scene.add(ambientLight);

    document.getElementById("ThreeBlock").append(renderer.domElement)
}

function animate() {
	// raycaster.setFromCamera( pointer, camera );
	requestAnimationFrame( animate );
	controls.update();
	renderer.render( scene, camera );
}

window.onresize=function(){//resize the canvas
    renderer.setSize( window.innerWidth, window.innerHeight );
    camera.aspect = renderer.domElement.width/renderer.domElement.height;
    camera.updateProjectionMatrix();
}

sceneSetup();
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

socket.on('new-peer', (roomId) => {
    console.log("I AM THE INITIATOR")
    // start(roomId,true);//isInitiator = true;
});

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








