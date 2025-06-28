import {updateGridColumns} from "./Utils.js"
import {onPointerMove,intersectsTileMeshes} from "./RaycasterHandling.js"
import {globalmanager} from "./GlobalInstanceMngr.js"
import {renderer,UserId,InputState} from "../siteJS.js"
import {EmitBuildingPlacementRequest,EmitUnitPlacementRequest,EmitUnitsBeingDeployed} from "./SceneInitiation.js"



var BuildingAssetName;//variable to hold which building is trying to be placed right now
var divToChangevalue;//this holds the div that displays the deploy position

//------------------------------------------------------------------------
//Unit creation and handling functions
export function adjustUnitDeployPosition(response){
    const position=response.position;
    const X=position[0].toFixed(2)
    const Y=position[1].toFixed(2)
    const Z=position[2].toFixed(2)
    divToChangevalue.innerText=X+","+Y+","+Z

    const ToTile=globalmanager.getTile(response.tile[0],response.tile[1])
    // console.log("target tile",response.tile[0],response.tile[1],ToTile)
    divToChangevalue.myParam=[position,ToTile || undefined]
}
export function onTileClick(ev){
    const intersects = intersectsTileMeshes()//raycaster.intersectObjects(globalmanager.allTileMeshes, true);

    if (intersects.length > 0) {
        const intersectedMesh = intersects[0].object;
        const foundTile =  globalmanager.meshToTiles.get(intersectedMesh);

        if (foundTile) {
            const IntersectPoint=intersects[0].point
            const processedPoint=[IntersectPoint.x,IntersectPoint.y,IntersectPoint.z]

            const RequestMetaData={
                "tile":[foundTile.x, foundTile.y],
                "position":processedPoint,
                "userOwner":UserId//localStorage.getItem('accessToken').id,
            }
            EmitUnitPlacementRequest(RequestMetaData)
        }
    }
}

function IterateOverDeploy(regimenEnvelope,DeployPoint,Obj_Identifier){
    console.log(Obj_Identifier)
    // console.log(regimenEnvelope.children.length)More actions
    //loop for deploying all units in regimen
    try{
        if(DeployPoint.myParam[0]==undefined){return}
    }catch(plu){return}

    const targetTile=DeployPoint.myParam[1]
    const DeployPosition=DeployPoint.myParam[0]
    //because the terrain is gpu drawn, need to get the height from the heightmap at the a,y position!

    const requestMetaData={
        "UnitCount":regimenEnvelope.children.length-1,
        "UnitType":Obj_Identifier,
        "DeployPosition":DeployPosition,
        "tile":[targetTile.x,targetTile.y],
        "owner":UserId,
    }
    // for(let i=1;i<regimenEnvelope.children.length;i++){
        
    //     // const IntersectPoint=intersects[0].point

    //     //build the request



    //     // DeployPoint.myParam[1].getPosWithHeight(DeployPoint.myParam[0]).then(val=>{
    //     //     console.log(val, "should be the point.....")
    //     //     const instanceMetaData={
    //     //         "position":val,
    //     //         "userId":UserId,//localStorage.getItem('accessToken').id,//ThisUser._id,
    //     //         "health":100,
    //     //         // "state":"Built"
    //     //     }
    //     //     DeployPoint.myParam[1].objectLoad(Obj_Identifier,instanceMetaData)

    //     // })
    //     regimenEnvelope.removeChild(regimenEnvelope.children[i])

    // }
    EmitUnitsBeingDeployed(requestMetaData)
    // console.log(regimenEnvelope.parentElement)
    regimenEnvelope.parentElement.removeChild(regimenEnvelope)
    // console.log(DeployPoint.myParam,"yes param")
}

function deploymentPoint(event){
    InputState.value="DeploymentPointRegime"
    divToChangevalue=event.target;
    // console.log("target",divToChangevalue)
    renderer.domElement.addEventListener( 'pointermove', onPointerMove );
    renderer.domElement.addEventListener( 'click', onTileClick );
        
}

function createUnitRegime(event){
    const whichUnit=event.currentTarget.myParam//archer, spearmen etc
    console.log(whichUnit, "THIS UNIT!!!!")

    //add to PieceRegimen
    const component=document.getElementById("PieceRegimen");
    // component.style.marginTop="1px"
    const regimenEnvelope=document.createElement("div");
    {
        regimenEnvelope.style.width="100%";
        // regimenEnvelope.style.height="20px"
        regimenEnvelope.style.display = "block";

        regimenEnvelope.style.marginBottom="1vw"//"max(2vw,2vh)";
        regimenEnvelope.style.backgroundColor="gray";
        regimenEnvelope.style.borderBottom="solid 4px black"
    }
    component.appendChild(regimenEnvelope)

    const TopInfo=document.createElement("div");
    {
        TopInfo.style.display="grid"
        TopInfo.style.gridTemplateColumns="1fr 4fr 2fr"
        TopInfo.style.columnGap="4px";
        TopInfo.style.borderBottom="solid 4px black"
        // TopInfo.style.borderTop="solid 4px black"
    }
    regimenEnvelope.appendChild(TopInfo)
    const ImageHolder=document.createElement("div");
    {
        ImageHolder.style.width="calc(100% - 4px)";
        // ImageHolder.style.aspectRatio="1/1";
        ImageHolder.style.padding="4px"
        ImageHolder.style.paddingRight="0"
    }
    TopInfo.appendChild(ImageHolder)
    const ImageIcon=document.createElement("div");
    {
        ImageIcon.style.backgroundColor="white";
        ImageIcon.className="IconGeneral"
        ImageIcon.style.backgroundImage="url('Icons/"+whichUnit +"Icon.png')"
        ImageIcon.style.width="100%"
        // ImageIcon.style.height="100%"
        ImageIcon.style.paddingTop="100%"
        ImageIcon.style.height = "auto"; // or remove it entirely
        ImageIcon.style.display = "block"; // Prevents bottom whitespace
    }
    ImageHolder.appendChild(ImageIcon)

    const midTopSection=document.createElement("div");
    {
        midTopSection.style.display="grid"
        midTopSection.style.gridTemplateRows="1fr 1fr"
        midTopSection.style.width="100%"
    }
    TopInfo.appendChild(midTopSection)

    const UnitType=document.createElement("div");
    {
        // midTopSection.style.gridTemplateRows="1fr 1fr"
        UnitType.style.width="calc(100%)"
        UnitType.style.backgroundColor="white"
        UnitType.style.color="black"
        UnitType.style.margin="4px 0 2px 0px"
        UnitType.style.overflow="hidden"
        UnitType.style.whiteSpace="nowrap"
        UnitType.innerText=whichUnit
        UnitType.style.textAlign="center"
        UnitType.style.alignContent="center"
        UnitType.style.fontSize="max(1.5vw,1.5vh)"
    }
    midTopSection.appendChild(UnitType)

    const DeployPoint=document.createElement("div");
    {
        // midTopSection.style.gridTemplateRows="1fr 1fr"
        DeployPoint.style.width="100%"
        DeployPoint.style.backgroundColor="white"
        DeployPoint.style.margin="2px 0 4px 0px"
        DeployPoint.innerText="Select A Position"
        DeployPoint.style.overflow="hidden"
        DeployPoint.style.whiteSpace="nowrap"
        DeployPoint.style.textAlign="center"
        DeployPoint.style.alignContent="center"
        DeployPoint.style.fontSize="max(1.5vw,1.5vh)"
    }
    DeployPoint.addEventListener("click",deploymentPoint)
    midTopSection.appendChild(DeployPoint)

    const RightTopSection=document.createElement("div");
    {
        RightTopSection.style.display="grid"
        RightTopSection.style.gridTemplateRows="1fr 1fr"
        RightTopSection.style.width="100%"
    }
    TopInfo.appendChild(RightTopSection)
    
    const AddSubSection=document.createElement("div");
    {
        AddSubSection.style.width="calc(100% - 4px)"
        // AddSubSection.style.backgroundColor="white"
        AddSubSection.style.margin="4px 4px 2px 0px"
        // AddSubSection.style.alignContent="center"
        AddSubSection.style.display="flex"
        AddSubSection.style.flexDirection="row"
    }
    RightTopSection.appendChild(AddSubSection)

    const SubtractBut=document.createElement("div");
    {
        // SubtractBut.style.height="100%"
        SubtractBut.style.aspectRatio="1/1"
        // SubtractBut.style.left="0"
        SubtractBut.style.backgroundColor="white"
        SubtractBut.style.backgroundImage="url('Icons/Subtract.png')"
        SubtractBut.className="IconGeneral"
    }
    AddSubSection.appendChild(SubtractBut)

    const middle = document.createElement("div");
    {
        // middle.style.flex = "1";
        middle.style.aspectRatio="1/2"
        middle.style.minWidth = "0"; // important to allow shrinking
        middle.style.background = "rgb(98, 98, 98)";
        middle.style.overflow="hidden"
    }

    AddSubSection.appendChild(middle)
    const AddBut=document.createElement("div");
    {
        // SubtractBut.style.height="100%"
        AddBut.style.aspectRatio="1/1"
        // AddBut.style.right="0"
        AddBut.style.backgroundColor="white"
        AddBut.style.backgroundImage="url('Icons/Add.png')"
        AddBut.className="IconGeneral"
    }
    AddSubSection.appendChild(AddBut)


    const AddDeploySection=document.createElement("div");
    {
        AddDeploySection.style.width="calc(100% - 4px)"
        // AddDeploySection.style.backgroundColor="white"
        AddDeploySection.style.margin="2px 4px 4px 0px"
        // AddDeploySection.style.alignContent="center"
        AddDeploySection.style.display="flex"
        AddDeploySection.style.flexDirection="row"
    }
    RightTopSection.appendChild(AddDeploySection)

    const countHolder = document.createElement("div");
    {
        countHolder.style.flex = "1";
        // countHolder.style.aspectRatio="1/2"
        countHolder.style.minWidth = "0"; // important to allow shrinking
        countHolder.style.background = "white";
        countHolder.style.overflow="hidden"
        countHolder.style.whiteSpace="nowrap"
        countHolder.innerText="1"
        countHolder.style.textAlign="center"
        countHolder.style.alignContent="center"
        countHolder.style.fontSize="max(1.5vw,1.5vh)"
    }
    AddDeploySection.appendChild(countHolder)

    const DeployBut=document.createElement("div");
    {
        // SubtractBut.style.height="100%"
        DeployBut.style.height="100%";
        // DeployBut.style.width="auto"
        DeployBut.style.aspectRatio="1/1"
        // AddBut.style.right="0"
        DeployBut.style.backgroundColor="white"
        DeployBut.style.backgroundImage="url('Icons/Deploy.png')"
        DeployBut.className="IconGeneral"
        DeployBut.style.marginLeft="4px"
    }
    DeployBut.addEventListener("click",function(){
        IterateOverDeploy(regimenEnvelope,DeployPoint,whichUnit);
    })
    AddDeploySection.appendChild(DeployBut)
    
    //adding the section for the specific units within the regimen
    const soldierTrack=document.createElement("div");
    {
        soldierTrack.style.width="calc(100% - 8px)"
        soldierTrack.style.aspectRatio="10/1"
        soldierTrack.style.backgroundColor="gray"
        soldierTrack.style.padding="4px"
        
        soldierTrack.style.display="flex"
        soldierTrack.style.flexDirection="row"
        soldierTrack.style.columnGap="4px"
    }
    regimenEnvelope.appendChild(soldierTrack)

    const SoldierSpecifics=document.createElement("div");
    {
        // DeploySpecific.style.aspectRatio="1/1"
        SoldierSpecifics.style.backgroundColor="white"
        SoldierSpecifics.style.flex = "1";
        SoldierSpecifics.style.minWidth = "0";
    }
    soldierTrack.appendChild(SoldierSpecifics)

    const DeploySpecific=document.createElement("div");
    {
        DeploySpecific.style.aspectRatio="1/1"
        DeploySpecific.style.backgroundColor="white"
    }
    soldierTrack.appendChild(DeploySpecific)

    const cancelTrain=document.createElement("div");
    {
        cancelTrain.style.aspectRatio="1/1"
        cancelTrain.style.backgroundColor="white"
    }
    soldierTrack.appendChild(cancelTrain)







    AddBut.addEventListener("click",function(e){
        try{
            const val=Number(countHolder.innerText)
            countHolder.innerText=val+1
            // console.log(, "THIS IS THE PARENT")
            // const rootRegimen=e.target.parentElement.parentElement.parentElement.parentElement
            const soldierTrack=document.createElement("div");
            {
                soldierTrack.style.width="calc(100% - 8px)"
                soldierTrack.style.aspectRatio="10/1"
                soldierTrack.style.backgroundColor="gray"
                soldierTrack.style.padding="4px"
                
                soldierTrack.style.display="flex"
                soldierTrack.style.flexDirection="row"
                soldierTrack.style.columnGap="4px"
            }
            regimenEnvelope.appendChild(soldierTrack)

            const SoldierSpecifics=document.createElement("div");
            {
                // DeploySpecific.style.aspectRatio="1/1"
                SoldierSpecifics.style.backgroundColor="white"
                SoldierSpecifics.style.flex = "1";
                SoldierSpecifics.style.minWidth = "0";
            }
            soldierTrack.appendChild(SoldierSpecifics)

            const DeploySpecific=document.createElement("div");
            {
                DeploySpecific.style.aspectRatio="1/1"
                DeploySpecific.style.backgroundColor="white"
            }
            soldierTrack.appendChild(DeploySpecific)

            const cancelTrain=document.createElement("div");
            {
                cancelTrain.style.aspectRatio="1/1"
                cancelTrain.style.backgroundColor="white"
            }
            soldierTrack.appendChild(cancelTrain)
        }catch(p){}
        
    });
    SubtractBut.addEventListener("click",function(){
        try{
            const val=Number(countHolder.innerText)
            if(val > 1){
                countHolder.innerText=val-1
                regimenEnvelope.removeChild(regimenEnvelope.lastChild)
            }
            
        }catch(p){}
    });
}

function MilTrainingElements(){
    const contentBox=document.getElementById("Dropdown_Content_Box");
    const MilTraincontentBox=document.getElementById("MilTraincontentBox");

    if(!MilTraincontentBox){
        const creatingMTCB=document.createElement("div");
        {
            creatingMTCB.style.width="100%";
            // creatingMTCB.style.height=""
            creatingMTCB.style.maxHeight="100%"
            creatingMTCB.id="MilTraincontentBox"
            // creatingMTCB.style.flexGrow="0";
            // flex-grow: 0;
        }
        contentBox.appendChild(creatingMTCB)

        const TrainingOptionsBox=document.createElement("div");
        {
            TrainingOptionsBox.style.width="100%";
            TrainingOptionsBox.style.display="grid";
            TrainingOptionsBox.style.gridTemplateRows="auto auto"
        }
        creatingMTCB.appendChild(TrainingOptionsBox)

        const IndiOrTemplateButtons=document.createElement("div");
        {
            // IndiOrTemplateButtons.style.backgroundColor="red";
            IndiOrTemplateButtons.id="IndiOrTemplateButtons"
            IndiOrTemplateButtons.style.width="calc(100% - 8px)"
            // IndiOrTemplateButtons.style.aspectRatio="12/1"
            IndiOrTemplateButtons.style.display="grid";
            IndiOrTemplateButtons.style.gridTemplateColumns="auto auto 0"
            IndiOrTemplateButtons.style.columnGap="4px"
            IndiOrTemplateButtons.style.marginLeft="4px"
            IndiOrTemplateButtons.style.marginRight="4px"
            // IndiOrTemplateButtons.style.maxWidth="calc(100% - 8px)"
            IndiOrTemplateButtons.style.minWidth = "0"; // ⚠️ Important for shrinking
            IndiOrTemplateButtons.style.borderBottom="solid 0.25vw gray"
        }
        TrainingOptionsBox.appendChild(IndiOrTemplateButtons)

        const TemplateBut=document.createElement("div");
        {
            TemplateBut.style.backgroundColor="red";
            // TemplateBut.style.width="calc(100% - 8px)"
            TemplateBut.style.height="calc(100% - 8px)"
            TemplateBut.style.margin="4px"
            TemplateBut.style.marginRight="0"
            TemplateBut.style.marginLeft="0"

            TemplateBut.innerText="Template"
            TemplateBut.style.fontSize="max(1.5vw,1.5vh)"
            TemplateBut.style.alignContent="center"
            TemplateBut.style.textAlign="center"
        }
        IndiOrTemplateButtons.appendChild(TemplateBut)

        const IndepBut=document.createElement("div");
        {
            IndepBut.style.backgroundColor="red";
            // IndepBut.style.width="calc(100% - 8px)"
            IndepBut.style.height="calc(100% - 8px)"
            IndepBut.style.margin="4px"
            IndepBut.style.marginLeft="0"
            IndepBut.style.marginRight="0px"
            IndepBut.innerText="Individual"
            IndepBut.style.fontSize="max(1.5vw,1.5vh)"
            IndepBut.style.alignContent="center"
            IndepBut.style.textAlign="center"
        }
        IndiOrTemplateButtons.appendChild(IndepBut)


        
        //create the box that houses these options
        const IndiTemplateOptionHolder=document.createElement("div");
        {
            IndiTemplateOptionHolder.style.width="calc(100% - 8px)";
            IndiTemplateOptionHolder.style.height="calc(100% - 8px)";
            // IndiTemplateOptionHolder.style.backgroundColor="pink"
            IndiTemplateOptionHolder.style.margin="4px"
            IndiTemplateOptionHolder.style.borderBottom="solid 0.25vw gray"
        }
        TrainingOptionsBox.appendChild(IndiTemplateOptionHolder)
        
        const IndiOptionHolder=document.createElement("div");
        {
            IndiOptionHolder.style.width="100%";
            IndiOptionHolder.id="IndiOptionHolder"
            IndiOptionHolder.style.display="grid";
            IndiOptionHolder.style.gridTemplateColumns="1fr 1fr 1fr 1fr 1fr 1fr 1fr"
            // IndiOptionHolder.style.backgroundColor="pink"
            IndiOptionHolder.style.columnGap="4px"
            IndiOptionHolder.style.rowGap="4px"
        }
        IndiTemplateOptionHolder.appendChild(IndiOptionHolder)
        
        // create the options for individual units
        const indiUnits=[["archer","url('Icons/ArcherIcon.png')"],["spearman","url('Icons/SpearManIcon.png')"],
    ["spearman","url('Icons/SpearManIcon.png')"],["spearman","url('Icons/SpearManIcon.png')"],["spearman","url('Icons/SpearManIcon.png')"]
,["spearman","url('Icons/SpearManIcon.png')"],["spearman","url('Icons/SpearManIcon.png')"],["spearman","url('Icons/SpearManIcon.png')"]]




        indiUnits.forEach((param)=>{
            const unitHolder=document.createElement("div");
            {
                unitHolder.style.width="calc(100% - 1vw)"
                
                // unitHolder.style.aspectRatio="1/1"
                unitHolder.style.padding="0.5vw"
                // unitHolder.style.paddingTop="100%"
            }
            IndiOptionHolder.appendChild(unitHolder)
            const unit=document.createElement("div");
            {
                unit.style.width="100%"
                unit.style.height = "auto"; // or remove it entirely
                unit.style.display = "block"; // Prevents bottom whitespace
                unit.style.paddingTop="100%"
                unit.myParam=param[0]

                unit.style.backgroundImage=param[1]||"";
                unit.className="IconGeneral"
            }


            unit.addEventListener("click",createUnitRegime)
            
            
            unitHolder.appendChild(unit)
        })

        const TemplateOptionHolder=document.createElement("div");
        {
            TemplateOptionHolder.style.width="100%";
            TemplateOptionHolder.id="TemplateOptionHolder"
            TemplateOptionHolder.style.display="none";
            TemplateOptionHolder.style.gridTemplateColumns="1fr 1fr 1fr 1fr 1fr 1fr 1fr"
            // TemplateOptionHolder.style
            TemplateOptionHolder.style.columnGap="4px"
            TemplateOptionHolder.style.rowGap="4px"
        }
        IndiTemplateOptionHolder.appendChild(TemplateOptionHolder)
        
        indiUnits.forEach((param)=>{//placeholder purposes
            const Template=document.createElement("div");
            {
                Template.style.width="100%"
                Template.myParam=param
                Template.style.aspectRatio="1/1"
                Template.style.backgroundColor="green"
                // soldier.style.
            }
            // TemplateOptionHolder.appendChild(Template)
        })


        //section that displays the training regimens

        const titlePieceRegimen=document.createElement("div");
        {
            titlePieceRegimen.style.maxWidth="calc(100% - 8px)";
            titlePieceRegimen.style.height="100%";
            titlePieceRegimen.style.display="inline-block"
            // IndiTemplateOptionHolder.style.backgroundColor="pink"
            titlePieceRegimen.style.marginLeft="4px"
            titlePieceRegimen.style.marginRight="4px"
            titlePieceRegimen.style.marginTop="1vw"
            titlePieceRegimen.style.marginBottom="1vw"
            titlePieceRegimen.style.borderBottom="solid 0.25vw gray"
            titlePieceRegimen.innerText="Training Regimens"
            titlePieceRegimen.style.color="white"
            titlePieceRegimen.style.fontSize="max(1.5vw,1.5vh)"
            titlePieceRegimen.style.alignContent="center"
            titlePieceRegimen.style.textAlign="left"
        }
        creatingMTCB.appendChild(titlePieceRegimen)

        const PieceRegimen=document.createElement("div");
        {
            PieceRegimen.id="PieceRegimen"
            PieceRegimen.style.width="calc(100% - 8px)";
            // PieceRegimen.style.minHeight="20px"
            // PieceRegimen.style.height="100%";
            PieceRegimen.style.display="block"
            // PieceRegimen.style.backgroundColor="pink"
            PieceRegimen.style.marginLeft="4px"
            PieceRegimen.style.marginRight="4px"
            // titlePieceRegimen.style.marginTop="1vw"
            // titlePieceRegimen.style.borderBottom="solid 0.25vw gray"
            // titlePieceRegimen.innerText="Training Regimens"
            // titlePieceRegimen.style.color="white"
            // titlePieceRegimen.style.fontSize="max(1.5vw,1.5vh)"
            // titlePieceRegimen.style.alignContent="center"
            // titlePieceRegimen.style.textAlign="left"
        }
        creatingMTCB.appendChild(PieceRegimen)

        IndepBut.addEventListener('click',function(){
            // console.log("MMMM, yesss")
            TemplateOptionHolder.style.display="none"
            IndiOptionHolder.style.display="grid"
        })
        TemplateBut.addEventListener('click',function(){
            // console.log("MMMM, yesss")
            IndiOptionHolder.style.display="none"
            TemplateOptionHolder.style.display="grid"
        })
    }else{
        MilTraincontentBox.style.display="block"
    }
    updateGridColumns();
}
//-------------------------------------------------------------------------
//construction functions
export function onclickBuilding(event){
    // console.log("CLICKED!!!!!!!!!!!!!!!!!!!!!!!!!")

    const intersects = intersectsTileMeshes()

    if (intersects.length > 0) {
        const intersectedMesh = intersects[0].object;
        const foundTile =  globalmanager.meshToTiles.get(intersectedMesh);

        if (foundTile) {
            // console.log("Clicked tile:", foundTile.x, foundTile.y);

            //find the tile, add the building

            const IntersectPoint=intersects[0].point
            const processedPoint=[IntersectPoint.x,IntersectPoint.y,IntersectPoint.z]

            const RequestMetaData={
                "tile":[foundTile.x, foundTile.y],
                "position":processedPoint,
                "rotation":0,
                "userOwner":UserId,
                "UnitType":BuildingAssetName
            }
            //permission is false, or it will be an adjusted position
            EmitBuildingPlacementRequest(RequestMetaData);//BuildingAssetName,

            // console.log("aight, we got the press",processedPoint)
        }
    }

    //this code needs to be moved the response of EmitBuildingPlacementRequest
    //the user clicked, the building has been placed, remove eventListeners
    // renderer.domElement.removeEventListener( 'pointermove', onPointerMove );
    // renderer.domElement.removeEventListener( 'click', onclickBuilding );
}

function onHoverBuilding(event){
    onPointerMove(event)

    //would be moving the asset of BuildingAssetName
}

function PlaceBuilding(event){
    InputState.value="Builder"
    //on renderer.domElement so that placement doesnt follow when users mouse is over the overlay
    renderer.domElement.addEventListener( 'pointermove', onHoverBuilding );
    renderer.domElement.addEventListener( 'click', onclickBuilding );

    BuildingAssetName=event.currentTarget.myParam

}

function ConstructionElements(){
    const contentBox=document.getElementById("Dropdown_Content_Box");
    const ConstructioncontentBox=document.getElementById("ConstructioncontentBox");
    if(!ConstructioncontentBox){
        
        const creatingCCB=document.createElement("div");
        {
            creatingCCB.style.width="100%";
            creatingCCB.id="ConstructioncontentBox"
        }
        contentBox.appendChild(creatingCCB)

        const BuildOptionsTitle=document.createElement("div");
        {
            BuildOptionsTitle.style.width="calc(100% - 1vw)";
            BuildOptionsTitle.style.aspectRatio="11/1";
            BuildOptionsTitle.style.margin="0 0.5vw 0 0.5vw";
            BuildOptionsTitle.style.alignContent="center";
            BuildOptionsTitle.innerText="Build Options";
            BuildOptionsTitle.style.fontSize="max(1vw,1vh)";
            BuildOptionsTitle.style.color="white"
            BuildOptionsTitle.style.borderBottom="solid gray 0.25vw"
        }
        // const BuildOptionsTitle=TitleBoxes("Build Options");
        // BuildOptionsTitle.innerText="Build Options"

        creatingCCB.appendChild(BuildOptionsTitle)

        const BuildOptionsBox=document.createElement("div");
        {
            BuildOptionsBox.style.width="100%";
            BuildOptionsBox.style.display="grid";
            BuildOptionsBox.style.gridTemplateColumns="1fr 1fr 1fr 1fr 1fr 1fr 1fr";
        }
        creatingCCB.appendChild(BuildOptionsBox)

        //important to keep up to date with asset names/ will change depending on research level to get the up-to-date assets
        const optionObjNames=["ArmsFactory","CivilianFactory","Mine","SawMill","Mill","Storage","House"]

        const ColouroptionTags=[
            "url('Icons/ArmsFactoryIcon.png')","url('Icons/CivilianFactoryIcon.png')",
            "url('Icons/quarryIcon.png')","url('Icons/SawmillIcon.png')",
            "url('Icons/MillIcon.png')","url('Icons/WarehouseIcon.png')",
            "url('Icons/HouseIcon.png')",
            
        ]

        for(let i=0;i<7;i++){
            const option=document.createElement("div");
            {
                // option.style.innerHTML=optionTags[i];
                option.style.aspectRatio="1/1";
                // option.style.backgroundColor=ColouroptionTags[i];
                option.style.padding="0.75vw 0.75vw 0.75vw 0.75vw";
            }  

            const optionButton=document.createElement("div");
            {
                // option.style.innerHTML=optionTags[i];
                optionButton.className="IconGeneral"
                optionButton.style.width="100%";
                optionButton.style.height="100%";
                optionButton.style.backgroundImage=ColouroptionTags[i];
                optionButton.style.backgroundColor="gray";//ColouroptionTags[i];
                
                optionButton.myParam=optionObjNames[i];//"Mill";
                
                
                
                optionButton.addEventListener("click",PlaceBuilding)
            } 


            option.appendChild(optionButton)
            BuildOptionsBox.appendChild(option)

        };

        const BuildQueueTitleBox=document.createElement("div");
        {
            BuildQueueTitleBox.style.width="calc(100% - 1vw)";
            // BuildQueueTitleBox.style.aspectRatio="13/1";
            BuildQueueTitleBox.style.display="grid";
            BuildQueueTitleBox.style.gridTemplateColumns="1.5fr 1fr ";
            BuildQueueTitleBox.style.margin="0 0.5vw 0 0.5vw";
            BuildQueueTitleBox.style.borderBottom="solid gray 0.25vw"
            BuildQueueTitleBox.style.marginBottom="1vw"
            
        }
        creatingCCB.appendChild(BuildQueueTitleBox)

        const BuildingTypeName=document.createElement("div");
        {
            BuildingTypeName.style.width="calc(100% - 1vw)";
            BuildingTypeName.style.padding="0 0.5vw 0 0.5vw";
            BuildingTypeName.style.alignContent="center";
            BuildingTypeName.innerText="Building Type";
            BuildingTypeName.style.fontSize="max(1vw,1vh)";
            BuildingTypeName.style.color="white"        
        }
        BuildQueueTitleBox.appendChild(BuildingTypeName)

        const ManpowerAllocation=document.createElement("div");
        {
            ManpowerAllocation.style.width="calc(100% - 1vw)";
            ManpowerAllocation.style.padding="0 0.5vw 0 0.5vw";
            ManpowerAllocation.style.alignContent="center";
            ManpowerAllocation.innerText="Allocate Manpower";
            ManpowerAllocation.style.fontSize="max(1vw,1vh)";
            ManpowerAllocation.style.color="white"
            // ManpowerAllocation.style.backgroundColor="brown"
            
        }
        BuildQueueTitleBox.appendChild(ManpowerAllocation)
        
    }else{
        ConstructioncontentBox.style.display="block"
    }
}

//--------------------------------------------------------------------------
//handle the display of selected objects

function addToMiscSelection(option, values){
    var whichTo=false;
    switch(option){
        case "Buildings":
            whichTo=document.getElementById("BuildingDisplayContentBox");
            break;
        case "Units":
            whichTo=document.getElementById("UnitsDisplayContentBox");
            break;
        case "Misc":
            whichTo=document.getElementById("OtherDisplayContentBox");
            break;
        default:
            console.log("hmm")
            break;
    }

    if(whichTo!=false){
        //traverse through each key (which is unitType) with a count display
        while (whichTo.firstChild) {
            whichTo.removeChild(whichTo.firstChild);
        }
        for (const [key, value] of Object.entries(values)) {
            console.log(key, value);
            const Envelope=document.createElement("div");
            {
                Envelope.style.width="calc(100% - 8px)"
                Envelope.style.display="grid"
                Envelope.style.gridTemplateColumns="0.6fr 2fr 1fr"
                Envelope.style.marginLeft="4px"
                Envelope.style.marginRight="4px"
                Envelope.style.backgroundColor="white"
                Envelope.style.marginBottom="4px"
            }
            whichTo.appendChild(Envelope)
            const ImgDivContainer=document.createElement("div");
            {
                ImgDivContainer.style.width="calc(100% - 8px)"
                ImgDivContainer.style.aspectRatio="1/1"
                // ImgDivContainer.style.backgroundColor="green"
                ImgDivContainer.style.padding="4px"
            }
            Envelope.appendChild(ImgDivContainer)
            
            const ImgDiv=document.createElement("div");
            {
                //"url('Icons/ArmsFactoryIcon.png')"
                console.log("Icons/"+key+"Icon.png")
                ImgDiv.style.backgroundImage="url(Icons/"+key.toString()+"Icon.png)"
                ImgDiv.className="IconGeneral"
                ImgDiv.style.width="100%";
                ImgDiv.style.height="100%";
            }
            ImgDivContainer.appendChild(ImgDiv)

            const WhichObjectTitle=document.createElement("div");
            {
                WhichObjectTitle.style.maxWidth="100%"
                WhichObjectTitle.style.height="100%"
                WhichObjectTitle.style.alignContent="center"
                WhichObjectTitle.style.textAlign="center"
                WhichObjectTitle.innerText=key
                WhichObjectTitle.style.color="black"
                WhichObjectTitle.style.fontSize="max(2vw,2vh)"
                WhichObjectTitle.style.textOverflow="clip"
                WhichObjectTitle.style.overflow="hidden"
            }
            Envelope.appendChild(WhichObjectTitle)

            const ObjectCountTitle=document.createElement("div");
            {
                ObjectCountTitle.style.maxWidth="100%"
                ObjectCountTitle.style.height="100%"
                ObjectCountTitle.style.alignContent="center"
                ObjectCountTitle.style.textAlign="center"
                ObjectCountTitle.innerText=value
                ObjectCountTitle.style.color="black"
                ObjectCountTitle.style.fontSize="max(2vw,2vh)"
                ObjectCountTitle.style.textOverflow="clip"
                ObjectCountTitle.style.overflow="hidden"
            }
            Envelope.appendChild(ObjectCountTitle)
        }
    }

}

export function UnitSelectionDisplay(Selected){
    
    resetButtonDropDown();
    document.getElementById("Title").innerHTML="Selection Information"
    // var buildingCount=false;
    // var unitCount=false;
    const UnitcountTracking={};
    const BuildingCountTracking={};
    const MiscCountTracking={};

    const contentBox=document.getElementById("Dropdown_Content_Box");
    var UnitInfoDispContentBox=document.getElementById("UnitInfoDispContentBox");
    if(!UnitInfoDispContentBox){
        UnitInfoDispContentBox=document.createElement("div");
        {
            UnitInfoDispContentBox.style.width="100%";
            UnitInfoDispContentBox.id="UnitInfoDispContentBox"
            UnitInfoDispContentBox.style.paddingTop="1vw"
        }
        contentBox.appendChild(UnitInfoDispContentBox)

        //add a section for displaying units
        const UnitDispSectionInUIDCB_Parent=document.createElement("div");
        {
            UnitDispSectionInUIDCB_Parent.style.width="100%";
            UnitDispSectionInUIDCB_Parent.id="UnitDispSectionInUIDCB_Parent"
        }
        UnitInfoDispContentBox.appendChild(UnitDispSectionInUIDCB_Parent)
            
            const UnitsDisplayTitleCard=document.createElement("div");
            {
                UnitsDisplayTitleCard.style.maxWidth="calc(100% - 8px)";
                UnitsDisplayTitleCard.style.height="100%";
                UnitsDisplayTitleCard.style.display="inline-block"
                UnitsDisplayTitleCard.style.marginLeft="4px"
                UnitsDisplayTitleCard.style.marginRight="4px"
                // UnitsDisplayTitleCard.style.marginTop="1vw"
                UnitsDisplayTitleCard.style.marginBottom="1vw"
                UnitsDisplayTitleCard.style.borderBottom="solid 0.25vw gray"
                UnitsDisplayTitleCard.innerText="Selected Units"
                UnitsDisplayTitleCard.style.color="white"
                UnitsDisplayTitleCard.style.fontSize="max(1.5vw,1.5vh)"
                UnitsDisplayTitleCard.style.alignContent="center"
                UnitsDisplayTitleCard.style.textAlign="left"
            }
            UnitDispSectionInUIDCB_Parent.appendChild(UnitsDisplayTitleCard)

            const UnitsDisplayContentBox=document.createElement("div");
            {
                UnitsDisplayContentBox.style.width="100%"
                UnitsDisplayContentBox.style.minHeight="20px"
                // UnitsDisplayContentBox.style.backgroundColor="pink"
                UnitsDisplayContentBox.id="UnitsDisplayContentBox"
            }
            UnitDispSectionInUIDCB_Parent.appendChild(UnitsDisplayContentBox)
        
        //section for displaying selected buildings
        const BuildingDispSectionInUIDCB_Parent=document.createElement("div");
        {
            BuildingDispSectionInUIDCB_Parent.style.width="100%";
            BuildingDispSectionInUIDCB_Parent.id="BuildingDispSectionInUIDCB_Parent"
        }
        UnitInfoDispContentBox.appendChild(BuildingDispSectionInUIDCB_Parent)

            const BuildingDisplayTitleCard=document.createElement("div");
            {
                BuildingDisplayTitleCard.style.maxWidth="calc(100% - 8px)";
                BuildingDisplayTitleCard.style.height="100%";
                BuildingDisplayTitleCard.style.display="inline-block"
                BuildingDisplayTitleCard.style.marginLeft="4px"
                BuildingDisplayTitleCard.style.marginRight="4px"
                // BuildingDisplayTitleCard.style.marginTop="1vw"
                BuildingDisplayTitleCard.style.marginBottom="1vw"
                BuildingDisplayTitleCard.style.borderBottom="solid 0.25vw gray"
                BuildingDisplayTitleCard.innerText="Selected Buildings"
                BuildingDisplayTitleCard.style.color="white"
                BuildingDisplayTitleCard.style.fontSize="max(1.5vw,1.5vh)"
                BuildingDisplayTitleCard.style.alignContent="center"
                BuildingDisplayTitleCard.style.textAlign="left"
            }
            BuildingDispSectionInUIDCB_Parent.appendChild(BuildingDisplayTitleCard)

            const BuildingDisplayContentBox=document.createElement("div");
            {
                BuildingDisplayContentBox.style.width="100%"
                BuildingDisplayContentBox.style.minHeight="20px"
                // BuildingDisplayContentBox.style.backgroundColor="pink"
                BuildingDisplayContentBox.id="BuildingDisplayContentBox"
            }
            BuildingDispSectionInUIDCB_Parent.appendChild(BuildingDisplayContentBox)

        //section for displaying anything else
        const OtherDispSectionInUIDCB_Parent=document.createElement("div");
        {
            OtherDispSectionInUIDCB_Parent.style.width="100%";
            OtherDispSectionInUIDCB_Parent.id="OtherDispSectionInUIDCB_Parent"
        }
        UnitInfoDispContentBox.appendChild(OtherDispSectionInUIDCB_Parent)

        const OtherDisplayTitleCard=document.createElement("div");
        {
            OtherDisplayTitleCard.style.maxWidth="calc(100% - 8px)";
            OtherDisplayTitleCard.style.height="100%";
            OtherDisplayTitleCard.style.display="inline-block"
            OtherDisplayTitleCard.style.marginLeft="4px"
            OtherDisplayTitleCard.style.marginRight="4px"
            // OtherDisplayTitleCard.style.marginTop="1vw"
            OtherDisplayTitleCard.style.marginBottom="1vw"
            OtherDisplayTitleCard.style.borderBottom="solid 0.25vw gray"
            OtherDisplayTitleCard.innerText="Selected Miscellaneous"
            OtherDisplayTitleCard.style.color="white"
            OtherDisplayTitleCard.style.fontSize="max(1.5vw,1.5vh)"
            OtherDisplayTitleCard.style.alignContent="center"
            OtherDisplayTitleCard.style.textAlign="left"
        }
        OtherDispSectionInUIDCB_Parent.appendChild(OtherDisplayTitleCard)

        const OtherDisplayContentBox=document.createElement("div");
        {
            OtherDisplayContentBox.style.width="100%"
            OtherDisplayContentBox.style.minHeight="20px"
            // OtherDisplayContentBox.style.backgroundColor="pink"
            OtherDisplayContentBox.id="OtherDisplayContentBox"
        }
        OtherDispSectionInUIDCB_Parent.appendChild(OtherDisplayContentBox)
    }

    //go through the selected objects, first categories by if its a unit, then building, else its misc
    //then by unitType

    //Selected is an array of instanceObjects
    Selected.forEach((InstanceElement) =>{
        console.log(InstanceElement.object.metadata.get(InstanceElement.instanceId), "yo, its in dropdown baby")
        const intMeta=InstanceElement.object.metadata.get(InstanceElement.instanceId)
        const Asset_Class=intMeta.AssetClass
        const Unit_Type=intMeta.UnitType
        switch(Asset_Class){
            case "Unit":
                // addToUnitSelection(intMeta)
                if(Unit_Type in UnitcountTracking){
                    UnitcountTracking[Unit_Type]=UnitcountTracking[Unit_Type]+1
                }else{
                    UnitcountTracking[Unit_Type]=1
                }
                break;
            case "Building":
                // addToBuildingSelection(intMeta)
                if(Unit_Type in BuildingCountTracking){
                    BuildingCountTracking[Unit_Type]=BuildingCountTracking[Unit_Type]+1
                }else{
                    BuildingCountTracking[Unit_Type]=1
                }
                break;
            default://misc (trees, rocks etc)
                // addToMiscSelection(intMeta)
                if(Unit_Type in MiscCountTracking){
                    MiscCountTracking[Unit_Type]=MiscCountTracking[Unit_Type]+1
                }else{
                    MiscCountTracking[Unit_Type]=1
                }
                break;
        }
    })
    if(Object.keys(BuildingCountTracking).length === 0){
        //hide the buildings section
        document.getElementById("BuildingDispSectionInUIDCB_Parent").style.display="none"
    }else{
        document.getElementById("BuildingDispSectionInUIDCB_Parent").style.display="block"
        addToMiscSelection("Buildings",BuildingCountTracking)
    }
    
    if(Object.keys(UnitcountTracking).length === 0){
        //hide the Units section
        document.getElementById("UnitDispSectionInUIDCB_Parent").style.display="none"
    }else{
        document.getElementById("UnitDispSectionInUIDCB_Parent").style.display="block"
        addToMiscSelection("Units",UnitcountTracking)
    }
    
    if(Object.keys(MiscCountTracking).length === 0){
        //hide the Misc section
        document.getElementById("OtherDispSectionInUIDCB_Parent").style.display="none"
    }else{
        document.getElementById("OtherDispSectionInUIDCB_Parent").style.display="block"
        addToMiscSelection("Misc",MiscCountTracking)
    }
    

    UnitInfoDispContentBox.style.display="block"
}
//------------------------------------------------------------------
//below is setup for everything above or util for above

export function addEventListenersToButtons(){//opens the dropdown
    const addEventsToButtons=[
        "btn_Decisions","btn_Research","btn_Finance","btn_Construction",
        "btn_Security","btn_Production","btn_Train"
    ]

    addEventsToButtons.forEach(function (item, index) {
        const target= document.getElementById(item)
        target.addEventListener("click", buttonpressed)
        target.myParam=item

    });
    
    document.getElementById("close_Dropdown").addEventListener("click",closeDropdown)
}

function resetButtonDropDown(){
    // console.log("parameter of pressed button:", event.currentTarget.myParam)
    const dropdownElement=document.getElementById("Button_Dropdown")
    if(dropdownElement.style.display=="none"){
        dropdownElement.style.display="flex";
        dropdownElement.style.visibility="visible"
    }//if they want to close the dropdownElement there will be an X button in the element to do so

    //if any, make the children of dropdownElement invisible
    const contentBox=document.getElementById("Dropdown_Content_Box");
    for (const childDiv of contentBox.children){
        // console.log(childDiv, "THESE ARE THE CHILDREN OF THE DROPDOWN MAN")
        childDiv.style.display="none"
    }
}

function buttonpressed(event){
    resetButtonDropDown()

    let Title;
    switch(event.currentTarget.myParam){
        case "btn_Decisions":
            Title="Events & Decisions"
            break;
        case "btn_Research":
            Title="Research"
            break;
        case "btn_Finance":
            Title="Trade & Cooperation"
            break;
        case "btn_Construction":
            Title="Construction"
            ConstructionElements()
            break;
        case "btn_Production":
            Title="Production"
            break;
        case "btn_Train":
            Title="Military Training"
            MilTrainingElements()
            break;
        case "btn_Security":
            Title="Security"
            break;
        default:
            console.log("something has gone wrong with button press")

    }
    // console.log(Title, "bruh")
    var titleElem=document.getElementById("Title")
    titleElem.innerHTML=Title
    titleElem.style.fontSize="max(2vw,2vh)"

}

function closeDropdown(){
    const dropdownElement=document.getElementById("Button_Dropdown")
    dropdownElement.style.display="none";
    dropdownElement.style.visibility="hidden"
}