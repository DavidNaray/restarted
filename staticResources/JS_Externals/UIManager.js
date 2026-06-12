
import {DecisionElements,
        ResearchElements,
        FinanceElements,
        ConstructionElements,
        ProductionElements,
        TrainElements,
        SecurityElements} from "./UIClickedOptions.js"

import {socket} from "./SceneInitiation.js"

class UIManager {
    constructor() {
        this.UIRoot=document.getElementById("UIRoot")
        this.selectionBase=document.getElementById("SB")
        this.selectionBasestyles();

        this.DropDown=document.getElementById("DropDown")
        this.DropDownStyles();
        this.BottomSec=document.getElementById("BottomSec")
        this.BottomSecStyles();

        this.DDTitle=document.getElementById("DDTitle")
        this.boxes=document.getElementsByClassName("DDChild")

        this.RBody=document.getElementById("RBody")

        this.TBBody=document.getElementById("TBBody")
        this.TBRegBody=document.getElementById("TBRegBody")

        this.widthFlag;
        this.heightFlag;

        this.widthswap=800
        this.heightswap=700
        
        this.onResize();
    }

    getBoxes(){return this.boxes}
    getDDTitle(){return this.DDTitle}
    getDropDown(){return this.DropDown}
    getRBody(){return this.RBody}
    getTBBody(){return this.TBBody}
    getTBRegBody(){return this.TBRegBody}

    hideBoxes(id){
        this.showAppropriateDropDown(true)

        const elems=this.getBoxes()
        let him;
        for(let elem of elems){
            if(elem.id!=id){elem.style.display="none"}
            else{him=elem;}//elem.style.display="block"}
            // elem.style.display="none"
            const hasOverflow = elem.scrollHeight > elem.clientHeight;
            elem.style.scrollbarGutter = hasOverflow ? 'stable' : 'auto';
            //important, prevents glitching by providing gap between content and the scrollbar, do not remove
            elem.style.paddingRight = hasOverflow ? '1px' : '0px';
        }
        him.style.display="block"
    }

    showAppropriateDropDown(override=false){
        const active=override || this.DropDown.style.display=="flex" || this.BottomSec.style.display=="block"
        if(!active){return}

        if(this.widthFlag){
            this.DropDown.style.display="flex"
            this.BottomSec.style.display="none"
        }else{
            this.BottomSec.style.display="block"
            this.DropDown.style.display="none"
        }
    }

    AddListeners(){
        const addEventsToButtons=[
            ["BD",DecisionElements],
            ["BR",ResearchElements],
            ["BF",FinanceElements],
            ["BC",ConstructionElements],
            ["BP",ProductionElements],
            ["BRc",TrainElements],
            ["BS",SecurityElements]
        ]

        for(let [id,func] of addEventsToButtons){
            const target= document.getElementById(id)
            target.addEventListener("click", func)
        }

    }

    selectionBasestyles(){
        this.selectionBase.style.backgroundColor="white"
        this.selectionBase.style.display="grid";
        this.selectionBase.style.gridTemplateColumns="auto 1fr"
        this.selectionBase.style.backgroundColor="gray"
        this.selectionBase.style.padding="max(4px, 0.3vw)"
        this.selectionBase.style.pointerEvents="auto"
    }

    DropDownStyles(){
        this.DropDown.style.backgroundColor="gray"
        this.DropDown.style.pointerEvents="auto"
        this.DropDown.style.padding="0 max(4px, 0.3vw) max(4px, 0.3vw) max(4px, 0.3vw)"
        this.DropDown.style.maxHeight="70%"
        this.DropDown.style.flexDirection="column"
        this.DropDown.style.display="none"
    }

    BottomSecStyles(){
        this.BottomSec.style.width="calc(100% - max(8px, 0.6vw))"
        this.BottomSec.style.aspectRatio="4/1"
        this.BottomSec.style.position="absolute"
        this.BottomSec.style.bottom=0;
        this.BottomSec.style.backgroundColor="white"
        this.BottomSec.style.padding="max(4px, 0.3vw)"
        this.BottomSec.style.display="none"
    }

    setFlags(){
        if (this.width<this.widthswap){this.widthFlag=false}
        else{this.widthFlag=true}

        if (this.height<this.heightswap){this.heightFlag=false}
        else{this.heightFlag=true}
    }

    onResize() {
        this.width = window.innerWidth;
        this.height = window.innerHeight;
        
        this.setFlags();
        this.updateLayout();
    }

    updateLayout(){
        this.selectionBase.style.height=`max(7%,${this.heightswap/10}px)`
        
        if(this.widthFlag){
            this.selectionBase.style.width=`max(50%,${this.widthswap}px)`
            this.selectionBase.style.borderRadius=" 0 0 max(4px, 0.3vw) 0"

            // this.DropDown.style.display="flex"//wide enough
            this.DropDown.style.width = `max(40%,${this.widthswap*0.75}px)`
            // this.BottomSec.style.display="none"
        }
        else{
            this.selectionBase.style.borderRadius="0"
            this.selectionBase.style.width="calc(100% - max(8px, 0.6vw) )"
            // this.BottomSec.style.display="block"
            // this.DropDown.style.display="none"
        }
        this.showAppropriateDropDown()

    }


    //---------------------------------
    RecruitButtonClicked(event){
        const WhichUnit=event.currentTarget.myParam
        socket.emit('NewTraining',{"RequestMetaData":WhichUnit})
    }
    RegimenCountAdjust(event){
        const UpDown=event.currentTarget.myParam
        const Rid=event.currentTarget.parentElement.parentElement.parentElement.parentElement.parentElement.myParam

        const RequestMetaData={UpDown,Rid}
        socket.emit('AdjustRegimen',{RequestMetaData})
    }

    DestroyRegimen(){
        const Rid = event.currentTarget.parentElement.parentElement.parentElement.parentElement.myParam;
        socket.emit('DestroyRegimen',{RequestMetaData:Rid})
    }
}

export const UImanager=new UIManager();