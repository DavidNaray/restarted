import * as THREE from 'three';

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
  return new THREE.Vector3().lerpVectors(points[i - 1], points[i], t);
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

  // Step 1: remove user points closer than x/2
  const cleaned = [points[0]];
  for (let i = 1; i < points.length; i++) {
    if (points[i].distanceTo(cleaned[cleaned.length - 1]) >= x / 2) {
      cleaned.push(points[i]);
    }
  }

  const dist = computeDistances(cleaned);
  const total = dist[dist.length - 1];
  const segments = [];

  let s = 0;
  for (let i = 1; i < cleaned.length - 1; i++) {
    const cornerS = dist[i];
    const leftCut = cornerS - x / 2;
    const rightCut = cornerS + x / 2;

    // Straight run before corner
    const straightSegs = [];
    if (leftCut - s >= y) {
      let cursor = s;
      while (cursor + x < leftCut) {
        const a = getPointAt(cleaned, dist, cursor);
        const b = getPointAt(cleaned, dist, cursor + x);
        straightSegs.push([a, b]);
        cursor += x;
      }
      const a = getPointAt(cleaned, dist, cursor);
      const b = getPointAt(cleaned, dist, leftCut);
      if (b.distanceTo(a) >= y) straightSegs.push([a, b]);
    }

    segments.push(...balanceStraights(straightSegs, x, y));

    // Corner itself
    const leftPt = getPointAt(cleaned, dist, leftCut);
    const rightPt = getPointAt(cleaned, dist, rightCut);
    segments.push([leftPt, cleaned[i], rightPt]);

    s = rightCut;
  }

  // trailing straight after last corner
  const straightSegs = [];
  while (s < total - y) {
    const next = Math.min(s + x, total);
    const a = getPointAt(cleaned, dist, s);
    const b = getPointAt(cleaned, dist, next);
    if (b.distanceTo(a) >= y) straightSegs.push([a, b]);
    s = next;
  }
  segments.push(...balanceStraights(straightSegs, x, y));

  return segments;
}


// const material = new THREE.LineBasicMaterial();
// const segments = buildWallSegments(userPoints, 10, 4);

// segments.forEach(seg => {
//   const color = new THREE.Color(Math.random(), Math.random(), Math.random());
//   const mat = new THREE.LineBasicMaterial({ color });
//   const geo = new THREE.BufferGeometry().setFromPoints(seg);
//   const line = new THREE.Line(geo, mat);
//   scene.add(line);
// });