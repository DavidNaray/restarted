import {updateGridColumns} from "./Utils.js"
import {onPointerMove,intersectsTileMeshes} from "./RaycasterHandling.js"
import {globalmanager} from "./GlobalInstanceMngr.js"
import {renderer,UserId,InputState} from "../siteJS.js"

import {ProductionSetupEmit,openProductionTab,closeProductionTab} from "./SceneInitiation.js"

export var moveableSelected={value:{}};

var divToChangevalue;//this holds the div that displays the deploy position

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


function exportDictSetupSelectable(AssetClass,temp,intMeta){
    //AssetClass is like "Unit"
    // temp is what the export value being manipulated

    //structure should be {owner: { AssetClass: {tile: { UnitType:{"positions":[],"ServerIds":[] }}}}}

    const owner=intMeta.owner;
    const parentTile=intMeta.parentTile
    const UnitType=intMeta.UnitType
    if(owner in temp){
        if(AssetClass in temp[owner]){
            if(parentTile in temp[owner][AssetClass]){
                if(UnitType in temp[owner][AssetClass][parentTile]){
                    //everything exists so push new values into the arrays
                    
                    // temp[owner][AssetClass][parentTile][UnitType]["positions"].push(intMeta.position)
                    temp[owner][AssetClass][parentTile][UnitType]["ServerIds"].push(intMeta.ServerId)
                }else{//there is unit type for the owner of the instance, of assetclass in the parentTile for export
                    temp[owner][AssetClass][parentTile][UnitType]={
                        // "positions":[intMeta.position],
                        "ServerIds":[intMeta.ServerId]
                    }
                }

            }else{//there is no record for the tile for the owner, for the assetclass in selectables
                temp[owner][AssetClass][parentTile]={
                    [UnitType]:{
                        // "positions":[intMeta.position],
                        "ServerIds":[intMeta.ServerId]
                    } 
                }
            }

        }else{//The instances AssetClass has no record for the owner in selectables
            temp[owner][AssetClass]={
                [parentTile]:{
                    [UnitType]:{
                        // "positions":[intMeta.position],
                        "ServerIds":[intMeta.ServerId]
                    } 
                }
            }
        }

    }else{//owner has no record for selectables
        const initValue={
            [AssetClass]:{
                [parentTile]:{
                    [UnitType]:{
                        // "positions":[intMeta.position],
                        "ServerIds":[intMeta.ServerId]
                    } 
                }
            }
        }
        temp[owner]=initValue;
    }

    // return the edited temp
    return temp
}


export function UnitSelectionDisplay(Selected){
    
    resetButtonDropDown();
    document.getElementById("Title").innerHTML="Selection Information"
    // var buildingCount=false;
    // var unitCount=false;
    const UnitcountTracking={};
    const BuildingCountTracking={};
    const MiscCountTracking={};

    //temp is dictionary with key of { assetClass -> {user/owner -> {tile -> {UnitType -> {keys ->arrays of info...} } } }
    var temp={}


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
        console.log(intMeta["owner"], "metainfo...")
        const Asset_Class=intMeta.AssetClass
        const Unit_Type=intMeta.UnitType
        switch(Asset_Class){
            case "Unit":
                // addToUnitSelection(intMeta)

                const editedTemp=exportDictSetupSelectable("Unit",temp,intMeta);
                temp=editedTemp
                if(Unit_Type in UnitcountTracking){UnitcountTracking[Unit_Type]=UnitcountTracking[Unit_Type]+1}
                else{UnitcountTracking[Unit_Type]=1};
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
    console.log("temp",temp)
    moveableSelected.value=temp
    // temp
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
        //
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

//-------------------------------------------------------------------------

function ProductionElements(){
    const contentBox=document.getElementById("Dropdown_Content_Box");
    const ProductioncontentBox=document.getElementById("ProductioncontentBox");
    if(!ProductioncontentBox){
        
        const creatingPCB=document.createElement("div");
        {
            creatingPCB.style.width="100%";
            creatingPCB.style.height = "auto";    // let it grow naturally
            creatingPCB.style.overflow = "visible"; // make sure it doesn't scroll itself
            creatingPCB.id="ProductioncontentBox"
        }
        contentBox.appendChild(creatingPCB)

        const ProductionOptionsInfo=document.createElement("div");
        {
            ProductionOptionsInfo.style.width="calc(100% - 1vw)";
            ProductionOptionsInfo.style.aspectRatio="11/1";
            ProductionOptionsInfo.style.margin="0 0.5vw 0 0.5vw";
            ProductionOptionsInfo.style.alignContent="center";
            ProductionOptionsInfo.innerText="Build Military Factories to expand your production lines, produce what can be used or sold. Each factory has a capacity of 400 population. For full productivity, 400 population must be assigned to each factory of a produciton line.";
            ProductionOptionsInfo.style.fontSize="max(1vw,1vh)";
            ProductionOptionsInfo.style.color="white"
            ProductionOptionsInfo.style.borderBottom="solid gray 0.25vw"
        }
        creatingPCB.appendChild(ProductionOptionsInfo)
        
        const ProdBox=document.createElement("div");
        {
            ProdBox.style.width="100%";
            ProdBox.style.display="grid";
            ProdBox.id="ProdBox"
            ProdBox.style.gridTemplateColumns="1fr 1fr 1fr 1fr 1fr 1fr 1fr";
            // ProdBox.style.borderBottom="solid gray 0.25vw"
        }
        creatingPCB.appendChild(ProdBox)

        const ProdCount=document.createElement("div");
        {
            ProdCount.style.width="calc(100% - 1vw)";
            ProdCount.style.margin="0 0.5vw 0 0.5vw";
            ProdCount.innerHTML="N.A"
            ProdCount.id="ProdCount"
            ProdCount.style.fontSize="max(1vw,1vh)";
            ProdCount.style.color="white"   
        }
        creatingPCB.appendChild(ProdCount)

        const FreeCount=document.createElement("div");
        {
            FreeCount.style.width="calc(100% - 1vw)";
            FreeCount.style.margin="0 0.5vw 0 0.5vw";
            FreeCount.innerHTML="N.A"
            FreeCount.id="FreeCount"
            FreeCount.style.fontSize="max(1vw,1vh)";
            FreeCount.style.color="white"   
        }
        creatingPCB.appendChild(FreeCount)

        const ProdQueueTitleBox=document.createElement("div");
        {
            ProdQueueTitleBox.style.width="calc(100% - 1vw)";
            ProdQueueTitleBox.style.display="grid";
            ProdQueueTitleBox.style.gridTemplateColumns="1.7fr 1.5fr 1fr";
            ProdQueueTitleBox.style.columnGap="0.5vw"
            ProdQueueTitleBox.style.margin="0 0.5vw 0 0.5vw";
            ProdQueueTitleBox.style.borderBottom="solid gray 0.25vw"
            ProdQueueTitleBox.style.marginBottom="1vh"
            
        }
        creatingPCB.appendChild(ProdQueueTitleBox)

        const ProductAndDetails=document.createElement("div");
        {
            ProductAndDetails.style.width="100%";
            // ProductAndDetails.style.padding="0 0.5vw 0 0.5vw";
            ProductAndDetails.style.alignContent="center";
            ProductAndDetails.innerText="Product";
            ProductAndDetails.style.fontSize="max(1vw,1vh)";
            ProductAndDetails.style.color="white"        
        }
        ProdQueueTitleBox.appendChild(ProductAndDetails)

        const FactoriesInvolved=document.createElement("div");
        {
            FactoriesInvolved.style.width="100%";
            // FactoriesInvolved.style.padding="0 0.5vw 0 0.5vw";
            FactoriesInvolved.style.alignContent="center";
            FactoriesInvolved.innerText="Factories";
            FactoriesInvolved.style.fontSize="max(1vw,1vh)";
            FactoriesInvolved.style.color="white"
            // ManpowerAllocation.style.backgroundColor="brown"
            
        }
        ProdQueueTitleBox.appendChild(FactoriesInvolved)

        const CostsInvolved=document.createElement("div");
        {
            CostsInvolved.style.width="100%";
            // CostsInvolved.style.padding="0 0.5vw 0 0.5vw";
            CostsInvolved.style.alignContent="center";
            CostsInvolved.innerText="Costs";
            CostsInvolved.style.fontSize="max(1vw,1vh)";
            CostsInvolved.style.color="white"
            // ManpowerAllocation.style.backgroundColor="brown"
            
        }
        ProdQueueTitleBox.appendChild(CostsInvolved)



        const ProdBlocks=document.createElement("div");
        {
            ProdBlocks.style.width="calc(100% - 1vw)";
            ProdBlocks.style.margin="0 0.5vw 0 0.5vw";
            ProdBlocks.id="ProdBlocks"
            ProdBlocks.style.fontSize="max(1vw,1vh)";  
        }
        creatingPCB.appendChild(ProdBlocks)


        ProductionSetupEmit()
    }else{
        ProductioncontentBox.style.display="block"
    }
    openProductionTab();
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
    
    closeProductionTab()
    
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
            Title="Technology"
            break;
        case "btn_Finance":
            Title="Trade & Cooperation"
            break;
        case "btn_Construction":
            Title="Construction"
            break;
        case "btn_Production":
            Title="Production"
            ProductionElements()
            break;
        case "btn_Train":
            Title="Military Training"
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
