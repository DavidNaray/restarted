const http = require('http');
const express=require("express");
const path = require('path')
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const { Console } = require('console');
const mongoose = require('mongoose');
const cookieParser = require('cookie-parser');

const {authenticateTokenImport,RefreshTokenImport,AccessTokenImport,verifyImport,socketUtilImport}=require("./modules/Verification")
const {SharpImgBuildingPlacementVerification,getPosWithHeight,BuildingPlacement}=require("./modules/PlacementValidation.js")

const {HandleReg}=require("./modules/RegistrationLogin/HandleReg.js")
const {HandleLogin}=require("./modules/RegistrationLogin/HandleLogin.js")
const {HandleTiles}=require("./modules/TilesAndTextures/HandleTiles.js")
const {validateclickedPoint,SpecificChunkPoint}=require("./modules/Verification/Positioning.js")
const {ProgressOrders}=require("./modules/UnitsAndMovement/OrderTracking.js")
const {LoginRewardCheckup}=require("./modules/TilesAndTextures/LoginRewards.js")

const ChunkManager=require("./modules/CacheChunkInfo.js")
const TickManager=require("./modules/TickManager.js")
const MovementOrderClass=require("./modules/MovementOrderClass.js")


const userSchemaImport=require("./Schemas/User")
const TemplateSchemaImport=require("./Schemas/Template")
const mongoDB="mongodb://localhost:27017/firstEver"

mongoose.connect(mongoDB).then(()=>{console.log("successfully connected to mongoDB")})
const User = mongoose.model('User', userSchemaImport)
const TemplateScheme = mongoose.model('Templates', TemplateSchemaImport)

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

server.listen(PORT,()=>{console.log("listening to port 5000")})

app.use(express.static("./staticResources"))
app.use(express.static("./staticResources/JS_Externals"))
app.use(cookieParser());
app.use(express.json()); // <-- This must come BEFORE your POST route handlers

app.get("/homepage",(req,res)=>{
    res.status(200).sendFile(path.join(__dirname,'../sitePages/Homepage.html'))
})

app.get("/play",(req,res)=>{
    res.status(200).sendFile(path.join(__dirname,'../sitePages/index.html'))
})

app.post('/Register-user', async (req, res) => {
  const { username,password } = req.body;

  const toReturn=await HandleReg(ChunkManager,User,username,password);

  if(toReturn =="ServerFail"){
    res.status(500).json({ success: false, message: "server failure" });
  }
  else if(toReturn =="ExistsUser"){
    return res.status(400).json({ success: false, message: 'Username already exists' });
  }
  else{
    const AccessToken=toReturn["AT"];
    const RefreshToken=toReturn["RT"];
    const user=toReturn["user"];
    res.cookie('refreshToken', RefreshToken, { httpOnly: true, secure: true, sameSite: 'Strict' });
    res.json({ AccessToken ,user, success: true, message: 'User recognised'});
  }
});

app.post('/Login-user', async (req, res) => {
  const { username,password } = req.body;

  const toReturn=await HandleLogin(ChunkManager,User,username,password);

  if(toReturn == "NoUser"){
    return res.status(400).json({ success: false, message: 'User not found' });
  }
  else if(toReturn =="WrongPass"){
    return res.status(400).json({ success: false, message: 'Incorrect password' });
  }
  else if(toReturn =="ServerFail"){
    res.status(500).json({ success: false, message: 'Server error' });
  }
  else{
    const AccessToken=toReturn["AT"];
    const RefreshToken=toReturn["RT"];
    const user=toReturn["user"];
    res.cookie('refreshToken', RefreshToken, { httpOnly: true, secure: true, sameSite: 'Strict' });
    res.json({ AccessToken ,user, success: true, message: 'User recognised'});
  }

});

// refresh token route
app.post('/token', async (req, res) => {


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

    const Returned=await HandleTiles(User,ChunkManager,req.user.id);

    if(Returned=="NoUser"){
        res.status(404).json({ message: "User not found" });
    }

    else if(Returned=="ERRORTiles"){
        res.status(500).json({ success: false, message: 'Failed to fetch tiles' })
    }
    
    else{
        const ogTile=Returned["OGTile"]
        const returnDict=Returned["returnDict"]
        res.json({ success: true, tiles: returnDict,OriginTile:ogTile});
    }

});


app.get('/Tiles/TextureMaps/{*any}',authenticateTokenImport,async (req, res) => {
    const filePath = req.params; // captures everything after /Tiles/TextureMaps/

    res.status(200).sendFile(path.join(__dirname,'../Tiles/TextureMaps',filePath.any[0]))

});

app.get('/Tiles/HeightMaps/{*any}', authenticateTokenImport, async (req, res) => {
    const filePath = req.params; // captures everything after /Tiles/TextureMaps/
    res.status(200).sendFile(path.join(__dirname,'../Tiles/HeightMaps',filePath.any[0]))
});

app.get('/Tiles/WalkMaps/{*any}',authenticateTokenImport, async(req, res) => {
    const filePath = req.params; // captures everything after /Tiles/TextureMaps/

    res.status(200).sendFile(path.join(__dirname,'../Tiles/WalkMaps',filePath.any[0]))
});

app.get('/Assets/Asset_Masks/{*any}',authenticateTokenImport, async(req, res) => {
    const filePath = req.params; // captures everything after /Tiles/TextureMaps/

    res.status(200).sendFile(path.join(__dirname,'../Assets/Asset_Masks',filePath.any[0]))

});

app.get('/Assets/GLB_Exports/{*any}', async(req, res) => {
    const filePath = req.params; // captures everything after /Tiles/TextureMaps/

    res.sendFile(path.resolve(__dirname,'../Assets/GLB_Exports',filePath.any[0]))

});

app.get('/{*any}',(req,res)=>{//handles urls not the explicitly defined, wanted ones
    res.status(200).send("pluh")
})


io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error('No token provided'));

    socketUtilImport(socket,token,next);
});

io.on('connection', async (socket) => {

    //Track their socket
    ChunkManager.setUserSocket(socket.userId,socket.id)
    //see if they need a Daily Login reward
    await LoginRewardCheckup(socket.userId)
    await TickManager.TechTreeMessage(socket.userId);
    await TickManager.RecruitableMessage(socket.userId);

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
            const values= SpecificChunkPoint(user.OriginTile,RequestMetaData.position)
            
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
        
        const TheUser = await ChunkManager.getUser(userId)

        const values= SpecificChunkPoint(TheUser.OriginTile,passIn);
        const response= validateclickedPoint(values.pixelCoords,values.chunkCoords)

        if(response=="ValidPoint"){
            const tileX=values.chunkCoords[0]
            const tileY=values.chunkCoords[1]
            const HeighMapLocation=path.join(__dirname,'../Tiles/HeightMaps/')+tileX+tileY+".png"

            const position=await getPosWithHeight(RequestMetaData.position,HeighMapLocation);

            const responseObject={
                "permission":true,
                "position":position,
                "tile":values.chunkCoords,
                "owner":userId,
            }
            TickManager.DeployPositionPermissionMessage(userId,responseObject);
            // socket.emit('CanYouDeployHere', responseObject);
        }
        else{TickManager.DeployPositionPermissionMessage(userId,{"permission":false});}
            // socket.emit('CanYouDeployHere', {"permission":false});}


    })

    socket.on('DeployAllUnits',async ({RequestMetaData}) => {
        const userId=socket.userId
        var chosenServerIndices=[];
        const UnitType=RequestMetaData.UnitType;
        
        const TheUser = await ChunkManager.getUser(userId)
        const values= SpecificChunkPoint(TheUser.OriginTile,RequestMetaData.DeployPosition);

        const chunkX=values.chunkCoords[0]
        const chunkY=values.chunkCoords[1]
        const tile = await ChunkManager.getTile(chunkX,chunkY);
        const tileKey=`${chunkX},${chunkY}`
        
        for(let i=0;i<RequestMetaData.UnitCount;i++){
            if(tile.freeIndices.length>0){
                const freeIndice=tile.freeIndices.shift().toString();//pops first element in array

                ChunkManager.AddUnitToTile(tileKey,values.pixelCoords,freeIndice,userId,UnitType,null)

                //add to chosenServerIndices to notify user of development
                chosenServerIndices.push(freeIndice)
            }else{

                //add to chosenServerIndices to notify user of development
                ChunkManager.AddUnitToTile(tileKey,values.pixelCoords,tile.topIndice,userId,UnitType,null)
                chosenServerIndices.push(tile.topIndice)
                
                tile.topIndice+=1
            }
                 
        }

        const responseObject={
            "AssetClass":"Unit",
            "position":values.pixelCoords,//RequestMetaData.DeployPosition,
            "UnitType":RequestMetaData.UnitType,
            "tile":values.chunkCoords,
            "UnitCount":RequestMetaData.UnitCount,
            "owner":userId,
            "ServerIds":chosenServerIndices
        }

        TickManager.DeploymentMessage(tileKey,responseObject)
    });


    socket.on('MovementCommand',async ({RequestMetaData}) => {
        const userId=socket.userId
        const TheUser = await ChunkManager.getUser(userId)

        const destinationPoint=RequestMetaData.position
        const selectedUnits=RequestMetaData.SelectedUnits

        //chunkID -> serverIds
        const ActualUnits=selectedUnits

        // const CHEATER=//confirm unit ownership

        // if(CHEATER){
        //     //perform kicking and ban basically, manipulating info is egregious offense
        // }
        
        const Values= SpecificChunkPoint(TheUser.OriginTile,destinationPoint);
        const response= validateclickedPoint(Values.pixelCoords,Values.chunkCoords)
        if(response=="ValidPoint"){
            
            const obj=new MovementOrderClass(ActualUnits,Values,userId)
            await obj.orderSetup();
        }
    });

    socket.on('NewTraining',async ({RequestMetaData}) => {
        const userId=socket.userId
        const TheUser = await ChunkManager.getUser(userId)
        const UnitType=RequestMetaData

        //create the Regimen
        const Rid=ChunkManager.CreateNewRegimen(userId,UnitType)

        TickManager.NewRegimenMessage(userId,Rid,UnitType)
    });

    socket.on('AdjustRegimen',async ({RequestMetaData}) => {
        const userId=socket.userId
        const TheUser = await ChunkManager.getUser(userId)
        console.log("bruh",RequestMetaData)
        const direction=RequestMetaData.UpDown
        const Rid=RequestMetaData.Rid

        TickManager.Adjustregimentcounts(userId,Rid,direction)
    });

    socket.on('DestroyRegimen',async ({RequestMetaData}) => {
        const userId=socket.userId
        const TheUser = await ChunkManager.getUser(userId)
        const Rid=RequestMetaData

        TickManager.DestroyRegimen(userId,Rid)
    });
    

    // Handle disconnect
    socket.on("disconnect", () => {ChunkManager.RemoveUserSocket(socket.userId,socket.id)});
});


async function gameTick() {

    await ProgressOrders();//MovementOrders
    
    const messages=TickManager.GetMessages()

    for (const [userId, Message] of messages) {
        // const TheirSocket=userSockets.get(userId)
        const TheirSocket=ChunkManager.getUserSockets(userId)
        
        try{
            for (const value of TheirSocket) {
                io.to(value).emit('TickUpdate', Message);
            }
        }catch(nosoc){console.log("no socket?",nosoc)}
    }
    TickManager.ClearMessages()
}

setInterval(gameTick, TickManager.GetTickRate());
setInterval(TickManager.ResourceMessage.bind(TickManager), TickManager.GetResourceTickRate());