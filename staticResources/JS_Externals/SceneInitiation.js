import {renderer,InputState} from "../siteJS.js"
import {onPointerMove} from "./RaycasterHandling.js"
import {onclickBuilding,adjustUnitDeployPosition,onTileClick} from "./DropDownUI.js"
import {globalmanager} from "./GlobalInstanceMngr.js"

let socket;
export async function getUserTileData(accessToken){
    try {
        const res = await fetch('/tiles', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });

        const data = await res.json();

        if (data.success) {
            return [data.tiles,data.OriginTile];  // Now this gets properly returned to the caller
        } else {
            console.error(data.message);
            return null;
        }
    } catch (err) {
        console.error('Error fetching tiles:', err);
        return null;
    }
}


function HandleSocketResponses(socket){
    //PoliticalPower
    socket.on('resourcePoliticalPowerUpdate', (resources) => {
        
        const PoliticalPowerRateTT=resources.Rate;
        const PoliticalPowerSurplusTT=resources.Total;
        // console.log("I AM THE WOOD REQUESTER RAHH",WoodRateTT)
        document.getElementById("PPRTxt").innerText=PoliticalPowerSurplusTT

        try{
            document.getElementById("ToolTipPPRate").innerText=PoliticalPowerRateTT;
            document.getElementById("ToolTipPPSurplus").innerText=PoliticalPowerSurplusTT;    
        }catch(e){}

        // start(roomId, initiator);
    });
    // Gold
    socket.on('resourceGoldUpdate', (resources) => {
        
        const GoldRateTT=resources.Rate;
        const GoldSurplusTT=resources.Total;
        // console.log("I AM THE WOOD REQUESTER RAHH",WoodRateTT)
        document.getElementById("GoldRTxt").innerText=GoldSurplusTT

        try{
            document.getElementById("ToolTipGoldRate").innerText=GoldRateTT;
            document.getElementById("ToolTipGoldSurplus").innerText=GoldSurplusTT;
        }catch(e){}
        // start(roomId, initiator);
    });
    //Stone
    socket.on('resourceStoneUpdate', (resources) => {
        

        const StoneRateTT=resources.Rate;
        const StoneSurplusTT=resources.Total;
        // console.log("I AM THE WOOD REQUESTER RAHH",WoodRateTT)
        document.getElementById("StoneRTxt").innerText=StoneSurplusTT

        try{
            document.getElementById("ToolTipStoneRate").innerText=StoneRateTT;
            document.getElementById("ToolTipStoneSurplus").innerText=StoneSurplusTT;
        }catch(e){}
            // start(roomId, initiator);
    });
    //Wood
    socket.on('resourceWoodUpdate', (resources) => {
        

        const WoodRateTT=resources.Rate;
        const WoodSurplusTT=resources.Total;
        // console.log("I AM THE WOOD REQUESTER RAHH",WoodRateTT)
        document.getElementById("WoodRTxt").innerText=WoodSurplusTT

        try{
            document.getElementById("ToolTipWoodRate").innerText=WoodRateTT;
            document.getElementById("ToolTipWoodSurplus").innerText=WoodSurplusTT;
        }catch(e){}
                // start(roomId, initiator);
    });
    //Stability
    socket.on('resourceStabilityUpdate', (resources) => {
        const StabilityTotalTT=resources.Total;
        // console.log("I AM THE WOOD REQUESTER RAHH",StabilityTotalTT)
        document.getElementById("StabilityRTxt").innerText=StabilityTotalTT

        try{
            document.getElementById("ToolTipStability").innerText=StabilityTotalTT;
        }catch(e){}
        // start(roomId, initiator);
    });

    socket.on('resourceWarSupportUpdate', (resources) => {
        const WarSupportTotalTT=resources.Total;
        // console.log("I AM THE WOOD REQUESTER RAHH",StabilityTotalTT)
        document.getElementById("WarSupportRTxt").innerText=WarSupportTotalTT
        try{
            document.getElementById("ToolTipWarSupport").innerText=WarSupportTotalTT;
        }catch(e){}// start(roomId, initiator);
    });

    socket.on('resourceManPowerUpdate', (resources) => {
        const TotalManpower=resources.TotalManPower;
        const TotalPopulation=resources.TotalPopulation;
        const PopulationRate=resources.TotalPopulation;
        const RecruitableFactor=resources.TotalPopulation;
        const MaxPopulation=resources.TotalPopulation;

        // console.log("I AM THE WOOD REQUESTER RAHH",WoodRateTT)
        document.getElementById("ManPowerRTxt").innerText=TotalManpower
        
        try{
            document.getElementById("ToolTipTotalManPower").innerText=TotalManpower;
            document.getElementById("ToolTipTotalPop").innerText=TotalPopulation;
            document.getElementById("ToolTipMonthlyPopGain").innerText=PopulationRate;
            document.getElementById("ToolTipRecrtuitableFac").innerText="Recruitable: "+RecruitableFactor+"%";
            document.getElementById("ToolTipMaxPop").innerText=MaxPopulation;
        }catch(e){}
    });

    socket.on('CanYouPlaceBuilding', (response) => {
        InputState.value="neutral"
        // console.log("YIPEEEEEEE",response.position)
        renderer.domElement.removeEventListener( 'pointermove', onPointerMove );
        renderer.domElement.removeEventListener( 'click', onclickBuilding );
        if(response.permission){
            console.log("permission to place building: accepted",response)
            const whichTile=globalmanager.getTile(response.tile[0],response.tile[1])
            console.log(whichTile)
            const metaData={
                "position":response.position,
                "rotation":response.rotation,
                "UnitType":response.UnitType,
                "AssetClass":response.AssetClass,
                "owner":response.owner,
                "ServerId":response.ServerId,
                "health":response.health,
            }
            whichTile.objectLoad(response.UnitType,metaData,response.AssetClass)
        }else{
            console.log("permission to place building: denied")
        }
    });

    socket.on('CanYouDeployHere', (response) => {
        InputState.value="neutral"
        // console.log("deploy here?",response)
        if(response.permission){
            adjustUnitDeployPosition(response)
        }
        //the user clicked, the deployment has/not been set, remove eventListeners
        renderer.domElement.removeEventListener( 'pointermove', onPointerMove );
        renderer.domElement.removeEventListener( 'click',  onTileClick);
    });

    socket.on('testingResponse', (response) => {
        // console.log(response)
        console.log("if this runs then the abstract map was made")
    })

    socket.on('DeployAllUnitsHere', (response) => {
        console.log("deploying units",response.position)

        const whichTileUnits=globalmanager.getTile(response.tile[0],response.tile[1])
        console.log(response.ServerIds)

        for(var i=0;i<response.UnitCount;i++){
            const metaDataUnits={
                "position":response.position,
                "UnitType":response.UnitType,
                "AssetClass":response.AssetClass,
                "owner":response.owner,
                "ServerId":response.ServerIds[i]
                // "health":response.health
            }
            console.log(response.ServerIds[i], "placing units, this is the serverId of one")
            whichTileUnits.objectLoad(response.UnitType,metaDataUnits,response.AssetClass)
        }
        
    });

    socket.on('MovementCommandResponse', (response) => {
        console.log(response,"hm.....")
    });
}

function HandleInitialEmits(socket){
    socket.emit('requestWoodUpdate');
    socket.emit('requestStoneUpdate');
    socket.emit('requestGoldUpdate');
    socket.emit('requestManPowerUpdate');
    socket.emit('requestWarSupportUpdate');
    socket.emit('requestStabilityUpdate');
    socket.emit('requestPoliticalPowerUpdate');

    socket.emit('testing');
}

export function EmitWoodUpdate(){socket.emit('requestWoodUpdate');}
export function EmitStoneUpdate(){socket.emit('requestStoneUpdate');}
export function EmitGoldUpdate(){socket.emit('requestGoldUpdate');}
export function EmitManPowerUpdate(){socket.emit('requestManPowerUpdate');}
export function EmitWarSupportUpdate(){socket.emit('requestWarSupportUpdate');}
export function EmitStabilityUpdate(){socket.emit('requestStabilityUpdate');}
export function EmitPoliticalPowerUpdate(){socket.emit('requestPoliticalPowerUpdate')}

export function EmitBuildingPlacementRequest(RequestMetaData){//BuildingAssetName,
    socket.emit('BuildingPlacementRequest',{
        // "BuildingAssetName":BuildingAssetName,
        "RequestMetaData":RequestMetaData
    })
}

export function EmitUnitPlacementRequest(RequestMetaData){
    console.log(RequestMetaData, "before unit deploy emit")
    socket.emit('UnitDeploymentPositionRequest',{
        "RequestMetaData":RequestMetaData
    })
}

export function EmitUnitsBeingDeployed(RequestMetaData){
    console.log(RequestMetaData)
    socket.emit('DeployAllUnits',{
        "RequestMetaData":RequestMetaData
    })
}

export function EmitMovementCommand(RequestMetaData){
    // if(Object.keys(RequestMetaData).length >) 
    socket.emit('MovementCommand',{
        "RequestMetaData":RequestMetaData
    })
}

export function setupSocketConnection(){
    socket = io({auth:{token:localStorage.getItem('accessToken')}});
    HandleSocketResponses(socket)
    HandleInitialEmits(socket)

}