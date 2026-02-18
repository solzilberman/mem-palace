const screens = ['config', 'prepare', 'memory', 'recall', 'stats'];
let state = {
  config: {},
  images: [],
  loadingPromise: null,
  memoryIndex: 0,
  memoryTimerId: null,
  recallSlots: [],
  recallPool: [],
  selectedSlotIndex: null,
  recallTimerId: null,
  memoryElapsed: 0,
  recallElapsed: 0,
  lastNextPress: 0,
};

function showScreen(id) {
  screens.forEach((s) => document.getElementById(s).classList.toggle('active', s === id));
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function loadImages(count, seed) {
  return Array.from({ length: count }, (_, i) => ({
    id: `${seed}-${i}`,
    url: `https://picsum.photos/seed/${seed}-${i}/300/300`,
  }));
}

async function cacheImages(images, onProgress) {
  const total = images.length;
  let done = 0;
  await Promise.all(
    images.map(async (img) => {
      const res = await fetch(img.url);
      const blob = await res.blob();
      img.url = URL.createObjectURL(blob);
      done++;
      if (onProgress) onProgress(done / total);
    })
  );
}

function getUrl(id) {
  return state.images.find((i) => i.id === id).url;
}

function initConfig() {
  document.getElementById('config-form').onsubmit = (e) => {
    e.preventDefault();
    state.config = {
      imageCount: +document.getElementById('image-count').value,
      memoryTime: +document.getElementById('memory-time').value,
      recallTime: +document.getElementById('recall-time').value,
      prepareTime: +document.getElementById('prepare-time').value,
    };
    showScreen('prepare');
    startPrepare();
  };
}

function startPrepare() {
  state.images.forEach((img) => {
    if (img.url && img.url.startsWith('blob:')) URL.revokeObjectURL(img.url);
  });
  const seed = Date.now();
  state.loadingPromise = (async () => {
    state.images = await loadImages(state.config.imageCount, seed);
    await cacheImages(state.images, (p) => {
      const bar = document.getElementById('prepare-loading-bar');
      const text = document.getElementById('prepare-loading-text');
      if (bar) bar.style.width = `${p * 100}%`;
      if (text) text.textContent = p >= 1 ? 'Ready' : `Loading images... ${Math.round(p * 100)}%`;
    });
  })();

  let left = state.config.prepareTime;
  const el = document.getElementById('prepare-countdown');
  el.textContent = left;
  document.getElementById('prepare-loading-bar').style.width = '0%';
  document.getElementById('prepare-loading-text').textContent = 'Loading images...';

  const goToMemory = () => {
    clearInterval(tid);
    state.loadingPromise.then(startMemory);
  };

  document.getElementById('skip-prepare').onclick = goToMemory;
  const tid = setInterval(() => {
    left--;
    el.textContent = left;
    if (left <= 0) goToMemory();
  }, 1000);
}

function startMemory() {
  state.memoryIndex = 0;
  state.memoryElapsed = 0;
  showScreen('memory');
  renderMemoryImage();
  startMemoryTimer();
  bindMemoryKeys();
  bindMemoryButtons();
}

function renderMemoryImage() {
  const img = state.images[state.memoryIndex];
  document.getElementById('memory-image').src = img.url;
  document.getElementById('memory-position').textContent =
    `${state.memoryIndex + 1} / ${state.images.length}`;
}

function startMemoryTimer() {
  const el = document.getElementById('memory-timer');
  const total = state.config.memoryTime;
  state.memoryTimerId = setInterval(() => {
    state.memoryElapsed++;
    el.textContent = formatTime(Math.max(0, total - state.memoryElapsed));
    if (state.memoryElapsed >= total) {
      clearInterval(state.memoryTimerId);
      goToRecall();
    }
  }, 1000);
  el.textContent = formatTime(total);
}

function bindMemoryKeys() {
  const handler = (e) => {
    if (e.key === 'ArrowRight') {
      if (state.memoryIndex === state.images.length - 1) {
        if (Date.now() - state.lastNextPress < 400) goToRecall();
        else state.lastNextPress = Date.now();
      } else {
        state.memoryIndex++;
        renderMemoryImage();
      }
    } else if (e.key === 'ArrowLeft') {
      if (state.memoryIndex > 0) {
        state.memoryIndex--;
        renderMemoryImage();
      }
    } else if (e.key === ' ' || e.key === 'ArrowUp') {
      e.preventDefault();
      state.memoryIndex = 0;
      renderMemoryImage();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      goToRecall();
    }
  };
  window._memoryKeyHandler = handler;
  window.addEventListener('keydown', handler);
}

function bindMemoryButtons() {
  document.getElementById('memory-prev').onclick = () => {
    if (state.memoryIndex > 0) {
      state.memoryIndex--;
      renderMemoryImage();
    }
  };
  document.getElementById('memory-next').onclick = () => {
    if (state.memoryIndex < state.images.length - 1) {
      state.memoryIndex++;
      renderMemoryImage();
    } else {
      if (Date.now() - state.lastNextPress < 400) goToRecall();
      else state.lastNextPress = Date.now();
    }
  };
  document.getElementById('finished-btn').onclick = goToRecall;
}

function goToRecall() {
  window.removeEventListener('keydown', window._memoryKeyHandler);
  clearInterval(state.memoryTimerId);
  state.recallSlots = Array(state.config.imageCount).fill(null);
  state.recallPoolOrder = shuffle(state.images.map((i) => i.id));
  state.recallPool = state.recallPoolOrder.slice();
  state.selectedSlotIndex = 0;
  state.recallElapsed = 0;
  showScreen('recall');
  document.getElementById('submit-recall').onclick = submitRecall;
  renderRecall();
  startRecallTimer();
  bindRecallKeys();
}

function renderRecall() {
  const slotsEl = document.getElementById('recall-slots');
  slotsEl.innerHTML = '';
  state.recallSlots.forEach((imageId, i) => {
    const div = document.createElement('div');
    div.className = 'recall-slot' + (i === state.selectedSlotIndex ? ' selected' : '');
    const inner = document.createElement('div');
    inner.className = 'slot-content';
    if (imageId) {
      const img = document.createElement('img');
      img.src = getUrl(imageId);
      img.alt = '';
      inner.appendChild(img);
    }
    inner.onclick = () => onClickSlot(i);
    div.appendChild(inner);
    const numSpan = document.createElement('span');
    numSpan.className = 'slot-number slot-number-clickable';
    numSpan.textContent = i + 1;
    numSpan.onclick = (e) => { e.stopPropagation(); insertSlot(i); };
    div.appendChild(numSpan);
    slotsEl.appendChild(div);
  });
  const poolEl = document.getElementById('recall-pool');
  poolEl.innerHTML = '';
  state.recallPool.forEach((imageId, i) => {
    const div = document.createElement('div');
    div.className = 'pool-item' + (imageId ? '' : ' pool-item-empty');
    if (imageId) {
      const img = document.createElement('img');
      img.src = getUrl(imageId);
      img.alt = '';
      div.appendChild(img);
      div.onclick = () => onClickPool(i);
    } else {
      const empty = document.createElement('div');
      empty.className = 'pool-item-blank';
      div.appendChild(empty);
    }
    // const numSpan = document.createElement('span');
    // numSpan.className = 'slot-number';
    // numSpan.textContent = i + 1;
    // div.appendChild(numSpan);
    poolEl.appendChild(div);
  });
}

function returnToPool(imageId) {
  state.recallPool[state.recallPoolOrder.indexOf(imageId)] = imageId;
}

function onClickSlot(index) {
  const imageId = state.recallSlots[index];
  if (imageId) {
    state.recallSlots[index] = null;
    returnToPool(imageId);
  }
  state.selectedSlotIndex = index;
  renderRecall();
}

function onClickPool(poolIndex) {
  if (state.selectedSlotIndex === null) return;
  const imageId = state.recallPool[poolIndex];
  if (!imageId) return;
  state.recallPool[poolIndex] = null;
  state.recallSlots[state.selectedSlotIndex] = imageId;
  const next = state.selectedSlotIndex + 1;
  state.selectedSlotIndex = next < state.recallSlots.length ? next : null;
  renderRecall();
}

function insertSlot(index) {
  if (state.recallSlots.length >= state.config.imageCount * 2) return;
  state.recallSlots.splice(index, 0, null);
  state.selectedSlotIndex = index;
  renderRecall();
}

function startRecallTimer() {
  const el = document.getElementById('recall-timer');
  const total = state.config.recallTime;
  state.recallTimerId = setInterval(() => {
    state.recallElapsed++;
    el.textContent = formatTime(Math.max(0, total - state.recallElapsed));
    if (state.recallElapsed >= total) {
      clearInterval(state.recallTimerId);
      submitRecall();
    }
  }, 1000);
  el.textContent = formatTime(total);
}

function bindRecallKeys() {
  const handler = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submitRecall();
      return;
    }
    if (state.selectedSlotIndex === null) return;
    if (e.key === '+' || e.key === '=') {
      e.preventDefault();
      state.recallSlots.splice(state.selectedSlotIndex, 0, null);
      state.selectedSlotIndex++;
      renderRecall();
    } else if (e.key === '-' || e.key === '_') {
      e.preventDefault();
      const id = state.recallSlots[state.selectedSlotIndex];
      if (id) {
        state.recallSlots[state.selectedSlotIndex] = null;
        returnToPool(id);
      }
      renderRecall();
    }
  };
  window._recallKeyHandler = handler;
  window.addEventListener('keydown', handler);
}

function submitRecall() {
  window.removeEventListener('keydown', window._recallKeyHandler);
  clearInterval(state.recallTimerId);
  document.getElementById('submit-recall').onclick = null;
  const correct = state.images.map((i) => i.id);
  const answered = state.recallSlots;
  let score = 0;
  const minLen = Math.min(correct.length, answered.length);
  for (let i = 0; i < minLen; i++) {
    if (correct[i] === answered[i]) score++;
  }
  showStats(score);
}

function showStats(score) {
  showScreen('stats');
  const correct = state.images.map((i) => i.id);
  const answered = state.recallSlots;
  let html = `
    <p class="stats-row"><strong>Score:</strong> ${score} / ${state.config.imageCount}</p>
    <p class="stats-row"><strong>Memorization time:</strong> ${state.memoryElapsed}s</p>
    <p class="stats-row"><strong>Recall time:</strong> ${state.recallElapsed}s</p>
    <p class="stats-row"><strong>Correct sequence:</strong></p>
    <div class="sequence-compare">
  `;
  for (let i = 0; i < correct.length; i++) {
    const c = correct[i];
    const a = answered[i];
    const cls = c === a ? 'correct' : 'wrong';
    html += `<img src="${getUrl(c)}" alt="" class="${cls}">`;
  }
  html += '</div>';
  document.getElementById('stats-content').innerHTML = html;
  document.getElementById('play-again').onclick = () => {
    state.images.forEach((img) => {
      if (img.url && img.url.startsWith('blob:')) URL.revokeObjectURL(img.url);
    });
    state.images = [];
    state.loadingPromise = null;
    document.getElementById('memory-image').removeAttribute('src');
    showScreen('config');
    initConfig();
  };
}

document.getElementById('submit-recall').onclick = submitRecall;
initConfig();
