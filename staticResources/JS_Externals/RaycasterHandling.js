import * as THREE from "three";
import {camera,InputState,scene,controls,UserId} from "../siteJS.js"
import {globalmanager} from "./GlobalInstanceMngr.js"
import {UnitSelectionDisplay,moveableSelected} from "./DropDownUI.js"
import {EmitMovementCommand} from "./SceneInitiation.js"

let isDragging = false;
let dragStart = { x: 0, y: 0 };
let DragSelectionKey=false;


export const raycaster = new THREE.Raycaster();
export const pointer  = new THREE.Vector2();

export function onPointerMove(event) {
    pointer .x = (event.clientX / window.innerWidth) * 2 - 1;
    pointer .y = -(event.clientY / window.innerHeight) * 2 + 1;
    
    raycaster.setFromCamera( pointer, camera );
}

export function intersectsTileMeshes(){
    return raycaster.intersectObjects(globalmanager.allTileMeshes, true);
}


export function MouseDownHandling(e) {
    if (e.button === 0) {//left click
        moveableSelected.value=[];
        if (InputState.value == 'neutral') {
            dragStart = { x: e.clientX, y: e.clientY };
            isDragging = false;
            InputState.value = 'BoxClickSelection';
        }
    }else if(e.button === 2){//right click
        // console.log("right click")
    }   
}

export function MouseMovingHandling(e) {
    if (e.button === 0) {//left click
        if (InputState.value == 'BoxClickSelection' && DragSelectionKey) {
            controls.enabled=false
            
            const dx = e.clientX - dragStart.x;
            const dy = e.clientY - dragStart.y;

            if (Math.abs(dx) > 0.3 || Math.abs(dy) > 0.3) {
                isDragging = true;
                // draw selection box here
                console.log("dragging")
                
            }else{//hide selection box since it would be small
                isDragging = false; 
                console.log("area small, removing drag box")
            }
        }
    }else if(e.button === 2){//right click
        // console.log("right drag")
    }
}

export function MouseUpHandling(e) {
    if (e.button === 0) {//left click
        if (InputState.value === 'BoxClickSelection') {
            if (isDragging) {
                // perform box selection logic
                console.log("dragging while mouse up?")
            }else{//just a click effectively
                console.log("muaahaha, just a click")
                onPointerMove(e)
            
                const intersectsAll = raycaster.intersectObjects(scene.children, true);
                const intersects = intersectsAll.filter(i => !globalmanager.allTileMeshes.includes(i.object));

                if (intersects.length > 0) {
                    const hit = intersects[0];

                    if (hit.instanceId !== undefined) {
                        // console.log('Instanced object hit, instanceId:', hit.instanceId);
                        // console.log('Base mesh:', hit.object);
                        
                        // You can now use hit.instanceId to reference that specific instance
                        const sendOver=[hit]
                        UnitSelectionDisplay(sendOver)
                    } else {
                        console.log('Non-instanced object hit:', hit.object);

                    }
                }else{
                    var UnitInfoDispContentBox=document.getElementById("UnitInfoDispContentBox");
                    if(UnitInfoDispContentBox && UnitInfoDispContentBox.style.display=="block"){
                        // UnitInfoDispContentBox.style.display="none"
                        document.getElementById("Button_Dropdown").style.display="none";
                    }
                }
            }
            
        }
        controls.enabled=true;//back to enabling controls, the default state
        isDragging = false; //return to false, the neutral state for drag
        InputState.value = 'neutral';//overall input state

        //note i could probably combine these two variable but cba.. it works rn
    }else if(e.button === 2){//right click
        //send moveableSelected over to the server to the point mouse is raycasting on at mouseup
        console.log(moveableSelected)
        if(Object.keys(moveableSelected).length>0){//Object.keys(obj).length
            console.log("sending over, movement command for:", moveableSelected)
            onPointerMove(e)

            const intersectTerrain=intersectsTileMeshes()
            if (intersectTerrain.length > 0) {
                const intersectedMesh = intersectTerrain[0].object;
                const foundTile =  globalmanager.meshToTiles.get(intersectedMesh);
                if (foundTile) {
                    // const IntersectPoint=intersects[0].point
                    const MoveToTargetPoint=intersectTerrain[0].point 
                    const processedPoint=[MoveToTargetPoint.x,MoveToTargetPoint.y,MoveToTargetPoint.z]

                    //problem is units can be selected over multiple tiles
                        //each instance carries info about their parent tile, meaning now we have target tile and can every tile
                        //a unit that is selected belongs to
                    //processedPoint and unit positions are still in global coordinates, not adjusted to the tile
                        //-> figure it out on the server

                    //need to send position data also for each instance so that the server can check for manipulation
                        //but thats part of its metadata
                    const RequestMetaData={
                        "TargetTile":[foundTile.x, foundTile.y],
                        "position":processedPoint,
                        "userOwner":UserId,//whos performing this command
                        "SelectedUnits":moveableSelected.value[UserId],
                    }

                    EmitMovementCommand(RequestMetaData);
                }
            }
        }else{
            console.log("nothing to send")
        }



    }
}

// export function onClickObjectSelection(event) {
//     if (isDragging) {
//         event.stopImmediatePropagation(); // optional: block click if drag happened
//         return;
//     }


//     //select everything and then filter out the terrainMeshes
//     if(InputState.value=="neutral"){
//         onPointerMove(event)
        
//         const intersectsAll = raycaster.intersectObjects(scene.children, true);
//         const intersects = intersectsAll.filter(i => !globalmanager.allTileMeshes.includes(i.object));

//         if (intersects.length > 0) {
//             const selectedObject = intersects[0].object;
//             console.log('Selected object:', selectedObject);
//             // Do your selection logic here, e.g., highlight, add to selection array, etc.
//         } else {
//             console.log('Nothing selected');
//         } 
//     }

// }

//when raycast hitting something as a selection or box selecting, everything is included bar the terrain meshes
//on the server differentiation occurs and a response is made as to the user akin to {buildings:{..},units:{..}}
//a ui is then built for this response, if they press to attempt to move, the values of units: {} is then passed onto the server
//the server then calculates how they should move

document.addEventListener('keydown', (e) => {
  if (e.key === 'Shift') DragSelectionKey = true;
});
document.addEventListener('keyup', (e) => {
  if (e.key === 'Shift') DragSelectionKey = false;
});