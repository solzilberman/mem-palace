/**
 * Card Sequence Memory Game
 * Memorize a sequence of playing cards and recall them in order.
 */
import { el, formatTime, shuffle, runTimer } from '../utils.js';

const PREFIX = 'card';
const DECK_API = 'https://www.deckofcardsapi.com/api/deck';

async function fetchDeck() {
  const res = await fetch(`${DECK_API}/new/shuffle/`);
  const data = await res.json();
  return data.deck_id;
}

async function drawCards(deckId, count) {
  const res = await fetch(`${DECK_API}/${deckId}/draw/?count=${count}`);
  const data = await res.json();
  return data.cards.map((c, i) => ({
    id: `${c.code}-${Date.now()}-${i}`,
    code: c.code,
    value: c.value,
    suit: c.suit,
    url: c.image,
  }));
}

const state = {
  config: {},
  cards: [],
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

function show(id) {
  const screen = el(id);
  const gameId = screen?.dataset?.game;
  if (!gameId) return;
  document.querySelectorAll('.game-panel').forEach((p) => p.classList.toggle('visible', p.id === `game-${gameId}`));
  document.querySelectorAll(`[data-game="${gameId}"]`).forEach((s) => s.classList.toggle('active', s.id === id));
}

function getCardUrl(id) {
  return state.cards.find((c) => c.id === id)?.url ?? '';
}

function initConfig(onBackToMenu) {
  el('card-back').onclick = onBackToMenu;
  el('card-config-form').onsubmit = (e) => {
    e.preventDefault();
    state.config = {
      itemCount: +el('card-count').value,
      memoryTime: +el('card-memory-time').value,
      recallTime: +el('card-recall-time').value,
      prepareTime: +el('card-prepare-time').value,
    };
    show(`${PREFIX}-prepare`);
    startPrepare();
  };
}

async function startPrepare() {
  const countdownEl = el('card-prepare-countdown');
  const textEl = el('card-prepare-loading-text');
  countdownEl.textContent = state.config.prepareTime;
  textEl.textContent = 'Shuffling deck...';

  try {
    const deckId = await fetchDeck();
    state.cards = await drawCards(deckId, state.config.itemCount);
    textEl.textContent = 'Ready';
  } catch (err) {
    textEl.textContent = 'Error loading cards. Try again.';
    return;
  }

  let left = state.config.prepareTime;
  const goToMemory = () => {
    clearInterval(tid);
    startMemory();
  };

  el('card-skip-prepare').onclick = goToMemory;
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
  renderMemoryCard();
  bindMemoryButtons();

  memoryKeyHandler = (e) => {
    if (e.key === 'ArrowRight') {
      if (state.memoryIndex === state.cards.length - 1) {
        if (Date.now() - state.lastNextPress < 400) goToRecall();
        else state.lastNextPress = Date.now();
      } else {
        state.memoryIndex++;
        renderMemoryCard();
      }
    } else if (e.key === 'ArrowLeft' && state.memoryIndex > 0) {
      state.memoryIndex--;
      renderMemoryCard();
    } else if (e.key === ' ' || e.key === 'ArrowUp') {
      e.preventDefault();
      state.memoryIndex = 0;
      renderMemoryCard();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      goToRecall();
    }
  };
  window.addEventListener('keydown', memoryKeyHandler);

  state.memoryTimerId = runTimer(state.config.memoryTime, (remaining) => {
    state.memoryElapsed = state.config.memoryTime - remaining;
    el('card-memory-timer').textContent = formatTime(remaining);
  }, goToRecall);
}

function renderMemoryCard() {
  const card = state.cards[state.memoryIndex];
  el('card-memory-image').src = card.url;
  el('card-memory-image').alt = `${card.value} of ${card.suit}`;
  el('card-memory-position').textContent = `${state.memoryIndex + 1} / ${state.cards.length}`;
}

function bindMemoryButtons() {
  el('card-memory-prev').onclick = () => {
    if (state.memoryIndex > 0) {
      state.memoryIndex--;
      renderMemoryCard();
    }
  };
  el('card-memory-next').onclick = () => {
    if (state.memoryIndex < state.cards.length - 1) {
      state.memoryIndex++;
      renderMemoryCard();
    } else {
      if (Date.now() - state.lastNextPress < 400) goToRecall();
      else state.lastNextPress = Date.now();
    }
  };
  el('card-finished-btn').onclick = goToRecall;
}

function goToRecall() {
  window.removeEventListener('keydown', memoryKeyHandler);
  clearInterval(state.memoryTimerId);
  state.recallSlots = Array(state.config.itemCount).fill(null);
  state.recallPoolOrder = shuffle(state.cards.map((c) => c.id));
  state.recallPool = [...state.recallPoolOrder];
  state.selectedSlotIndex = 0;
  state.recallElapsed = 0;
  show(`${PREFIX}-recall`);
  el('card-submit-recall').onclick = submitRecall;
  renderRecall();
  bindRecallKeys();

  state.recallTimerId = runTimer(state.config.recallTime, (remaining) => {
    state.recallElapsed = state.config.recallTime - remaining;
    el('card-recall-timer').textContent = formatTime(remaining);
  }, submitRecall);
}

let recallKeyHandler = null;

function returnToPool(cardId) {
  const idx = state.recallPoolOrder.indexOf(cardId);
  if (idx >= 0) state.recallPool[idx] = cardId;
}

function onClickSlot(index) {
  const cardId = state.recallSlots[index];
  if (cardId) {
    state.recallSlots[index] = null;
    returnToPool(cardId);
  }
  state.selectedSlotIndex = index;
  renderRecall();
}

function onClickPool(poolIndex) {
  if (state.selectedSlotIndex === null) return;
  const cardId = state.recallPool[poolIndex];
  if (!cardId) return;
  state.recallPool[poolIndex] = null;
  state.recallSlots[state.selectedSlotIndex] = cardId;
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
  const slotsEl = el('card-recall-slots');
  slotsEl.innerHTML = state.recallSlots
    .map(
      (cardId, i) => `
    <div class="recall-slot${i === state.selectedSlotIndex ? ' selected' : ''}">
      <div class="slot-content" data-slot="${i}">
        ${cardId ? `<img src="${getCardUrl(cardId)}" alt="">` : ''}
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

  const poolEl = el('card-recall-pool');
  poolEl.innerHTML = state.recallPool
    .map(
      (cardId, i) => `
    <div class="pool-item${cardId ? '' : ' pool-item-empty'}" data-pool="${i}">
      ${cardId ? `<img src="${getCardUrl(cardId)}" alt="">` : '<div class="pool-item-blank"></div>'}
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
  el('card-submit-recall').onclick = null;
  const correct = state.cards.map((c) => c.id);
  const answered = state.recallSlots;
  let score = 0;
  for (let i = 0; i < Math.min(correct.length, answered.length); i++) {
    if (correct[i] === answered[i]) score++;
  }
  showStats(score);
}

function showStats(score) {
  show(`${PREFIX}-stats`);
  const correct = state.cards.map((c) => c.id);
  const answered = state.recallSlots;
  const compareHtml = correct
    .map(
      (c, i) =>
        `<img src="${getCardUrl(c)}" alt="" class="card-thumb ${c === answered[i] ? 'correct' : 'wrong'}">`
    )
    .join('');
  el('card-stats-content').innerHTML = `
    <p class="stats-row"><strong>Score:</strong> ${score} / ${state.config.itemCount}</p>
    <p class="stats-row"><strong>Memorization time:</strong> ${state.memoryElapsed}s</p>
    <p class="stats-row"><strong>Recall time:</strong> ${state.recallElapsed}s</p>
    <p class="stats-row"><strong>Correct sequence:</strong></p>
    <div class="sequence-compare sequence-compare-cards">${compareHtml}</div>
  `;
  el('card-play-again').onclick = () => {
    state.cards = [];
    el('card-memory-image').removeAttribute('src');
    show(`${PREFIX}-config`);
    initConfig(window.__onBackToMenu);
  };
  el('card-stats-back').onclick = window.__onBackToMenu;
}

export const cardGame = {
  id: 'card',
  name: 'Card Sequence',
  init(onBackToMenu) {
    window.__onBackToMenu = onBackToMenu;
    show(`${PREFIX}-config`);
    initConfig(onBackToMenu);
  },
};
