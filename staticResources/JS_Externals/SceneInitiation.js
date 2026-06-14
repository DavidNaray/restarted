import * as THREE from "three";
import {renderer,InputState,scene,requestRenderIfNotRequested} from "../siteJS.js"
import {onPointerMove,intersectsTileMeshes,suppressPlacement} from "./RaycasterHandling.js"
import {makeToolTipTechnology} from "./ResourceTips.js"


import {buildWallSegments,trySnapPoint} from "./WallPlacementFuncs.js"
import {superHeightMapTexture} from "./SuperCanvas.js"

export let socket;
var userPoints = [];
const previewGroup = new THREE.Group();

import {globalmanager} from "./GlobalInstanceMngr.js"
import {UImanager} from "./UIManager.js"
import { InputManager } from "./UserInputState.js";


export function setupSocketConnection(){
    socket = io({auth:{token:localStorage.getItem('accessToken')}});
    
    socket.on("TickUpdate",async (response)=>{
        const replacements=response.replacements
        const positions=response.positions
        const Deployments=response.Deployments
        const DeployPosRequestResponse=response.DeployPosRequestResponse

        const resources=response.resources
        const DailyReward=response.DailyReward

        const TechTree=response.TechTree
        const Recruitable=response.Recruitable

        const NewRegimen=response.NewRegimen
        const AdjustRegimenCount=response.AdjustRegimenCount
        const DelRegimen=response.DelRegimen

        const constructable=response.Constructable

        const MovePlacementBuilding=response.MovePlacementBuilding
        const PlaceBuilding=response.PlaceBuilding

        //move units across chunks
        if(replacements){await HandleUnitReplacements(replacements)}

        //change unit positions within a chunk
        if(positions){HandleUnitPosition(positions)}

        //deploy units at position
        if(Deployments){await HandleDeployments(Deployments)}

        //response for unit deployment position
        if(DeployPosRequestResponse){HandleDeploymentPositionRequest(DeployPosRequestResponse)}

        //keep user resources up-to-date
        if(resources){makeResourceUpdate(resources)}

        //alert user of daily reward
        if(DailyReward){HandleDailyReward(DailyReward)}

        if(TechTree){HandleTechTree(TechTree)}

        if(constructable){Handleconstructable(constructable)}

        if(Recruitable){HandleRecruitable(Recruitable)}

        if(NewRegimen){HandleNewRegimen(NewRegimen)}

        if(AdjustRegimenCount){HandleAdjustRegimenCount(AdjustRegimenCount)}

        if(DelRegimen){HandleDelRegimen(DelRegimen)}

        if(MovePlacementBuilding){HandleMovePlacementBuilding(MovePlacementBuilding)}

        if(PlaceBuilding){HandlePlaceBuilding(PlaceBuilding)}
    })
    
    HandleSocketResponses(socket)

}

function makeResourceUpdate(resources){
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
    
    //update ResourcePieces
    document.getElementById("PPblock").innerText=political.Total;
    document.getElementById("Stabblock").innerText=stability.Total;
    document.getElementById("Warblock").innerText=warSupport.Total;
    document.getElementById("Manblock").innerText=manpower.TotalManPower;
    document.getElementById("GoldBlock").innerText=gold.Total;
    document.getElementById("StoneBlock").innerText=stone.Total;
    document.getElementById("WoodBlock").innerText=wood.Total;

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
}

async function HandleDeployments(Deployments){
    for(let Deploy of Deployments){
        const whichTileUnits=globalmanager.getTile(Deploy.tile[0],Deploy.tile[1]);
        
        for(var i=0;i<Deploy.UnitCount;i++){
            const metaDataUnits={
                "position":Deploy.position,//in pixel values for the chunk its to be deployed in!
                "UnitType":Deploy.UnitType,
                "AssetClass":"Unit",//Deploy.AssetClass,
                // "owner":Deploy.owner,
                "ServerId":Deploy.ServerIds[i]
            }

            const objLoad=await globalmanager.objectLoad(Deploy.UnitType,Deploy.AssetClass)
            if(objLoad){whichTileUnits.addToScene(Deploy.UnitType, metaDataUnits)}
        }
    }
}

function HandleDeploymentPositionRequest(DeployPosRequestResponse){
    
    const Rid=DeployPosRequestResponse.Rid
    const To=UImanager.getTBRegBody()
    
    // console.log("RID RID,",Rid,DeployPosRequestResponse)
    let targElem;
    for (const elem of To.children) {
        if(elem.myParam!=Rid){continue}
        targElem=elem
    }
    // console.log("targElem",targElem)
    const from =targElem.children[1].children[1].children[0].children[0];

    if(DeployPosRequestResponse.permission){
        const chunk=DeployPosRequestResponse.tile
        const pixel=DeployPosRequestResponse.position
        from.innerHTML=`Deploy To: Chunk:${chunk},Pixel:${pixel}`
    }
    else{from.innerHTML="Deploy To: Invalid Location"}
}

function HandleUnitPosition(positions){
    for(const position of positions){
        const brokenpos=position.split("|")
        const [ChunkX,ChunkY]=brokenpos[1].split(",").map(Number)
        const [x,y]=brokenpos[2].split(",").map(Number)
        const UnitServerId=Number(brokenpos[0])

        const whichTileUnits=globalmanager.getTile(ChunkX,ChunkY)

        whichTileUnits.moveUnit([x,y],UnitServerId)
    }
}

function HandleDailyReward(DailyReward){
    const msgDiv=document.getElementById("DailyRewardText");
    const imgDiv=document.getElementById("DailyRewardImage");

    msgDiv.innerText=DailyReward.Message;
    imgDiv.style.backgroundImage=`url('${DailyReward.ImageLocation}')`;//"url("+response.ImageLocation+")";

    const bruhTwo=document.getElementById("bruhTwo");
    bruhTwo.style.display="flex"; // Show the reward box
}

function HandleTechTree(TechTree){
    function stringintoURL(str){return `Icons/TechTree/${str}.png`;}
    
    const To=UImanager.getRBody();
    To.replaceChildren();

    for (let key in TechTree) {
        const strURL=stringintoURL(key);

        let option=document.createElement("img");
        option.style.width="100%"
        option.style.height="100%"
        option.src=strURL;
        option.style.objectFit="contain"
        option.style.display="block"
        option.style.aspectRatio="1/1"

        if(TechTree[key].Unlocked){
            option.style.outline="lightgray dashed 0.1vw"; 
            option.style.backgroundColor="rgba(216,216,216,0.2)"; 
        }
        To.appendChild(option)
        makeToolTipTechnology(option,TechTree[key]);
    }
}

async function HandleUnitReplacements(replacements){
    for(const replace of replacements){
        const [oldId,newId,oldchunk,newchunk,pixel,owner,unitType,AssetClass]=replace.split("|")
        const [oChunkX,oChunkY]=oldchunk.split(",").map(Number)
        const [nchunkX,nchunkY]=newchunk.split(",").map(Number)

        const RemoveFrom=globalmanager.getTile(oChunkX,oChunkY)
        if(RemoveFrom){RemoveFrom.removeUnit(Number(oldId))}
        else{/*user does not have the tile loaded to delete the unit */}
        
        const LoadTo=globalmanager.getTile(nchunkX,nchunkY)
        if(LoadTo){
            const Meta={
                "position":pixel.split(",").map(Number),//in pixel values for the chunk its to be deployed in!
                "UnitType":unitType,
                "AssetClass":AssetClass,
                "owner":owner,
                "ServerId":Number(newId)
            }
            const objLoad=await globalmanager.objectLoad(unitType,AssetClass)
            if(objLoad){LoadTo.addToScene(unitType, Meta)}
        }
        else{/*user does not have the tile loaded to create the unit */}
    }
}

function HandleRecruitable(Recruitable){
    
    const To=UImanager.getTBBody()
    To.replaceChildren();
    for(let [RType,strURL] of Object.entries(Recruitable)){
        let option=document.createElement("img");
        option.style.width="100%"
        option.style.height="100%"
        option.src=strURL;
        option.style.objectFit="contain"
        option.style.display="block"
        option.style.aspectRatio="1/1"
        option.style.outline="rgb(188, 187, 187) dashed 0.1vw"; 
        option.style.backgroundColor="rgba(216,216,216,0.2)"; 

        option.myParam=RType

        option.addEventListener("click",UImanager.RecruitButtonClicked)
        To.appendChild(option)
    }
}

function HandleNewRegimen(NewRegimen){
    if(!NewRegimen.Rid){return}//no permission

    function TopSec(elem){
        
        let Imgsec=document.createElement("img");
        Imgsec.style.width="100%"
        Imgsec.src=NewRegimen.img;
        Imgsec.style.backgroundColor="rgb(188, 187, 187)";
        Imgsec.style.objectFit="contain"
        Imgsec.style.display="block"
        Imgsec.style.aspectRatio="1/1"

        elem.appendChild(Imgsec)
        
        let TopNextContainer=document.createElement("div");
        TopNextContainer.style.width="calc(100% - max(4px, 0.3vw))"
        TopNextContainer.style.display="grid"
        TopNextContainer.style.gridTemplateRows="40% calc(60% - max(4px, 0.3vw))"
        TopNextContainer.style.rowGap="max(4px, 0.3vw)"

        // ------------------------------------------------------------------------
        let TNTContainer=document.createElement("div");
        TNTContainer.style.display="grid"
        TNTContainer.style.gridTemplateColumns="calc(70% - max(4px, 0.3vw)) 30%"
        TNTContainer.style.columnGap="max(4px, 0.3vw)"

        let TopTitle=document.createElement("div");
        TopTitle.innerHTML=NewRegimen.UnitType
        TopTitle.className="resourceText"
        TopTitle.style.fontSize="max(20px,1vw)";
        TopTitle.style.backgroundColor="rgb(188, 187, 187)";
        
        TNTContainer.appendChild(TopTitle)

        let LastTopContainer=document.createElement("div");
        LastTopContainer.style.display="flex"

        let LeftFill = document.createElement("div");
        LeftFill.style.flex = "1"; // takes remaining width
        LeftFill.style.marginRight = "max(4px, 0.3vw)";
        LeftFill.style.backgroundColor="rgb(188, 187, 187)";
        LeftFill.style.gap = "max(4px, 0.3vw)";
        LeftFill.style.display = "flex";

        // LEFT square
        let BotLeft = document.createElement("div");
        BotLeft.style.height = "100%";
        BotLeft.style.aspectRatio = "1 / 1";
        BotLeft.style.backgroundImage="url('Icons/Subtract.png')"
        BotLeft.className="IconGeneral"
        BotLeft.myParam=-1

        // MIDDLE filler
        let BotMiddle = document.createElement("div");
        BotMiddle.style.flex = "1";
        BotMiddle.innerHTML="1/1"
        BotMiddle.className="resourceText"
        BotMiddle.style.fontSize="max(15px,1vw)"

        // RIGHT square
        let BotRight = document.createElement("div");
        BotRight.style.height = "100%";
        BotRight.style.aspectRatio = "1 / 1";
        BotRight.style.backgroundImage="url('Icons/Add.png')"
        BotRight.className="IconGeneral"
        BotRight.myParam=1

        LeftFill.appendChild(BotLeft);
        LeftFill.appendChild(BotMiddle);
        LeftFill.appendChild(BotRight);

        LastTopContainer.appendChild(LeftFill)

        let DestroyRegimen=document.createElement("div");
        DestroyRegimen.style.height="100%"
        DestroyRegimen.style.aspectRatio="1/1"
        DestroyRegimen.style.backgroundColor="rgb(188, 187, 187)";
        DestroyRegimen.style.marginLeft = "auto";
        DestroyRegimen.style.backgroundImage="url('Icons/Cross.png')"
        DestroyRegimen.className="IconGeneral"

        LastTopContainer.appendChild(DestroyRegimen)
        TNTContainer.appendChild(LastTopContainer)

        TopNextContainer.appendChild(TNTContainer)


        let BotNext=document.createElement("div");
        BotNext.style.display="flex"

        let Deploy=document.createElement("div");
        Deploy.style.height="100%"
        Deploy.style.aspectRatio="1/1"
        Deploy.style.backgroundColor="rgb(188, 187, 187)";
        Deploy.style.marginLeft = "auto";
        Deploy.style.backgroundImage="url('Icons/Deploy.png')"
        Deploy.className="IconGeneral"

        let LastBotContainer=document.createElement("div");
        LastBotContainer.style.display="flex";

        let LeftFillBot = document.createElement("div");
        LeftFillBot.style.flex = "1";
        LeftFillBot.style.marginRight = "max(4px, 0.3vw)";
        LeftFillBot.style.display="grid"
        LeftFillBot.style.gridTemplateColumns="1fr 1fr"
        LeftFillBot.style.columnGap="max(4px, 0.3vw)"

        let from = document.createElement("div");
        from.innerHTML="Deploy To:"
        from.className="resourceText"
        from.style.fontSize="max(15px,1vw)"
        from.style.justifyContent="left"
        from.style.padding="0 max(4px, 0.3vw) 0 max(4px, 0.3vw)"
        from.style.backgroundColor="rgb(188, 187, 187)";
        LeftFillBot.appendChild(from)

        let Status = document.createElement("div");
        Status.innerHTML="Status: Ready"
        Status.className="resourceText"
        Status.style.fontSize="max(15px,1vw)"
        Status.style.justifyContent="left"
        Status.style.padding="0 max(4px, 0.3vw) 0 max(4px, 0.3vw)"
        Status.style.backgroundColor="rgb(188, 187, 187)";
        LeftFillBot.appendChild(Status)


        BotNext.appendChild(LeftFillBot)
        BotNext.appendChild(Deploy)
        TopNextContainer.appendChild(BotNext)

        elem.appendChild(TopNextContainer)

        BotLeft.addEventListener("click",UImanager.RegimenCountAdjust)//decrement
        BotRight.addEventListener("click",UImanager.RegimenCountAdjust)//increment

        DestroyRegimen.addEventListener("click",UImanager.DestroyRegimen)//delete the regimen
        Deploy.addEventListener("click",UImanager.DeployReadyUnits)//deploy ready units

        from.addEventListener("click",UImanager.DeployPosition)//set a deploy point

    }


    const To=UImanager.getTBRegBody()

    let option=document.createElement("div");
    option.style.width="calc(100% - max(8px, 0.6vw))"
    option.style.minHeight="10px"
    option.style.outline="lightgray dashed 0.1vw"; 
    option.style.backgroundColor="rgba(216,216,216,0.2)"
    option.style.padding="max(4px, 0.3vw)"
    option.style.display="grid"
    option.style.gridTemplateColumns="10% 90%"
    option.style.columnGap="max(4px, 0.3vw)"

    option.myParam=NewRegimen.Rid //reference to the appropriate regimen record on server

    TopSec(option)

    To.appendChild(option);

    UImanager.hideBoxes("TrainingBox")//can overflow the box, this makes sure it catches that moment
}

function HandleAdjustRegimenCount(AdjustRegimenCount){
    if(!AdjustRegimenCount.Rid){return}
    const Rid=AdjustRegimenCount.Rid
    const Count=AdjustRegimenCount.Count

    const To=UImanager.getTBRegBody()
    //go through the children until the element that has myParam be Rid

    for (const elem of To.children) {
        if(elem.myParam!=Rid){continue}

        //then go to the element that has the count and make the adjustment
        const BotMiddle =elem.children[1].children[0].children[1].children[0].children[1];
        const txt=BotMiddle.innerHTML.split("/")
        // const newTxt=`${txt[0]}/${Count}` //if there was training involved, i cba rn
        const newTxt=`${Count}/${Count}`
        BotMiddle.innerHTML=newTxt

    }

}

function HandleDelRegimen(HandleDelRegimen){
    // console.log("HandleDelRegimen",HandleDelRegimen)
    if(!HandleDelRegimen.Rid){return}
    const Rid=HandleDelRegimen.Rid

    const To=UImanager.getTBRegBody()

    for (const elem of To.children) {
        if(elem.myParam!=Rid){continue}

        //destroy the element
        elem.remove()
    }
}


function Handleconstructable(constructable){
    const To=UImanager.getCBody()
    To.replaceChildren();

    for(let [RType,strURLGlb] of Object.entries(constructable)){
        let option=document.createElement("img");
        option.style.width="100%"
        option.style.height="100%"
        option.src=strURLGlb[0];
        option.style.objectFit="contain"
        option.style.display="block"
        option.style.aspectRatio="1/1"
        option.style.outline="rgb(188, 187, 187) dashed 0.1vw"; 
        option.style.backgroundColor="rgba(216,216,216,0.2)"; 

        option.myParam=strURLGlb[1]

        option.addEventListener("click",UImanager.BuildingRequest)
        To.appendChild(option)
    }
}


function HandleMovePlacementBuilding(MovePlacementBuilding){

    function colourchange(objectDef,colour){
        // console.log("REALLY",colour)
        const c = new THREE.Color(colour);

        objectDef.traverse((child) => {
            if (child.isMesh && child.material) {
                if (Array.isArray(child.material)) {child.material = child.material.map((m) => m.clone());} 
                else {child.material = child.material.clone();}

                let materials = Array.isArray(child.material) ? child.material : [child.material];
                // vec3(0.2, 0.5, 1.0)
                materials.forEach((mat) => {
                    mat.transparent = true; // enable opacity
                    mat.opacity = 0.5;           // adjust to desired see-through
                    mat.customProgramCacheKey = () => colour;
                    mat.onBeforeCompile = (shader) => {
                        shader.fragmentShader = shader.fragmentShader.replace(
                            '#include <map_fragment>',
                            `
                            #include <map_fragment>
                            // overlay light blue
                            vec3 overlayColor = vec3(${c.r.toFixed(3)}, ${c.g.toFixed(3)}, ${c.b.toFixed(3)}); // light blue
                            float overlayOpacity = 0.5; // adjust transparency
                            diffuseColor.rgb = mix(diffuseColor.rgb, overlayColor, overlayOpacity);
                            `
                        );
                    };

                    mat.needsUpdate = true;
                });
            }
        });
    }


    const building=MovePlacementBuilding.buildingToMove
    const [px,py]=MovePlacementBuilding.pixelPoint
    const [chunkX,chunkY]=MovePlacementBuilding.ChunkPlaced
    const valid=MovePlacementBuilding.valid
    
    //get target object details
    let Asset=InputManager.getPlacementBuilding()
    if(!Asset){
        const Assetdetails=globalmanager.getAsset(building)
        if(!Assetdetails){return};
        Asset = new THREE.Mesh(Assetdetails.geometry, Assetdetails.materials);
        Asset.scale.set(0.2,0.2,0.2);
        InputManager.setPlacementBuilding(Asset)
        scene.add(Asset);
    }

    //move the asset to the desired location on the clients coordinate system
    const xyz=superHeightMapTexture.getXYZ(chunkX,chunkY,MovePlacementBuilding.pixelPoint)
    const threePos=new THREE.Vector3(chunkX*7.5 + px/(1536/7.5) - 3.75 ,xyz[1],chunkY*7.5 + py/(1536/7.5) -3.75)
    Asset.position.copy(threePos)
       
    if(scene.getObjectById(Asset.id) === undefined){scene.add(Asset)}

    //depending on valid, change the colour of the object
    if(valid){colourchange(Asset,"green")}
    else{colourchange(Asset,"red")}
}

async function HandlePlaceBuilding(PlaceBuilding){

    for(let Building of PlaceBuilding){    
        const [nchunkX,nchunkY]=Building.ChunkPlaced
        const LoadTo=globalmanager.getTile(nchunkX,nchunkY)

        if(LoadTo){
            const Meta={
                "position":Building.pixelPoint,//in pixel values for the chunk its to be deployed in!
                "UnitType":Building.buildingToMove,
                "AssetClass":"Building",
                // "owner":owner,
                "ServerId":Number(Building.Sid)
            }
            const objLoad=await globalmanager.objectLoad(Building.buildingToMove,"Building")
            if(objLoad){LoadTo.addToScene(Building.buildingToMove, Meta)}
        }
        else{/*user does not have the tile loaded to create the unit */}
    }
}





function HandleSocketResponses(socket){

    socket.on('FactoryCountsUpdate', async (response) => {
        const CivAwareness=document.getElementById("CivAwareness")
        const MilAwareness=document.getElementById("MilAwareness")
        const ProdCount=document.getElementById("ProdCount")

        try{if(response.Civ){ CivAwareness.innerHTML=`Civilian Factories: ${response.Civ}`} }catch(p){}
        try{if(response.Mil){ MilAwareness.innerHTML=`Military Factories: ${response.Mil}`} }catch(pp){}
        try{if(response.Mil){ ProdCount.innerHTML=`Total Production Lines: ${response.Mil}`} }catch(pp){}


    })

    socket.on('ProductionSetupResponse',(response) =>{ 
        function stringintoURL(str){
            return `url('Icons/TechTree/${str}.png')`;
        }
        console.log("ProductionSetupResponse",response)
        if(response){
            const ProdCount=document.getElementById("ProdCount");
            ProdCount.innerHTML=`Total Production Lines: ${response.ProductionLines.Total}`
            const FreeCount=document.getElementById("FreeCount");
            FreeCount.innerHTML=`Free Production Lines: ${response.ProductionLines.Free}`

            const ProdOptionsBox=document.getElementById("ProdBox");
            for (let key of response.Products) {
                const strURL=stringintoURL(key);

                const option=document.createElement("div");
                {
                    option.style.aspectRatio="1/1";
                    option.style.padding="0.75vw 0.75vw 0.75vw 0.75vw";
                }  

                const optionButton=document.createElement("div");
                {
                    // option.style.innerHTML=optionTags[i];
                    optionButton.className="IconGeneral"
                    optionButton.style.width="100%";
                    optionButton.style.height="100%";
                    optionButton.style.backgroundImage=strURL;//ColouroptionTags[i];
                    optionButton.style.backgroundColor="rgba(216,216,216,0.2)";//ColouroptionTags[i];
                    
                    // optionButton.myParam=key//optionObjNames[i];//"Mill";
                    
                    optionButton.addEventListener("click",()=>{socket.emit('requestProductionLine',{"RequestMetaData":key} )} )
                    
                    // optionButton.addEventListener("click",PlaceBuilding)
                } 


                option.appendChild(optionButton)
                ProdOptionsBox.appendChild(option)
            }
        }
    });

    socket.on('ProductionResponse',(response) =>{
        // console.log("ProductionResponse",response)
        if(response){

            const FreeCount=document.getElementById("FreeCount");
            FreeCount.innerHTML=`Free Production Lines: ${response.FreeLines}`
            const ProdBlocks=document.getElementById("ProdBlocks");

            const ProdContainerContainer=document.createElement("div")
            {
                ProdContainerContainer.style.width="calc(100% - 0.5vh)"
                ProdContainerContainer.id=`${response.blockId},container`
                ProdContainerContainer.style.backgroundColor="gray"
                ProdContainerContainer.style.marginBottom="1vh"
                ProdContainerContainer.style.padding="0.25vh"

            }
            ProdBlocks.appendChild(ProdContainerContainer)

            const UIProdDetails=document.createElement("div")
            {
                UIProdDetails.style.width="100%"
                UIProdDetails.style.minHeight="20px"
                // UIProdDetails.style.backgroundColor="orange"
                UIProdDetails.style.display="grid";
                UIProdDetails.style.columnGap="0.5vw"
                UIProdDetails.style.gridTemplateColumns="1.7fr 1.5fr 1fr";
            }
            ProdContainerContainer.appendChild(UIProdDetails)

            const ProductTitle=document.createElement("div")
            {
                ProductTitle.style.width="100%"
                ProductTitle.style.height="100%"
                // ProductTitle.style.backgroundColor="black"
                ProductTitle.style.display="flex"
                ProductTitle.style.alignItems="center"
                ProductTitle.style.paddingLeft="0.25vw"
                ProductTitle.innerHTML=`Product: ${response.Item}`
                ProductTitle.style.fontSize="max(1vw,1vh)"
                ProductTitle.style.color="white"
                // ProductTitle.style.lineHeight="0.75"
            }
            UIProdDetails.appendChild(ProductTitle)

            const FactoryCount=document.createElement("div")
            {
                FactoryCount.style.width="100%"
                FactoryCount.id=`${response.blockId},count`
                FactoryCount.style.height="100%"
                FactoryCount.style.display="flex"
                FactoryCount.style.alignItems="center"
                FactoryCount.innerHTML=`Factory Count: 1`
                FactoryCount.style.fontSize="max(1vw,1vh)"
                FactoryCount.style.color="white"
                // FactoryCount.style.lineHeight="0.75"
            }
            UIProdDetails.appendChild(FactoryCount)

            const closeBoxContainer=document.createElement("div")
            {
                closeBoxContainer.style.height="100%"
                closeBoxContainer.style.width="100%"
            }
            UIProdDetails.appendChild(closeBoxContainer)
            const closeBox=document.createElement("div")
            {
                closeBox.style.height="100%"
                closeBox.id=`${response.blockId},close`
                closeBox.style.aspectRatio="1/1"
                closeBox.style.backgroundColor="black"
                closeBox.style.justifySelf = "end";   // slams to right edge
            }
            closeBox.addEventListener("click",removeProductionLine)
            closeBoxContainer.appendChild(closeBox)

            const UIProdContainer=document.createElement("div")
            {
                UIProdContainer.style.width="100%"//"calc(100% - 0.5vh)"
                // UIProdContainer.style.minHeight="100px"
                UIProdContainer.style.aspectRatio="5.5/1"
                // UIProdContainer.style.backgroundColor="gray"
                UIProdContainer.style.marginTop="0.25vh"
                UIProdContainer.style.display="grid";
                UIProdContainer.style.columnGap="0.5vw"
                UIProdContainer.style.gridTemplateColumns="1.7fr 1.5fr 1fr";
            }
            ProdContainerContainer.appendChild(UIProdContainer)

            //------------------------- first section
            const ProdDetails=document.createElement("div")
            {
                ProdDetails.style.width="100%"
                ProdDetails.style.height="100%"
                // ProdDetails.style.backgroundColor="red"
                ProdDetails.style.display="grid";
                ProdDetails.style.gridTemplateRows="1fr 2.5fr 1fr"
            }
            UIProdContainer.appendChild(ProdDetails)

            const StorageTitle=document.createElement("div")
            {
                StorageTitle.style.width="100%"
                StorageTitle.style.height="100%"
                StorageTitle.id=`${response.blockId},storageTitle`
                StorageTitle.style.display="flex"
                StorageTitle.style.alignItems="center"
                StorageTitle.style.paddingLeft="0.25vw"
                StorageTitle.innerHTML=`In Storage (Appr~): ${response.Storage}`
                StorageTitle.style.fontSize="max(1vw,1vh)"
                StorageTitle.style.color="white"
            }
            ProdDetails.appendChild(StorageTitle)

            const ProductIcon=document.createElement("div")
            {
                ProductIcon.className="IconGeneral"
                ProductIcon.style.width="100%"
                ProductIcon.style.height="100%"
                // ProductIcon.style.backgroundColor="rgba(216,216,216,0.2)";
                const strimg=`url('Icons/TechTree/${response.Item}.png')`
                ProductIcon.style.backgroundImage=strimg
            }
            ProdDetails.appendChild(ProductIcon)

            
            const ProductRate=document.createElement("div")
            {
                ProductRate.style.width="100%"
                ProductRate.style.height="100%"
                ProductRate.id=`${response.blockId},ProductRate`
                ProductRate.style.display="flex"
                ProductRate.style.paddingLeft="0.25vw"
                ProductRate.style.alignItems="center"
                ProductRate.innerHTML=`Created per Day: ${response.Rate}`
                ProductRate.style.fontSize="max(1vw,1vh)"
                ProductRate.style.color="white"
            }
            ProdDetails.appendChild(ProductRate)


            //---------------------------------------
            //second section
            const FactoryParticipation=document.createElement("div")
            {
                FactoryParticipation.style.width="100%"
                FactoryParticipation.style.height="100%"
                // FactoryParticipation.style.backgroundColor="black"
                FactoryParticipation.style.display="grid"
                FactoryParticipation.style.columnGap="0.25vw"
                FactoryParticipation.style.gridTemplateColumns="1fr 5fr"
            }
            UIProdContainer.appendChild(FactoryParticipation)

            const scaleFactories=document.createElement("div")
            {
                scaleFactories.style.width="100%"
                scaleFactories.style.height="100%"
                scaleFactories.style.display="grid"
                scaleFactories.style.rowGap="0.25vh"
                // scaleFactories.style.marginBottom="0.25vh"
                // scaleFactories.style.marginTop="0.25vh"
            }
            FactoryParticipation.appendChild(scaleFactories)

            const buttons=[1,5,10]
            for(const val of buttons){
                const scaleFactor=document.createElement("div")
                {
                    scaleFactor.id=`${response.blockId},scale,${val}`
                    scaleFactor.ScaVal=`${response.blockId},${val}`;
                    scaleFactor.style.width="100%"
                    scaleFactor.style.height="100%"
                    scaleFactor.innerHTML=`${val}x`;
                    scaleFactor.style.display="flex"
                    scaleFactor.style.backgroundColor="rgb(98, 98, 98)"
                    scaleFactor.style.borderRadius="0.2vw"
                    scaleFactor.style.color="white"
                    scaleFactor.style.fontSize="max(1vw,1vh)"
                    scaleFactor.style.justifyContent="center"
                    scaleFactor.style.alignItems="center"
                }
                if(val==1){
                    scaleFactor.style.backgroundColor="rgb(75, 75, 75)"
                }

                scaleFactor.addEventListener("click",changeProdDisplayScale)
                scaleFactories.appendChild(scaleFactor)
            }

            const Factories=document.createElement("div")
            {
                Factories.style.width="100%"
                Factories.style.height="100%"
                // Factories.style.backgroundColor="red"
                Factories.style.gridTemplateColumns="repeat(5, 1fr)"
                Factories.style.display="grid"
                Factories.style.rowGap="0.25vh"
                Factories.style.columnGap="0.25vh"
            }
            FactoryParticipation.appendChild(Factories)

            for (let i = 1; i <= 3; i++) {//3 rows
                for (let j = 1; j <= 5; j++) {//5 across
                    const FacBut=document.createElement("div")
                    {
                        FacBut.className="IconGeneral"
                        // FacBut.style.backgroundImage="url";
                        FacBut.style.width="100%"
                        FacBut.style.height="100%"
                        FacBut.id=`${response.blockId},${i},${j}`
                        FacBut.style.backgroundColor="rgb(98, 98, 98)"
                    }
                    if(i==1 && j==1){
                        FacBut.style.backgroundImage=`url('Icons/TechTree/MilitaryFactory.png')`
                    }
                    FacBut.addEventListener("mouseover",ChangeProdsFactories)
                    FacBut.addEventListener("mouseout",ClearBackground)
                    FacBut.addEventListener("click",UpdateCommitedFactories)


                    Factories.appendChild(FacBut)
                }
            }


            //---------------------------------------
            //costs section
            const CostsDetails=document.createElement("div")
            {
                CostsDetails.style.width="100%"
                CostsDetails.style.height="100%"
                // CostsDetails.style.backgroundColor="purple"
                CostsDetails.style.display="grid";
                CostsDetails.style.gridTemplateRows="1.5fr 1fr 1fr 1fr"
            }
            UIProdContainer.appendChild(CostsDetails)

            const ManpowerDetails=document.createElement("div")
            {
                ManpowerDetails.style.width="100%"
                ManpowerDetails.style.height="100%"
                // ManpowerDetails.style.backgroundColor="purple"
                ManpowerDetails.style.display="grid"
                ManpowerDetails.style.gridTemplateRows="1fr 1fr"
            }
            CostsDetails.appendChild(ManpowerDetails)

            const ManpowerTxt=document.createElement("div")
            {
                ManpowerTxt.style.width="100%"
                ManpowerTxt.style.height="100%"
                ManpowerTxt.innerHTML="Manpower:"
                ManpowerTxt.style.display="flex"
                ManpowerTxt.style.alignItems="center"
                ManpowerTxt.style.fontSize="max(1vw,1vh)"
                ManpowerTxt.style.color="white"
            }
            ManpowerDetails.appendChild(ManpowerTxt)
            const ManpowerSlider=document.createElement("input")
            {
                ManpowerSlider.style.margin="0"
                ManpowerSlider.type="range"
                ManpowerSlider.min="0"
                ManpowerSlider.max="100"
                ManpowerSlider.value="50"
                ManpowerSlider.step="1"
                ManpowerSlider.style.width="100%"
                ManpowerSlider.style.height="max(1vw,1vh)"
            }
            ManpowerDetails.appendChild(ManpowerSlider)



            const GoldDetails=document.createElement("div")
            {
                GoldDetails.style.width="100%"
                GoldDetails.style.height="100%"
                GoldDetails.innerHTML="Gold:"
                GoldDetails.style.display="flex"
                GoldDetails.style.alignItems="center"
                GoldDetails.style.fontSize="max(1vw,1vh)"
                GoldDetails.style.color="white"
            }
            CostsDetails.appendChild(GoldDetails)

            const StoneDetails=document.createElement("div")
            {
                StoneDetails.style.width="100%"
                StoneDetails.style.height="100%"
                StoneDetails.innerHTML="Stone:"
                StoneDetails.style.display="flex"
                StoneDetails.style.alignItems="center"
                StoneDetails.style.fontSize="max(1vw,1vh)"
                StoneDetails.style.color="white"
            }
            CostsDetails.appendChild(StoneDetails)

            const WoodDetails=document.createElement("div")
            {
                WoodDetails.style.width="100%"
                WoodDetails.style.height="100%"
                WoodDetails.innerHTML="Wood:"
                WoodDetails.style.display="flex"
                WoodDetails.style.alignItems="center"
                WoodDetails.style.fontSize="max(1vw,1vh)"
                WoodDetails.style.color="white"
            }
            CostsDetails.appendChild(WoodDetails)
        }
    });

    socket.on('ChangeFactoryCountForProdResponse',(response) =>{
        console.log("ChangeFactoryCountForProdResponse",response)
        if(response){
            const FreeCount=document.getElementById("FreeCount");
            FreeCount.innerHTML=`Free Production Lines: ${response.FreeLines}`

            // const StorageT=document.getElementById(`${response.blockId},storageTitle`);
            // StorageT.innerHTML=`In Storage: ${response.FreeLines}`

            const Rate=document.getElementById(`${response.blockId},ProductRate`);
            Rate.innerHTML=`Created per Day: ${response.Rate}`

            const Used=document.getElementById(`${response.blockId},count`);
            Used.innerHTML=`Factory Count: ${response.FactoryCount}`
            
            ClearBackground(`${response.blockId},${response.row},${response.column}`)
            ChangeProdsFactories(`${response.blockId},${response.row},${response.column}`)
            const el = document.getElementById(`${response.blockId},${response.row},${response.column}`);
            if(el){
                // el.click()
                el.dispatchEvent(new MouseEvent("mouseout", { bubbles: true, cancelable: true }));
            }
        }
    });

    socket.on('ChangeFactoryScaleForProdResponse',(response) =>{
        console.log("ChangeFactoryScaleForProdResponse",response)
        
        if(response){
            const pot=[1,5,10]
            for(const scaler of pot){
                if(scaler==response.Scale){continue}

                const PotButton = document.getElementById(`${response.blockId},scale,${scaler}`);
                PotButton.style.backgroundColor="rgb(98, 98, 98)"
            }

            const ClickedButton = document.getElementById(`${response.blockId},scale,${response.Scale}`);
            ClickedButton.style.backgroundColor="rgb(75, 75, 75)"



            ClearBackground(`${response.blockId},${response.row},${response.column}`)
            ChangeProdsFactories(`${response.blockId},${response.row},${response.column}`)
            const el = document.getElementById(`${response.blockId},${response.row},${response.column}`);
            if(el){
                // el.click()
                el.dispatchEvent(new MouseEvent("mouseout", { bubbles: true, cancelable: true }));
            }
        }
    });

    socket.on('closeProdLine',(response) =>{
        console.log(response,"!!")//`${response.blockId},container`
        if(response){
            const removeit=document.getElementById(`${response.Remove},container`)
            removeit.remove()
            
            const FreeCount=document.getElementById("FreeCount");
            FreeCount.innerHTML=`Free Production Lines: ${response.FreeLines}`
        }
    });

    socket.on('ProductionInventoryUpdate',(response) =>{

        console.log("ProductionInventoryUpdate",response)
        if(response){
            for (const [Item, values] of Object.entries(response)) {
                const blockIds=values.blocks
                const val=values.value

                for(const blockId of blockIds){
                    const el=document.getElementById(`${blockId},storageTitle`)
                    el.innerHTML=`In Storage (Appr~): ${val}`
                }
            }

        }
    });
}


export function ProductionSetupEmit(){
    // console.log("should be emitting?")
    socket.emit('ProductionSetupRequest');
}


function ChangeProdsFactories(e){
    const isevent=e instanceof Event
    var target=e.target;
    var prodBlockId,row,column;
    var flag=false;

    // const target=e.target
    // const [prodBlockId,row,column]=target.id.split(",").map(Number)
    
    if(isevent){
        [prodBlockId,row,column]=target.id.split(",").map(Number)
    }else if(typeof e === "string"){
        flag=true;
        [prodBlockId,row,column]=e.split(",").map(Number);
        target=document.getElementById(`${prodBlockId},${row},${column}`)
    }

    // console.log([prodBlockId,row,column],parent,target.style.backgroundImage=='')

    for (let r = 1; r <= row; r++) {
        // if it's the last row, stop at 'column'
        const maxCol = (r === row ? column : 5);

        for (let c = 1; c <= maxCol; c++) {
            const cell = document.getElementById(`${prodBlockId},${r},${c}`);
            if (cell) {
                cell.style.backgroundColor = "rgb(75, 75, 75)";
                if(flag){
                    cell.style.backgroundImage=`url('Icons/TechTree/MilitaryFactory.png')`
                }
            }
        }
    }

}

function ClearBackground(e){
    
    const isevent=e instanceof Event
    
    var target=e.target;
    var prodBlockId,row,column;
    var flag=false;
    if(isevent){
        // target=
        [prodBlockId,row,column]=target.id.split(",").map(Number)
    }else if(typeof e === "string"){
        flag=true;
        [prodBlockId,row,column]=e.split(",").map(Number);
        target=document.getElementById(`${prodBlockId},${row},${column}`)
    }

    for (let r = 1; r <= 3; r++) {
        // if it's the last row, stop at 'column'
        const maxCol = 5//(r === row ? column : 5);

        for (let c = 1; c <= maxCol; c++) {
            const cell = document.getElementById(`${prodBlockId},${r},${c}`);
            if (cell) {
                cell.style.backgroundColor = "rgb(98, 98, 98)";
                if(flag){
                    cell.style.backgroundImage = ''
                }
                
            }
        }
    }

}

function UpdateCommitedFactories(e){
    const target=e.target
    const [prodBlockId,row,column]=target.id.split(",").map(Number)

    socket.emit('ChangeFactoryCountForProd',{
        "RequestMetaData":{blockId:prodBlockId,row:row,column:column}
    })
}

function changeProdDisplayScale(e){
    // console.log("scale value",e.target.ScaVal)
    const target=e.target
    const [prodBlockId,Scale]=target.ScaVal.split(",").map(Number)
    socket.emit('ChangeFactoryScaleForProd',{
        "RequestMetaData":{blockId:prodBlockId,Scale:Scale}
    })
}

function removeProductionLine(e){
    // console.log(e.target.id)
    const target=e.target
    const [prodBlockId,extra]=target.id.split(",").map(Number)
    socket.emit('CloseProductionLine',{
        "RequestMetaData":{blockId:prodBlockId}
    })
}

//------------------------------------------construction


function WallCase(wallType){
    previewGroup.clear()
    if(!previewGroup.parent){
        scene.add(previewGroup);
    }

    try{
        renderer.domElement.removeEventListener( 'pointermove', onPointerMove );
        renderer.domElement.removeEventListener( 'pointermove', onHoverBuilding );
        renderer.domElement.removeEventListener( 'click', onclickBuilding );
        scene.remove(hoveringBuildings.get(BuildingAssetName))
        requestRenderIfNotRequested();
        console.log("cleared buildingcases")
    }catch(p){}
    BuildingAssetName=wallType

    InputState.value="Builder"
    // console.log("wallType",wallType)    


    renderer.domElement.addEventListener("mousemove", wallCaseHover);
    renderer.domElement.addEventListener("click", wallCaseClick);

    document.addEventListener('keyup', wallCaseEscape);

    // const segments = buildWallSegments(userPoints, 10, 4);

    // segments.forEach(seg => {
    //     const color = new THREE.Color(Math.random(), Math.random(), Math.random());
    //     const mat = new THREE.LineBasicMaterial({ color });
    //     const geo = new THREE.BufferGeometry().setFromPoints(seg);
    //     const line = new THREE.Line(geo, mat);
    //     scene.add(line);
    // });



}



function wallCaseHover(event){
    previewGroup.clear()

    onPointerMove(event)
    const copyPath=userPoints.slice()
    // console.log("wallHover",copyPath)
    const intersects = intersectsTileMeshes()
    if(intersects.length==0){return}
    const IntersectPoint=intersects[0].point
    const chunkX=Math.floor((IntersectPoint.x+3.75)/7.5);const chunkY=Math.floor((IntersectPoint.y+3.75)/7.5)
    const xyz=superHeightMapTexture.getXYZ(chunkX,chunkY,[((IntersectPoint.x+3.75)/7.5)*1536,((IntersectPoint.z+3.75)/7.5)*1536])
    
    let newPoint = new THREE.Vector3(xyz[0], xyz[1], xyz[2]);

    if(copyPath.length>2){ 
        newPoint = trySnapPoint(newPoint, copyPath, 0.1);
        
    }
    copyPath.push(newPoint)//new THREE.Vector3(xyz[0],xyz[1],xyz[2]))
    if(copyPath.length>1){ 


        const segments = buildWallSegments(copyPath, 0.2, 0.1);
        if(segments.length>0){
            // console.log("segments",segments)
            
            segments.forEach(seg => {
                const color = new THREE.Color(Math.random(), Math.random(), Math.random());
                const mat = new THREE.LineBasicMaterial({ color });
                const geo = new THREE.BufferGeometry().setFromPoints(seg);
                const line = new THREE.Line(geo, mat);
                previewGroup.add(line); // put in group instead of scene
            });
        }
        
    }

    requestRenderIfNotRequested();
}

function wallCaseClick(){
    if(!suppressPlacement.value){
        

        const intersects = intersectsTileMeshes()
        const IntersectPoint=intersects[0].point
        // (chunkX,chunkY,[((IntersectPoint.x+3.75)/7.5)*1536,((IntersectPoint.z+3.75)/7.5)*1536])
        const chunkX=Math.floor((IntersectPoint.x+3.75)/7.5)
        const chunkY=Math.floor((IntersectPoint.y+3.75)/7.5)
        const xyz=superHeightMapTexture.getXYZ(chunkX,chunkY,[((IntersectPoint.x+3.75)/7.5)*1536,((IntersectPoint.z+3.75)/7.5)*1536])
        // console.log("IntersectPoint",IntersectPoint,xyz)
        let newPoint = new THREE.Vector3(xyz[0], xyz[1], xyz[2]);
        // userPoints.push(new THREE.Vector3(xyz[0],xyz[1],xyz[2]))
        if(userPoints.length>2){ 
            newPoint = trySnapPoint(newPoint, userPoints, 0.1);
        }
        userPoints.push(newPoint)
    }else{suppressPlacement.value=false;}
}

function wallCaseEscape(e){
    if (e.key === 'Escape'){
        // DragSelectionKey = false;
        // controls.enabled=true
        console.log("poopee")
        InputState.value="neutral"
        previewGroup.clear()
        userPoints=[]
        document.removeEventListener('keyup', wallCaseEscape)
        renderer.domElement.removeEventListener("click", wallCaseClick)
        renderer.domElement.removeEventListener("mousemove", wallCaseHover)
    }
}

//-------------------------------------------------------

let productionInterval = null;

export function openProductionTab() {
    console.log("pinging for inventory updates")
    if (!productionInterval) {
        // Emit every 20 seconds while tab is open
        productionInterval = setInterval(() => {
            socket.emit("requestingProductionInventory");
        }, 20000);
    }
}

export function closeProductionTab() {
    if (productionInterval) {
        clearInterval(productionInterval);
        productionInterval = null;
    }
}