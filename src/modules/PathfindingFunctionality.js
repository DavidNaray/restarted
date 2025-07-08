const {convertMongoPortalGraphToMap}=require("./MongoAbstractConversions.js")

//all movement commands generate a formation and selected units 
// are then responsible for finding their way to their designated position

//what this means is for the movement order, a path needs to be found for the formation
    //this would be determining the position point of the "center" of the formation which
    //all the offsets for the formation build off of
    //the path for the formation is calculated once, it checks the entire path so that there
        //is always enough thickness that wider units are able to stay in formation and reach 
        //the end

//the pathfinding proceeds as follows
    //you have a goal point and you have start point, for units this is their position 
    //in the formation. For the formation this is the clicked on endpoint/ line
        //from the start point determine which subgrid they are on, then determine which subgrid
        //the goal point is on, then calculate the shortest path with A* algorithm over the
        //abstract map from the start grid to the end grid
        //then perform A* algorithm over the subgrids the abstract map selected to the 
        //goal position, this applies both to the units and the formation itself
        
//reading tiles abstract portal info...
// const graphMap = convertMongoPortalGraphToMap(tile.AbstractMap);

//when a user loads in it  
const TilePixelOccupancyMap=new Map()

function calcFormationCenterPoint(selectedUnitsPositions){
    //the median coordinate of selected units
}