export function updateGridColumns() {
    try{
        // console.log("RAHHHHHHHHHHHHHHHHHHHHHHHHHH")
        const IndiOrTemplateButtons=document.getElementById("IndiOrTemplateButtons");
        if (window.innerWidth < 800) {
            IndiOrTemplateButtons.style.gridTemplateColumns = "auto auto 0";
        } else {
            IndiOrTemplateButtons.style.gridTemplateColumns = "auto auto 30%";
        }
    }catch(m){}
}