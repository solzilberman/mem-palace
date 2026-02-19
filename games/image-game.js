/**
 * Image Sequence Memory Game
 * Memorize a sequence of images and recall them in order.
 */
import { el, showScreen, formatTime, shuffle, runTimer } from '../utils.js';

const PREFIX = 'image';
const SCREENS = [`${PREFIX}-config`, `${PREFIX}-prepare`, `${PREFIX}-memory`, `${PREFIX}-recall`, `${PREFIX}-stats`];

function show(id) {
  const screen = el(id);
  const gameId = screen?.dataset?.game;
  if (!gameId) return;
  document.querySelectorAll('.game-panel').forEach((p) => p.classList.toggle('visible', p.id === `game-${gameId}`));
  document.querySelectorAll(`[data-game="${gameId}"]`).forEach((s) => s.classList.toggle('active', s.id === id));
}

const state = {
  config: {},
  images: [],
  loadingPromise: null,
  memoryIndex: 0,
  memoryTimerId: null,
  memoryElapsed: 0,
  recallSlots: [],
  recallPool: [],
  recallPoolOrder: [],
  recallTimerId: null,
  recallElapsed: 0,
  selectedSlotIndex: null,
  lastNextPress: 0,
};

function getImageUrl(id) {
  return state.images.find((i) => i.id === id)?.url ?? '';
}

function revokeBlobUrls() {
  state.images.forEach((img) => {
    if (img.url?.startsWith('blob:')) URL.revokeObjectURL(img.url);
  });
}

async function loadImages(count) {
  return Array.from({ length: count }, (_, i) => ({
    id: `img-${Date.now()}-${i}`,
    url: `https://picsum.photos/300/300?random=${Date.now()}-${i}`,
  }));
}

async function cacheImages(images, onProgress) {
  const total = images.length;
  let done = 0;
  await Promise.all(
    images.map(async (img) => {
      const res = await fetch(img.url);
      img.url = URL.createObjectURL(await res.blob());
      done++;
      onProgress?.(done / total);
    })
  );
}

function initConfig(onBackToMenu) {
  el('image-back').onclick = onBackToMenu;
  el('image-config-form').onsubmit = (e) => {
    e.preventDefault();
    state.config = {
      itemCount: +el('image-count').value,
      memoryTime: +el('image-memory-time').value,
      recallTime: +el('image-recall-time').value,
      prepareTime: +el('image-prepare-time').value,
    };
    show(`${PREFIX}-prepare`);
    startPrepare();
  };
}

function startPrepare() {
  revokeBlobUrls();
  state.loadingPromise = (async () => {
    state.images = await loadImages(state.config.itemCount);
    await cacheImages(state.images, (p) => {
      el('image-prepare-loading-bar').style.width = `${p * 100}%`;
      el('image-prepare-loading-text').textContent =
        p >= 1 ? 'Ready' : `Loading images... ${Math.round(p * 100)}%`;
    });
  })();

  let left = state.config.prepareTime;
  const countdownEl = el('image-prepare-countdown');
  countdownEl.textContent = left;
  el('image-prepare-loading-bar').style.width = '0%';
  el('image-prepare-loading-text').textContent = 'Loading images...';

  const goToMemory = () => {
    clearInterval(tid);
    state.loadingPromise.then(startMemory);
  };

  el('image-skip-prepare').onclick = goToMemory;
  const tid = setInterval(() => {
    left--;
    countdownEl.textContent = left;
    if (left <= 0) goToMemory();
  }, 1000);
}

let memoryKeyHandler = null;

function startMemory() {
  state.memoryIndex = 0;
  state.memoryElapsed = 0;
  show(`${PREFIX}-memory`);
  renderMemoryImage();
  bindMemoryButtons();

  memoryKeyHandler = (e) => {
    if (e.key === 'ArrowRight') {
      if (state.memoryIndex === state.images.length - 1) {
        if (Date.now() - state.lastNextPress < 400) goToRecall();
        else state.lastNextPress = Date.now();
      } else {
        state.memoryIndex++;
        renderMemoryImage();
      }
    } else if (e.key === 'ArrowLeft' && state.memoryIndex > 0) {
      state.memoryIndex--;
      renderMemoryImage();
    } else if (e.key === ' ' || e.key === 'ArrowUp') {
      e.preventDefault();
      state.memoryIndex = 0;
      renderMemoryImage();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      goToRecall();
    }
  };
  window.addEventListener('keydown', memoryKeyHandler);

  state.memoryTimerId = runTimer(state.config.memoryTime, (remaining) => {
    state.memoryElapsed = state.config.memoryTime - remaining;
    el('image-memory-timer').textContent = formatTime(remaining);
  }, goToRecall);
}

function renderMemoryImage() {
  const img = state.images[state.memoryIndex];
  el('image-memory-image').src = img.url;
  el('image-memory-position').textContent = `${state.memoryIndex + 1} / ${state.images.length}`;
}

function bindMemoryButtons() {
  el('image-memory-prev').onclick = () => {
    if (state.memoryIndex > 0) {
      state.memoryIndex--;
      renderMemoryImage();
    }
  };
  el('image-memory-next').onclick = () => {
    if (state.memoryIndex < state.images.length - 1) {
      state.memoryIndex++;
      renderMemoryImage();
    } else {
      if (Date.now() - state.lastNextPress < 400) goToRecall();
      else state.lastNextPress = Date.now();
    }
  };
  el('image-finished-btn').onclick = goToRecall;
}

function goToRecall() {
  window.removeEventListener('keydown', memoryKeyHandler);
  clearInterval(state.memoryTimerId);
  state.recallSlots = Array(state.config.itemCount).fill(null);
  state.recallPoolOrder = shuffle(state.images.map((i) => i.id));
  state.recallPool = [...state.recallPoolOrder];
  state.selectedSlotIndex = 0;
  state.recallElapsed = 0;
  show(`${PREFIX}-recall`);
  el('image-submit-recall').onclick = submitRecall;
  renderRecall();
  bindRecallKeys();

  state.recallTimerId = runTimer(state.config.recallTime, (remaining) => {
    state.recallElapsed = state.config.recallTime - remaining;
    el('image-recall-timer').textContent = formatTime(remaining);
  }, submitRecall);
}

let recallKeyHandler = null;

function returnToPool(imageId) {
  const idx = state.recallPoolOrder.indexOf(imageId);
  if (idx >= 0) state.recallPool[idx] = imageId;
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
  state.selectedSlotIndex =
    state.selectedSlotIndex + 1 < state.recallSlots.length ? state.selectedSlotIndex + 1 : null;
  renderRecall();
}

function insertSlot(index) {
  if (state.recallSlots.length >= state.config.itemCount * 2) return;
  state.recallSlots.splice(index, 0, null);
  state.selectedSlotIndex = index;
  renderRecall();
}

function renderRecall() {
  const slotsEl = el('image-recall-slots');
  slotsEl.innerHTML = state.recallSlots
    .map(
      (imageId, i) => `
    <div class="recall-slot${i === state.selectedSlotIndex ? ' selected' : ''}">
      <div class="slot-content" data-slot="${i}">
        ${imageId ? `<img src="${getImageUrl(imageId)}" alt="">` : ''}
      </div>
      <span class="slot-number slot-number-clickable" data-insert="${i}">${i + 1}</span>
    </div>`
    )
    .join('');
  slotsEl.querySelectorAll('.slot-content').forEach((node) => {
    node.onclick = () => onClickSlot(parseInt(node.dataset.slot, 10));
  });
  slotsEl.querySelectorAll('[data-insert]').forEach((node) => {
    node.onclick = (e) => {
      e.stopPropagation();
      insertSlot(parseInt(node.dataset.insert, 10));
    };
  });

  const poolEl = el('image-recall-pool');
  poolEl.innerHTML = state.recallPool
    .map(
      (imageId, i) => `
    <div class="pool-item${imageId ? '' : ' pool-item-empty'}" data-pool="${i}">
      ${imageId ? `<img src="${getImageUrl(imageId)}" alt="">` : '<div class="pool-item-blank"></div>'}
    </div>`
    )
    .join('');
  poolEl.querySelectorAll('.pool-item:not(.pool-item-empty)').forEach((node) => {
    node.onclick = () => onClickPool(parseInt(node.dataset.pool, 10));
  });
}

function bindRecallKeys() {
  recallKeyHandler = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submitRecall();
      return;
    }
    if (state.selectedSlotIndex === null) return;
    if (e.key === '+' || e.key === '=') {
      e.preventDefault();
      insertSlot(state.selectedSlotIndex);
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
  window.addEventListener('keydown', recallKeyHandler);
}

function submitRecall() {
  window.removeEventListener('keydown', recallKeyHandler);
  clearInterval(state.recallTimerId);
  el('image-submit-recall').onclick = null;
  const correct = state.images.map((i) => i.id);
  const answered = state.recallSlots;
  let score = 0;
  for (let i = 0; i < Math.min(correct.length, answered.length); i++) {
    if (correct[i] === answered[i]) score++;
  }
  showStats(score);
}

function showStats(score) {
  show(`${PREFIX}-stats`);
  const correct = state.images.map((i) => i.id);
  const answered = state.recallSlots;
  const compareHtml = correct
    .map(
      (c, i) =>
        `<img src="${getImageUrl(c)}" alt="" class="${c === answered[i] ? 'correct' : 'wrong'}">`
    )
    .join('');
  el('image-stats-content').innerHTML = `
    <p class="stats-row"><strong>Score:</strong> ${score} / ${state.config.itemCount}</p>
    <p class="stats-row"><strong>Memorization time:</strong> ${state.memoryElapsed}s</p>
    <p class="stats-row"><strong>Recall time:</strong> ${state.recallElapsed}s</p>
    <p class="stats-row"><strong>Correct sequence:</strong></p>
    <div class="sequence-compare">${compareHtml}</div>
  `;
  el('image-play-again').onclick = () => {
    revokeBlobUrls();
    state.images = [];
    state.loadingPromise = null;
    el('image-memory-image').removeAttribute('src');
    show(`${PREFIX}-config`);
    initConfig(window.__onBackToMenu);
  };
  el('image-stats-back').onclick = window.__onBackToMenu;
}

export const imageGame = {
  id: 'image',
  name: 'Image Sequence',
  init(onBackToMenu) {
    window.__onBackToMenu = onBackToMenu;
    show(`${PREFIX}-config`);
    initConfig(onBackToMenu);
  },
};
