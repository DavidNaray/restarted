const movementOrderObjects=new Map()

async function addMovementOrder(TheObj){
    const itsId=movementOrderObjects.size
    movementOrderObjects.set(itsId,TheObj)
    TheObj.ident=itsId
}

async function removeMovementOrder(theObj){
    movementOrderObjects.delete(theObj.ident)
}

async function ProgressOrders(){
    for(const [key,order] of movementOrderObjects){
        order.ProgressMovement();
    }
}

module.exports={
    addMovementOrder,
    removeMovementOrder,
    ProgressOrders
}