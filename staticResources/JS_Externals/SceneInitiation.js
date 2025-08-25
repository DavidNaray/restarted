import {renderer,InputState} from "../siteJS.js"
import {onPointerMove,intersectsTileMeshes} from "./RaycasterHandling.js"
import {makeToolTipTechnology} from "./ResourceTips.js"
import {adjustUnitDeployPosition,onTileClick} from "./DropDownUI.js"
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
            console.log("permission to place building: denied",response)
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
                    if(response[key].Unlocked){
                        optionInner.style.outline="lightgray dashed 0.1vw"; // green for researched
                        optionInner.style.backgroundColor="rgba(216,216,216,0.2)"; // green for researched
                    }

                } 

                makeToolTipTechnology(optionInner,response[key]);
                option.appendChild(optionInner)
                appendTo.appendChild(option)

            }
            
        }
    });

    socket.on('ConstructionSetupResponse', (response) => {
        function stringintoURL(str){
            return `url('Icons/TechTree/${str}.png')`;
        }
        // console.log("Construction Setup Response",response)

        if(response){
            const BuildOptionsBox=document.getElementById("BuildOptionsBox");
            for (let key of response) {
                const strURL=stringintoURL(key);

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
                    optionButton.style.backgroundImage=strURL;//ColouroptionTags[i];
                    optionButton.style.backgroundColor="rgba(216,216,216,0.2)";//ColouroptionTags[i];
                    
                    optionButton.myParam=key//optionObjNames[i];//"Mill";
                    
                    
                    
                    optionButton.addEventListener("click",PlaceBuilding)
                } 


                option.appendChild(optionButton)
                BuildOptionsBox.appendChild(option)
            }
        }
    });

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

export function ConstructionSetupEmit(){
    socket.emit('ConstructionSetupRequest');
}

export function ProductionSetupEmit(){
    // console.log("should be emitting?")
    socket.emit('ProductionSetupRequest');
}
setInterval(EmitResourceUpdate, 10000);// Emit resource updates every 10 seconds


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
var BuildingAssetName;//variable to hold which building is trying to be placed right now

function onclickBuilding(event){
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
                // "tile":[foundTile.x, foundTile.y],
                "position":processedPoint,
                "rotation":0,
                // "userOwner":UserId,
                "BuildingType":BuildingAssetName
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
    console.log("BuildingAssetName",BuildingAssetName)
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