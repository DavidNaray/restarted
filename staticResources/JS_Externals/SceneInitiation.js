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
        const PoliticalPowerSurplusTT=Math.floor(resources.Total);
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
        const GoldSurplusTT=Math.floor(resources.Total);
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
        const StoneSurplusTT=Math.floor(resources.Total);
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
        const WoodSurplusTT=Math.floor(resources.Total);
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
        const StabilityTotalTT=Math.floor(resources.Total);
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
        const TotalManpower=Math.floor(resources.TotalManPower);
        const TotalPopulation=Math.floor(resources.TotalPopulation);
        const PopulationRate=resources.PopulationRate;
        const RecruitableFactor=resources.RecruitableFactor;
        const MaxPopulation=resources.MaxPopulation;

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

    socket.on('resourceUpdate', (resources) => {
        
        const political={Rate:resources.Political.Rate,Total:Math.floor(resources.Political.Total)};
        const gold={Rate:resources.Gold.Rate,Total:Math.floor(resources.Gold.Total)};
        const stone={Rate:resources.Stone.Rate,Total:Math.floor(resources.Stone.Total)};
        const wood={Rate:resources.Wood.Rate,Total:Math.floor(resources.Wood.Total)};
        const stability={Total:Math.floor(resources.Stability.Total)};  
        const warSupport={Total:Math.floor(resources.WarSupport.Total)};
        const manpower={
            TotalManPower:Math.floor(resources.ManPower.TotalManPower),
            TotalPopulation:Math.floor(resources.ManPower.TotalPopulation),
            PopulationRate:resources.ManPower.PopulationRate,
            RecruitableFactor:resources.ManPower.RecruitableFactor,
            MaxPopulation:resources.ManPower.MaxPopulation
        };
        
        document.getElementById("PPRTxt").innerText=political.Total;
        try{
            document.getElementById("ToolTipPPRate").innerText=political.Rate;
            document.getElementById("ToolTipPPSurplus").innerText=political.Total;    
        }catch(a){}

        document.getElementById("GoldRTxt").innerText=gold.Total;
        try{
            document.getElementById("ToolTipGoldRate").innerText=gold.Rate;
            document.getElementById("ToolTipGoldSurplus").innerText=gold.Total;
        }catch(b){}

        document.getElementById("StoneRTxt").innerText=stone.Total;
        try{
            document.getElementById("ToolTipStoneRate").innerText=stone.Rate;
            document.getElementById("ToolTipStoneSurplus").innerText=stone.Total;
        }catch(c){}

        document.getElementById("WoodRTxt").innerText=wood.Total;
        try{
            document.getElementById("ToolTipWoodRate").innerText=wood.Rate;
            document.getElementById("ToolTipWoodSurplus").innerText=wood.Total;
        }catch(d){}

        document.getElementById("StabilityRTxt").innerText=stability.Total;
        try{
            document.getElementById("ToolTipStability").innerText=stability.Total;
        }catch(e){}

        document.getElementById("WarSupportRTxt").innerText=warSupport.Total;
        try{
            document.getElementById("ToolTipWarSupport").innerText=warSupport.Total;
        }catch(f){}

        document.getElementById("ManPowerRTxt").innerText=manpower.TotalManPower;
        try{
            document.getElementById("ToolTipTotalManPower").innerText=manpower.TotalManPower;
            document.getElementById("ToolTipTotalPop").innerText=manpower.TotalPopulation;
            document.getElementById("ToolTipMonthlyPopGain").innerText=manpower.PopulationRate;
            document.getElementById("ToolTipRecrtuitableFac").innerText="Recruitable: "+manpower.RecruitableFactor+"%";
            document.getElementById("ToolTipMaxPop").innerText=manpower.MaxPopulation;
        }catch(g){}
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

    socket.on('rewardUpdate', (response) => {
        console.log("reward update",response)
        if(response){
            
            const msgDiv=document.getElementById("DailyRewardText");
            const imgDiv=document.getElementById("DailyRewardImage");

            msgDiv.innerText=response.Message;
            imgDiv.style.backgroundImage=`url('${response.ImageLocation}')`;//"url("+response.ImageLocation+")";

            const bruhTwo=document.getElementById("bruhTwo");
            bruhTwo.style.display="flex"; // Show the reward box
        }
    });

    socket.on('testingResponse', (response) => {
        // console.log(response)
        console.log("if this runs then the abstract map was made")
    })

    socket.on('DeployAllUnitsHere', (response) => {
        console.log("deploying units",response.position)

        const whichTileUnits=globalmanager.getTile(response.tile[0],response.tile[1])
        // console.log("owner of deployed units",response.owner)

        for(var i=0;i<response.UnitCount;i++){
            const metaDataUnits={
                "position":response.position,//in pixel values for the chunk its to be deployed in!
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

    socket.on("TickUpdate",(response)=>{
        // console.log("ummmm",response)
        //loop over positions
        const replacements=response.replacements
        // console.log("replacements",response.replacements)
        const positions=response.positions

        if(replacements){
            console.log("replacements!!!!!!!!!!",replacements)
            for(const unitReplace of replacements){
                const whichTileUnitsRemoveFrom=globalmanager.getTile(unitReplace.ChunkX,unitReplace.ChunkY)
                const RemoveUnitOfId=unitReplace.unitId

                whichTileUnitsRemoveFrom.removeUnit(RemoveUnitOfId)
                
                const whichTileUnits=globalmanager.getTile(unitReplace.newChunkX,unitReplace.newChunkY)
                const newUnitId=unitReplace.serverId

                const metaDataUnits={
                    "position":[unitReplace.x,unitReplace.y],//in pixel values for the chunk its to be deployed in!
                    "UnitType":unitReplace.unitType,
                    "AssetClass":unitReplace.AssetClass,
                    "owner":unitReplace.owner,
                    "ServerId":newUnitId
                    // "health":response.health
                }
                // console.log(response.ServerIds[i], "placing units, this is the serverId of one")
                whichTileUnits.objectLoad(unitReplace.unitType,metaDataUnits,unitReplace.AssetClass)

            }
        }

        if(positions){
            for(const unitmove of positions){
                // console.log("unitmove",unitmove)
                const whichTileUnits=globalmanager.getTile(unitmove.ChunkX,unitmove.ChunkY)
                // console.log(whichTileUnits,"so its got the tile")
                const UnitServerId=unitmove.unitId

                whichTileUnits.moveUnit([unitmove.x,unitmove.y],UnitServerId)
            }
        }

    })

    socket.on('TechnologyTreeResponse', (response) => {
        function stringintoURL(str){
            return `url('Icons/TechTree/${str}.png')`;
        }
        console.log("Technology Tree Response",response)
        if(response){
            const appendTo=document.getElementById("TechBox");
            for (let key in response) {
                const strURL=stringintoURL(key);

                const option=document.createElement("div");
                {
                    option.style.aspectRatio="1/1";
                    option.style.padding="0.75vw 0.75vw 0.75vw 0.75vw";
                } 
                const optionInner=document.createElement("div");
                {
                    // option.style.innerHTML=optionTags[i];
                    optionInner.className="IconGeneral"
                    optionInner.style.width="100%";
                    optionInner.style.height="100%";
                    optionInner.style.backgroundImage=strURL;
                    if(response[key]){
                        optionInner.style.outline="lightgray dashed 0.1vw"; // green for researched
                        optionInner.style.backgroundColor="rgba(216,216,216,0.2)"; // green for researched
                    }

                } 


                option.appendChild(optionInner)
                appendTo.appendChild(option)

            }
            
        }
    });
}

function HandleInitialEmits(socket){
    socket.emit('requestResourceUpdate');
    socket.emit('requestRewards')
    // socket.emit('testing');
}

export function EmitResourceUpdate(){
    socket.emit('requestResourceUpdate');
}

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

export function techTreeSetupEmit(){
    socket.emit('TechnologyTreeRequest');
}

setInterval(EmitResourceUpdate, 10000);// Emit resource updates every 10 seconds