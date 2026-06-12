import {UImanager} from "./UIManager.js"


export function DecisionElements(){
    UImanager.hideBoxes('DecisionBox')
    UImanager.getDDTitle().innerHTML="Decisions"

}

export function ResearchElements(){
    UImanager.hideBoxes("ResearchBox")
    UImanager.getDDTitle().innerHTML="Research"
}

export function FinanceElements(){
    UImanager.hideBoxes("CommunityBox")
    UImanager.getDDTitle().innerHTML="Community"
}

export function ConstructionElements(){
    UImanager.hideBoxes("ConstructionBox")
    UImanager.getDDTitle().innerHTML="Construction"
}

export function ProductionElements(){
    UImanager.hideBoxes("ProductionBox")
    UImanager.getDDTitle().innerHTML="Production"
}

export function TrainElements(){
    UImanager.hideBoxes("TrainingBox")
    UImanager.getDDTitle().innerHTML="Recruitment"
}

export function SecurityElements(){
    UImanager.hideBoxes("SecurityBox")
    UImanager.getDDTitle().innerHTML="Security"
}