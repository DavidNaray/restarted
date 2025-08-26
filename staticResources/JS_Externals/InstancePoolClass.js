import * as THREE from "three";
import {scene,requestRenderIfNotRequested} from "../siteJS.js"
import {OBJECTS} from "./TileClass.js"

export class TileInstancePool { 
    constructor(tile) {
        this.tile = tile; // 👈 Full reference to the Tile instance
        this.dummyMatrix = new THREE.Matrix4(); // Globally or per class
        this.instanceGroups = new Map(); // objectType → instanceObject (for that objectType) 
        
        this.ServerId_To_ObjTypeAndInstId_Mapping=new Map();//integer → [objectType,instanceId]

    }

    getTileCoord() {
        return [this.tile.x,this.tile.y]; // or directly access this.tile.x, this.tile.y, etc.
    }

    GeneralAddInstance(objectType, transform,meta={}){
        console.log("METAAAAAA: ",meta)

        let mesh=this.instanceGroups.get(objectType);
        if(!mesh){
            console.log("didnt exist, make it!")
            //if there was no key of objectType then there wont be a value
            mesh=this.createInstanceObjectOfCount(objectType,3);
            mesh.freeIndices=new Set([0,1,2])//every index is free 
            // mesh.scale.set(0.2,0.2,0.2)
            this.instanceGroups.set(objectType,mesh)
            scene.add(mesh);
        }else{//exists, 
            console.log("exists")

            const trueMax=mesh.instanceMatrix.count

            if(mesh.count >= trueMax){
                console.log("need to make bigger!")
                //create a new instanceObject that is larger
                const newMesh=this.createInstanceObjectOfCount(objectType,trueMax+16,mesh);
                newMesh.metadata=mesh.metadata;
                //need to copy over the information from the current mesh, +16 so it doesnt replace too often
                scene.remove(mesh)
                mesh = newMesh;
                scene.add(mesh);
                this.instanceGroups.set(objectType,mesh);
            }
        }


        let index;

        if (mesh.freeIndices.size > 0) {
            
            index = mesh.freeIndices.values().next().value; // Reuse a free index
            console.log("woah, free indice!", index)
            mesh.freeIndices.delete(index);
        } else {
            index = mesh.count++;

        }

        this.ServerId_To_ObjTypeAndInstId_Mapping.set(meta.ServerId,[objectType,index]);
        // console.log("lets see the tile total instance tracking state:",this.ServerId_To_ObjTypeAndInstId_Mapping)
        mesh.setMatrixAt(index, transform);
        meta.parentTile=[this.tile.x,this.tile.y]
        mesh.metadata.set(index,meta);
        mesh.instanceMatrix.needsUpdate = true;

        if (meta.underConstruction) {
            console.log("UNDER CONSTRUCTION")
            // mesh.setOpacityAt(index,0.5)
            // this.markUnderConstruction(mesh, index, true);
            // mesh.material.needsUpdate = true;
            mesh.geometry.getAttribute("instanceOpacity").setX(index, 0.5);
            mesh.geometry.getAttribute("instanceOpacity").needsUpdate = true;
        }
        if (index >= mesh.count) {
            mesh.count = index + 1;
        }
        // console.log(mesh.freeIndices)
        mesh.computeBoundingSphere();
        requestRenderIfNotRequested();
    }


    createInstanceObjectOfCount(objectType,count,oldMesh = null){
        const objectTypeMesh = OBJECTS.get(objectType);
        const geometry = objectTypeMesh.Geometry;
        const baseMat  = objectTypeMesh.material;


        const opacityAttr = new THREE.InstancedBufferAttribute(new Float32Array(count), 1);
        for (let i = 0; i < count; i++) opacityAttr.setX(i, 1); // default fully opaque
        geometry.setAttribute("instanceOpacity", opacityAttr);
        opacityAttr.needsUpdate = true
        
        let material;
        if (Array.isArray(baseMat)) {
            // console.log("hmmmmm, mats array")
            material = baseMat.map(m => m.clone());
            material.forEach((mat) => {
                mat.onBeforeCompile = (shader) => {
                    shader.vertexShader = `
                        attribute float instanceOpacity;
                        varying float vOpacity;
                    ` + shader.vertexShader;

                    shader.vertexShader = shader.vertexShader.replace(
                        '#include <begin_vertex>',
                        `#include <begin_vertex>
                        vOpacity = instanceOpacity;`
                    );

                    shader.fragmentShader = `
                        varying float vOpacity;
                    ` + shader.fragmentShader;

                    shader.fragmentShader = shader.fragmentShader.replace(
                        '#include <dithering_fragment>',
                        `
                        gl_FragColor.a *= vOpacity;
                        #include <dithering_fragment>
                        `
                    );
                };
                mat.transparent = true; // enable opacity
                // mat.depthWrite = false; // crucial for blending
                mat.needsUpdate = true;
            });

        } else if (baseMat.clone) {
            material = baseMat.clone();
            material.transparent = true; // enable opacity
            material.opacity = 0.5;           // adjust to desired see-through
        } else {
            console.warn("Material has no clone(), using as-is:", baseMat);
            material = baseMat;
        }


        const mesh = new THREE.InstancedMesh(geometry, material, count);
        mesh.metadata = new Map();



        const freeIndices = new Set();
        for (let j = 0; j < count; j++) freeIndices.add(j);
        mesh.freeIndices = freeIndices;

        // Copy old mesh matrices if resizing
        if (oldMesh) {
            for (let i = 0; i < oldMesh.count; i++) {
                freeIndices.delete(i);
                oldMesh.getMatrixAt(i, this.dummyMatrix);
                mesh.setMatrixAt(i, this.dummyMatrix);
            }
            mesh.count = oldMesh.count;
        } else {
            mesh.count = 0;
        }

        return mesh;
    }

    removeInstance(serverId) {
        console.log("removing instance with serverId:",serverId)
        // let mesh=this.instanceGroups.get(objectType);
        const relevantInfo=this.ServerId_To_ObjTypeAndInstId_Mapping.get(serverId);
        const objectType=relevantInfo[0]
        const index=relevantInfo[1]
        let mesh=this.instanceGroups.get(objectType)

        if (!mesh) return false;
    
        if (index >= mesh.count) return false; // Invalid index

        const lastIndex = mesh.count - 1;

        //so when count is decremented, it chops off the top instance, so we swap the index to be removed with the lastindex
        if (index !== lastIndex) {
            // Move last matrix into the removed slot
            mesh.getMatrixAt(lastIndex, this.dummyMatrix);
            mesh.setMatrixAt(index, this.dummyMatrix);
    
            // Update metadata
            const lastMeta = mesh.metadata.get(lastIndex);
            mesh.metadata.set(index, lastMeta);
            mesh.metadata.delete(lastIndex);
            
        } else {
            // If you're removing the last one directly since index ==last
            mesh.metadata.delete(index);
            
        }
        //you do not add the last index to free-indices because count is decremented

        mesh.count--;
        mesh.instanceMatrix.needsUpdate = true;

        
        // Compact every 10 removals (adjustable)
        if (mesh.freeIndices.size>=10) {
            console.log("trigger compact")
            this.compactInstanceObject(objectType, mesh);
        }
        requestRenderIfNotRequested();
        return true;
    }


    compactInstanceObject(objectType, oldMesh) {
        const usedIndices = new Set();
        for (let i = 0; i <= oldMesh.count; i++) {
            if (!oldMesh.freeIndices.has(i)) {
                usedIndices.add(i);
            }
        }
    
        // Nothing to compact if it's full or only a couple used
        if (usedIndices.size === oldMesh.instanceMatrix.count) return;
    
        //creating newMesh, not updating hence no oldMesh 3rd param into this, have to define freeIndices here, empty cus full
        const newMesh = this.createInstanceObjectOfCount(objectType, usedIndices.size);
        // newMesh.scale.set(0.2,0.2,0.2)
        // newMesh.metadata=new Map();
        newMesh.freeIndices = new Set();
        
        let j = 0;
        for (const i of usedIndices) {
            oldMesh.getMatrixAt(i, this.dummyMatrix);
            newMesh.setMatrixAt(j, this.dummyMatrix);
            
            const meta=oldMesh.metadata.get(i);
            if(meta){
                newMesh.metadata.set(j, meta);
            }
            j++;
        }
        newMesh.count = usedIndices.size;
        newMesh.instanceMatrix.needsUpdate = true;
    
        scene.remove(oldMesh);
        scene.add(newMesh);
    
        // targetMap.set(objectType, newMesh);
        this.instanceGroups.set(objectType,newMesh);
    }

    moveUnit(serverId,NewPositiontransform){
        const relevantInfo=this.ServerId_To_ObjTypeAndInstId_Mapping.get(serverId);
        const theInstanceObjectType=relevantInfo[0]
        const theUnitsInstanceI=relevantInfo[1]
        let mesh=this.instanceGroups.get(theInstanceObjectType)
        mesh.setMatrixAt(theUnitsInstanceI, NewPositiontransform);
        mesh.instanceMatrix.needsUpdate = true;
        mesh.computeBoundingSphere();
        requestRenderIfNotRequested();
    }


}