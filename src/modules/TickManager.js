
const ChunkManager=require("./CacheChunkInfo.js")
const ResourceManager=require("./ResourceManager.js")

class TickManager {

    constructor() {
        this.TICK_RATE = 1000 / 15; //10 updates a second //(1000 / 60)/2;//
        this.ResourceTickRate=1000;//update every 1 second
        this.messages=new Map()

        this.indiUnits={
            "archer":'Icons/ArcherIcon.png',
            "spearman":'Icons/SpearManIcon.png'
        }
    }

    GetTickRate(){return this.TICK_RATE;}

    GetResourceTickRate(){return this.ResourceTickRate;}

    GetMessages(){return this.messages;}

    ClearMessages(){this.messages.clear()}
    
    DeleteUserRecord(userId){this.messages.delete(userId)}
    
    UpdateMessageUnitPosition(TargetChunk,UpdateMessage){
        const concerned=ChunkManager.getUserIdArrayForTile(TargetChunk)
        for(let userId of concerned){
            const currentMessage=this.messages.get(userId)
            if(currentMessage){
                const positions=currentMessage.positions
                if(positions){currentMessage.positions.push(UpdateMessage)}
                else{currentMessage.positions=[UpdateMessage]}
            }
            else{this.messages.set(userId,{positions:[UpdateMessage]})}
        }

    }

    UpdateMessageCrossChunk(OldChunk,TargetChunk,unitReplace){
        const first=ChunkManager.getUserIdArrayForTile(OldChunk)
        const second=ChunkManager.getUserIdArrayForTile(TargetChunk)

        const concerned=[...new Set(first.concat(second))]

        for(let userId of concerned){
            const currentMessage=this.messages.get(userId)
            if(currentMessage){
                const replacementsVal=currentMessage.replacements
                if(replacementsVal){currentMessage.replacements.push(unitReplace)}
                else{currentMessage.replacements=[unitReplace]}
            }
            else{this.messages.set(userId,{replacements:[unitReplace]})}
        }
    }

    DeploymentMessage(TargetChunk,UpdateMessage){
        const concerned=ChunkManager.getUserIdArrayForTile(TargetChunk)
        for(let userId of concerned){
            const currentMessage=this.messages.get(userId)
            if(currentMessage){
                const deployments=currentMessage.Deployments
                if(deployments){currentMessage.Deployments.push(UpdateMessage)}
                else{currentMessage.Deployments=[UpdateMessage]}
            }
            else{this.messages.set(userId,{Deployments:[UpdateMessage]})}
        }
    }

    DeployPositionPermissionMessage(userId,UpdateMessage){
        //only concerns the one person
        const currentMessage=this.messages.get(userId)
        if(currentMessage){
            const permission=currentMessage.DeployPosRequestResponse
            if(permission){currentMessage.DeployPosRequestResponse.push(UpdateMessage)}
            else{currentMessage.DeployPosRequestResponse=UpdateMessage}
        }
        else{this.messages.set(userId,{DeployPosRequestResponse:UpdateMessage})}
    }

    async ResourceMessage(){
        try{
            const UsersAndSockets=ChunkManager.getSockets()
            for (const [userId, socket] of UsersAndSockets) {
                const UsersResources=await ResourceManager.getUserResources(userId)
                const currentMessage=this.messages.get(userId)

                if(currentMessage){currentMessage.resources=UsersResources}
                else{this.messages.set(userId,{resources:UsersResources})}

            }
        }catch(huh){console.log("error somehow",huh)}
    }

    LoginRewardMessage(userId,UpdateMessage){
        const currentMessage=this.messages.get(userId)
        
        if(currentMessage){currentMessage.DailyReward=UpdateMessage}
        else{this.messages.set(userId,{DailyReward:UpdateMessage})}
    }

    async TechTreeMessage(userId){
        const user=await ChunkManager.getUser(userId)
        const currentMessage=this.messages.get(userId)

        if(currentMessage){currentMessage.TechTree=user.Technology}
        else{this.messages.set(userId,{TechTree:user.Technology})}
    }

    async RecruitableMessage(userId){
        const user=await ChunkManager.getUser(userId)
        const myUnlockedUnits={
            "archer":'Icons/ArcherIcon.png',
            "spearman":'Icons/SpearManIcon.png'
        }
        
        const currentMessage=this.messages.get(userId)
        if(currentMessage){currentMessage.Recruitable=myUnlockedUnits}
        else{this.messages.set(userId,{Recruitable:myUnlockedUnits})}
    }

    async ConstructableMessage(userId){
        const user=await ChunkManager.getUser(userId)
        const myUnlockedBuildings={
            "Civilian Factory":['Icons/CivilianFactoryIcon.png',"CivilianFactory"],
            "House":['Icons/HouseIcon.png',"FeudalHouse"]
        }
        
        const currentMessage=this.messages.get(userId)
        if(currentMessage){currentMessage.Constructable=myUnlockedBuildings}
        else{this.messages.set(userId,{Constructable:myUnlockedBuildings})}
    }

    async NewRegimenMessage(userId,Rid,UnitType){

        const TheUser = await ChunkManager.getUser(userId)

        const message={Rid,UnitType,img:this.indiUnits[UnitType]}
        const currentMessage=this.messages.get(userId)
        if(currentMessage){currentMessage.NewRegimen=message}
        else{this.messages.set(userId,{NewRegimen:message})}
    }

    async Adjustregimentcounts(userId,Rid,direction){
        const TheUser = await ChunkManager.getUser(userId)
        const regiment=ChunkManager.getRegiment(userId,Rid)
        if(!regiment){return}

        regiment.count+=direction
        if(regiment.count<=0){regiment.count=1}

        //everything in that direction
        for(let [unit,CPF] of Object.entries(regiment.units)){
            //adjust the finish accordingly....
        }

        const message={Rid,Count:regiment.count}
        const currentMessage=this.messages.get(userId)
        if(currentMessage){currentMessage.AdjustRegimenCount=message}
        else{this.messages.set(userId,{AdjustRegimenCount:message})}
    }

    async DestroyRegimen(userId,Rid){
        const TheUser = await ChunkManager.getUser(userId)

        const success=ChunkManager.deleteRegiment(userId,Rid)
        if(!success){return}
        // console.log("should be sending?",Rid)
        const message={Rid}
        const currentMessage=this.messages.get(userId)
        if(currentMessage){currentMessage.DelRegimen=message}
        else{this.messages.set(userId,{DelRegimen:message})}

    }

    //--------------------------
    async AdjustPlacementBuildingPosition(userId,message){
        const TheUser = await ChunkManager.getUser(userId)

        const currentMessage=this.messages.get(userId)
        if(currentMessage){currentMessage.MovePlacementBuilding=message}
        else{this.messages.set(userId,{MovePlacementBuilding:message})}
    }
}

module.exports=new TickManager()