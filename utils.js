// ─── Shared Utilities ──────────────────────────────────────────────────────

export const el = (id) => document.getElementById(id);

export function showScreen(screenId, activeClass = 'active') {
  const screens = document.querySelectorAll('.screen');
  screens.forEach((s) => s.classList.remove(activeClass));
  const target = typeof screenId === 'string' ? el(screenId) : screenId;
  if (target) target.classList.add(activeClass);
}

export function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function runTimer(totalSec, onTick, onComplete) {
  let elapsed = 0;
  const tid = setInterval(() => {
    elapsed++;
    onTick(Math.max(0, totalSec - elapsed));
    if (elapsed >= totalSec) {
      clearInterval(tid);
      onComplete();
    }
  }, 1000);
  onTick(totalSec);
  return tid;
}
