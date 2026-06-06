const path = require('path');
const bcrypt = require('bcrypt');
const {RefreshTokenImport,AccessTokenImport}=require("../Verification")
const Coordfinder=require("./NextChunkCoord.js")
const genTerrain=require("../TerrainGeneration/TerrainGeneration")
const {PortalConnectivity}=require("../TerrainGeneration/AbtractMapGeneration.js")
const TileScheme=require("../../Schemas/Tile")
const {convertMapToMongoDoc,toCachedUser}=require("../MongoAbstractConversions.js")
const bson = require('bson');


const saltRounds = 10;
const defaultHeightmapURL = './Tiles/HeightMaps/00.png';
const defaultTexturemapURL = './Tiles/TextureMaps/00.png';
const defaultWalkmapURL = './Tiles/WalkMaps/00.png';
async function HandleReg(ChunkManager,User,username,password){

    try{
        const existingUser = await User.findOne({ username });
        if (existingUser) { return "ExistsUser";}

        const passwordHash = await bcrypt.hash(password, saltRounds);
        const user = new User({ username, passwordHash });

        const accessToken = AccessTokenImport(user)
        const refreshToken = RefreshTokenImport(user)

        //save the refresh token in DB
        user.refreshTokens.push(refreshToken);        
        
        //run the terrain generation function with the coords
        const pos=Coordfinder.GiveMeNextCoordAndSetState()
        const chunkX=pos[0];const chunkY=pos[1];
        user.OriginTile=[chunkX,chunkY]

        await user.save();

        const UserToCacheConverted = await toCachedUser(user)
        await ChunkManager.RegisterUser(UserToCacheConverted.id,UserToCacheConverted)

        await genTerrain.generateHeightmap(chunkX,chunkY)
        const WalkMapLocation=path.join(__dirname,'../../../Tiles/WalkMaps/')+chunkX.toString()+chunkY.toString()+".png"

        var abstractMapForTile;
        try{abstractMapForTile=await PortalConnectivity(WalkMapLocation)
        }catch(eb){console.log("Error in abstract map generation:", eb);}

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
            buildings: []//B_TownHall
        });


        if(abstractMapForTile){
            const abstractMapDoc= convertMapToMongoDoc(abstractMapForTile);
            const doc = { AbstractMap: abstractMapDoc };

            const size = bson.calculateObjectSize(doc);
            
            console.log('Mongo document size in bytes:', size);

            tile.AbstractMap=abstractMapDoc;
            tile.markModified('AbstractMap');
        }

        try{
            await tile.save();
            console.log("✅ Tile saved successfully");
        } catch (TF) {console.error("❌ Tile save failed:", TF);}

        console.log("Registration of User:", username);
        return {"RT":refreshToken,"AT":accessToken,"user":user}


    }catch(err){
        console.log(err);
        return "ServerFail";
    }


}


module.exports={HandleReg}