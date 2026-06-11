import {UImanager} from "./UIManager.js"

function hideBoxes(id){
    UImanager.showAppropriateDropDown(true)

    const elems=UImanager.getBoxes()
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


export function DecisionElements(){
    hideBoxes('DecisionBox')
    UImanager.getDDTitle().innerHTML="Decisions"

}

export function ResearchElements(){
    hideBoxes("ResearchBox")
    UImanager.getDDTitle().innerHTML="Research"
}

export function FinanceElements(){
    hideBoxes("CommunityBox")
    UImanager.getDDTitle().innerHTML="Community"
}

export function ConstructionElements(){
    hideBoxes("ConstructionBox")
    UImanager.getDDTitle().innerHTML="Construction"
}

export function ProductionElements(){
    hideBoxes("ProductionBox")
    UImanager.getDDTitle().innerHTML="Production"
}

export function TrainElements(){
    hideBoxes("TrainingBox")
    UImanager.getDDTitle().innerHTML="Recruitment"
}

export function SecurityElements(){
    hideBoxes("SecurityBox")
    UImanager.getDDTitle().innerHTML="Security"
}