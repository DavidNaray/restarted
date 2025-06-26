import * as THREE from "three";
import {OrbitControls} from 'https://cdn.jsdelivr.net/npm/three@0.176.0/examples/jsm/controls/OrbitControls.js';

import {getUserTileData,setupSocketConnection} from "./JS_Externals/SceneInitiation.js"
import {MakeToolTips} from "./JS_Externals/ResourceTips.js"
import {addEventListenersToButtons} from "./JS_Externals/DropDownUI.js"
import {updateGridColumns} from "./JS_Externals/Utils.js"
import {raycaster,pointer} from "./JS_Externals/RaycasterHandling.js"

import {globalmanager} from "./JS_Externals/GlobalInstanceMngr.js"
import {Tile} from "./JS_Externals/TileClass.js"

export var renderer,camera,username,UserId;
export const scene = new THREE.Scene();
var controls,renderRequested;


class Template{
    constructor(name, structure = {}) {
        this.id = generateUniqueId();
        this.name = name;
        this.structure = structure; // { infantry: 20, artillery: 5 }
        this.instanceGroups = new Set(); // All instance groups (from many tiles)
        this.division = null;            // Assigned division (optional)
    }
}

function sceneSetup(tiles){
    scene.background = new THREE.Color('hsl(194, 100%, 71%)');
    
    renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false,powerPreference: "high-performance" });
    renderer.shadowMap.enabled = false;
    renderer.setSize( window.innerWidth, window.innerHeight );
    renderer.setPixelRatio(window.devicePixelRatio * 0.75); // Half the normal pixel ratio

    document.getElementById("ThreeBlock").appendChild(renderer.domElement)

    
    camera = new THREE.PerspectiveCamera( 75, renderer.domElement.width / renderer.domElement.height, 0.1, 10000 );//window.innerWidth / window.innerHeight
    camera.position.z = 5;
    camera.position.y = 1;
    camera.lookAt(new THREE.Vector3(0,0,0))
    
    controls = new OrbitControls( camera, renderer.domElement );
    controls.addEventListener( 'change', requestRenderIfNotRequested );
    
    let ambientLight = new THREE.AmbientLight(new THREE.Color('hsl(0, 100%, 100%)'), 3);
    scene.add(ambientLight);

    const userData=tiles[0];
    console.log(userData,"THIS IS THE X")
    
    const tileyay=new Tile(userData.x,userData.y,globalmanager,userData.textures.texturemapUrl,userData.textures.heightmapUrl,userData.textures.WalkMapURL);

    // loop over the buildings
    userData.buildings.forEach(buildingEntry =>{
        //buildingEntry is of form:
            // const B_TownHall={
            //     "userId":user._id,
            //     "assetId": "DATC",
            //     "instances":[{
            //         "position":[0,0,0],
            //         "metaData":{
            //             "health":100,
            //             "state":"Built"
            //         }
            //     }]
            // }
        const assetID=buildingEntry.assetId;
        const userID=buildingEntry.userId;
        buildingEntry.instances.forEach(instanceEntry =>{
        
            const newMetaData={
                "position":instanceEntry.position,
                "userId":userID,
                "health":instanceEntry.health,
                "state":instanceEntry.state,
            }

            tileyay.objectLoad(assetID,newMetaData);

        });

        // tileyay.objectLoad(buildingEntry)

    })


    // tileyay.addcubeInstance(1);
    // tileyay.addcubeInstance(2);
    // tileyay.addcubeInstance(3);
    // tileyay.addcubeInstance(4);
    // console.log("DIVISION, NOW IN REMOVAL process")
    // tileyay.removecubeInstance(0);
    // tileyay.removecubeInstance(1);

    // tileyay.addcubeInstance(0);
    // window.addEventListener( 'pointermove', onPointerMove );
}

function render(){
    renderRequested = false;
    raycaster.setFromCamera( pointer, camera );
    controls.update();
    renderer.render(scene, camera);
}

export function requestRenderIfNotRequested() {
  if (!renderRequested) {
    renderRequested = true;
    requestAnimationFrame(render);
  }
}

window.onresize=function(){//resize the canvas
    renderer.setSize( window.innerWidth, window.innerHeight );
    camera.aspect = renderer.domElement.width/renderer.domElement.height;
    camera.updateProjectionMatrix();
    updateGridColumns();
    requestRenderIfNotRequested();
}

window.onload=async function(){
    function decodeJWT(token) {
        const payloadBase64 = token.split('.')[1]; // the middle part
        const payload = atob(payloadBase64); // decode base64 to string
        return JSON.parse(payload); // parse the string to object
    }

    async function  startAutoRefresh() {
        const res = await fetch('/token', { method: 'POST', credentials: 'include' });
        if (res.ok) {
            const data = await res.json();
            localStorage.setItem('accessToken', data.accessToken);
            const token = localStorage.getItem('accessToken');
            const decoded = decodeJWT(token);
            // console.log(decoded.username); // ✅
            // console.log(decoded.id);       // ✅
            username=decoded.username
            UserId=decoded.id
            console.log("Access token refreshed.");
        }
        setInterval(async () => {
            const res = await fetch('/token', { method: 'POST', credentials: 'include' });
            if (res.ok) {
                const data = await res.json();
                localStorage.setItem('accessToken', data.accessToken);
                const token = localStorage.getItem('accessToken');
                const decoded = decodeJWT(token);
                // console.log(decoded.username); // ✅
                // console.log(decoded.id);       // ✅
                username=decoded.username
                UserId=decoded.id
                console.log("Access token refreshed.");
            }else {
                console.error("Failed to refresh token", await res.text());
            }
        }, 14 * 60 * 1000); // Every 14 minutes (if access token expires in 15m)
    }
    //if you refresh it asks to check the accesstoken, restart that timer so the user should be set
    await startAutoRefresh()

    //UserTileData is the world information for their account
    const UserTileData=await getUserTileData(localStorage.getItem('accessToken'));
    
    //setupSocketConnection allows for resource value updates & world change updates 
    setupSocketConnection();
    
    //run the function that sets up the three.js scene, traverses the UserTileData and populates the scene with it
    sceneSetup(UserTileData)
    
    //the resource bar needs an overlay with some functionality, calling an emit for whichever resource
    //  and creating a display box for the user to see details about that resource
    MakeToolTips()
    
    addEventListenersToButtons();
}

