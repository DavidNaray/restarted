
const ChunkManager=require("./CacheChunkInfo.js")

class TickManager {

    constructor() {
        this.TICK_RATE = (1000 / 60)/3;
        this.messages=new Map()
    }

    GetTickRate(){return this.TICK_RATE;}

    GetMessages(){return this.messages;}

    ClearMessages(){this.messages=new Map()}
    
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

}

module.exports=new TickManager()