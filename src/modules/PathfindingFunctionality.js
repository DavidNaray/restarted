const {convertMongoPortalGraphToMap}=require("./MongoAbstractConversions.js")
const path = require('path')
const sharp = require('sharp');
        
//reading tiles abstract portal info...
// const graphMap = convertMongoPortalGraphToMap(tile.AbstractMap);

const TilePixelOccupancyMap=new Map()
const UsersSeeingTileMap=new Map()
//used to ping the correct sockets about the units that are moving in the tile
//tile -> {userIds:[],unitIds:[]}
//the userIds are the users that are online and currently see what is going on in that tile
//unitIds are the units that have something changed about them, health position etc

//TilePixelOccupancyMap is what is used by the server to calculate how units move, 
    // if a unit moves then there should be a line to update unitIds in  UsersSeeingTileMap

function calcFormationCenterPoint(selectedUnitsPositions){
    //the median coordinate of selected units
}


async function updateOccupancyMap(tiles,UserId){
    const promises = [];
    for (const [key, value] of Object.entries(tiles)) {
        
        for(const tile of value){
            // console.log(tile.x,tile.y,tile.textures)
            const MapContainsTile=TilePixelOccupancyMap.has(`${tile.x},${tile.y}`)
            if(!MapContainsTile){
                UsersSeeingTileMap.set(`${tile.x},${tile.y}`,[UserId])

                const imgLocation=path.join(__dirname,"../../Tiles/WalkMaps/"+tile.x.toString()+tile.y.toString()+".png")
                // console.log(imgLocation, "plz bruh")
                const p = sharp(imgLocation)
                .ensureAlpha()
                .raw()
                .toBuffer({ resolveWithObject: true })
                .then(({ data, info }) => {
                    const width = info.width;
                    const height = info.height;
                    const occupancy = new Uint32Array(width * height);
                    occupancy.fill(0); // 0 means no unit
                    
                    TilePixelOccupancyMap.set(`${tile.x},${tile.y}`,{
                        walkMap:data,//access the colour by getting index and then looking it up +1,2,3 for rgba
                        UnitOccupancy:occupancy
                    });
                })
                .catch(err => {
                    console.error(`Error loading tile image ${tile.x},${tile.y}:`, err);
                });
                promises.push(p);

                // const index = (y * width + x) * 4;
                // const r = walkmap[index];
                // const g = walkmap[index + 1];
                // const b = walkmap[index + 2];
                // const a = walkmap[index + 3];
            }else{
                UsersSeeingTileMap.get(`${tile.x},${tile.y}`).push(UserId)
            }

        }
    }
    await Promise.all(promises);
}

module.exports={updateOccupancyMap}