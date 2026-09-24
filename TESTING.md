# Testing WristGuard

## 1. Automated tests (30 seconds)

```bash
npm test
```

Runs 14 unit tests on the wrist angle math (signs, zones, hand pairing) and a syntax check on every extension script. GitHub runs the same tests on every push (see the Actions tab).

## 2. Load the extension

1. Open `chrome://extensions` (or `edge://extensions`), turn on **Developer mode**.
2. Click **Load unpacked** and choose the `extension/` folder.
3. A welcome tab should open. Pin WristGuard to the toolbar.

After any code change, click the reload icon on the WristGuard card.

## 3. Test the reminders without waiting 20 minutes

On `chrome://extensions`, click **service worker** under WristGuard to open its console, then paste:

```js
// Pretend you have typed for 19.9 minutes, then trigger a tick
const { state } = await chrome.storage.local.get('state');
await chrome.storage.local.set({ state: { ...state, activeSinceMicro: 19.9, lastTick: Date.now() - 60000 } });
chrome.alarms.create('wg-tick', { when: Date.now() + 100, periodInMinutes: 1 });
```

A "Microbreak" notification should appear within a second. Use `activeSinceExercise: 59.9` for the exercise break.

To test escalation (stage 2), ignore the notification and run:

```js
const { state } = await chrome.storage.local.get('state');
await chrome.storage.local.set({ state: { ...state, pending: { ...state.pending, firedAt: Date.now() - 4 * 60000 }, lastTick: Date.now() - 60000 } });
chrome.alarms.create('wg-tick', { when: Date.now() + 100, periodInMinutes: 1 });
```

The break window should open on its own.

No notification? Check your OS settings (macOS: System Settings > Notifications > Google Chrome; Windows: Settings > System > Notifications, and turn off Focus / Do Not Disturb).

## 4. Manual checklist

| Test | Expected |
|---|---|
| Popup > Take a microbreak now | Break window, 30 s countdown in 3 steps |
| Finish the break | "Nice work", closes after 10 s, History shows Completed |
| Start a break, close the window | History shows Skipped, timer resets |
| Notification > Snooze | Badge shows `zz`, no reminder for 5 min |
| Popup > Pause 30m | Badge shows `off` |
| Leave the computer idle 5+ min | History shows Natural rest, both timers reset |
| Dashboard > Exercises > Try it now | Single exercise runs, nothing logged as a break |
| Settings > change routine | Routine length updates, next exercise break uses it |
| Settings > Active hours outside now | Popup says "Off hours" |
| History > Export CSV | CSV downloads |

## 5. Posture checker

1. Popup > **Posture check**. Allow the camera.
2. **Side view:** put the camera level with your desk, off to one side, with elbow, forearm and hand visible.
3. Hold your wrist straight and press **Calibrate**. The reading should sit near 0°.
4. Bend your wrist up slowly. The number should rise and turn amber past about 27° and red past about 33°. Hold it there for 5 s and the alert should fire.
5. Switch to **Top view** (camera looking down at the keyboard). Bending toward your pinky should turn amber past about 12°.
6. Press **Stop** after 20+ seconds. The session appears on Dashboard > Today and in History.

To check accuracy, compare against a phone goniometer app or a protractor held at the wrist. Expect a few degrees of difference. Accuracy drops if your forearm points at the camera.

## 6. Test the website version

```bash
./build.sh
cd web && python3 -m http.server 8000
```

Open http://localhost:8000. It must be localhost or https; `file://` will not work.
