// Exercise library. Every step is timed so the break window can guide it.
// Keep stretches gentle: mild pull, never pain. Stop if numbness or tingling increases.

const glidePositions = [
  ['Straight hand', 'Point all fingers straight up, wrist straight.'],
  ['Hook fist', 'Bend only the top two finger joints, like a claw. Keep big knuckles straight.'],
  ['Full fist', 'Make a relaxed full fist, thumb resting over your fingers.'],
  ['Tabletop', 'Bend only at the big knuckles. Fingers straight, like an L shape.'],
  ['Straight fist', 'Fingertips to the base of your palm. Keep fingertip joints straight.']
];

function repeat(n, fn) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(...fn(i));
  return out;
}

export const EXERCISES = [
  {
    id: 'tendon-glides',
    name: 'Tendon glides',
    area: 'Fingers and wrist tendons',
    summary: 'Five hand shapes that slide the finger flexor tendons through the carpal tunnel.',
    evidence: 'Part of standard hand therapy. A systematic review of 4 RCTs found tendon and nerve gliding plus usual care improved symptoms and function more than usual care alone (Kim 2015).',
    steps: repeat(3, (r) => glidePositions.map(([title, text]) => ({
      title: `${title} (round ${r + 1} of 3)`, text, sec: 3
    })))
  },
  {
    id: 'flexor-stretch',
    name: 'Wrist flexor stretch',
    area: 'Inner forearm',
    summary: 'Stretches the muscles that curl your fingers and bend your wrist down.',
    evidence: 'Low-risk counter-stretch for the forearm flexors, which work constantly while typing.',
    steps: repeat(2, () => [
      { title: 'Right arm', text: 'Straighten your right arm in front, palm up. With your left hand, gently bend the fingers down and back until you feel a mild stretch.', sec: 15 },
      { title: 'Left arm', text: 'Switch sides. Left arm straight, palm up. Gently ease the fingers back. Mild stretch only.', sec: 15 }
    ])
  },
  {
    id: 'extensor-stretch',
    name: 'Wrist extensor stretch',
    area: 'Top of forearm',
    summary: 'Stretches the muscles that hold your wrist up while typing.',
    evidence: 'Forearm extensors stay active to lift the wrist over the keys; this reverses that posture briefly.',
    steps: repeat(2, () => [
      { title: 'Right arm', text: 'Straighten your right arm in front, palm down. Let the wrist drop and gently press the back of the hand with your left hand.', sec: 15 },
      { title: 'Left arm', text: 'Switch sides. Left arm straight, palm down. Let the wrist drop, add light pressure.', sec: 15 }
    ])
  },
  {
    id: 'finger-spread',
    name: 'Finger spread and soft fist',
    area: 'Hand muscles',
    summary: 'Alternates opening and closing to restore blood flow to the small hand muscles.',
    evidence: 'Active movement breaks up static holding, the main driver of fatigue in sustained keyboard work.',
    steps: repeat(3, () => [
      { title: 'Spread', text: 'Spread all fingers as wide as comfortable.', sec: 5 },
      { title: 'Soft fist', text: 'Close into a gentle, loose fist.', sec: 5 }
    ])
  },
  {
    id: 'forearm-rotation',
    name: 'Forearm rotations',
    area: 'Forearm',
    summary: 'Turns the forearm through its full range, the opposite of the fixed palms-down typing posture.',
    evidence: 'Standard keyboards hold the forearm near 60 to 70 degrees of pronation (Marklin 1999); rotating counters that static hold.',
    steps: [
      { title: 'Set up', text: 'Tuck your elbows at your sides, bent to 90 degrees, hands in front.', sec: 5 },
      { title: 'Rotate slowly', text: 'Turn both palms up to the ceiling, then down to the floor. Slow and smooth.', sec: 25 }
    ]
  },
  {
    id: 'median-nerve-glide',
    name: 'Median nerve glide',
    area: 'Median nerve',
    summary: 'A six-position sequence that gently slides the median nerve. Go slow.',
    evidence: 'Often combined with tendon glides in carpal tunnel care (Kim 2015). Stop immediately if tingling or numbness increases.',
    caution: true,
    steps: [
      { title: '1. Fist', text: 'Wrist straight, make a fist with your thumb outside your fingers.', sec: 5 },
      { title: '2. Open hand', text: 'Straighten fingers and thumb together, wrist still straight.', sec: 5 },
      { title: '3. Wrist back', text: 'Gently bend wrist and fingers back, like a stop sign.', sec: 5 },
      { title: '4. Thumb out', text: 'Keep the wrist back and move your thumb out to the side.', sec: 5 },
      { title: '5. Palm up', text: 'Keeping that shape, slowly turn your palm to face the ceiling.', sec: 5 },
      { title: '6. Thumb stretch', text: 'With your other hand, very gently ease the thumb a little further. Stop at any tingling.', sec: 5 }
    ]
  },
  {
    id: 'shoulder-reset',
    name: 'Shoulder and neck reset',
    area: 'Shoulders and neck',
    summary: 'Resets the shoulders and neck, which tense up alongside the wrists.',
    evidence: 'Galinsky (2000) and McLean (2001) both found breaks reduced neck and shoulder discomfort as well as wrist discomfort.',
    steps: [
      { title: 'Shoulder rolls', text: 'Roll both shoulders up, back and down. Slow circles.', sec: 15 },
      { title: 'Chin tucks', text: 'Sit tall. Gently glide your chin straight back, hold a second, release.', sec: 15 }
    ]
  }
];

export const EXERCISE_BY_ID = Object.fromEntries(EXERCISES.map((e) => [e.id, e]));

export function totalSeconds(steps) {
  return steps.reduce((s, st) => s + st.sec, 0);
}

export function formatDuration(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  if (m === 0) return `${s}s`;
  return s ? `${m}m ${s}s` : `${m} min`;
}
