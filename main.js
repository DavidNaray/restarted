const http = require('http');
const fs = require('fs');
const express=require("express");
const path = require('path')
const { Server } = require('socket.io');
// const { RTCPeerConnection, RTCSessionDescription } = require('wrtc');
const { PNG } = require('pngjs');
const seedrandom = require('seedrandom');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const ACCESS_TOKEN_SECRET = "your_access_secret_here";
const REFRESH_TOKEN_SECRET = "your_refresh_secret_here";

const mongoose = require('mongoose');
const mongoDB="mongodb://localhost:27017/firstEver"
// console.log(mongoDB)
mongoose.connect(mongoDB).then(()=>{
    console.log("successfully connected to mongoDB")
})

const userSchema = new mongoose.Schema({
  username: { type: String, unique: true },
  passwordHash: String,  // store hashed password here
  refreshTokens: [String],  // Store issued refresh tokens (optional)
});

const templateSchema = new mongoose.Schema({
    name: { type: String, required: true },           // Name of the template
    owner: { type: String, required: true },          // Username of the creator/owner
    
    composition: [{
        // unitAsset: { type: String, required: true },  // Which unit asset/model this refers to
        assetId: { type: String, required: true },        // what type of unit they are
        count: { type: Number, required: true },      // Number of this unit in the template
        // config: { type: mongoose.Schema.Types.Mixed } // Optional: equipment, formation, etc.
    }],
    
    createdAt: { type: Date, default: Date.now }
});

const tileSchema = new mongoose.Schema({
    x:Number,
    y:Number,

    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },       // ✅ Full control & vision
    allies: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],    // ✅ Full vision, restricted actions (per owners rules)
    involvedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],// ⚔️ Enemies or visiting users

    textures: {
        heightmapUrl: String,
        texturemapUrl: String,
        WalkMapURL: String,
    },

    buildings: [{
        userId: String,
        assetId: String, // building type
        instances:[{
            position: [Number], // [x, y, z] on the tile
            metaData: {
                health: Number,
                state: String,     // e.g., "under_construction", "built", etc.
            }
        }]
    }],

    units: [{
        username: String,       // who owns these units
        assetId: String,        // what type of unit they are
        instances: [{
            position: [Number], // [x, y]
            metaData: {
                // templateId: { type: String, default: null },  // null = free unit
                templateId: { type: mongoose.Schema.Types.ObjectId, ref: 'Template', default: null },
                health: Number,
                state: String,       // e.g., "idle", "moving", "attacking"

            }
        }]
    }],


    updatedAt: { type: Date, default: Date.now }
});



const User = mongoose.model('User', userSchema);

const TemplateScheme = mongoose.model('TemplateScheme', templateSchema);

const TileScheme = mongoose.model('TileScheme', tileSchema);

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
    const colourMap = new PNG({ width, height });

    const walkWidth=width*3;
    const walkHeight=height*3;
    const walkmap = new PNG({ width:walkWidth, height:walkHeight });
    const openEdges = chooseOpenEdges();

    const tileData = new TileData(chunkX, chunkY, width, height,openEdges);

    // Choose 2 open edges randomly
    function chooseOpenEdges() {
        const edges = ['top', 'right', 'bottom', 'left'];
        return edges.sort(() => Math.random() - 0.5).slice(0, 2);
    }

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
        const riverDepth = crossable ? 0.1 : 0.2;


        const base = (plains* 0.5) * (0.7 - mountainStrength);
        // console.log(riverStrength)
        let heightmap = clamp(base + mountains*7);
        let heightmapBase=heightmap;
        
        // Apply cliffs
        const cliffCenterNoise = fBm(nx * 0.08, ny * 0.08, 3, 2.0, 0.5);
        const cliffThreshold = 0.6;
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
            let val = Math.floor(heightmap * 255);







            let r, g, b;
            // === TERRAIN COLORING ===
            let terrainR = 0, terrainG = 0, terrainB = 0;

            // Check nearby for any strong river influence
            let nearRiver = false;
            const riverRadius = 2;

            for (let ry = -riverRadius; ry <= riverRadius && !nearRiver; ry++) {
                for (let rx = -riverRadius; rx <= riverRadius && !nearRiver; rx++) {
                    const nx = x + rx;
                    const ny = y + ry;
                    if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                        const neighborRiverStrength = heightBuffer[ny][nx].riverStrength;
                        if (neighborRiverStrength > 0.2) {
                            nearRiver = true;
                        }
                    }
                }
            }



            // ✅ Remove cliffs in mountainous regions and edge of river...

            if (mountainStrength > 0.1 || nearRiver) {
                isCliff = false;

            }

            if ( riverStrength > 0) {
                // console.log(val)
                // River body
                terrainR = 50;
                terrainG = 70;
                terrainB = 100;
                // It's part of the river
                val = Math.floor(heightmapBase * 255);
                if (crossable) {
                    
                    //should strictly be the height of the plains just coloured differently, maybe slightly lower
                    // Crossing point
                    terrainR = 50;
                    terrainG = 90;
                    terrainB = 100;
                    r = 255; g = 255; b = 0; // Yellow

                } else {
                    r = 0; g = 0; b = 255;   // Blue
                    // console.log(val + "depth")
                    if((val-5)>=0){
                        val=val-5;
                    }
                    
                }
            }else if(nearRiver && (heightmap - heightmapBase)>0.05){
                terrainR = 110;
                terrainG = 100 + Math.floor(Math.random() * 20); // subtle pebble noise
                terrainB = 90;

                r = 255; g = 0; b = 0; // red cliff face
                
                //need this if crossable thing because it still overlaps the river edge, this is what prevents what
                //  jerks the blue in the river up the cliff
                if (crossable) {
                    val = Math.floor(heightmapBase * 255);
                    console.log(val + "crossing")
                    // Crossing point
                    terrainR = 50;
                    terrainG = 90;
                    terrainB = 100;
                    r = 255; g = 255; b = 0; // Yellow

                } else {
                    r = 0; g = 0; b = 255;   // Blue
                    val = Math.floor(heightmapBase * 255);
                    if((val-5)>=0){
                        val=val-5;
                    }
                    
                }
            }

            
            else if (isCliff) { // 🎯 Adjust this threshold as needed
                r = 255; g = 0; b = 0; // red cliff face
                terrainR = 110;
                terrainG = 100 + Math.floor(Math.random() * 20); // subtle pebble noise
                terrainB = 90;
            }

            else{
                // Land
                r = walkable ? 255 : 0;
                g = walkable ? 255 : 0;
                b = walkable ? 255 : 0;

                const greenNoise = (fBm(x * 0.01, y * 0.01) * 0.5 + 0.5) * 60;
                
                // terrainR = walkable ? 40 : 0;
                // terrainG = walkable ? 120 + greenNoise : 0;
                // terrainB = walkable ? 40 : 0;
                if(walkable){
                    terrainR = 40;
                    terrainG = 120 + greenNoise;
                    terrainB = 40 ;
                }else{
                    if(heightmapBase>0.6){//this is a peak, hence white
                        terrainR=255;
                        terrainG=255;
                        terrainB=255;
                    }else{//overwise its rocky
                        terrainR = 110;
                        terrainG = 100 + Math.floor(Math.random() * 10); // subtle pebble noise
                        terrainB = 90;
                    }

                }
                if(nearRiver){
                    // isCliff = false;
                    terrainR = 110;
                    terrainG = 100 + Math.floor(Math.random() * 20); // subtle pebble noise
                    terrainB = 90;
                }
                // terrainR = 40;
                // terrainG = 120 + greenNoise;
                // terrainB = 40;
            }


            const idx = (width * y + x) << 2;
            png.data[idx] = val;     // R
            png.data[idx + 1] = val; // G
            png.data[idx + 2] = val; // B
            png.data[idx + 3] = 255; // A


            colourMap.data[idx]     = terrainR;
            colourMap.data[idx + 1] = terrainG;
            colourMap.data[idx + 2] = terrainB;
            colourMap.data[idx + 3] = 255;

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
    
    png.pack().pipe(fs.createWriteStream('./Tiles/HeightMaps/'+chunkX+chunkY+'.png')).on('finish', () => {
        console.log('✅ Saved: heightmap.png');
    });
    walkmap.pack().pipe(fs.createWriteStream('./Tiles/WalkMaps/'+chunkX+chunkY+'.png')).on('finish', () => {
        console.log('✅ Saved: Walkmap.png');
    });
    colourMap.pack().pipe(fs.createWriteStream('./Tiles/TextureMaps/'+chunkX+chunkY+'.png')).on('finish', () => {
        console.log('✅ Saved: colourMap.png');
    });

}
generateHeightmap();



const app=express()//creates server
const server = http.createServer(app);
const io = new Server(server);


app.use(express.static("./staticResources"))

// app.use(express.static('./Tiles/TextureMaps'));
// app.use(express.static('./Tiles/HeightMaps'));
// app.use('/Tiles/TextureMaps', express.static(path.join(__dirname, '/Tiles/TextureMaps')));

app.use(express.json()); // <-- This must come BEFORE your POST route handlers

app.get("/homepage",(req,res)=>{
    //if i want to access index through sitePages, when commented out, if index.html in staticResources, gets it from there
    //any errors in the future, potentially use path.resolve
    res.status(200).sendFile(path.join(__dirname,'./sitePages/Homepage.html'))
})

app.get("/play",(req,res)=>{
    //if i want to access index through sitePages, when commented out, if index.html in staticResources, gets it from there
    //any errors in the future, potentially use path.resolve
    res.status(200).sendFile(path.join(__dirname,'./sitePages/index.html'))
})

app.post('/Register-user', async (req, res) => {
  const { username,password } = req.body;

  try {
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'Username already exists' });
    }
    
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    const user = new User({ username, passwordHash });

    // Create a JWT token with payload identifying the user
    const accessToken = jwt.sign({ username: user.username }, ACCESS_TOKEN_SECRET, { expiresIn: '15m' });
    const refreshToken = jwt.sign({ username: user.username }, REFRESH_TOKEN_SECRET);

    // Save refreshToken to user in DB (optional)
    user.refreshTokens.push(refreshToken);
    await user.save();

    // === Create Tile ===
    const defaultHeightmapURL = './Tiles/HeightMaps/00.png';
    const defaultTexturemapURL = './Tiles/TextureMaps/00.png';
    const defaultWalkmapURL = './Tiles/WalkMaps/00.png';

    const B_TownHall={
        "userId":user._id,
        "assetId": "DATC",
        "instances":[{
            "position":[0,0,0],
            "metaData":{
                "health":100,
                "state":"Built"
            }
        }]
    }
    const tile = new TileScheme({
        x:0,
        y:0,
        owner: user._id,
        allies: [],
        involvedUsers: [],
        textures:{
            heightmapUrl: defaultHeightmapURL,
            texturemapUrl: defaultTexturemapURL,
            WalkMapURL: defaultWalkmapURL,
        },
        units: [],
        buildings: [B_TownHall]
    });

    await tile.save();
    console.log("ITS ON REGISTER MAN!!")
    res.cookie('refreshToken', refreshToken, { httpOnly: true, secure: true, sameSite: 'Strict' }); // if HTTPS
    res.json({ accessToken,user, success: true, message: 'User recognised'});
    // res.status(201).json({ success: true, message: 'User created' });
    // res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ success: false, message: "server failure" });
  }
});
app.post('/Login-user', async (req, res) => {
  const { username,password } = req.body;

  try {
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(400).json({ success: false, message: 'User not found' });
    }

    const passwordMatch = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatch) {
      return res.status(400).json({ success: false, message: 'Incorrect password' });
    }
    
    // Create a JWT token with payload identifying the user
    const accessToken = jwt.sign({ username: user.username }, ACCESS_TOKEN_SECRET, { expiresIn: '15m' });
    const refreshToken = jwt.sign({ username: user.username }, REFRESH_TOKEN_SECRET);

    // Save refreshToken to user in DB (optional)
    user.refreshTokens.push(refreshToken);
    await user.save();
    // res.status(201).json({ success: true, message: 'User recognised',user,token });
    console.log("WE LOGGIN IN  MAN!!")
    res.cookie('refreshToken', refreshToken, { httpOnly: true, secure: true, sameSite: 'Strict' }); // if HTTPS
    res.json({ accessToken,user, success: true, message: 'User recognised'});
  } catch (err) {

    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// refresh token route
app.post('/token', async (req, res) => {
  const refreshToken = req.cookies.refreshToken;
  if (!refreshToken) return res.status(401).json({ message: "No refresh token provided" });

  try {
    const payload = jwt.verify(refreshToken, REFRESH_TOKEN_SECRET);

    // Check if refreshToken is still valid (optional)
    const user = await User.findOne({ username: payload.username });
    if (!user || !user.refreshTokens.includes(refreshToken)) {
      return res.status(403).json({ message: "Invalid refresh token" });
    }

    const accessToken = jwt.sign({ username: user.username }, ACCESS_TOKEN_SECRET, { expiresIn: '15m' });

    res.json({ accessToken });
  } catch (err) {
    return res.status(403).json({ message: "Invalid or expired refresh token" });
  }
});

// Middleware to authenticate token
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.sendStatus(401);

  jwt.verify(token, ACCESS_TOKEN_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user; // { username: ... }
    next();
  });
}

app.get('/tiles', authenticateToken, async (req, res) => {
  try {
    const user = await User.findOne({ username: req.user.username });
    console.log(user)
    if (!user) return res.status(404).json({ message: "User not found" });

    const tiles = await TileScheme.find({ owner: user._id });
    res.json({ success: true, tiles,user:user });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch tiles' });
  }
});


app.get('/Tiles/TextureMaps/{*any}', (req, res) => {
    const filePath = req.params; // captures everything after /Tiles/TextureMaps/
    // console.log(filePath[0],"huh")
    // console.log('Requested file:', path.join(__dirname,'Tiles/TextureMaps',filePath.any[0]));
    res.status(200).sendFile(path.join(__dirname,'Tiles/TextureMaps',filePath.any[0]))
    // const fullPath = path.join(__dirname, 'Tiles/TextureMaps', filePath);

    // res.sendFile(fullPath, err => {
    //     if (err) {
    //         console.error(err);
    //         res.status(404).send('File not found');
    //     }
    // });
});

app.get('/Tiles/HeightMaps/{*any}', (req, res) => {
    const filePath = req.params; // captures everything after /Tiles/TextureMaps/
    // console.log('Requested file:', filePath);
    res.status(200).sendFile(path.join(__dirname,'Tiles/HeightMaps',filePath.any[0]))
    // const fullPath = path.join(__dirname, 'Tiles/TextureMaps', filePath);

    // res.sendFile(fullPath, err => {
    //     if (err) {
    //         console.error(err);
    //         res.status(404).send('File not found');
    //     }
    // });
});

app.get('/Tiles/WalkMaps/{*any}', (req, res) => {
    const filePath = req.params; // captures everything after /Tiles/TextureMaps/
    // console.log('Requested file:', filePath);
    res.status(200).sendFile(path.join(__dirname,'Tiles/WalkMaps',filePath.any[0]))
    // const fullPath = path.join(__dirname, 'Tiles/TextureMaps', filePath);

    // res.sendFile(fullPath, err => {
    //     if (err) {
    //         console.error(err);
    //         res.status(404).send('File not found');
    //     }
    // });
});

app.get('/Assets/Asset_Masks/{*any}', (req, res) => {
    const filePath = req.params; // captures everything after /Tiles/TextureMaps/
    // console.log('Requested file:', filePath);
    res.status(200).sendFile(path.join(__dirname,'Assets/Asset_Masks',filePath.any[0]))
    // const fullPath = path.join(__dirname, 'Tiles/TextureMaps', filePath);

    // res.sendFile(fullPath, err => {
    //     if (err) {
    //         console.error(err);
    //         res.status(404).send('File not found');
    //     }
    // });
});

app.get('/Assets/GLB_Exports/{*any}', (req, res) => {
    const filePath = req.params; // captures everything after /Tiles/TextureMaps/
    // console.log('Requested file:', filePath);
    // res.status(200).sendFile(path.join(__dirname,'Tiles/HeightMaps',filePath.any[0]))

    res.sendFile(path.resolve(__dirname,'Assets/GLB_Exports',filePath.any[0]))

});



app.get('/{*any}',(req,res)=>{//handles urls not the explicitly defined, wanted ones
    res.status(200).send("pluh")
})

const PORT= 5000
server.listen(PORT,()=>{
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
