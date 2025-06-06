const http = require('http');
const fs = require('fs');
const express=require("express");
const path = require('path')
const { Server } = require('socket.io');
// const { RTCPeerConnection, RTCSessionDescription } = require('wrtc');
const { PNG } = require('pngjs');
const seedrandom = require('seedrandom');


// Choose 2 open edges randomly
function chooseOpenEdges() {
    const edges = ['top', 'right', 'bottom', 'left'];
    return edges.sort(() => Math.random() - 0.5).slice(0, 2);
}

class TileData {
    constructor(chunkX, chunkY, width, height,openEdges) {
      this.chunkOrigin=[chunkX,chunkY];
      this.resolution=[width,height];
      this.openEdges=openEdges;
      this.riverPath = [];
      this.crossingPoints = [];
      this.nonCrossingPoints = [];
    }

    setRiverPath(path) {
        this.riverPath = path;
        this.crossingPoints = path.filter(p => p.crossable);
        this.nonCrossingPoints = path.filter(p => !p.crossable);
    }
}


async function generateHeightmap(chunkX=0,chunkY=0) {
    const { createNoise2D } = await import('simplex-noise');
    
    const rng = seedrandom('TERRAIN_SEED');
    const noise2D = createNoise2D(rng);

    const width = 512;
    const height = 512;
    const scale=5;
    const png = new PNG({ width, height });

    const walkWidth=width*3;
    const walkHeight=height*3;
    const walkmap = new PNG({ width:walkWidth, height:walkHeight });
    const openEdges = chooseOpenEdges();

    const tileData = new TileData(chunkX, chunkY, width, height,openEdges);



    // Pick start/end points for river
    function pickRiverEndpoints(openEdges, width, height,margin = 20, minDistance = 100) {
        // margin = how far from edge corners start/end can be placed
        // minDistance = minimum pixel distance between start and end

        function randomEdgePoint(edge) {
            if (edge === 'top') return [Math.floor(margin + Math.random() * (width - 2 * margin)), 0];
            if (edge === 'bottom') return [Math.floor(margin + Math.random() * (width - 2 * margin)), height - 1];
            if (edge === 'left') return [0, Math.floor(margin + Math.random() * (height - 2 * margin))];
            if (edge === 'right') return [width - 1, Math.floor(margin + Math.random() * (height - 2 * margin))];


            // if (edge === 'top') return [Math.floor(Math.random() * width), 0];
            // if (edge === 'bottom') return [Math.floor(Math.random() * width), height - 1];
            // if (edge === 'left') return [0, Math.floor(Math.random() * height)];
            // if (edge === 'right') return [width - 1, Math.floor(Math.random() * height)];
        }


        let start, end;
        let dist = 0;
        let tries = 0;
        do {
          start = randomEdgePoint(openEdges[0]);
          end = randomEdgePoint(openEdges[1]);
          const dx = end[0] - start[0];
          const dy = end[1] - start[1];
          dist = Math.sqrt(dx * dx + dy * dy);
          tries++;
          if (tries > 100) {
            // fallback if can't find good points after 100 tries
            break;
          }
        } while (dist < minDistance);

        // return {
        //     start: randomEdgePoint(edgeA),
        //     end: randomEdgePoint(edgeB)
        // };
        return { start, end };
    }

    const { start, end } = pickRiverEndpoints(openEdges, width, height,20, 100);
    console.log(`Open edges for chunk are`, openEdges);


    // Utility
    function clamp(val) {
        return Math.max(0, Math.min(1, val));
    }

    // 👇 River path with shallow crossing points
    function generateRiverPath(start, end, steps = 256, crossableFreq = 0.01, clusterRadius = 10) {
        const path = [];

        // Perlin warping
        const warpScale = 0.01;// Lower frequency → broader curves
        const warpStrength = 5;// Lower strength → gentler deviation
        const noiseWarp = createNoise2D(rng); // same seed
    
        // Step 1: Generate curved path (without assigning crossable yet)
        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            let x = start[0] + t * (end[0] - start[0]);
            let y = start[1] + t * (end[1] - start[1]);
    
            const warpX = noiseWarp(x * warpScale, y * warpScale);
            const warpY = noiseWarp((x + 999) * warpScale, (y + 999) * warpScale);
    
            x += warpX * warpStrength;
            y += warpY * warpStrength;
    
            path.push({ x: Math.floor(x), y: Math.floor(y), crossable: false });
        }
    
        // Step 2: Randomly pick some points as cluster centers
        const clusterCenters = path.filter(() => Math.random() < crossableFreq);
    
        // Step 3: Mark nearby points in path as crossable
        for (const point of path) {
            for (const center of clusterCenters) {
                const dx = point.x - center.x;
                const dy = point.y - center.y;
                if (Math.sqrt(dx * dx + dy * dy) < clusterRadius) {
                    point.crossable = true;
                    break;
                }
            }
        }
        return path;
    }

    const riverPath = generateRiverPath(start, end);
    tileData.setRiverPath(riverPath);

    function fBm(x, y, octaves = 5, lacunarity = 2.0, gain = 0.5) {
        let total = 0;
        let amplitude = 1;
        let frequency = 1;
        let max = 0; // for normalization
    
        for (let i = 0; i < octaves; i++) {
            total += noise2D(x * frequency, y * frequency) * amplitude;
            max += amplitude;
            amplitude *= gain;
            frequency *= lacunarity;
        }
    
        return (total/max+1)/2;

    }

    // 👇 Return river strength & crossable status
    function riverMask(x, y, riverPath, radius = 60) {
        let closest = null;
        let minDist = Infinity;
        for (const point of riverPath) {
            const dx = x - point.x;
            const dy = y - point.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < minDist && dist < radius) {
                minDist = dist;
                closest = point;
            }
        }
        if (closest) {
            const strength = 1.0 - (minDist / radius);
            return { strength, crossable: closest.crossable };
        }
        return { strength: 0, crossable: false };
    }



    // ✅ CHUNK-AWARE GET HEIGHT FUNCTION
    function getHeight(x, y) {
        const nx = (x + chunkX * width) / width *scale ;
        const ny = (y + chunkY * height) / height *scale;

        const plains=fBm(nx, ny);

        const mountainRegion = fBm(nx * 0.5, ny * 0.5, 3, 2.0, 0.5);
        const mountainStrength = Math.pow(mountainRegion, 2);

        // Edge fade
        const dx = x / width;
        const dy = y / height;
        const edgeFadeSize = 0.2;
        let edgeMask = 1.0;

        // Center mask to reduce mountain height near tile center
        const cx = dx - 0.5; // [-0.5, 0.5]
        const cy = dy - 0.5;
        const distanceFromCenter = Math.sqrt(cx * cx + cy * cy) * 2; // [0, ~1.41] → normalized
        const centerMask = clamp((distanceFromCenter - 0.4) / 0.6); // 0 near center, 1 near edge


        if (openEdges.includes('top')) {
        edgeMask *= clamp((dy - edgeFadeSize) / (1 - edgeFadeSize));
        }
        if (openEdges.includes('bottom')) {
        edgeMask *= clamp(((1 - dy) - edgeFadeSize) / (1 - edgeFadeSize));
        }
        if (openEdges.includes('left')) {
        edgeMask *= clamp((dx - edgeFadeSize) / (1 - edgeFadeSize));
        }
        if (openEdges.includes('right')) {
        edgeMask *= clamp(((1 - dx) - edgeFadeSize) / (1 - edgeFadeSize));
        }

        // Mountain noise
        const mountainNoise = fBm(nx * 4, ny * 4, 4, 2.0, 0.5);
        const rawMountains = Math.pow(mountainNoise, 2) * mountainStrength * edgeMask * centerMask;
        const mountains = Math.pow(clamp(rawMountains, 0, 1), 1.5);
        // console.log(mountains)

        // 👇 River influence
        const { strength: riverStrength, crossable } = riverMask(x, y, riverPath, 6);
        const riverDepth = crossable ? 0.05 : 0.3;


        const base = plains * (0.7 - mountainStrength);
        let heightmap = clamp(base + mountains*10 - riverStrength*6 * riverDepth);
        let heightmapBase=heightmap;
        
        // Apply cliffs
        const cliffCenterNoise = fBm(nx * 0.08, ny * 0.08, 3, 2.0, 0.5);
        const cliffThreshold = 0.6;
        const cliffRadius = 0.1;
        const cliffHeight = 0.3;
        const cliffFalloff = 5.0;

        // Only place cliffs if:
        // console.log(mountainStrength)
        // ⛔ Avoid cliffs where mountains or rivers dominate

        const cliffRegion = fBm(nx * 1.5, ny * 1.5, 4, 2.0, 0.5);
        const shouldPlaceCliff = cliffRegion > 0.5 && mountainStrength < 0.1 && riverStrength < 0.2;
        
        let cliffSteepness=0;
        let dot=0;
        let directionalFalloff=0;
        let isCliffFace=false;
        if (shouldPlaceCliff) {
            // Directional push: create asymmetrical slope
            const dirX = fBm(nx + 100, ny) * 2 - 1;
            const dirY = fBm(nx, ny + 100) * 2 - 1;
        
            // Directional offset (how "in front" of the cliff center we are)
            const centerOffsetX = nx - cliffCenterNoise;
            const centerOffsetY = ny - cliffCenterNoise;
            dot = centerOffsetX * dirX + centerOffsetY * dirY;
        
            // Steep on the front side, blend on the back
            directionalFalloff = 1.0 / (1.0 + Math.exp(-cliffFalloff * (dot - 0.02)));
            
            const smoothed = Math.max(0, 1 - Math.abs(cliffCenterNoise - cliffThreshold) * 6.0);
            cliffSteepness = directionalFalloff * smoothed;
            isCliffFace = cliffSteepness > 0.15 && directionalFalloff > 0.1 && directionalFalloff < 0.9;
            

            const cliffHeightContribution = cliffSteepness * cliffHeight;
            heightmap = clamp(heightmap + cliffHeightContribution);
        }


        return {
            heightmapBase:heightmapBase,
            heightmap: heightmap,
            walkable: (mountains < 0.008) && (crossable || riverStrength < 0.3),
            riverStrength:riverStrength,
            crossable:crossable,
            cliffSteepness:cliffSteepness,
            isCliffFace:isCliffFace,
            mountainStrength:mountainStrength,
            riverStrength:riverStrength
        };
    }


    // === FIRST PASS: Compute all heights and metadata ===
    const heightBuffer = Array.from({ length: height }, () => new Array(width));
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            heightBuffer[y][x] = getHeight(x, y); // Only once!
        }
    }


    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const {
                heightmapBase,
                heightmap,
                walkable,
                riverStrength,
                crossable,
                cliffSteepness,
                isCliffFace,
                mountainStrength,
            } = heightBuffer[y][x];
            // let dict= getHeight(x, y);
            // const { heightmapBase,heightmap,walkable,riverStrength,crossable,cliffSteepness, isCliffFace } = getHeight(x, y);
            // === Check neighbors for drop-offs ===
            const neighbors = [];
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    if (dx === 0 && dy === 0) continue;
                    const nx = x + dx;
                    const ny = y + dy;
                    if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                        neighbors.push(heightBuffer[ny][nx].heightmap);
                    }
                }
            }

            const dropThreshold = 0.1; // Tweak as needed
            let isCliff = neighbors.some(h => (heightmap - h) > dropThreshold);
            // SECOND PASS: Detect cliffs by height drop-off
            const cliffThreshold = 0.1; // tweak this as needed
            const val = Math.floor(heightmap * 255);

            const idx = (width * y + x) << 2;
            png.data[idx] = val;     // R
            png.data[idx + 1] = val; // G
            png.data[idx + 2] = val; // B
            png.data[idx + 3] = 255; // A

            let r, g, b;

            // Check nearby for any strong river influence
            let nearRiver = false;
            const riverRadius = 2;

            for (let ry = -riverRadius; ry <= riverRadius && !nearRiver; ry++) {
                for (let rx = -riverRadius; rx <= riverRadius && !nearRiver; rx++) {
                    const nx = x + rx;
                    const ny = y + ry;
                    if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                        const neighborRiverStrength = heightBuffer[ny][nx].riverStrength;
                        if (neighborRiverStrength > 0.1) {
                            nearRiver = true;
                        }
                    }
                }
            }



            // ✅ Remove cliffs in mountainous regions
            // console.log(riverStrength)
            if (mountainStrength > 0.1 || nearRiver) {
                isCliff = false;
            }


            if ( riverStrength > 0) {
                // It's part of the river
                if (crossable) {
                    // Crossing point
                    r = 255; g = 255; b = 0; // Yellow
                } else {
                    r = 0; g = 0; b = 255;   // Blue
                }
            } 
            
            else if (isCliff) { // 🎯 Adjust this threshold as needed
                r = 255; g = 0; b = 0; // Black cliff face
            }

            else {
                // Land
                r = walkable ? 255 : 0;
                g = walkable ? 255 : 0;
                b = walkable ? 255 : 0;
            }


            for (let dy = 0; dy < 3; dy++) {
                for (let dx = 0; dx < 3; dx++) {
                const wx = x * 3 + dx;
                const wy = y * 3 + dy;
                const wIdx = (walkWidth * wy + wx) << 2;
        
                walkmap.data[wIdx] = r;
                walkmap.data[wIdx + 1] = g;
                walkmap.data[wIdx + 2] = b;
                walkmap.data[wIdx + 3] = 255;
                }
            }

        }
    }
    
    png.pack().pipe(fs.createWriteStream('heightmap.png')).on('finish', () => {
        console.log('✅ Saved: heightmap.png');
    });
    walkmap.pack().pipe(fs.createWriteStream('walkmap.png')).on('finish', () => {
        console.log('✅ Saved: Walkmap.png');
    });


}
generateHeightmap();

const app=express()//creates server
const server = http.createServer(app);
const io = new Server(server);


app.use(express.static("./staticResources"))


app.get("/",(req,res)=>{
    //if i want to access index through sitePages, when commented out, if index.html in staticResources, gets it from there
    //any errors in the future, potentially use path.resolve
    res.status(200).sendFile(path.join(__dirname,'./sitePages/index.html'))
})

// app.get("/about",(req,res)=>{res.status(200).send("aboutpage")})

app.get('/{*any}',(req,res)=>{//handles urls not the explicitly defined, wanted ones
    res.status(200).send("pluh")
})

server.listen(5000,()=>{
    console.log("listening to port 5000")
})

//users join a room and then establish a connection with users in that room
//for this app users will establish one on one peer to peer connection
//from the server you get your data, tiles, objects, quantities but only yours

const socketToRooms  = new Map();//{}; // roomId -> array of sockets

io.on('connection', socket => {
    // console.log('a user connected');
    socket.on('join', roomId => {
        console.log(`user connected ${roomId}`)

        const room = io.sockets.adapter.rooms.get(roomId) || new Set();
        const numClients = room.size;

        
        if (numClients < 2) {
            socket.join(roomId);

            if (!socketToRooms.has(socket.id)) {
                socketToRooms.set(socket.id, new Set());
            }
            socketToRooms.get(socket.id).add(roomId);

            socket.emit('joined', roomId);

            const updatedRoom = io.sockets.adapter.rooms.get(roomId);
            if (updatedRoom && updatedRoom.size === 2) {
                const [firstId, secondId] = [...updatedRoom];
                const initiatorId = secondId; // the newer client
                const receiverId = firstId;

                io.to(initiatorId).emit('ready', { roomId, initiator: true });
                io.to(receiverId).emit('ready', { roomId, initiator: false });
            }

        } else {
            socket.emit('room-full', roomId);
        }

    });


    socket.on('offer', ({ roomId, offer }) => {
        socket.to(roomId).emit('offer', { roomId, offer });
        // socket.to(data.room).emit('offer', data.offer);
        // socket.broadcast.emit('offer', data);
    });

    socket.on('answer', ({ roomId, answer }) => {
        socket.to(roomId).emit('answer', { roomId, answer });
        // socket.to(data.room).emit('answer', data.answer);
        // socket.broadcast.emit('answer', data);
    });

    socket.on('ice-candidate', ({ roomId, candidate }) => {
        socket.to(roomId).emit('ice-candidate', { roomId, candidate });
        // socket.broadcast.emit('ice-candidate', data);
    });

    socket.on('disconnect', () => {
            console.log('user disconnected');
            // Get all rooms socket was in
            const rooms = socketToRooms.get(socket.id) || new Set(); // Set including socket.id itself
            rooms.forEach(roomId => {
                setTimeout(() => {
                    const room = io.sockets.adapter.rooms.get(roomId);
                    
                    if (!room || room.size < 2) {

                        console.log(`[Server] Notifying room ${roomId} that peer left`);
                        socket.to(roomId).emit('peer-left', roomId);


                        if (!room || room.size < 2) {
                            for (const socketId of room || []) {
                                //kicks the remaining peer out the room
                                io.sockets.sockets.get(socketId)?.leave(roomId);
                                //notifies them that the room is closed and to not try to reconnect
                                io.sockets.sockets.get(socketId)?.emit('room-closed', roomId);  // Explicit event for remaining client
                            }
                        }
                    }else {
                        console.log(`[Server] Room ${roomId} still active, skipping cleanup`);
                    }
                },1000);
            });
            socketToRooms.delete(socket.id);
    });


});
