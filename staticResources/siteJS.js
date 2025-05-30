import * as THREE from "three";
import {OrbitControls} from 'https://cdn.jsdelivr.net/npm/three@0.176.0/examples/jsm/controls/OrbitControls.js';

var controls,renderer,camera;
const scene = new THREE.Scene();

function sceneSetup(){
    scene.background = new THREE.Color( 0xff0000 );
    
    renderer = new THREE.WebGLRenderer();
    renderer.setSize(document.getElementById("ThreeBlock").clientWidth, document.getElementById("ThreeBlock").clientHeight);//window.innerWidth, window.innerHeight );
    
    camera = new THREE.PerspectiveCamera( 75, renderer.domElement.width/renderer.domElement.height, 0.1, 10000 );//window.innerWidth / window.innerHeight
    camera.position.z = 5;
    camera.position.y = 1;
    camera.lookAt(new THREE.Vector3(0,0,0))
    
    controls = new OrbitControls( camera, renderer.domElement );
    
    const geometry = new THREE.BoxGeometry( 0.1, 0.1, 0.1 );
    const material = new THREE.MeshLambertMaterial({color: 0x0000ff, transparent: false, opacity: 0.5}) 
    const cube = new THREE.Mesh( geometry, material );
    scene.add( cube );
    
    let ambientLight = new THREE.AmbientLight(new THREE.Color('hsl(0, 0%, 100%)'), 3);
    scene.add(ambientLight);

    document.getElementById("ThreeBlock").append(renderer.domElement)
}

function animate() {
	// raycaster.setFromCamera( pointer, camera );
	requestAnimationFrame( animate );
	controls.update();
	renderer.render( scene, camera );
}

window.onresize=function(){//resize the canvas
    renderer.setSize( window.innerWidth, window.innerHeight );
    camera.aspect = renderer.domElement.width/renderer.domElement.height;
    camera.updateProjectionMatrix();
}

sceneSetup();
animate();
