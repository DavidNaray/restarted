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
const {PointPlacementVerification,IdentifySpecificChunkPoint,SharpImgBuildingPlacementVerification,getPosWithHeight,BuildingPlacement}=require("./modules/PlacementValidation.js")
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
        try{abstractMapForTile=await PortalConnectivity(WalkMapLocation)//,true)
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

            // await updateResourceForUser(user);
            socket.emit("TechnologyTreeResponse", user.Technology);
        }catch(err){
        }
    });

    socket.on('ConstructionSetupRequest', async () => { 
        const validBuilings = new Set([
            "CivilianFactory", "MilitaryFactory", "Farm", "Quarry", "LumberMill",
            "Barracks", "Market", "TownHall", "Warehouse","WoodHouse","StoneHouse",
            "WoodenKeep", "StoneKeep", "WoodenTower", "StoneTower","WoodWall",
            "StoneWall","Pavement","WoodGate","StoneGate"
        ]);
        try{
            // const user=await User.findOne({ _id: socket.userId })
            const user=await ChunkManager.getUser(socket.userId)
            if(!user) {
                console.log(`No user found for playerId: ${socket.userId}`);
                return;
            }
            const toSend=[];
            for (let key in user.Technology) {
                if (validBuilings.has(key) && user.Technology[key].Unlocked) {
                    // user.Technology[key].Unlocked = true; // Set Unlocked to true
                    toSend.push(key);
                } else {}
            }
            
            socket.emit("ConstructionSetupResponse", {Buildings:toSend,MilCount:user.ProductionLines.Total,CivCount:user.ProductionLines.TotalCiv});
        }catch(err){
        }

    });

    socket.on('ProductionSetupRequest',async() => {
        const validToProduce=new Set([
            "Bows","Swords","Shields","Spears","LeatherArmour","BatteringRam",
            "WagonFort","ChainArmour","PlateArmour","Crossbows","Trebuchet","Catapult",
            "Ballista"
        ])
        try{
            // const user=await User.findOne({ _id: socket.userId })
            const user=await ChunkManager.getUser(socket.userId)
            if(!user) {
                console.log(`No user found for playerId: ${socket.userId}`);
                return;
            }
            const toSend=[];
            for (let key in user.Technology) {
                if (validToProduce.has(key) && user.Technology[key].Unlocked) {
                    // user.Technology[key].Unlocked = true; // Set Unlocked to true
                    toSend.push(key);
                } else {}
            }
            // await updateResourceForUser(user);
            // console.log("ProductionSetupResponse",toSend)
            socket.emit("ProductionSetupResponse", {ProductionLines:user.ProductionLines,Products:toSend});
        }catch(err){
        }
    });

    socket.on('requestProductionLine',async ({RequestMetaData}) =>{
        try{
            // const user=await User.findOne({ _id: socket.userId })
            const user=await ChunkManager.getUser(socket.userId)
            if(!user) {
                console.log(`No user found for playerId: ${socket.userId}`);
                return;
            }
            const freeLines=user.ProductionLines.Free
            if(freeLines>0){
                const newFreeLines=freeLines-1
                // console.log(RequestMetaData)
                var AssignedTopBlock
                if(user.ProductBlocks.FreeBlocks.length>0){
                    AssignedTopBlock=user.ProductBlocks.FreeBlocks.pop()
                }else{AssignedTopBlock=user.ProductBlocks.TopBlock}
                
                var InventoryRecord;
                try{
                    InventoryRecord =user.Inventory[`${RequestMetaData}`]
                    if(InventoryRecord==undefined){
                        // console.log("^_^")
                        InventoryRecord={Total:0}
                        user.Inventory[`${RequestMetaData}`]={Total:0,lastUpdated:new Date()}
                    }
                }catch(sad){}
               
                // if(!InventoryRecord){
                //     InventoryRecord={Total:0}
                //     user.Inventory[item]={Total:0,lastUpdated:new Date()}
                // }
                // console.log("InventoryRecord",InventoryRecord)
                const Rate=user.Technology[RequestMetaData].Rate
                socket.emit("ProductionResponse", {FreeLines:newFreeLines,Item:RequestMetaData,blockId:AssignedTopBlock,Rate:Rate,Storage:InventoryRecord.Total});
                user.ProductionLines.Free=newFreeLines
                user.ProductBlocks.Values[AssignedTopBlock]={FactoryCount:1,MultiplierFactor:1,ItemProduced:RequestMetaData}
                user.ProductBlocks.TopBlock+=1
            }else{
                // console.log("no more lines bro")
                socket.emit("ProductionResponse", false);
            }
            // await updateResourceForUser(user);
            // console.log("ProductionSetupResponse",toSend)
            
        }catch(err){
        }

    });

    socket.on('ChangeFactoryCountForProd',async ({RequestMetaData}) =>{
        // console.log("uh....",RequestMetaData)
        try{
            const user=await ChunkManager.getUser(socket.userId)
            if(!user) {
                console.log(`No user found for playerId: ${socket.userId}`);
                return;
            }
            const row=RequestMetaData.row
            const column=RequestMetaData.column
            const blockId=RequestMetaData.blockId

            const concernedLine=user.ProductBlocks.Values[`${blockId}`]
            const requestedFactories=((row-1)*5 +column)*concernedLine.MultiplierFactor
            
            const freeLines=user.ProductionLines.Free + user.ProductBlocks.Values[`${blockId}`].FactoryCount
            
            //min free factories of 0
            //because were recalculating the number of factories, we give back the current factories on the prod line back to free
            //then subtract what is requested from that, so if request 30 but only have 20 free, 20 - max(0,-10)=20
            
            user.ProductionLines.Free=Math.max(0,freeLines - requestedFactories)
            user.ProductBlocks.Values[`${blockId}`].FactoryCount=freeLines - Math.max(0,freeLines - requestedFactories)
            
            const newFreeLines=user.ProductionLines.Free
            const FacCount=user.ProductBlocks.Values[blockId].FactoryCount

            const ItemProduced=user.ProductBlocks.Values[`${blockId}`].ItemProduced
            const Rate=FacCount*user.Technology[`${ItemProduced}`].Rate

            const visualRow=Math.floor((user.ProductBlocks.Values[blockId].FactoryCount/concernedLine.MultiplierFactor) /5)+1
            const visualCol=Math.ceil(user.ProductBlocks.Values[blockId].FactoryCount/concernedLine.MultiplierFactor) %5
            socket.emit("ChangeFactoryCountForProdResponse", {FreeLines:newFreeLines,blockId:blockId,FactoryCount:FacCount,row:visualRow,column:visualCol,Rate:Rate});
        }catch(p){}
    });

    socket.on('CloseProductionLine',async ({RequestMetaData}) =>{
        try{
            const user=await ChunkManager.getUser(socket.userId)
            if(!user) {
                console.log(`No user found for playerId: ${socket.userId}`);
                return;
            }
            const blockId=RequestMetaData.blockId
            if(blockId==user.ProductBlocks.TopBlock -1){
                user.ProductBlocks.TopBlock -=1
            }else{
                user.ProductBlocks.FreeBlocks.push(blockId)
            }
            const freeLines=user.ProductionLines.Free + user.ProductBlocks.Values[`${blockId}`].FactoryCount
            user.ProductionLines.Free=freeLines

            user.Inventory[`${user.ProductBlocks.Values[`${blockId}`].ItemProduced}`].lastUpdated=null
            delete user.ProductBlocks.Values[`${blockId}`]

            socket.emit("closeProdLine", {Remove:blockId,FreeLines:freeLines});

        }catch(p){}
    });

    socket.on('requestingProductionInventory',async ()=>{
        // console.log("yo")
        try{
            // const user=await User.findOne({ _id: socket.userId })
            const user=await ChunkManager.getUser(socket.userId)
            if(!user) {
                console.log(`No user found for playerId: ${socket.userId}`);
                return;
            }

            const toReturn={}
            const ProductionLines=user.ProductBlocks.Values
            // console.log("before erm?",ProductionLines)
            for(const [ProductLineNumber, values] of Object.entries(ProductionLines)){
                // console.log(ProductLineNumber,values)
                
                const item=values.ItemProduced
                if(toReturn[item]){
                    // console.log("stright away? or no...",toReturn)
                    toReturn[item].blocks.push(ProductLineNumber)
                    continue
                }
                // console.log("dying here?")
                const FactoryCount=values.FactoryCount
                const Rate=user.Technology[item].Rate//rate is in days
                // console.log("what about dying here?",user.Inventory)
                var lastUpdated=new Date(user.Inventory[`${item}`].lastUpdated || Date.now());//user.Inventory[item].lastUpdated
                // if(!InventoryRecord){InventoryRecord={Total:0,lastUpdated:new Date()}}
                // console.log("lastUpdated",lastUpdated)
                const TimeNow= new Date()

                const TimeDifferenceDays=((((TimeNow-lastUpdated)/1000)/60)/60)/24 //for seconds / minutes/ hours/days
                // console.log("TimeDifferenceDays",TimeDifferenceDays)
                const productionPerDay=FactoryCount*Rate
                const AmountProduced=productionPerDay*TimeDifferenceDays

                const cutOffAmount=Math.floor(AmountProduced)
                if(cutOffAmount>0){
                    const timeForCutOffAmountDays = cutOffAmount / productionPerDay;
                    const timeForCutOffAmountMilli = timeForCutOffAmountDays * 24 * 60 * 60 * 1000;

                    const ToSetLastUpdated = new Date(lastUpdated.getTime() + timeForCutOffAmountMilli);

                    user.Inventory[item].Total += cutOffAmount;
                    user.Inventory[item].lastUpdated = ToSetLastUpdated;
                    
                    toReturn[item]={blocks:[ProductLineNumber],value:user.Inventory[item].Total}
                }else{}

            }
            // console.log("erm?")
            socket.emit("ProductionInventoryUpdate", toReturn)
        }catch(p){}
    })

    socket.on('ChangeFactoryScaleForProd',async ({RequestMetaData}) =>{
        try{
            const user=await ChunkManager.getUser(socket.userId)
            if(!user) {
                console.log(`No user found for playerId: ${socket.userId}`);
                return;
            }
            const Scale=Number(RequestMetaData.Scale)
            const TargetBlock=user.ProductBlocks.Values[`${RequestMetaData.blockId}`]
            TargetBlock.MultiplierFactor=Scale

            const WholeCover=Math.floor(TargetBlock.FactoryCount/Scale)
            const Partial=TargetBlock.FactoryCount%Scale

            const VisRows=Math.floor((WholeCover)/5)+1
            const VisCol=(Math.ceil(TargetBlock.FactoryCount/Scale))%5
            if(Partial>0){
                socket.emit(
                    "ChangeFactoryScaleForProdResponse", 
                    {blockId:RequestMetaData.blockId,Scale:Scale,Partial:Partial,row:VisRows,column:VisCol}
                )
            }else{
                socket.emit(
                    "ChangeFactoryScaleForProdResponse", 
                    {blockId:RequestMetaData.blockId,Scale:Scale,row:VisRows,column:VisCol}
                )
            }
        }catch(p){}
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

    })

    socket.on('StopConstruction',async ({RequestMetaData}) =>{
        try{
            const user=await ChunkManager.getUser(socket.userId)
            if(!user) {
                console.log(`No user found for playerId: ${socket.userId}`);
                return;
            }
            const key=`${RequestMetaData.chunk[0]},${RequestMetaData.chunk[1]},${RequestMetaData.ServerId}`

            delete user.Construction.Values[key]

            socket.emit("removeConstResponse", RequestMetaData)

        }catch(p){}
    });

    socket.on('BuildingPlacementRequest',async ({RequestMetaData}) =>{//BuildingAssetName,
        // console.log("BuildingPlacementRequest",RequestMetaData)
        try{
            const user=await ChunkManager.getUser(socket.userId)
            if(!user) {
                console.log(`No user found for playerId: ${socket.userId}`);
                return;
            }
            const values=await IdentifySpecificChunkPoint(user.OriginTile,RequestMetaData.position)
            
            const buildingToPlace=RequestMetaData.BuildingType
            const Rotation=RequestMetaData.rotation
            const pixelPoint=values.pixelCoords
            const ChunkPlaced=values.chunkCoords

            const uniqueOpts=["Farm","Pavement"]
            var placementResponse;
            if(!uniqueOpts.includes(buildingToPlace)){
                placementResponse=await BuildingPlacement(buildingToPlace,{pixel:pixelPoint,chunk:ChunkPlaced,rotation:Rotation})
            }else{

            }
            if(placementResponse.success){
                var chosenServerIndice;
                const tile = await ChunkManager.getTile(ChunkPlaced[0],ChunkPlaced[1]);

                if(tile.freeIndices.length>0){
                    const freeIndice=tile.freeIndices.pop().toString();
                    chosenServerIndice.push(freeIndice)
                }else{
                    chosenServerIndice=tile.topIndice
                    tile.topIndice+=1
                }
                var buildit=false
                if(chosenServerIndice>0){
                    buildit=false
                }

                if(buildit){
                    switch(buildingToPlace){
                        case "MilitaryFactory":
                            user.ProductionLines.Total+=1
                            socket.emit("FactoryCountsUpdate", {Mil:user.ProductionLines.Total})
                            break;
                        case "CivilianFactory":
                            user.ProductionLines.TotalCiv+=1
                            socket.emit("FactoryCountsUpdate", {Civ:user.ProductionLines.TotalCiv})
                            break;
                        default:
                            break;
                    }
                }else{
                    const identifier=`${ChunkPlaced[0]},${ChunkPlaced[1]},${chosenServerIndice}`
                    const setter={
                        start:Date.now(),
                        finish:Date.now(),
                    }

                    user.Construction.Values[identifier]=setter
                }
                const responseObject={
                    "position":{chunk:ChunkPlaced,pixel:pixelPoint},//RequestMetaData.position,
                    "rotation":Rotation,
                    "BuildingType":buildingToPlace,
                    "ServerId":chosenServerIndice,
                    "underConstruction":buildit
                }

                socket.emit('CanYouPlaceBuilding', responseObject)

            }else{
                socket.emit('CanYouPlaceBuilding', {reason:placementResponse.reason,at:placementResponse.at})
            }

        }catch(p){socket.emit('CanYouPlaceBuilding', false)}
        // socket.emit('CanYouPlaceBuilding', false)//responseObject);
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