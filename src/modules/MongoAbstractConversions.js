
function convertMapToMongoDoc(graphMap) {
    const result = [];

    for (const [subgrid, neighbors] of graphMap.entries()) {
        const connections = [];

        for (const [to, cost] of neighbors.entries()) {
            connections.push({ to, cost });
        }

        result.push({ subgrid, connections });
    }

    return result
}

function convertMongoPortalGraphToMap(graphArray) {
    const graphMap = new Map();

    for (const { subgrid, connections } of graphArray) {
        const connMap = new Map();
        for (const { to, cost } of connections) {
            connMap.set(to, cost);
        }
        graphMap.set(subgrid, connMap);
    }

    return graphMap;
}

module.exports={convertMapToMongoDoc,convertMongoPortalGraphToMap}