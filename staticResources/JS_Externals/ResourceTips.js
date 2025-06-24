import {   
    EmitWoodUpdate,EmitStoneUpdate,EmitGoldUpdate,EmitManPowerUpdate,
    EmitWarSupportUpdate,EmitStabilityUpdate,EmitPoliticalPowerUpdate
} from "./SceneInitiation.js"

function positionTooltip(targetElem, tooltipElem) {
    const rect = targetElem.getBoundingClientRect();

    // Default position: right side, 8px offset, vertically aligned to top of element
    let left = rect.right - (rect.right - rect.left)/2;//(tooltipElem.offsetWidth / 2) ;
    let top = rect.top - (rect.top - rect.bottom)/2//(tooltipElem.offsetHeight / 4);

    // Check viewport width to prevent clipping off right edge
    const tooltipWidth = tooltipElem.offsetWidth;
    const viewportWidth = window.innerWidth;

    if (left + tooltipWidth > viewportWidth) {
        // Not enough space on right, position to left instead
        left = rect.left - (rect.right - rect.left)/2 ;
    }

    // Check bottom clipping (optional)
    const tooltipHeight = tooltipElem.offsetHeight;
    const viewportHeight = window.innerHeight;
    if (top + tooltipHeight > viewportHeight) {
        top = viewportHeight - tooltipHeight - 8; // Shift up if clipping bottom
    }

    // Apply position
    tooltipElem.style.left = `${left}px`;
    tooltipElem.style.top = `${top}px`;
}

function GeneralToolTipTitleDiv(inner_HTML,Parent){
    const section  = document.createElement('div');
    section.innerHTML=inner_HTML
    Parent.appendChild(section)
}

function GeneralToolTipValueDiv(inner_HTML,Parent,ID){
    const section  = document.createElement('div');
    section.innerHTML=inner_HTML
    section.id=ID
    Parent.appendChild(section)
}

function WoodCase(tooltip){
    GeneralToolTipTitleDiv("Rate:",tooltip)
    
    GeneralToolTipValueDiv("N.A",tooltip,"ToolTipWoodRate");

    GeneralToolTipTitleDiv("Surplus:",tooltip)

    GeneralToolTipValueDiv("N.A",tooltip,"ToolTipWoodSurplus");
}

function StoneCase(tooltip){
    GeneralToolTipTitleDiv("Rate:",tooltip)

    GeneralToolTipValueDiv("N.A",tooltip,"ToolTipStoneRate");

    GeneralToolTipTitleDiv("Surplus:",tooltip)

    GeneralToolTipValueDiv("N.A",tooltip,"ToolTipStoneSurplus");
}

function GoldCase(tooltip){
    GeneralToolTipTitleDiv("Rate:",tooltip)

    GeneralToolTipValueDiv("N.A",tooltip,"ToolTipGoldRate");

    GeneralToolTipTitleDiv("Surplus:",tooltip)

    GeneralToolTipValueDiv("N.A",tooltip,"ToolTipGoldSurplus");
}

function ManPowerCase(tooltip){
    GeneralToolTipTitleDiv("Total ManPower:",tooltip)

    GeneralToolTipValueDiv("N.A",tooltip,"ToolTipTotalManPower");

    GeneralToolTipTitleDiv("Total Population:",tooltip)

    GeneralToolTipValueDiv("N.A",tooltip,"ToolTipTotalPop");

    GeneralToolTipTitleDiv("Population Gain:",tooltip)

    GeneralToolTipValueDiv("N.A",tooltip,"ToolTipMonthlyPopGain");

    GeneralToolTipValueDiv("N.A",tooltip,"ToolTipRecrtuitableFac");

    GeneralToolTipTitleDiv("Population Limit (housing):",tooltip)

    GeneralToolTipValueDiv("N.A",tooltip,"ToolTipMaxPop");
}

function WarSupportCase(tooltip){
    GeneralToolTipTitleDiv("War Support:",tooltip)

    GeneralToolTipValueDiv("N.A",tooltip,"ToolTipWarSupport");
}

function StabilityCase(tooltip){
    GeneralToolTipTitleDiv("Stability:",tooltip)

    GeneralToolTipValueDiv("N.A",tooltip,"ToolTipStability");
}

function PoliticalPowerCase(tooltip){
    GeneralToolTipTitleDiv("Political Power:",tooltip)

    GeneralToolTipValueDiv("N.A",tooltip,"ToolTipPPRate");

    GeneralToolTipTitleDiv("Rate:",tooltip)

    GeneralToolTipValueDiv("N.A",tooltip,"ToolTipPPSurplus");
}

export function MakeToolTips(){
    // Find all resource blocks
    const resourceBlocks = document.querySelectorAll('.ResourceBlock');

    resourceBlocks.forEach(block => {
        const tooltip = document.createElement('div');
        tooltip.className = 'resource-tooltip';
        document.body.appendChild(tooltip);

        block.addEventListener('mouseenter', (e) => {
            const whichToolTip=block.getAttribute('data-tooltip')
            const hasNoChildNodes=!tooltip.hasChildNodes()
            switch(whichToolTip){
                case "Wood":
                    if(hasNoChildNodes){WoodCase(tooltip)}
                    EmitWoodUpdate();
                    break;
                case "Stone":
                    if(hasNoChildNodes){StoneCase(tooltip);}
                    EmitStoneUpdate();
                    break;
                case "Gold":
                    if(hasNoChildNodes){GoldCase(tooltip);}
                    EmitGoldUpdate();
                    break;
                case "ManPower":
                    if(hasNoChildNodes){ManPowerCase(tooltip);}
                    EmitManPowerUpdate();
                    break;
                case "WarSupport":
                    if(hasNoChildNodes){WarSupportCase(tooltip);}
                    EmitWarSupportUpdate();
                    break;
                case "Stability":
                    if(hasNoChildNodes){StabilityCase(tooltip);}
                    EmitStabilityUpdate()
                    break;
                case "PoliticalPower":
                    if(hasNoChildNodes){PoliticalPowerCase(tooltip);}
                    EmitPoliticalPowerUpdate()
                    break;
                default:
                    tooltip.innerHTML='Resource info';

            }        
            tooltip.style.display = 'block';

            // Position tooltip to the right of the hovered element, offset by 8px
            positionTooltip(block, tooltip);
        });

        block.addEventListener('mousemove', (e) => {
            // Update position if needed (optional)
            positionTooltip(block, tooltip);
        });

        block.addEventListener('mouseleave', (e) => {
            // Hide tooltip on mouse leave
            tooltip.style.display = 'none';
        });


    });

}
