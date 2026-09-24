import { signedWristAngle, classify, pairHandsWithElbows } from '../extension/checker/angles.js';
const R = Math.PI/180;
// Build a hand: wrist at W, forearm pointing along +x (elbow to the left), hand rotated by theta (image coords, y down).
function makeHand(W, theta, pinkySide = +1, aspect = 1) {
  // hand axis direction rotated by theta from +x; in image coords positive theta (clockwise visually since y down)
  const dir = { x: Math.cos(theta), y: Math.sin(theta) };
  const perp = { x: -dir.y, y: dir.x };
  const pts = Array.from({length:21}, () => ({x:W.x, y:W.y}));
  const P = (along, across) => ({ x: W.x + (dir.x*along + perp.x*across)/aspect, y: W.y + dir.y*along + perp.y*across });
  pts[0] = {...W};
  pts[9] = P(0.1, 0);
  pts[5] = P(0.09, -0.03*pinkySide);
  pts[17] = P(0.08, 0.03*pinkySide);
  return pts;
}
let fails = 0;
const check = (name, got, exp, tol=0.01) => { const ok = Math.abs(got-exp) < tol; if(!ok) fails++; console.log(ok?'PASS':'FAIL', name, got?.toFixed?.(2), 'expected', exp); };
const W = {x:0.5,y:0.5}, E = {x:0.2,y:0.5};
// side view: hand tilted up (negative y) by 30deg => extension +30
check('side ext 30', signedWristAngle({elbow:E, hand:makeHand(W,-30*R), view:'side', aspect:1}), 30);
check('side flex 20', signedWristAngle({elbow:E, hand:makeHand(W,20*R), view:'side', aspect:1}), -20);
check('side straight', signedWristAngle({elbow:E, hand:makeHand(W,0), view:'side', aspect:1}), 0);
// forearm pointing left (elbow on right): hand up still extension
const E2={x:0.8,y:0.5};
function makeHandLeft(W,theta){ const h=makeHand(W,Math.PI - theta); return h; }
check('side ext 25 mirrored', signedWristAngle({elbow:E2, hand:makeHandLeft(W,-25*R), view:'side', aspect:1}), 25);
// top view: pinky on +perp side; rotating hand toward +perp (theta>0) = ulnar
check('top ulnar 15', signedWristAngle({elbow:E, hand:makeHand(W,15*R,+1), view:'top', aspect:1}), 15);
check('top radial 10', signedWristAngle({elbow:E, hand:makeHand(W,-10*R,+1), view:'top', aspect:1}), -10);
// other hand (pinky on -perp side): rotating toward -perp is ulnar
check('top ulnar other hand', signedWristAngle({elbow:E, hand:makeHand(W,-12*R,-1), view:'top', aspect:1}), 12);
// aspect ratio handling: build with aspect 16/9 and pass the same
check('aspect', signedWristAngle({elbow:{x:0.5-0.3*9/16,y:0.5}, hand:makeHand(W,-30*R,1,16/9), view:'side', aspect:16/9}), 30);
// classify (Keir et al. 2007 zones)
const zone = (a, v) => classify(a, v).zone;
const eq = (name, got, exp) => { const ok = got === exp; if (!ok) fails++; console.log(ok ? 'PASS' : 'FAIL', name, got, 'expected', exp); };
eq('30 ext = caution', zone(30, 'side'), 'caution');
eq('40 flex = caution', zone(-40, 'side'), 'caution');
eq('13 ulnar = caution', zone(13, 'top'), 'caution');
eq('25 radial = risk', zone(-25, 'top'), 'risk');
eq('5 ulnar = ok', zone(5, 'top'), 'ok');
// pairing hands to the nearest elbow
const pose = Array.from({length:33},()=>({x:0,y:0,visibility:1}));
pose[13]={x:0.2,y:0.5,visibility:0.9}; pose[15]={x:0.5,y:0.5}; pose[14]={x:0.9,y:0.5,visibility:0.9}; pose[16]={x:0.7,y:0.5};
const pairs = pairHandsWithElbows(pose,[makeHand({x:0.51,y:0.5},0), makeHand({x:0.69,y:0.5},0)]);
eq('pairing', pairs.map(p=>p.side).join(','), 'left,right');
console.log(fails ? `${fails} FAILED` : 'All angle tests passed');
process.exit(fails?1:0);
