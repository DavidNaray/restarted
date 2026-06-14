import * as THREE from "three";
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.176.0/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'https://cdn.jsdelivr.net/npm/three@0.176.0/examples/jsm/utils/BufferGeometryUtils.js';

import {Tile} from "./TileClass.js"

//track all tiles and meshes
class GlobalInstanceManager {
    constructor() {
        this.OriginTile;
        this.tiles = new Map();//tiles have utility
        this.meshToTiles=new WeakMap();      //for mesh -> tile lookup
        this.allTileMeshes=[];          //for raycast intersects
        
        this.OBJECTS=new Map(); 
        this.gltfLoader = new GLTFLoader();
        this.fileLoader = new THREE.FileLoader(this.gltfLoader.manager);
        this.fileLoader.setResponseType('arraybuffer'); // GLB is binary
        this.fileLoader.setRequestHeader({'Authorization': `Bearer ${localStorage.getItem('accessToken')}`});
        
    }

    setOrigin(Origin){this.OriginTile=Origin;}

    getTile(x, y) {return this.tiles.get(`${x},${y}`);}
    
    registerTile(tile) {this.tiles.set(`${tile.x},${tile.y}`, tile);}

    async CreateTile(TileInfo){
        const CreatedTile=new Tile(
            TileInfo.x,
            TileInfo.y,
            TileInfo.textures.texturemapUrl,
            TileInfo.textures.heightmapUrl,
            this.OriginTile
        );
        
        const TilesMeshesMap=CreatedTile.BuildTileBase()
        await CreatedTile.loadtextures();
    
        for(let [XYKey,mesh] of TilesMeshesMap){
            this.meshToTiles.set(mesh,CreatedTile)
            this.allTileMeshes.push(mesh)
        }

        this.registerTile(CreatedTile)
    }

    getAsset(AssetId){return this.OBJECTS.get(AssetId)}

    async loadFile(path) {
        return new Promise(resolve => {
            this.fileLoader.load(path, resolve, undefined, () => resolve(null));
        });
    }

    async parseGLB(data) {
        return new Promise(resolve => {
            this.gltfLoader.parse(data, '', resolve, () => resolve(null));
        });
    }

    mergeMeshes(scene) {
        const geometries = [];
        const materials = [];

        scene.traverse(child => {
            if (!child.isMesh) return;

            child.updateWorldMatrix(true, false);
            const geo = child.geometry.clone();
            geo.applyMatrix4(child.matrixWorld);
            geometries.push(geo);

            if (Array.isArray(child.material)) {
                child.material.forEach(m => materials.push(m));
            } else {
                materials.push(child.material);
            }
        });

        if (geometries.length === 0) return { geometry: null, materials: [] };

        return {
            geometry: mergeGeometries(geometries, true),
            materials
        };
    }

    async objectLoad(assetId,AssetClass,){
        if(this.OBJECTS.has(assetId)){return true}

        const data = await this.loadFile(`Assets/GLB_Exports/${assetId}.glb`);
        if (!data) return false;

        const gltf = await this.parseGLB(data);
        const { geometry, materials } = this.mergeMeshes(gltf.scene);
        if (!geometry || !materials) return false;

        const asset = { AssetClass, geometry, materials };
        this.OBJECTS.set(assetId, asset);
        return true;
    }

}

export const globalmanager=new GlobalInstanceManager();