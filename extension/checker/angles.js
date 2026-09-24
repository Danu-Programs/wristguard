// Wrist angle math. Pure functions, no DOM, so they can be unit tested in Node.
//
// Inputs are MediaPipe landmarks in normalized image coordinates (x, y in 0..1, y down).
// Forearm axis: pose elbow -> hand wrist landmark (0).
// Hand axis:    hand wrist (0) -> middle-finger knuckle (9). Using the knuckle, not a fingertip,
//               keeps the measurement independent of how curled the fingers are.
//
// The camera sees a 2D projection, so each view measures one plane:
//   side view -> flexion / extension (bend up or down)
//   top view  -> radial / ulnar deviation (bend toward thumb or pinky)
import { THRESHOLDS } from '../shared/config.js';

const DEG = 180 / Math.PI;

function vec(a, b, aspect) {
  // Scale x by the frame aspect ratio so both axes use the same units.
  return { x: (b.x - a.x) * aspect, y: b.y - a.y };
}
const dot = (a, b) => a.x * b.x + a.y * b.y;
const cross = (a, b) => a.x * b.y - a.y * b.x;
const len = (a) => Math.hypot(a.x, a.y);

/**
 * Signed wrist angle in degrees.
 *   view 'side': positive = extension (hand tilted up in the image, assumes palm-down typing)
 *   view 'top' : positive = ulnar deviation (hand tilted toward the pinky side)
 * Returns null when the geometry is unreliable (segments too short or degenerate).
 */
export function signedWristAngle({ elbow, hand, view, aspect = 16 / 9 }) {
  if (!elbow || !hand || hand.length < 21) return null;
  const wrist = hand[0];
  const f = vec(elbow, wrist, aspect);
  const h = vec(wrist, hand[9], aspect);
  const lf = len(f);
  const lh = len(h);
  if (lf < 0.02 || lh < 0.01) return null;

  const magnitude = Math.atan2(Math.abs(cross(f, h)), dot(f, h)) * DEG;

  // Component of the hand axis perpendicular to the forearm tells us which way it bends.
  const fu = { x: f.x / lf, y: f.y / lf };
  const along = dot(h, fu);
  const perp = { x: h.x - along * fu.x, y: h.y - along * fu.y };

  let ref;
  if (view === 'side') {
    ref = { x: 0, y: -1 }; // image "up" = back of the hand when typing palm-down
  } else {
    ref = vec(hand[5], hand[17], aspect); // index knuckle -> pinky knuckle
    if (len(ref) < 1e-4) return null;
  }
  const side = dot(perp, ref);
  if (Math.abs(side) < 1e-9) return 0;
  return side > 0 ? magnitude : -magnitude;
}

/** Name the direction of a signed angle for a given view. */
export function direction(angle, view) {
  if (view === 'side') return angle >= 0 ? 'extension' : 'flexion';
  return angle >= 0 ? 'ulnar' : 'radial';
}

/** Classify a calibrated signed angle into ok / caution / risk using Keir et al. (2007). */
export function classify(angle, view) {
  const dir = direction(angle, view);
  const t = THRESHOLDS[dir];
  const mag = Math.abs(angle);
  const zone = mag > t.risk ? 'risk' : mag > t.caution ? 'caution' : 'ok';
  return { dir, mag, zone, threshold: t };
}

/** Pair each detected hand with the nearer pose elbow, using the pose wrist as the anchor. */
export function pairHandsWithElbows(pose, hands) {
  if (!pose) return [];
  const arms = [
    { side: 'left', elbow: pose[13], poseWrist: pose[15] },
    { side: 'right', elbow: pose[14], poseWrist: pose[16] }
  ].filter((a) => a.elbow && (a.elbow.visibility ?? 1) > 0.5);
  const out = [];
  const used = new Set();
  for (const hand of hands.filter(Boolean)) {
    let best = null;
    let bestD = Infinity;
    for (const arm of arms) {
      if (used.has(arm.side)) continue;
      const d = Math.hypot(arm.poseWrist.x - hand[0].x, arm.poseWrist.y - hand[0].y);
      if (d < bestD) { bestD = d; best = arm; }
    }
    if (best && bestD < 0.15) {
      used.add(best.side);
      out.push({ side: best.side, elbow: best.elbow, hand });
    }
  }
  return out;
}

/** Exponential moving average helper for jitter reduction. */
export function ema(prev, next, alpha = 0.35) {
  if (prev === null || prev === undefined || Number.isNaN(prev)) return next;
  return prev + alpha * (next - prev);
}
