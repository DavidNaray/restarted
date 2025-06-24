function nextSpiralPos(state) {
    let [x, y] = state.pos;
    let dirIdx = state.dirIdx;
    let stepsTaken = state.stepsTaken;
    let stepLength = state.stepLength;
    let turnCount = state.turnCount;

    // Directions: right, up, left, down
    const directions = [
        [1, 0],
        [0, 1],
        [-1, 0],
        [0, -1],
    ];
    const [dx, dy] = directions[dirIdx];

    // Move one step in current direction
    x += dx;
    y += dy;
    stepsTaken += 1;

    // Check if finished current step length in this direction
    if (stepsTaken === stepLength) {
        dirIdx = (dirIdx + 1) % 4; // turn left
        stepsTaken = 0;
        turnCount += 1;

        // Every 2 turns, increase step length by 1
        if (turnCount % 2 === 0) {
        stepLength += 1;
        }
    }

    // Update state
    state.pos = [x, y];
    state.dirIdx = dirIdx;
    state.stepsTaken = stepsTaken;
    state.stepLength = stepLength;
    state.turnCount = turnCount;

    return { pos: [x, y], state };
}

let state = {
  pos: [0, 0],
  dirIdx: 0,
  stepsTaken: 0,
  stepLength: 1,
  turnCount: 0,
  firstCall: true,
};


function GiveMeNextCoordAndSetState(){
    if (state.firstCall) {
        state.firstCall = false;
        return state.pos;  // return (0,0) first without advancing
    }

    const result = nextSpiralPos(state);
    state = result.state;
    return result.pos;  // return the newly advanced position
}

module.exports={GiveMeNextCoordAndSetState}