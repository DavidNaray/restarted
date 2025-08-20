const { Binary } = require('mongodb');

function convertMapToMongoDoc(graphMap) {
    console.log("made it here?")
    const result = [];

    for (const [subgrid, neighbors] of graphMap.entries()) {
        // console.log(subgrid)
        const [bing, bong]=subgrid.split(",")
        // if(Number(bing)==9){
        //     console.log(subgrid,"....",neighbors.get("connections"))
        //     // console.log(neighbors)
        //     // console.log(subgridBuffer)
        //     // console.log(connections)
        // }
        // console.log(subgrid)
        // const rawBuffer=neighbors.get("buffer")

        // const subgridBuffer = neighbors.get("buffer").toString('base64');

        // console.log("tryna save:", subgridBuffer)
        // const connections = [];
        const connectionsObj = {};
        const connect=neighbors.get("connections") || new Map()
        // console.log("connect",connect)
        if(connect.size>0){
            for (const [fromPortal, innerMap] of connect.entries()) {
                const innerObj = {};
                for (const [toPortal, cost] of innerMap.entries()) {
                    innerObj[toPortal] = cost;
                }
                connectionsObj[fromPortal] = innerObj;
            }
        }

        result.push({ 
            subgrid, 
            subgridBuffer:new Binary(neighbors.get("buffer")),
            connections:connectionsObj 
        });
    }
    // console.log(result,"being saved")
    return result
}

function convertMongoPortalGraphToMap(graphArray) {
    // console.log("?",graphArray)
    const graphMap = new Map();

    for (const { subgrid, subgridBuffer,connections } of graphArray) {
        // console.log(subgrid,connections)
        // console.log(subgridBuffer)
        const connMap = new Map();
        // if(subgrid=='9,11'){
        //     console.log(subgridBuffer)
        //     console.log(connections)
        // }

        // const subgridBuff=subgridBuffer//.from(base64, 'base64')//values.get("buffer")

        connMap.set("buffer",subgridBuffer.buffer)
        const condict=new Map()
        // console.log(connections,"connections")
        if(connections){
            for (const [ fromPortal, innerMap ] of Object.entries(connections)) {
                // console.log(to, cost)
                // condict.set(to, cost);
                const innerObj = new Map();
                for (const [toPortal, cost] of Object.entries(innerMap)) {
                    innerObj.set(toPortal, cost);
                }
                condict.set(fromPortal, innerObj);
            }
        }else{
            // console.log("what the hell is going on....",subgrid)
            // console.log(subgridBuffer.buffer)
        }
        connMap.set("connections",condict)
        // console.log()
        graphMap.set(subgrid,connMap);
    }

    // console.log("come on, ", graphMap,"graphMap")
    return graphMap;
}


async function toCachedUser(userDoc) {
  if (!userDoc) return null;

  return {
    id: userDoc._id.toString(),
    username: userDoc.username,
    passwordHash: userDoc.passwordHash,
    OriginTile: [...(userDoc.OriginTile || [])],
    refreshTokens: [...(userDoc.refreshTokens || [])],
    ProductionLines:userDoc.ProductionLines ?? 2,
    
    ProductBlocks: {
      TopBlock: userDoc.ProductBlocks?.TopBlock ?? 0,
      Values: userDoc.ProductBlocks?.Values ? Object.fromEntries(userDoc.ProductBlocks.Values) : {}
    },

    Resources: {
      Gold: {
        Total: userDoc.Resources.Gold.Total ?? 0,
        Rate: userDoc.Resources.Gold.Rate ?? 1,
      },
      Stone: {
        Total: userDoc.Resources.Stone.Total ?? 0,
        Rate: userDoc.Resources.Stone.Rate ?? 0,
      },
      Wood: {
        Total: userDoc.Resources.Wood.Total ?? 0,
        Rate: userDoc.Resources.Wood.Rate ?? 1,
      },
      Political: {
        Total: userDoc.Resources.Political.Total ?? 0,
        Rate: userDoc.Resources.Political.Rate ?? 0,
      },
      Stability: {
        Total: userDoc.Resources.Stability.Total ?? 50,
        Influence: userDoc.Resources.Stability.Influence ?? "Base: 50%",
      },
      WarSupport: {
        Total: userDoc.Resources.WarSupport.Total ?? 50,
        Influence: userDoc.Resources.WarSupport.Influence ?? "Base: 50%",
      },
      ManPower: {
        TotalManPower: userDoc.Resources.ManPower.TotalManPower ?? 0,
        TotalPopulation: userDoc.Resources.ManPower.TotalPopulation ?? 500,
        PopulationRate: userDoc.Resources.ManPower.PopulationRate ?? 0.1,
        RecruitableFactor: userDoc.Resources.ManPower.RecruitableFactor ?? 0.1,
        MaxPopulation: userDoc.Resources.ManPower.MaxPopulation ?? 500,
        FreePopulation: userDoc.Resources.ManPower.FreePopulation ?? 500,
      },
      lastUpdated: userDoc.Resources.lastUpdated
        ? new Date(userDoc.Resources.lastUpdated)
        : new Date(),
    },
    Technology: {
      Bows: userDoc.Technology.Bows ?? true,
      Swords: userDoc.Technology.Swords ?? true,
      Shields: userDoc.Technology.Shields ?? true,
      Spears: userDoc.Technology.Spears ?? true,
      LeatherArmour: userDoc.Technology.LeatherArmour ?? true,
      BatteringRam: userDoc.Technology.BatteringRam ?? true,
      WagonFort: userDoc.Technology.WagonFort ?? true,

      WoodWall: userDoc.Technology.WoodWall ?? true,
      StoneWall: userDoc.Technology.StoneWall ?? true,
      WoodGate: userDoc.Technology.WoodGate ?? true,
      StoneGate: userDoc.Technology.StoneGate ?? true,
      WoodenTower: userDoc.Technology.WoodenTower ?? true,
      StoneTower: userDoc.Technology.StoneTower ?? true,
      WoodenKeep: userDoc.Technology.WoodenKeep ?? true,
      StoneKeep: userDoc.Technology.StoneKeep ?? true,
      WoodHouse: userDoc.Technology.WoodHouse ?? true,
      StoneHouse: userDoc.Technology.StoneHouse ?? true,
      Pavement: userDoc.Technology.Pavement ?? true,

      CivilianFactory: userDoc.Technology.CivilianFactory ?? true,
      MilitaryFactory: userDoc.Technology.MilitaryFactory ?? true,
      Farm: userDoc.Technology.Farm ?? true,
      Quarry: userDoc.Technology.Quarry ?? true,
      LumberMill: userDoc.Technology.LumberMill ?? true,
      Barracks: userDoc.Technology.Barracks ?? true,
      // SiegeWorkshop: userDoc.Technology.SiegeWorkshop ?? true,
      Market: userDoc.Technology.Market ?? true,
      TownHall: userDoc.Technology.TownHall ?? true,
      Warehouse: userDoc.Technology.Warehouse ?? true,



      ChainArmour: userDoc.Technology.ChainArmour ?? false,
      PlateArmour: userDoc.Technology.PlateArmour ?? false,
      Crossbows: userDoc.Technology.Crossbows ?? false,
      Trebuchet: userDoc.Technology.Trebuchet ?? false,
      Catapult: userDoc.Technology.Catapult ?? false,
      Ballista: userDoc.Technology.Ballista ?? false,
      StandardisedParts: userDoc.Technology.StandardisedParts ?? false,
      RobustSupplyChains: userDoc.Technology.RobustSupplyChains ?? false,
      WorkerShifts: userDoc.Technology.WorkerShifts ?? false,
      FortifiedSettlements: userDoc.Technology.FortifiedSettlements ?? false,
      CropRotation: userDoc.Technology.CropRotation ?? false,

    },

    lastClaimDate: userDoc.lastClaimDate ?? null,
  };
}
module.exports={convertMapToMongoDoc,convertMongoPortalGraphToMap,toCachedUser}