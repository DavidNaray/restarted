import {UImanager} from "./UIManager.js"

function hideBoxes(){
    UImanager.showAppropriateDropDown(true)

    const elems=UImanager.getBoxes()
    for(let elem of elems){
        elem.style.visibility="hidden"
        const hasOverflow = elem.scrollHeight > elem.clientHeight;
        elem.style.scrollbarGutter = hasOverflow ? 'stable' : 'auto';
        //important, prevents glitching by providing gap between content and the scrollbar, do not remove
        elem.style.paddingRight = hasOverflow ? '1px' : '0px';
    }
}


export function DecisionElements(){
    hideBoxes()
    const el = document.getElementById('DecisionBox');
    el.style.visibility="visible"

    UImanager.getDDTitle().innerHTML="Decisions"

}

export function ResearchElements(){
    hideBoxes()
    UImanager.getDDTitle().innerHTML="Research"
}

export function FinanceElements(){
    hideBoxes()
    UImanager.getDDTitle().innerHTML="Community"
}

export function ConstructionElements(){
    hideBoxes()
    UImanager.getDDTitle().innerHTML="Construction"
}

export function ProductionElements(){
    hideBoxes()
    UImanager.getDDTitle().innerHTML="Production"
}

export function TrainElements(){
    hideBoxes()
    UImanager.getDDTitle().innerHTML="Recruitment"
}

export function SecurityElements(){
    hideBoxes()
    UImanager.getDDTitle().innerHTML="Security"
}