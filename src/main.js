const http = require('http');
const express=require("express");
const path = require('path')
const { Server } = require('socket.io');

const cookieParser = require('cookie-parser');
const bcrypt = require('bcrypt');


const Coordfinder=require("./modules/NextChunkCoord")
const genTerrain=require("./modules/TerrainGeneration")
const userSchemaImport=require("./Schemas/User")
const TileSchemaImport=require("./Schemas/Tile")
const TemplateSchemaImport=require("./Schemas/Template")

const {authenticateTokenImport,RefreshTokenImport,AccessTokenImport,verifyImport,socketUtilImport}=require("./modules/Verification")
const {SharpImgBuildingPlacementVerification,SharpImgPointVerification,getPosWithHeight}=require("./modules/PlacementValidation.js")
const {PortalConnectivity}=require("./modules/PathfindingFunctionality.js")

const mongoose = require('mongoose');
const { Console } = require('console');
const mongoDB="mongodb://localhost:27017/firstEver"
mongoose.connect(mongoDB).then(()=>{console.log("successfully connected to mongoDB")})

const User = mongoose.model('User', userSchemaImport)
const TemplateScheme = mongoose.model('Templates', TemplateSchemaImport)
const TileScheme = mongoose.model('Tiles', TileSchemaImport)

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
    await user.save();

    // === Create Tile ===

    // console.log(Coordfinder.GiveMeNextCoordAndSetState(), "COORDS BABAY")
    const defaultHeightmapURL = './Tiles/HeightMaps/00.png';
    const defaultTexturemapURL = './Tiles/TextureMaps/00.png';
    const defaultWalkmapURL = './Tiles/WalkMaps/00.png';

    //run the terrain generation function with the coords
    const pos=Coordfinder.GiveMeNextCoordAndSetState()
    const chunkX=pos[0];
    const chunkY=pos[1];
    // console.log(chunkX,chunkY, "HOPEFULLY STILL CHANGES")
    genTerrain.generateHeightmap(chunkX,chunkY)//function that creates terrain

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
        x:chunkX,
        y:chunkY,
        owner: user._id,
        allies: [],
        involvedUsers: [],
        textures:{
            heightmapUrl: './Tiles/HeightMaps/'+chunkX.toString()+chunkY.toString()+'.png' || defaultHeightmapURL,
            texturemapUrl: './Tiles/TextureMaps/'+chunkX.toString()+chunkY.toString()+'.png' || defaultTexturemapURL,
            WalkMapURL: './Tiles/WalkMaps/'+chunkX.toString()+chunkY.toString()+'.png' || defaultWalkmapURL,
        },
        units: [],
        buildings: [B_TownHall]
    });

    await tile.save();
    console.log("ITS ON REGISTER MAN!!")
    res.cookie('refreshToken', refreshToken, { httpOnly: true, secure: true, sameSite: 'Strict' }); // if HTTPS
    res.json({ accessToken,user, success: true, message: 'User recognised'});
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
    const user = await User.findOne({ username: req.user.username });
    console.log(user)
    if (!user) return res.status(404).json({ message: "User not found" });

    const tiles = await TileScheme.find({ owner: user._id });
    res.json({ success: true, tiles,user:user });
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


io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error('No token provided'));

    socketUtilImport(socket,token,next);
});

io.on('connection', (socket) => {

    socket.on('requestWoodUpdate', () => {
        // console.log(`Resources requested by player: ${playerId}`);

        User.findOne({ _id: socket.userId }).then(user => {
            if (!user) {
                console.log(`No user found for playerId: ${socket.userId}`);
                return;
            }
            // console.log(user, ".....");
            socket.emit('resourceWoodUpdate', user.Resources.Wood);
        }).catch(err => {
            console.error("Error fetching user:", err);
        });
    });

    socket.on('requestStoneUpdate', () => {
        // console.log(`Resources requested by player: ${playerId}`);

        
        User.findOne({ _id: socket.userId }).then(user => {
            if (!user) {
                console.log(`No user found for playerId: ${socket.userId}`);
                return;
            }
            // console.log(user, ".....");
            socket.emit('resourceStoneUpdate', user.Resources.Stone);
        }).catch(err => {
            console.error("Error fetching user:", err);
        });
    });

    socket.on('requestGoldUpdate', () => {
        // console.log(`Resources requested by player: ${playerId}`);

        User.findOne({ _id: socket.userId }).then(user => {
            if (!user) {
                console.log(`No user found for playerId: ${socket.userId}`);
                return;
            }
            // console.log(user, ".....");
            socket.emit('resourceGoldUpdate', user.Resources.Gold);
        }).catch(err => {
            console.error("Error fetching user:", err);
        });
    });

    socket.on('requestPoliticalPowerUpdate', () => {
        // console.log(`Resources requested by player: ${playerId}`);

        User.findOne({ _id: socket.userId }).then(user => {
            if (!user) {
                console.log(`No user found for playerId: ${socket.userId}`);
                return;
            }
            // console.log(user, ".....");
            socket.emit('resourcePoliticalPowerUpdate', user.Resources.Political);
        }).catch(err => {
            console.error("Error fetching user:", err);
        });
    });

    socket.on('requestStabilityUpdate', () => {
        // console.log(`Resources requested by player: ${playerId}`);

        User.findOne({ _id: socket.userId }).then(user => {
            if (!user) {
                console.log(`No user found for playerId: ${socket.userId}`);
                return;
            }
            // console.log(user, ".....");
            socket.emit('resourceStabilityUpdate', user.Resources.Stability);
        }).catch(err => {
            console.error("Error fetching user:", err);
        });
    });

    socket.on('requestWarSupportUpdate', () => {
        // console.log(`Resources requested by player: ${playerId}`);

        User.findOne({ _id: socket.userId }).then(user => {
            if (!user) {
                console.log(`No user found for playerId: ${socket.userId}`);
                return;
            }
            // console.log(user, ".....");
            socket.emit('resourceWarSupportUpdate', user.Resources.WarSupport);
        }).catch(err => {
            console.error("Error fetching user:", err);
        });
    });

    socket.on('requestManPowerUpdate', () => {
        // console.log(`Resources requested by player: ${playerId}`);

        User.findOne({ _id: socket.userId }).then(user => {
            if (!user) {
                console.log(`No user found for playerId: ${socket.userId}`);
                return;
            }
            // console.log(user, ".....");
            socket.emit('resourceManPowerUpdate', user.Resources.ManPower);
        }).catch(err => {
            console.error("Error fetching user:", err);
        });
    });

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
            const tile = await TileScheme.findOne({x: RequestMetaData.tile[0],y: RequestMetaData.tile[1]});//owner: user._id });
            console.log("TILE TARGET", tile.x,tile.y,"topindice",tile.topIndice)
            if(tile.freeIndices.length>0){
                ServerIdProvided=tile.freeIndices.shift();//pops first element in array
            }else{
                ServerIdProvided=tile.topIndice
                tile.topIndice+=1
            }
            tile.save()
        
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
        const tileX=RequestMetaData.tile[0].toString();
        const tileY=RequestMetaData.tile[1].toString();
        const WalkMapLocation=path.join(__dirname,'../Tiles/WalkMaps/')+tileX+tileY+".png"
        const passIn=RequestMetaData.position
        const permission=await SharpImgPointVerification(WalkMapLocation,passIn)
        
        var position;
        if(permission){
            const HeighMapLocation=path.join(__dirname,'../Tiles/HeightMaps/')+tileX+tileY+".png"
            position=await getPosWithHeight(RequestMetaData.position,HeighMapLocation);
        }

        const responseObject={
            "permission":permission,
            "position":position,//RequestMetaData.position,
            "tile":RequestMetaData.tile,
            "owner":RequestMetaData.userOwner,
        }
        socket.emit('CanYouDeployHere', responseObject);
    })

    socket.on('testing',async () => {//relevant to seeing if the abstractMap code worked
        const WalkMapLocation=path.join(__dirname,'../Tiles/WalkMaps/')+"0"+"0"+".png"
        socket.emit('testingResponse', "hello");
        PortalConnectivity(WalkMapLocation)
    });

    socket.on('DeployAllUnits',async ({RequestMetaData}) => {

        // console.log(RequestMetaData.owner, "owner")
        var chosenServerIndices=[];
        //get the title, check free indices and the rest are top ++++
        const tile = await TileScheme.findOne({x: RequestMetaData.tile[0],y: RequestMetaData.tile[1]});//owner: user._id });
        // console.log("TILE TARGET", tile.x,tile.y,"topindice",tile.topIndice)
        var tileFreeIndices=tile.freeIndices
        var TileTopIndice=tile.topIndice
        const compositeKey=`${RequestMetaData.owner},${RequestMetaData.UnitType}`
        
        for(let i=0;i<RequestMetaData.UnitCount;i++){
            if(tileFreeIndices.length>0){
                // console.log(tileFreeIndices,"FREE INDICES!")
                const freeIndice=tileFreeIndices.shift().toString();//pops first element in array

                //add soldier to tile
                // Ensure tile.units exists:
                if (!tile.units) tile.units = new Map(); // Or {}
                
                //ensure that the composite has a mapping
                if (!tile.units.has(compositeKey)) {
                    tile.units.set(compositeKey, { instances: new Map() });
                }

                tile.units.get(compositeKey).instances.set(freeIndice,{
                    templateId:null,
                    health:100,
                    state:"Idle",
                    position:RequestMetaData.DeployPosition
                })


                //add to chosenServerIndices to notify user of development
                chosenServerIndices.push(freeIndice)
            }else{
                //add soldier to tile
                // console.log(compositeKey,"compositeKEY!!!!")

                // Ensure tile.units exists:
                if (!tile.units) tile.units = new Map(); // Or {}
                
                //ensure that the composite has a mapping
                if (!tile.units.has(compositeKey)) {
                    tile.units.set(compositeKey, { instances: new Map() });
                }

                tile.units.get(compositeKey).instances.set(TileTopIndice.toString(),{
                    templateId:null,
                    health:100,
                    state:"Idle",
                    position:RequestMetaData.DeployPosition
                })

                //add to chosenServerIndices to notify user of development
                chosenServerIndices.push(TileTopIndice)
                TileTopIndice+=1
            }
                 
        }
        tile.freeIndices=tileFreeIndices
        tile.topIndice=TileTopIndice
        tile.save()
        console.log("chosen....",chosenServerIndices)

        const responseObject={
            "AssetClass":"Unit",
            "position":RequestMetaData.DeployPosition,
            "UnitType":RequestMetaData.UnitType,
            "tile":RequestMetaData.tile,
            "UnitCount":RequestMetaData.UnitCount,
            "owner":RequestMetaData.owner,
            "ServerIds":chosenServerIndices
        }
        socket.emit('DeployAllUnitsHere', responseObject);
    });

    socket.on('MovementCommand',async ({RequestMetaData}) => {
        console.log(RequestMetaData)//.SelectedUnits.Unit)

        const destinationPoint=RequestMetaData.position
        const TargetTileXY=RequestMetaData.TargetTile
        const UserIdCommandee=RequestMetaData.userOwner
        const selectedUnits=RequestMetaData.SelectedUnits
        //need to verify that the RequestMetaData.UserOwner (one commanding) shares Id of owner of unit of serverID
        //but first some processing....
        const originTiles=[];
        var CHEATER=false;
        for (const [AssetClass, TileEtc] of Object.entries(selectedUnits)) {
            // console.log(AssetClass, TileEtc);
            for (const [TileXYOrigin, UnitTypeEtc] of Object.entries(TileEtc)) {
                const TileXY=TileXYOrigin.split(",").map(Number);
                originTiles.push(TileXY)
                // console.log(TileXY)
                 
                const InvestigateTile = await TileScheme.findOne({x:TileXY[0],y:TileXY[1]});
                
                for (const [UnitType, SIdPos] of Object.entries(UnitTypeEtc)) { 
                    const compositeLocalTileKey=`${UserIdCommandee},${UnitType}`

                    const LocalPositions=SIdPos.positions
                    const LocalServerIds=SIdPos.ServerIds

                    const WhatActuallyExistsHere=InvestigateTile.units.get(compositeLocalTileKey)
                    if(WhatActuallyExistsHere){
                        const ExistingInstancesHere=WhatActuallyExistsHere.instances
                        LocalServerIds.forEach((SId)=>{
                            //person making request is indeed the owner of the units... at least thats what is checked here
                            const SIdIncluded=ExistingInstancesHere.has(SId.toString())
                            if(SIdIncluded){
                                //ok theyve been verified, continue the scan
                                //need to check that the unit position is within a margin of error of expected location
                                //------------------------------------------
                                //---------assume ok for now----------------
                                //------------------------------------------
                            }else{
                                CHEATER=true;
                                console.log("ALERT. ACTION, referencing Sid that is not under their control on tile")
                            }
                        })
                    }else{
                        CHEATER=true;
                        console.log("ALERT ALERT CHEATER.... ACTION, user trying to move units they do not have on the tile")
                    }
                }
            }
        }

        if(CHEATER){
            //perform kicking and ban basically, manipulating info is egregious offense
        }
        //otherwise yay continue

        //the only thing valid is Unit assetClass so youre literally passing in
        console.log(selectedUnits["Unit"],"pass in object")


        //run unit positionValidation that checks if units in the request matches where 
        // that unit should be according to the server within a margin of error (drift from collisions)
            //collisions notify the server but only in batches so there will be times a movement
            //command may happen where a unit will have a mismatched position with the server hence the margin
        const responseObject={
            hello:"hello"
        }
        socket.emit('MovementCommandResponse',responseObject);
    });
});
