import * as THREE from "three";
import {camera} from "../siteJS.js"
import {globalmanager} from "./GlobalInstanceMngr.js"


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


//when raycast hitting something as a selection or box selecting, everything is included bar the terrain meshes
//on the server differentiation occurs and a response is made as to the user akin to {buildings:{..},units:{..}}
//a ui is then built for this response, if they press to attempt to move, the values of units: {} is then passed onto the server
//the server then calculates how they should move 