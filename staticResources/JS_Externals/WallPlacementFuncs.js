import * as THREE from 'three';
import {superHeightMapTexture} from "./SuperCanvas.js"

function computeDistances(points) {
  const d = [0];
  for (let i = 1; i < points.length; i++) {
    d.push(d[i - 1] + points[i].distanceTo(points[i - 1]));
  }
  return d;
}

function getPointAt(points, dist, s) {
  if (s <= 0) return points[0].clone();
  const total = dist[dist.length - 1];
  if (s >= total) return points[points.length - 1].clone();

  let i = 1;
  while (i < dist.length && dist[i] < s) i++;
  const t = (s - dist[i - 1]) / (dist[i] - dist[i - 1]);

  const interp = new THREE.Vector3().lerpVectors(points[i - 1], points[i], t);
  return snapToTerrain(interp)//new THREE.Vector3().lerpVectors(points[i - 1], points[i], t);
}

function snapToTerrain(point) {
  // NOTE: in THREE.js world, your "y" is height, and x/z is ground-plane
  const chunkX = Math.floor((point.x + 3.75) / 7.5);
  const chunkY = Math.floor((point.z + 3.75) / 7.5); // use z, not y!
  const xyz = superHeightMapTexture.getXYZ(
    chunkX,
    chunkY,
    [((point.x + 3.75) / 7.5) * 1536, ((point.z + 3.75) / 7.5) * 1536]
  );
  return new THREE.Vector3(xyz[0], xyz[1], xyz[2]);
}

function segmentLength(seg) {
  let len = 0;
  for (let i = 1; i < seg.length; i++) {
    len += seg[i - 1].distanceTo(seg[i]);
  }
  return len;
}

function balanceStraights(straights, x, y) {
  let changed = true;
  while (changed) {
    changed = false;

    for (let i = 0; i < straights.length; i++) {
      const seg = straights[i];
      const len = segmentLength(seg);
      if (len < y && straights.length > 1) {
        const left = i > 0 ? straights[i - 1] : null;
        const right = i < straights.length - 1 ? straights[i + 1] : null;

        let mergeLeftScore = Infinity;
        let mergeRightScore = Infinity;

        if (left) {
          const newLen = segmentLength(left) + len;
          mergeLeftScore = Math.abs(x - newLen);
        }
        if (right) {
          const newLen = segmentLength(right) + len;
          mergeRightScore = Math.abs(x - newLen);
        }

        if (mergeLeftScore <= mergeRightScore && left) {
          straights[i - 1] = [left[0], seg[seg.length - 1]];
          straights.splice(i, 1);
        } else if (right) {
          straights[i + 1] = [seg[0], right[right.length - 1]];
          straights.splice(i, 1);
        }
        changed = true;
        break;
      }
    }
  }
  return straights;
}

/**
 * Build wall segments
 * @param {THREE.Vector3[]} points - user path
 * @param {number} x - target segment size
 * @param {number} y - minimum segment size
 * @returns {THREE.Vector3[][]} segments
 */
export function buildWallSegments(points, x, y) {
  if (points.length < 2) return [];

  // --- Step 0: detect closed loop
  const isClosed = points[0].distanceTo(points[points.length - 1]) < 1e-6;
  let trimmed = isClosed ? points.slice(0, -1) : points;

  // --- Step 1: clean near-duplicates (within x/2)
  const cleaned = points//[trimmed[0]];
  // for (let i = 1; i < trimmed.length; i++) {
  //   if (trimmed[i].distanceTo(cleaned[cleaned.length - 1]) >= x / 2) {
  //     cleaned.push(trimmed[i]);
  //   }
  // }

  const dist = computeDistances(cleaned);
  const total = dist[dist.length - 1];
  const segments = [];

  // --- Step 2: split each line into [x/2, x, ..., x/2] without gaps
  const lineSplits = [];
  for (let i = 0; i < cleaned.length - 1; i++) {
    const aS = dist[i];
    const bS = dist[i + 1];
    const lineLen = bS - aS;

    if (lineLen < x) {
      // too short: still force split into two halves
      const midS = (aS + bS) / 2;
      lineSplits.push([
        [getPointAt(cleaned, dist, aS), getPointAt(cleaned, dist, midS)],
        [getPointAt(cleaned, dist, midS), getPointAt(cleaned, dist, bS)]
      ]);
      continue;
    }

    const segs = [];

    // head
    const headEnd = aS + x / 2;
    segs.push([getPointAt(cleaned, dist, aS), getPointAt(cleaned, dist, headEnd)]);

    // full chunks
    let cursor = headEnd;
    while (cursor + x <= bS - x / 2 + 1e-6) {
      segs.push([
        getPointAt(cleaned, dist, cursor),
        getPointAt(cleaned, dist, cursor + x)
      ]);
      cursor += x;
    }

    // tail — instead of fixed bS - x/2, start from cursor (avoids small gap)
    segs.push([getPointAt(cleaned, dist, cursor), getPointAt(cleaned, dist, bS)]);

    lineSplits.push(segs);
  }




  
  // --- Step 3: stitch corners
  for (let i = 1; i < cleaned.length - 1; i++) {
    const prevSegs = lineSplits[i - 1];
    const nextSegs = lineSplits[i];

    const leftEnd = prevSegs[prevSegs.length - 1][0]; // tail start
    const rightStart = nextSegs[0][1];                 // head end
    const corner = cleaned[i];

    // merge as corner
    segments.push([leftEnd, corner, rightStart]);
  }

  // --- Step 4: collect straights (non-corner)
  for (let i = 0; i < lineSplits.length; i++) {
    const segs = lineSplits[i];
    // skip head and tail, they belong to corners
    for (let j = 1; j < segs.length - 1; j++) {
      if (segmentLength(segs[j]) >= y) segments.push(segs[j]);
    }
  }

  // --- Step 5: handle ends / loop closure
  if (isClosed) {
    console.log("woo, closed");

    // const firstHead = lineSplits[0][0];
    // const lastTail = lineSplits[lineSplits.length - 1].slice(-1)[0];

    // // drop the duplicate end cap
    // segments.pop();

    // // replace the first head with a corner segment
    // const corner = cleaned[0];
    // segments[0] = [ lastTail[0], corner, firstHead[1] ];

    // console.log("closing corner:", segments[0]);
    const startFirst = lineSplits[0][0];
    
    const lastTail = lineSplits[lineSplits.length - 1].slice(-1)[0];
    console.log("startFirst",startFirst,"lastTail",lastTail)
    segments.push([lastTail[0],lastTail[1],startFirst[1]])
    // if (segmentLength(firstHead) >= y) segments.push(firstHead);
    // if (segmentLength(lastTail) >= y) segments.push(lastTail);


  } else {
    // open path: include head of first line and tail of last line
    const firstHead = lineSplits[0][0];
    const lastTail = lineSplits[lineSplits.length - 1].slice(-1)[0];
    if (segmentLength(firstHead) >= y) segments.push(firstHead);
    if (segmentLength(lastTail) >= y) segments.push(lastTail);
  }

  return segments;
}


export function trySnapPoint(candidate, existingPoints, snapRadius = 1.0) {
  if (existingPoints.length < 2) return candidate;

  let bestSnap = null;
  let bestDist = Infinity;

  // --- 1. Snap to start or end point
  const start = existingPoints[0];
  const end = existingPoints[existingPoints.length - 1];

  const distToStart = candidate.distanceTo(start);
  if (distToStart < snapRadius && distToStart < bestDist) {
    bestSnap = start;
    bestDist = distToStart;
  }

  const distToEnd = candidate.distanceTo(end);
  if (distToEnd < snapRadius && distToEnd < bestDist) {
    bestSnap = end;
    bestDist = distToEnd;
  }

  // --- 2. Snap to mid-segment
  for (let i = 0; i < existingPoints.length - 1; i++) {
    const a = existingPoints[i];
    const b = existingPoints[i + 1];

    // only valid if this is a straight 2-point segment
    // (you can later expand if you keep track of "corner segments")
    if (!a || !b) continue;

    const closest = closestPointOnSegment(candidate, a, b);
    const d = candidate.distanceTo(closest);

    if (d < snapRadius && d < bestDist) {
      // must actually be between a and b, not just at an endpoint
      if (!closest.equals(a) && !closest.equals(b)) {
        bestSnap = closest;
        bestDist = d;
      }
    }
  }

  return bestSnap ? bestSnap : candidate;
}

function closestPointOnSegment(p, a, b) {
  const ab = new THREE.Vector3().subVectors(b, a);
  const ap = new THREE.Vector3().subVectors(p, a);
  const t = THREE.MathUtils.clamp(ap.dot(ab) / ab.lengthSq(), 0, 1);
  return new THREE.Vector3().copy(a).addScaledVector(ab, t);
}