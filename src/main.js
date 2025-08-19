const http = require('http');
const express=require("express");
const path = require('path')
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');

const cookieParser = require('cookie-parser');
const bcrypt = require('bcrypt');
const bson = require('bson');

const Coordfinder=require("./modules/NextChunkCoord")
const genTerrain=require("./modules/TerrainGeneration")
const userSchemaImport=require("./Schemas/User")
const TileScheme=require("./Schemas/Tile")
const TemplateSchemaImport=require("./Schemas/Template")

const {authenticateTokenImport,RefreshTokenImport,AccessTokenImport,verifyImport,socketUtilImport}=require("./modules/Verification")
const {PointPlacementVerification,IdentifySpecificChunkPoint,SharpImgBuildingPlacementVerification,getPosWithHeight}=require("./modules/PlacementValidation.js")
const {PortalConnectivity}=require("./modules/AbtractMapGeneration.js")
const {validateUnitOwnership,validateUnitOwnershipTwo}=require("./modules/UnitPositionValidation.js")
const {calculateReward}=require("./modules/RewardCalculating.js")
const {convertMapToMongoDoc,toCachedUser}=require("./modules/MongoAbstractConversions.js")
const {updatePixelLocAndOcc,ProgressOrders}=require("./modules/PathfindingFunctionality.js")
const {getTheMessage,killEntry}=require("./modules/TickMessages.js")
const ChunkManager=require("./modules/CacheChunkInfo.js")
const MovementOrderClass=require("./modules/MovementOrderClass.js")
// console.log(ChunkManager,"?")

const mongoose = require('mongoose');
const { Console } = require('console');
const mongoDB="mongodb://localhost:27017/firstEver"
mongoose.connect(mongoDB).then(()=>{console.log("successfully connected to mongoDB")})

const User = mongoose.model('User', userSchemaImport)
const TemplateScheme = mongoose.model('Templates', TemplateSchemaImport)
// const TileScheme = mongoose.model('Tiles', TileSchemaImport)

// module.exports={TileScheme};

function getTodayDateString() {
  const now = new Date();
  return now.toISOString().slice(0, 10); // e.g. "2025-08-16"
}

const PORT= 5000
const app=express()//creates server
const server = http.createServer(app);
const io = new Server(
    server,{    
        cors: {
            origin: 'http://localhost:'+PORT,
            credentials: true
        }
    }
);
server.listen(PORT,()=>{
    console.log("listening to port 5000")
})

app.use(express.static("./staticResources"))
app.use(express.static("./staticResources/JS_Externals"))
app.use(cookieParser());
app.use(express.json()); // <-- This must come BEFORE your POST route handlers

app.get("/homepage",(req,res)=>{
    //if i want to access index through sitePages, when commented out, if index.html in staticResources, gets it from there
    //any errors in the future, potentially use path.resolve
    res.status(200).sendFile(path.join(__dirname,'../sitePages/Homepage.html'))
})

app.get("/play",(req,res)=>{
    //if i want to access index through sitePages, when commented out, if index.html in staticResources, gets it from there
    //any errors in the future, potentially use path.resolve
    res.status(200).sendFile(path.join(__dirname,'../sitePages/index.html'))
})

app.post('/Register-user', async (req, res) => {
  const { username,password } = req.body;

  try {
    const existingUser = await User.findOne({ username });
    if (existingUser) {
        console.log("Username already exists, preventing spam reg?:", username);
        return res.status(400).json({ success: false, message: 'Username already exists' });
    }
    
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    const user = new User({ username, passwordHash });

    // Create a JWT token with payload identifying the user
    // RefreshTokenImport,AccessTokenImport
    const accessToken = AccessTokenImport(user)//jwt.sign({ username: user.username }, ACCESS_TOKEN_SECRET, { expiresIn: '15m' });
    const refreshToken = RefreshTokenImport(user)//jwt.sign({ username: user.username }, REFRESH_TOKEN_SECRET);

    // Save refreshToken to user in DB (optional)
    user.refreshTokens.push(refreshToken);

    //run the terrain generation function with the coords
    const pos=Coordfinder.GiveMeNextCoordAndSetState()
    const chunkX=pos[0];const chunkY=pos[1];

    user.OriginTile=[chunkX,chunkY]
    try{
        await user.save();


        
        const UserToCache = await User.findOne({ username });
        // await ChunkManager.RegisterUser(UserToCache._id.toString(),UserToCache)
        const UserToCacheConverted = await toCachedUser(UserToCache)
        await ChunkManager.RegisterUser(UserToCacheConverted.id,UserToCacheConverted)


        // === Create Tile ===
        const defaultHeightmapURL = './Tiles/HeightMaps/00.png';
        const defaultTexturemapURL = './Tiles/TextureMaps/00.png';
        const defaultWalkmapURL = './Tiles/WalkMaps/00.png';
        await genTerrain.generateHeightmap(chunkX,chunkY)//function that creates terrain

        const WalkMapLocation=path.join(__dirname,'../Tiles/WalkMaps/')+chunkX.toString()+chunkY.toString()+".png"

        var abstractMapForTile;
        try{abstractMapForTile=await PortalConnectivity(WalkMapLocation,true)
        }catch(eb){console.log("Error in abstract map generation:", eb);}
        
        
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
        const tile = new TileScheme({
            x:chunkX,
            y:chunkY,
            owner: user._id,
            allies: [],
            involvedUsers: [],
            // AbstractMap:convertMapToMongoDoc(abstractMapForTile),
            textures:{
                heightmapUrl: './Tiles/HeightMaps/'+chunkX.toString()+chunkY.toString()+'.png' || defaultHeightmapURL,
                texturemapUrl: './Tiles/TextureMaps/'+chunkX.toString()+chunkY.toString()+'.png' || defaultTexturemapURL,
                WalkMapURL: './Tiles/WalkMaps/'+chunkX.toString()+chunkY.toString()+'.png' || defaultWalkmapURL,
            },
            units: [],
            buildings: []//B_TownHall
        });

        try {
            if(abstractMapForTile){
                const abstractMapDoc= convertMapToMongoDoc(abstractMapForTile);
                const doc = { AbstractMap: abstractMapDoc };

                const size = bson.calculateObjectSize(doc);
                
                console.log('Mongo document size in bytes:', size);

                tile.AbstractMap=abstractMapDoc;
                tile.markModified('AbstractMap');
            }

            await tile.save();
            console.log("✅ Tile saved successfully");
        } catch (err) {
            console.error("❌ Tile save failed:", err);
        }
        res.cookie('refreshToken', refreshToken, { httpOnly: true, secure: true, sameSite: 'Strict' }); // if HTTPS
        res.json({ accessToken,user, success: true, message: 'User recognised'});

    } catch (err) {
        console.log("Error saving user:", err);
        return res.status(400).json({ success: false, message: "Username already exists" });
    }

    console.log("ITS ON REGISTER MAN!!")

    
    
    



    
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

    const passwordMatch = bcrypt.compare(password, user.passwordHash);
    if (!passwordMatch) {
      return res.status(400).json({ success: false, message: 'Incorrect password' });
    }
    
    // Create a JWT token with payload identifying the user
    const accessToken = AccessTokenImport(user)
    const refreshToken = RefreshTokenImport(user)

    // Save refreshToken to user in DB (optional)
    user.refreshTokens.push(refreshToken);
    await user.save();
    
    const UserToCache = await User.findOne({ username });
    const UserToCacheConverted = await toCachedUser(UserToCache)
    await ChunkManager.RegisterUser(UserToCacheConverted.id,UserToCacheConverted)

    console.log("WE LOGGIN IN  MAN!!")
    res.cookie('refreshToken', refreshToken, { httpOnly: true, secure: true, sameSite: 'Strict' }); // if HTTPS
    res.json({ accessToken,user, success: true, message: 'User recognised'});
  } catch (err) {

    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// refresh token route
app.post('/token', async (req, res) => {
    // console.log(req.cookies.refreshToken,"COME ON REFRESH TOKENNNNN")
    const refreshToken = req.cookies.refreshToken;
    if (!refreshToken){
        return res.status(401).json({ message: "No refresh token provided" });
    } 

    try {
        const payload = verifyImport(refreshToken);//jwt.verify(refreshToken, REFRESH_TOKEN_SECRET);

        // Check if refreshToken is still valid (optional)
        const user = await User.findOne({ username: payload.username });
        if (!user || !user.refreshTokens.includes(refreshToken)) {
            return res.status(403).json({ message: "Invalid refresh token" });
        }

        const accessToken = AccessTokenImport(user)//jwt.sign({ username: user.username }, ACCESS_TOKEN_SECRET, { expiresIn: '15m' });

        res.json({ accessToken });
    } catch (err) {
        return res.status(403).json({ message: "Invalid or expired refresh token" });
    }
});



app.get('/tiles', authenticateTokenImport, async (req, res) => {//authenticateToken
  try {
    // const today = getTodayDateString();
    // var rewardrequest = false;

    // console.log("tiles id",req.user.id)
    const user = await User.findOne({ _id: req.user.id });
    // console.log(user)
    if (!user) return res.status(404).json({ message: "User not found" });

    // if (user.lastClaimDate !== today) {rewardrequest = true;}

    const tiles = {
        "owner":await TileScheme.find({ owner: user._id }),
        "allies":await TileScheme.find({ allies: user._id }),
        "involvedUsers":await TileScheme.find({ involvedUsers: user._id })
    }
    // Set of all known tile keys
    const knownTilesSet = new Set();
    for (const category of Object.values(tiles)) {
        for (const tile of category) {
            knownTilesSet.add(`${tile.x},${tile.y}`);
        }
    }
    const deltas = [
        [-1, 0], [1, 0],
        [0, -1], [0, 1],
        [-1, -1], [-1, 1],
        [1, -1], [1, 1],
    ];

    // Find perimeter neighbors
    const neighborCoords = new Set();
    for (const category of Object.values(tiles)) {
        for (const tile of category) {
            for (const [dx, dy] of deltas) {
                const nx = tile.x + dx;
                const ny = tile.y + dy;
                const key = `${nx},${ny}`;
                if (!knownTilesSet.has(key)) {//so if you dont find the 'neighbour' key in keys that are interacted by user
                    neighborCoords.add(key);
                }
            }
        }
    }


    // Fetch the actual tile documents for these perimeter tiles
    const neighborsTiles = await TileScheme.find({
        $or: [...neighborCoords].map(coord => {
            const [x, y] = coord.split(',').map(Number);
            return { x, y };
        })
    });
    tiles["Neighbours"]=neighborsTiles
    
    // await updateOccupancyMap(tiles,user._id.toString())

    //pass tiles into ChunkManager registration, itll spit out the json of those tiles
    const returnDict=await ChunkManager.RegisterChunk(tiles,user._id.toString())
    // console.log(user.OriginTile,"OriginTile")
    res.json({ success: true, tiles: returnDict,OriginTile:user.OriginTile});
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch tiles' });
  }
});


app.get('/Tiles/TextureMaps/{*any}',authenticateTokenImport,async (req, res) => {
    const filePath = req.params; // captures everything after /Tiles/TextureMaps/

    res.status(200).sendFile(path.join(__dirname,'../Tiles/TextureMaps',filePath.any[0]))

});

app.get('/Tiles/HeightMaps/{*any}', authenticateTokenImport, async (req, res) => {
    const filePath = req.params; // captures everything after /Tiles/TextureMaps/
    // console.log('Requested file:', filePath);
    res.status(200).sendFile(path.join(__dirname,'../Tiles/HeightMaps',filePath.any[0]))
    // const fullPath = path.join(__dirname, 'Tiles/TextureMaps', filePath);

    // res.sendFile(fullPath, err => {
    //     if (err) {
    //         console.error(err);
    //         res.status(404).send('File not found');
    //     }
    // });
});

app.get('/Tiles/WalkMaps/{*any}',authenticateTokenImport, async(req, res) => {
    const filePath = req.params; // captures everything after /Tiles/TextureMaps/
    // console.log('Requested file:', filePath);
    res.status(200).sendFile(path.join(__dirname,'../Tiles/WalkMaps',filePath.any[0]))
    // const fullPath = path.join(__dirname, 'Tiles/TextureMaps', filePath);

    // res.sendFile(fullPath, err => {
    //     if (err) {
    //         console.error(err);
    //         res.status(404).send('File not found');
    //     }
    // });
});

app.get('/Assets/Asset_Masks/{*any}',authenticateTokenImport, async(req, res) => {
    const filePath = req.params; // captures everything after /Tiles/TextureMaps/
    // console.log('Requested file:', filePath);
    console.log("ima trying to get a mask rn")
    res.status(200).sendFile(path.join(__dirname,'../Assets/Asset_Masks',filePath.any[0]))
    // const fullPath = path.join(__dirname, 'Tiles/TextureMaps', filePath);

    // res.sendFile(fullPath, err => {
    //     if (err) {
    //         console.error(err);
    //         res.status(404).send('File not found');
    //     }
    // });
});

app.get('/Assets/GLB_Exports/{*any}',authenticateTokenImport, async(req, res) => {
    const filePath = req.params; // captures everything after /Tiles/TextureMaps/
    // console.log('Requested file:', filePath);
    // res.status(200).sendFile(path.join(__dirname,'Tiles/HeightMaps',filePath.any[0]))

    res.sendFile(path.resolve(__dirname,'../Assets/GLB_Exports',filePath.any[0]))

});

app.get('/{*any}',(req,res)=>{//handles urls not the explicitly defined, wanted ones
    res.status(200).send("pluh")
})


async function updateResourceForUser(user){
    // console.log("updating resources for user",user.id,user.Resources.lastUpdated)
    const now = Date.now();
    const elapsedSeconds = (now - user.Resources.lastUpdated.getTime()) / 1000;
    // console.log("elapsedSeconds",elapsedSeconds)

    if (elapsedSeconds <= 0) return user;

    for (const key of ["Gold", "Stone", "Wood", "Political"]) {
        const resource = user.Resources[key];
        if (resource.Rate !== 0) {
            resource.Total += resource.Rate * elapsedSeconds;
        }
    }

    const mp = user.Resources.ManPower;
    if (mp.PopulationRate !== 0) {
        mp.TotalPopulation += mp.PopulationRate * elapsedSeconds;
        if (mp.TotalPopulation > mp.MaxPopulation) {
            mp.TotalPopulation = mp.MaxPopulation;
        }
        mp.TotalManPower = Math.floor(mp.TotalPopulation * mp.RecruitableFactor);
    }
    user.Resources.lastUpdated = new Date(now);
    // await user.save();
    return user;
}

const userSockets = new Map(); // userId -> Set of socket IDs

io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error('No token provided'));

    socketUtilImport(socket,token,next);
});

io.on('connection', (socket) => {

    if (!userSockets.has(socket.userId)) {
        userSockets.set(socket.userId, new Set());
    }
    userSockets.get(socket.userId).add(socket.id);

    socket.on('requestResourceUpdate', async () => {
        // console.log(`Resources requested by player: ${playerId}`);
        try{
            // const user=await User.findOne({ _id: socket.userId })
            const user=await ChunkManager.getUser(socket.userId)
            if(!user) {
                console.log(`No user found for playerId: ${socket.userId}`);
                return;
            }

            await updateResourceForUser(user);
            socket.emit("resourceUpdate", user.Resources);
        }catch(err){
        }

    });

    socket.on('TechnologyTreeRequest', async () => {    
        try{
            // const user=await User.findOne({ _id: socket.userId })
            const user=await ChunkManager.getUser(socket.userId)
            if(!user) {
                console.log(`No user found for playerId: ${socket.userId}`);
                return;
            }

            await updateResourceForUser(user);
            socket.emit("TechnologyTreeResponse", user.Technology);
        }catch(err){
        }
    });

    socket.on('requestRewards',  async () => {
        const today = getTodayDateString();
        const user=await ChunkManager.getUser(socket.userId)
        if (!user) {
            console.log(`No user found for playerId: ${socket.userId}`);
            return;
        }
        if (user.lastClaimDate !== today) {  
            const rewardToSend= calculateReward(user)
            socket.emit('rewardUpdate', rewardToSend);

            user.lastClaimDate = today;
        }
        // User.findOne({ _id: socket.userId }).then(user => {
        //     if (!user) {
        //         console.log(`No user found for playerId: ${socket.userId}`);
        //         return;
        //     }
        //     const today = getTodayDateString();
        //     if (user.lastClaimDate !== today) {  
        //         const rewardToSend= calculateReward(user)
        //         socket.emit('rewardUpdate', rewardToSend);

        //         user.lastClaimDate = today;
        //         user.save().then(() => {
        //             // console.log("User's last claim date updated successfully.");
        //         }).catch(err => {
        //             console.error("Error updating user's last claim date:", err);
        //         });
        //     }else{
        //         socket.emit('rewardUpdate', false);
        //     }
        // }).catch(err => {
        //     console.error("Error fetching user:", err);
        // });
    })

    socket.on('BuildingPlacementRequest',async ({RequestMetaData}) =>{//BuildingAssetName,
        //response should be which asset, 
        // a valid coordinate for the position since height is actually gpu rendered its not real
        //rotation
        //which tile
        //any other stats like health etc
        
        //takes in imagelocation for mask (for the building) and walkMaplocation for the tile
        const BuildingAssetName=RequestMetaData.UnitType
        const tileX=RequestMetaData.tile[0].toString();
        const tileY=RequestMetaData.tile[1].toString();
        
        const MaskLocation=path.join(__dirname,'../Assets/Asset_Masks/')+BuildingAssetName+"_Mask.png"
        const WalkMapLocation=path.join(__dirname,'../Tiles/WalkMaps/')+tileX+tileY+".png"

        const passIn={
            "position":RequestMetaData.position,
            "rotation":RequestMetaData.rotation,
        }
        const permission=await SharpImgBuildingPlacementVerification(MaskLocation,WalkMapLocation,passIn)
        var position;
        var ServerIdProvided;
        if(permission){
            const HeighMapLocation=path.join(__dirname,'../Tiles/HeightMaps/')+tileX+tileY+".png"
            position=await getPosWithHeight(RequestMetaData.position,HeighMapLocation);

            //lookup the tile 
            // const tile = await TileScheme.findOne({x: RequestMetaData.tile[0],y: RequestMetaData.tile[1]});//owner: user._id });
            const tile = await ChunkManager.getTile(RequestMetaData.tile[0],RequestMetaData.tile[1]);
            console.log("TILE TARGET", tile.x,tile.y,"topindice",tile.topIndice)
            if(tile.freeIndices.length>0){
                ServerIdProvided=tile.freeIndices.shift();//pops first element in array
            }else{
                ServerIdProvided=tile.topIndice
                tile.topIndice+=1
            }
            // tile.save()
        
        }
        console.log("what the hell come on:", ServerIdProvided)
        const responseObject={
            "permission":permission,
            "position":position,//RequestMetaData.position,
            "rotation":RequestMetaData.rotation,
            "UnitType":RequestMetaData.UnitType,
            "health":100,
            "owner":RequestMetaData.userOwner,
            "tile":[tileX,tileY],
            // "AssetName":BuildingAssetName,
            "AssetClass":"Building",
            "ServerId":ServerIdProvided
        }

        socket.emit('CanYouPlaceBuilding', responseObject);
    })

    socket.on('UnitDeploymentPositionRequest',async ({RequestMetaData}) => {

        const userId=socket.userId
        const passIn=RequestMetaData.position//need to localise for the tile
        
        const TheUser = await ChunkManager.getUser(userId)//User.findOne({ _id: userId });
        console.log(TheUser.OriginTile,"OriginTile")
        const values=await IdentifySpecificChunkPoint(TheUser.OriginTile,passIn)
        // console.log("wonder what ill get",values.chunkCoords,values.pixelCoords)
        
        const tileX=values.chunkCoords[0]
        const tileY=values.chunkCoords[1]
        const WalkMapLocation=path.join(__dirname,'../Tiles/WalkMaps/')+tileX+tileY+".png"

        const permission=await PointPlacementVerification(values.pixelCoords,WalkMapLocation)
        // console.log("new confirm func",permission,WalkMapLocation)

        var position;
        if(permission){
            const HeighMapLocation=path.join(__dirname,'../Tiles/HeightMaps/')+tileX+tileY+".png"
            position=await getPosWithHeight(RequestMetaData.position,HeighMapLocation);
            const responseObject={
                "permission":permission,
                "position":position,
                "tile":values.chunkCoords,
                "owner":userId,
            }
            socket.emit('CanYouDeployHere', responseObject);
        }else{socket.emit('CanYouDeployHere', {"permission":permission});}

    })

    socket.on('testing',async () => {//relevant to seeing if the abstractMap code worked
        // const WalkMapLocation=path.join(__dirname,'../Tiles/WalkMaps/')+"0"+"0"+".png"
        socket.emit('testingResponse', "hello");
        // PortalConnectivity(WalkMapLocation)
    });

    socket.on('DeployAllUnits',async ({RequestMetaData}) => {
        const userId=socket.userId
        var chosenServerIndices=[];
        
        // const TheUser = await User.findOne({ _id: userId });
        const TheUser = await ChunkManager.getUser(userId)
        const values=await IdentifySpecificChunkPoint(TheUser.OriginTile,RequestMetaData.DeployPosition)
        const chunkX=values.chunkCoords[0]
        const chunkY=values.chunkCoords[1]

        // const tile = await TileScheme.findOne({x: chunkX,y: chunkY});
        const tile = await ChunkManager.getTile(chunkX,chunkY);
        
        // var tileFreeIndices=tile.freeIndices
        // var TileTopIndice=tile.topIndice
        // const compositeKey=`${userId},${RequestMetaData.UnitType}`
        
        for(let i=0;i<RequestMetaData.UnitCount;i++){
            if(tile.freeIndices.length>0){
                // console.log(tileFreeIndices,"FREE INDICES!")
                const freeIndice=tile.freeIndices.shift().toString();//pops first element in array

                updatePixelLocAndOcc(chunkX,chunkY,freeIndice,RequestMetaData.UnitType,values.pixelCoords,userId)

                //add to chosenServerIndices to notify user of development
                chosenServerIndices.push(freeIndice)
            }else{

                updatePixelLocAndOcc(chunkX,chunkY,tile.topIndice,RequestMetaData.UnitType,values.pixelCoords,userId)
                //add to chosenServerIndices to notify user of development
                chosenServerIndices.push(tile.topIndice)
                tile.topIndice+=1
            }
                 
        }
        // tile.freeIndices=tileFreeIndices
        // tile.topIndice=TileTopIndice
        // tile.save()
        // console.log("chosen....",chosenServerIndices)

        // console.log("deploying units in pixel",values.pixelCoords)
        const responseObject={
            "AssetClass":"Unit",
            "position":values.pixelCoords,//RequestMetaData.DeployPosition,
            "UnitType":RequestMetaData.UnitType,
            "tile":values.chunkCoords,
            "UnitCount":RequestMetaData.UnitCount,
            "owner":userId,
            "ServerIds":chosenServerIndices
        }
        socket.emit('DeployAllUnitsHere', responseObject);
    });

    socket.on('MovementCommand',async ({RequestMetaData}) => {
        // console.log(RequestMetaData)//.SelectedUnits.Unit)
        const userId=socket.userId
        const TheUser = await ChunkManager.getUser(userId)//await User.findOne({ _id: userId });
        
        const destinationPoint=RequestMetaData.position
        const TargetTileXY=RequestMetaData.TargetTile
        const UserIdCommandee=RequestMetaData.userOwner
        const selectedUnits=RequestMetaData.SelectedUnits
        // console.log("selectedUnits",selectedUnits["Unit"])
        //need to verify that the RequestMetaData.UserOwner (one commanding) shares Id of owner of unit of serverID
        // const response=await validateUnitOwnership(selectedUnits,UserIdCommandee)
        const CHEATER=await validateUnitOwnershipTwo(selectedUnits["Unit"],UserIdCommandee)
        // const CHEATER=response
        // const originTiles=response[1]
        
        if(CHEATER){
            //perform kicking and ban basically, manipulating info is egregious offense
        }
        //otherwise yay continue

        //the only thing valid is Unit assetClass so youre literally passing in
        // console.log(selectedUnits["Unit"],"pass in object")
        //of form tile->{unittype ->{serverIds:[] }}


        const values=await IdentifySpecificChunkPoint(TheUser.OriginTile,destinationPoint)
        
        new MovementOrderClass(selectedUnits["Unit"],values.pixelCoords,values.chunkCoords,userId)
        // await newOrder.calculateMedian();
        // const cheapestPortal=await newOrder.getClosestAccessiblePortal()
        // console.log("huh?", cheapestPortal)
        // const pathnodesCentral=await newOrder.PathFromStartPortalToEndSubgrid(cheapestPortal)
        // await newOrder.getCombinedSubgridsDataForPath(pathnodesCentral)
        // await newOrder.orderSetup()

        const responseObject={
            hello:"hello"
        }
        socket.emit('MovementCommandResponse',responseObject);
    });

    // Handle disconnect
    socket.on("disconnect", () => {
        const sockets = userSockets.get(socket.userId);
        if (sockets) {
            sockets.delete(socket.id);
            if (sockets.size === 0) userSockets.delete(socket.userId);
        }
    });
});


const TICK_RATE = (1000 / 60)/3; // 20 ticks per second

async function gameTick() {

    // for (const [socketId, socket] of io.sockets.sockets) {
    //     const playerId = socket.userId;
    //     const visibleUnits = getUnitsForPlayer(playerId); // however you track this
    //     socket.emit('TickUpdate', visibleUnits);
    // }
    await ProgressOrders();

    
    //get the messages, go through it 
    const messages=await getTheMessage()
    // console.log("hi?",messages)
    for (const [userIdent, TheirMessage] of messages) {
        const TheirSocket=userSockets.get(userIdent)

        // if(TheirMessage.replacements){
        //     console.log("its here man......")

        // }
        // console.log("TheirMessage",TheirMessage,TheirSocket)
        // const iterator = TheirSocket.values();
        for (const value of TheirSocket) {
            // console.log(value);
            io.to(value).emit('TickUpdate', TheirMessage);
        }
        
        await killEntry(userIdent)
    }

}

setInterval(gameTick, TICK_RATE);