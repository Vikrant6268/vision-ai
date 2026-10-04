// =====================================================================
// alertPolicy.js – decides WHEN Walk Mode should speak.
//
// Kept apart from walk.js because it is pure logic with no browser
// code in it, so tests/test-policy.js can run it in Node and check it
// against recorded sequences of frames.
//
// The rule that matters is: warn when an obstacle APPEARS, then be
// quiet while it stays.
//
// The first version spoke again every few seconds for as long as the
// obstacle was in view. In use it was worse than unhelpful: the user
// had already stopped, the warning kept repeating, and because speech
// takes a couple of seconds it kept going after the obstacle had gone.
//
//   frame:   clear  A  A  A  A  A  clear clear  A
//   result:         ■  .  .  .  ~  .     .      ■
//
//   ■  announce   ~  remind (a short tone only)   .  say nothing
// =====================================================================

export function createAlertPolicy({
  // Frames with no obstacle needed before we decide it has really gone.
  // One clear frame in the middle of a bus is a detector flicker.
  clearFrames = 2,

  // The same warning is never spoken twice within this long, even if it
  // flickers off and on.
  minGapMs = 6000,

  // While an obstacle stays in the way: a quiet tone this often.
  reminderMs = 10000,

  now = () => Date.now(),
} = {}) {
  let activeKey = null;       // the obstacle we are currently warning about
  let clearStreak = 0;
  let lastReminderAt = 0;
  const lastSaid = new Map(); // key → when it was last announced

  return {
    /**
     * Feed in one frame's result.
     *
     * @param key  identifies the obstacle in this frame, or null for none
     * @returns 'announce' | 'remind' | null
     */
    update(key) {
      const time = now();

      if (!key) {
        clearStreak += 1;
        if (clearStreak >= clearFrames) activeKey = null;
        return null;
      }

      clearStreak = 0;

      // The obstacle we already warned about is still there.
      if (key === activeKey) {
        if (time - lastReminderAt >= reminderMs) {
          lastReminderAt = time;
          return 'remind';
        }
        return null;
      }

      // A new obstacle.
      activeKey = key;
      lastReminderAt = time;

      const previous = lastSaid.get(key);
      if (previous !== undefined && time - previous < minGapMs) return null;

      lastSaid.set(key, time);
      return 'announce';
    },

    reset() {
      activeKey = null;
      clearStreak = 0;
      lastReminderAt = 0;
      lastSaid.clear();
    },
  };
}
