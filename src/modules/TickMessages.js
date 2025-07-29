//every person gets a potential message each tick and once sent gets cleared

const messages=new Map() //id -> message

//message of form
//positions


async function unitPositionChangeForUsers(IdArray,unitPosition){
    //go over the ids and adjust their messags
    for(const userId of IdArray){
        const currentMessage=messages.get(userId)
        if(currentMessage){
            const positions=currentMessage.positions
            if(positions){
                currentMessage.positions.push(unitPosition)
            }else{
                currentMessage.positions=[]
            }
        }else{
            //no current message for it
            messages.set(userId,{positions:[unitPosition]})
        }
    }
}

async function getTheMessage(){
    return messages//.get(userId)
}

async function killEntry(userId){
    messages.delete(userId)
}

module.exports={unitPositionChangeForUsers,getTheMessage,killEntry}