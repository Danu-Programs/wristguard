// WristGuard shared configuration.
// Defaults are grounded in the research summary (see dashboard "Learn" tab and the research PDF).

export const DEFAULT_SETTINGS = {
  // Stage A: short microbreaks. McLean et al. (2001) found 20-minute microbreaks reduced
  // discomfort in neck, back, shoulder and wrist without hurting productivity.
  microEnabled: true,
  microIntervalMin: 20,
  microDurationSec: 30,

  // Stage B: longer exercise breaks. Galinsky et al. (2000) added four 5-minute breaks per
  // shift and saw lower forearm/wrist/hand discomfort with no productivity loss.
  exerciseEnabled: true,
  exerciseIntervalMin: 60,
  routine: ['tendon-glides', 'flexor-stretch', 'extensor-stretch', 'finger-spread', 'shoulder-reset'],

  // Two-stage reminder: a gentle notification first, then a focused break window if ignored.
  escalate: true,
  escalateAfterMin: 3,
  snoozeMin: 5,

  // Idle detection: time away from the keyboard counts as rest.
  naturalBreakMin: 5,

  // Schedule
  activeHoursEnabled: false,
  activeStart: '08:00',
  activeEnd: '20:00',
  activeDays: [1, 2, 3, 4, 5], // 0 = Sunday

  // Feedback
  showBadge: true,
  sound: true,

  // Posture checker
  alertAfterSec: 5
};

// Wrist posture thresholds from Keir, Bach, Hudes & Rempel (2007), Human Factors 49(1):88-99.
// Angles are the 25th-percentile posture at which carpal tunnel pressure reaches the threshold,
// i.e. staying inside them keeps ~75% of people below that pressure.
//   caution = 25 mmHg threshold, risk = 30 mmHg threshold
export const THRESHOLDS = {
  extension: { caution: 26.6, risk: 32.7 },
  flexion:   { caution: 37.7, risk: 48.6 },
  ulnar:     { caution: 12.1, risk: 14.5 },
  radial:    { caution: 17.8, risk: 21.8 }
};

export const MICRO_STEPS = [
  { title: 'Hands off', text: 'Take your hands off the keyboard and mouse. Let your arms hang loose at your sides.', weight: 1 },
  { title: 'Shake out', text: 'Gently shake out your hands and wiggle your fingers.', weight: 1 },
  { title: 'Reset', text: 'Roll your shoulders back slowly and look at something far away.', weight: 1 }
];
