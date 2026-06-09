import * as THREE from "three";
import {renderer,camera,scene,requestRenderIfNotRequested} from "../siteJS.js"
import {globalmanager} from "./GlobalInstanceMngr.js"

import {UnitSelectionDisplay} from "./DropDownUI.js"

export class RendererUserInputState{
    constructor(){
        //binders
        this.onPointerMove = this.onPointerMove.bind(this);
        this.onMouseDown = this.onMouseDown.bind(this);
        this.onMouseUp = this.onMouseUp.bind(this);

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
        
        this.boxSelect=true;

        //Mouse Dealings
        this.LastState="";
        this.MoveTimer;
        this.isMoving;
        this.isDown;

        this.dragStart={ x: null, y: null };
        this.dragEnd={ x: null, y: null };
        this.FinalMouseState;//whether button is up/down/dragging

        this.SelectedItems;//what has the user selected
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

    RaycastSelect(){
        console.log("trying to raycast select?")
        const intersectsAll = this.raycaster.intersectObjects(scene.children, true);
        const intersects = intersectsAll.filter(i => !globalmanager.allTileMeshes.includes(i.object));
        if (intersects.length > 0) {
            const hit = intersects[0];

            const instanced=hit.instanceId !== undefined
            if (instanced) {console.log('Base mesh!!!!:', hit.object);UnitSelectionDisplay([hit])}

            else {console.log('Non-instanced object hit:', hit.object);}
        }
        else{
            var UnitInfoDispContentBox=document.getElementById("UnitInfoDispContentBox");
            if(UnitInfoDispContentBox && UnitInfoDispContentBox.style.display=="block"){
                document.getElementById("Button_Dropdown").style.display="none";
            }
        }
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



    BoxSelect(){

    }

    Action(){
        if(this.FinalMouseState=="Click"){this.RaycastSelect()}/*make a raycast selection*/
        
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
    }

    CheckFinalState(e){
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

        if(!this.boxSelect ||this.FinalMouseState=="UpMoving" || this.FinalMouseState=="Up"){
            this.dragStart={ x: null, y: null };
            this.dragEnd={ x: null, y: null };
        }
        
        const req=this.LastState!=this.FinalMouseState
        this.LastState=this.FinalMouseState
        if(req){requestRenderIfNotRequested()}
        
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
        if (LeftClick) {this.isDown=true;}
        this.CheckFinalState(event)
    }

    onMouseUp(event){
        const LeftClick=event.button === 0
        if (LeftClick) {this.isDown=false;}
        this.CheckFinalState(event);
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
    }



}

export const InputManager=new RendererUserInputState();