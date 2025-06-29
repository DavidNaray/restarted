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
        //instance Objects are then given a meta-data tag
        //form of meta will vary, buildings may have name, type of building, under construction, resistances etc
        //units may have health, damage, weaknesses etc 
        //most importantly a reference to a template object if its part of a template
        // console.log("i am getting the right meta right?: ",meta)
        let mesh=this.instanceGroups.get(objectType);
        if(!mesh){
            console.log("didnt exist, make it!")
            //if there was no key of objectType then there wont be a value
            mesh=this.createInstanceObjectOfCount(objectType,3);
            mesh.metadata=new Map();
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
        if (index >= mesh.count) {
            mesh.count = index + 1;
        }
        // console.log(mesh.freeIndices)
        mesh.computeBoundingSphere();
        requestRenderIfNotRequested();
    }


    createInstanceObjectOfCount(objectType,count,oldMesh = null){
        const objectTypeMesh=OBJECTS.get(objectType).Mesh;
        const geometry = objectTypeMesh.geometry;//refers to the geometry
        const material = objectTypeMesh.material;
        const mesh = new THREE.InstancedMesh( geometry, material, count );
        const freeIndices=new Set();
        for(let j = 0; j < count; j++){
            freeIndices.add(j)
        }
        mesh.freeIndices=freeIndices;
        // If upgrading an old mesh, copy transforms
        if (oldMesh) {
            
            for (let i = 0; i < oldMesh.count; i++) { 
                freeIndices.delete(i)
                oldMesh.getMatrixAt(i, this.dummyMatrix);
                mesh.setMatrixAt(i, this.dummyMatrix);
            }
            mesh.count = oldMesh.count;
            
            
        } else {//ie when oldMesh is null
            mesh.count = 0; // Start fresh
        }


        return mesh;
    }

    removeInstance(objectType, index) {
        let mesh=this.instanceGroups.get(objectType);

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
        newMesh.metadata=new Map();
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


    transferInstance(targetTile, index, objectType, targetMap){

    }
}