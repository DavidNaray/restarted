import {updateGridColumns} from "./Utils.js"
import {onPointerMove,intersectsTileMeshes} from "./RaycasterHandling.js"
import {globalmanager} from "./GlobalInstanceMngr.js"
import {renderer,UserId,InputState} from "../siteJS.js"
import {EmitBuildingPlacementRequest,EmitUnitPlacementRequest,EmitUnitsBeingDeployed} from "./SceneInitiation.js"



var BuildingAssetName;//variable to hold which building is trying to be placed right now
var divToChangevalue;//this holds the div that displays the deploy position

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
        "tile":[targetTile.x,targetTile.y]
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
                "userOwner":UserId//localStorage.getItem('accessToken').id,
            }
            //permission is false, or it will be an adjusted position
            EmitBuildingPlacementRequest(BuildingAssetName,RequestMetaData);

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
            "url('Icons/arms-factory.png')","url('Icons/civilian-factory.png')",
            "url('Icons/quarry.png')","url('Icons/Sawmill.png')",
            "url('Icons/Farm.png')","url('Icons/Warehouse.png')",
            "url('Icons/House.png')",
            
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

function buttonpressed(event){
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
    console.log(Title, "bruh")
    document.getElementById("Title").innerHTML=Title

}

function closeDropdown(){
    const dropdownElement=document.getElementById("Button_Dropdown")
    dropdownElement.style.display="none";
    dropdownElement.style.visibility="hidden"
}