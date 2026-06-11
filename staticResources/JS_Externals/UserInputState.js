import * as THREE from "three";
import {globalmanager} from "./GlobalInstanceMngr.js"
import {socket} from "./SceneInitiation.js"
import {renderer,
        controls,
        camera,
        scene,
        requestRenderIfNotRequested} from "../siteJS.js"

import {UnitSelectionDisplay} from "./DropDownUI.js"

export class RendererUserInputState{
    constructor(){
        //binders
        this.onPointerMove = this.onPointerMove.bind(this);
        this.onMouseDown = this.onMouseDown.bind(this);
        this.onMouseUp = this.onMouseUp.bind(this);
        this.onKeyDown = this.onKeyDown.bind(this);
        this.onKeyUp = this.onKeyUp.bind(this);

        /*--------------OverlayUI--------------*/
        this.selectionCanvas = document.createElement("canvas");
        this.selectCanvasSetup()
        this.selectionCtx = this.selectionCanvas.getContext("2d");

        /*---------------UI-game---------------*/
        //raycaster
        this.raycaster = new THREE.Raycaster();
        this.pointer  = new THREE.Vector2();

        //keyboard Dealings
        this.HeldButtons=[]//3 latest  current held
        this.lastPressed=[]//3 last unique presses (there is a time limit)
        
        this.boxSelect;

        //Mouse Dealings
        this.LastState="";
        this.LastRightState="";
        this.MoveTimer;
        this.isMoving;
        this.isDown;//LeftClick
        this.RightisDown;

        this.dragStart={ x: null, y: null };
        this.dragEnd={ x: null, y: null };
        this.FinalMouseState;//whether button is up/down/dragging
        this.FinalrightMouseState;//right mouse button

        this.SelectedItems=[];//what has the user selected
    }

    selectCanvasSetup(){
        this.selectionCanvas.width = window.innerWidth;
        this.selectionCanvas.height = window.innerHeight;
        this.selectionCanvas.style.position = "absolute";
        this.selectionCanvas.style.top = "0";
        this.selectionCanvas.style.left = "0";
        this.selectionCanvas.style.pointerEvents = "none";

        document.body.appendChild(this.selectionCanvas);
    }

    UpdateBoxArea(newW, newH) {
        const oldW = this.selectionCanvas.width;
        const oldH = this.selectionCanvas.height;

        this.selectionCanvas.width = newW;
        this.selectionCanvas.height = newH;

        const scaleX = newW / oldW;
        const scaleY = newH / oldH;

        if (this.dragStart.x !== null) {
            this.dragStart.x *= scaleX;
            this.dragStart.y *= scaleY;
            this.dragEnd.x   *= scaleX;
            this.dragEnd.y   *= scaleY;
        }
    }

    DrawBoxSelectArea() {
        const ctx = this.selectionCtx;

        const canvas = this.selectionCanvas;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (!this.dragStart || !this.dragEnd) return;

        // Compute raw values
        let x = Math.min(this.dragStart.x, this.dragEnd.x);
        let y = Math.min(this.dragStart.y, this.dragEnd.y);
        let w = Math.abs(this.dragEnd.x - this.dragStart.x);
        let h = Math.abs(this.dragEnd.y - this.dragStart.y);

        // Snap to integer pixels to avoid subpixel blurring
        x = Math.floor(x) + 0.5;
        y = Math.floor(y) + 0.5;
        w = Math.floor(w);
        h = Math.floor(h);

        // Transparent fill
        ctx.fillStyle = "rgba(255, 255, 255, 0.15)";
        ctx.fillRect(x, y, w, h);

        // Crisp 1px border
        ctx.strokeStyle = "rgba(255, 255, 255, 1)";
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, w, h);
    }

    RaycastSelect(){
        const intersectsTerrain=this.raycaster.intersectObjects(globalmanager.allTileMeshes, true);

        const intersectsAll = this.raycaster.intersectObjects(scene.children, true);
        const intersects = intersectsAll.filter(i => !globalmanager.allTileMeshes.includes(i.object));
        
        let intersectedTerrain
        try{intersectedTerrain = intersectsTerrain[0].object;}catch(pooh){}
        if (!intersectedTerrain) {//hide the UI for selected units (if there was one selected)
            this.SelectedItems=[];
            var UnitInfoDispContentBox=document.getElementById("UnitInfoDispContentBox");
            if(UnitInfoDispContentBox && UnitInfoDispContentBox.style.display=="block"){
                document.getElementById("Button_Dropdown").style.display="none";
            }
            return;
        }

        const foundTile =  globalmanager.meshToTiles.get(intersectedTerrain);
        let hit;
        try{hit = intersects[0];}catch(bleugh){}
        if(foundTile && hit){
            const instanced=hit.instanceId !== undefined
            if (instanced) {
                UnitSelectionDisplay([hit])
                this.SelectedItems=[{chunk:`${foundTile.x},${foundTile.y}`,instanceId:hit.instanceId,obj:hit.object}];
            }
        }
    }

    BoxSelect(){
        this.SelectedItems=[];
        if (this.dragStart.x === null || this.dragEnd.x === null) return;

    }

    EmitMovementOrder(){
        const intersectTerrain=this.raycaster.intersectObjects(globalmanager.allTileMeshes, true);
        if (intersectTerrain.length > 0) {
            const MoveToTargetPoint=intersectTerrain[0].point 
            const processedPoint=[MoveToTargetPoint.x,MoveToTargetPoint.y,MoveToTargetPoint.z]
            
            const processSelected=this.SelectedItems.map(item => ({sid:item.instanceId,chunk:item.chunk}))
            const grouped = processSelected.reduce((acc, {sid, chunk}) => {
                (acc[chunk] ||= []).push(sid);
                return acc;
            }, {});

            const RequestMetaData={
                "position":processedPoint,
                "SelectedUnits":grouped
            }
            socket.emit('MovementCommand',{"RequestMetaData":RequestMetaData})
        }
    }

    Action(){
        // console.log(this.boxSelect)
        if(this.FinalMouseState=="Click"){
            this.FinalMouseState="Up"
            this.isDown=false
            this.RaycastSelect()/*make a raycast selection*/
        }
        
        else if(this.boxSelect){
            //box is maintained when dragging or if mouse is down
            if(this.FinalMouseState=="Down" || this.FinalMouseState=="Dragging"){
                //draw the selection box
                const startNull=this.dragStart.x!=null && this.dragStart.y!=null;
                const endNull=this.dragEnd.x!=null && this.dragEnd.y!=null
                if(!startNull || !endNull){return;}

                this.DrawBoxSelectArea();
                this.selectionCanvas.style.visibility = "visible";
                this.BoxSelect();
            }
            else{this.selectionCanvas.style.visibility = "hidden";}
        }

        if(this.FinalrightMouseState=="Click"){
            this.FinalrightMouseState="Up"
            this.RightisDown=false
            this.EmitMovementOrder()
        }

    }

    CheckFinalState(e){
        //LeftSide
        if(!this.isDown &&  this.LastState=="Down"){this.FinalMouseState="Click";}

        else if(this.isDown && this.isMoving){
            if(this.boxSelect){
                const nullDStart=this.dragStart.x==null || this.dragStart.y==null
                if(nullDStart){this.dragStart={ x: e.clientX, y: e.clientY };}
                this.dragEnd={ x: e.clientX, y: e.clientY };
            }
            
            this.FinalMouseState="Dragging";
        }
        
        else if(this.isDown && !this.isMoving){this.FinalMouseState="Down";}

        
        else if(!this.isDown && this.isMoving){this.FinalMouseState="UpMoving";}

        else{this.FinalMouseState="Up";}

        //make sure the drawn box select is reset the moment its up
        if(this.FinalMouseState=="UpMoving" || this.FinalMouseState=="Up"){
            this.dragStart={ x: null, y: null };
            this.dragEnd={ x: null, y: null };
        }

        //Rightside
        if(!this.RightisDown &&  this.LastRightState=="Down"){this.FinalrightMouseState="Click";}
        else if(this.RightisDown){this.FinalrightMouseState="Down";}
        else{this.FinalrightMouseState="Up";}

        //yeah
        const req=  this.LastState!=this.FinalMouseState 
                    || this.LastRightState!=this.FinalrightMouseState
                    || this.FinalMouseState=="Dragging"
        if(req){requestRenderIfNotRequested()}        
        
        this.LastState=this.FinalMouseState
        this.LastRightState=this.FinalrightMouseState
        
        // console.log(this.dragStart, this.dragEnd)
        // console.log(this.FinalMouseState)

    }

    onPointerMove(event) {
        clearTimeout(this.MoveTimer);

        this.MoveTimer = setTimeout(() => {this.isMoving=false;}, 100);
        this.isMoving=true;
        this.CheckFinalState(event)

        this.pointer .x = (event.clientX / window.innerWidth) * 2 - 1;
        this.pointer .y = -(event.clientY / window.innerHeight) * 2 + 1;
        
        this.raycaster.setFromCamera( this.pointer, camera );
    }

    onMouseDown(event){
        const LeftClick=event.button === 0
        const RightClick=event.button === 2
        if (LeftClick) {this.isDown=true;}
        if (RightClick){this.RightisDown=true;}
        this.CheckFinalState(event)
    }

    onMouseUp(event){
        const LeftClick=event.button === 0
        const RightClick=event.button === 2
        if (LeftClick) {this.isDown=false;}
        if (RightClick){this.RightisDown=false;}
        this.CheckFinalState(event);
    }

    onKeyDown(event){
        if (event.key === 'Shift') {
            this.boxSelect=true
            controls.enabled=false
        }
    }

    onKeyUp(event){
        if (event.key === 'Shift') {
            this.boxSelect=false
            controls.enabled=true
        }
    }

    SetupListeners(){
        function MouseMove(parent,remove=false){
            if(remove){renderer.domElement.removeEventListener( 'mousemove', parent.onPointerMove );}
            else{renderer.domElement.addEventListener('mousemove',parent.onPointerMove)}
        }

        function MouseDown(parent,remove=false){
            if(remove){renderer.domElement.removeEventListener( 'mousedown', parent.onMouseDown );}
            else{renderer.domElement.addEventListener('mousedown',parent.onMouseDown)}
        }
        
        function MouseUp(parent,remove=false){
            if(remove){renderer.domElement.removeEventListener( 'mouseup', parent.onMouseUp );}
            else{renderer.domElement.addEventListener('mouseup',parent.onMouseUp)}
        }

        MouseMove(this);
        MouseDown(this)
        MouseUp(this)

        function KeyUp(parent,remove=false){
            if(remove){document.removeEventListener( 'keyup', parent.onKeyUp );}
            else{document.addEventListener('keyup',parent.onKeyUp)}
        }
        
        function KeyDown(parent,remove=false){
            if(remove){document.removeEventListener( 'keydown', parent.onKeyDown );}
            else{document.addEventListener('keydown',parent.onKeyDown)}
        }

        KeyUp(this)
        KeyDown(this)

    }

}

export const InputManager=new RendererUserInputState();