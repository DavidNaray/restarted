const {MinHeap,PriorityQueue}=require("../Pathfinding/MinH_PQ.js")

async function AstarPathCost(rawData, startPixel, goalPixel, segmentOrigin, segmentWidth, segmentHeight, flag = false) {
    const data = rawData;

    function getTerrainCost(x, y) {
        const idx = (y * segmentWidth + x) * 4;
        const r = data[idx], g = data[idx + 1], b = data[idx + 2];
        if (r === 255 && g === 255 && b === 255) return 1;   // White
        if (r === 255 && g === 255 && b === 0) return 1;     // Yellow
        if (r === 255 && g === 165 && b === 0) return 1;     // Orange
        if (r === 128 && g === 0 && b === 128) return 1;     // Purple
        return Infinity;
    }

    function heuristic(x1, y1, x2, y2) {
        const dx = x2 - x1, dy = y2 - y1;
        return Math.sqrt(dx * dx + dy * dy);
    }

    const startX = startPixel.x, startY = startPixel.y;
    const goalX = goalPixel.x, goalY = goalPixel.y;

    if (
        startX < 0 || startX >= segmentWidth || startY < 0 || startY >= segmentHeight ||
        goalX < 0 || goalX >= segmentWidth || goalY < 0 || goalY >= segmentHeight
    ) {
        return flag ? { cost: Infinity, path: [] } : Infinity;
    }

    const size = segmentWidth * segmentHeight;
    const gScore = new Float32Array(size).fill(Infinity);
    const fScore = new Float32Array(size).fill(Infinity);
    const cameFromX = new Int16Array(size).fill(-1);
    const cameFromY = new Int16Array(size).fill(-1);
    const closedSet = new Uint8Array(size); // 0 = not visited, 1 = visited

    function idx(x, y) { return y * segmentWidth + x; }

    const startIdx = idx(startX, startY);
    const goalIdx = idx(goalX, goalY);

    gScore[startIdx] = 0;
    fScore[startIdx] = heuristic(startX, startY, goalX, goalY);

    const openSet = new MinHeap((a, b) => a.f - b.f);
    openSet.push({ x: startX, y: startY, f: fScore[startIdx] });

    const directions = [
        [0, -1, 1], [1, 0, 1], [0, 1, 1], [-1, 0, 1],
        [1, -1, Math.SQRT2], [1, 1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]
    ];

    while (!openSet.isEmpty()) {
        const current = openSet.pop();
        const curIdx = idx(current.x, current.y);

        if (closedSet[curIdx]) continue; // already processed
        closedSet[curIdx] = 1;

        if (current.x === goalX && current.y === goalY) {
            const totalCost = gScore[curIdx];
            if (!flag) return totalCost;

            // Reconstruct path
            const path = [];
            let cx = goalX, cy = goalY, guard = 0;
            while (!(cx === startX && cy === startY)) {
                path.push(`${cx},${cy}`);
                const prevX = cameFromX[idx(cx, cy)];
                const prevY = cameFromY[idx(cx, cy)];
                if (prevX === -1 || ++guard > size) break;
                cx = prevX;
                cy = prevY;
            }
            path.push(`${startX},${startY}`);
            path.reverse();
            return { cost: totalCost, path };
        }

        for (const [dx, dy, moveCost] of directions) {
            const nx = current.x + dx, ny = current.y + dy;
            if (nx < 0 || nx >= segmentWidth || ny < 0 || ny >= segmentHeight) continue;

            // Prevent diagonal corner cutting
            if (dx !== 0 && dy !== 0) {
                if (getTerrainCost(current.x + dx, current.y) === Infinity ||
                    getTerrainCost(current.x, current.y + dy) === Infinity) {
                    continue;
                }
            }

            const tCost = getTerrainCost(nx, ny);
            if (tCost === Infinity) continue;

            const nIdx = idx(nx, ny);
            const tentativeG = gScore[curIdx] + tCost * moveCost;
            if (tentativeG < gScore[nIdx]) {
                cameFromX[nIdx] = current.x;
                cameFromY[nIdx] = current.y;
                gScore[nIdx] = tentativeG;
                fScore[nIdx] = tentativeG + heuristic(nx, ny, goalX, goalY);
                openSet.push({ x: nx, y: ny, f: fScore[nIdx] });
            }
        }
    }

    return flag ? { cost: Infinity, path: [] } : Infinity;
}

module.exports={AstarPathCost}