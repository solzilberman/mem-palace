/**
 * Card Sequence Memory Game
 * Memorize a sequence of playing cards and recall them in order.
 * Uses local SVG cards from assets/cards/ (Open Source Vector Playing Cards, totalnonsense.com, LGPL 3.0).
 */
import { el, formatTime, shuffle, runTimer } from '../utils.js';

const PREFIX = 'card';
const CARDS_BASE = 'assets/cards';

// Standard 52 cards: value A,2-10(0),J,Q,K × suits S,D,C,H (API codes: 0 = 10)
const VALUES = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '0', 'J', 'Q', 'K'];
const SUITS = ['S', 'D', 'C', 'H'];
const FULL_DECK = SUITS.flatMap((suit) => VALUES.map((v) => v + suit));

// Map API-style code to local filename (suit: S→s, D→d, C→c, H→h; value: A→01, 0→10, J→11, Q→12, K→13)
function codeToPath(code) {
  const valueChar = code.slice(0, 1);
  const suitChar = code.slice(1, 2).toLowerCase();
  const num =
    valueChar === 'A' ? '01' : valueChar === '0' ? '10' : valueChar === 'J' ? '11' : valueChar === 'Q' ? '12' : valueChar === 'K' ? '13' : `0${valueChar}`;
  return `${CARDS_BASE}/${suitChar}${num}.svg`;
}

const VALUE_NAMES = { A: 'Ace', '0': '10', J: 'Jack', Q: 'Queen', K: 'King' };
function valueLabel(v) {
  return VALUE_NAMES[v] ?? v;
}
const SUIT_NAMES = { S: 'Spades', D: 'Diamonds', C: 'Clubs', H: 'Hearts' };
function suitLabel(s) {
  return SUIT_NAMES[s] ?? s;
}

function codeToCard(code) {
  const valueChar = code.slice(0, 1);
  const suitChar = code.slice(1, 2);
  return {
    id: code,
    code,
    value: valueLabel(valueChar),
    suit: suitLabel(suitChar),
    url: codeToPath(code),
  };
}

function drawCardsFromDeck(count) {
  const shuffled = shuffle([...FULL_DECK]);
  return shuffled.slice(0, count).map((code) => codeToCard(code));
}

const state = {
  config: {},
  cards: [],
  memoryIndex: 0,
  memoryTimerId: null,
  memoryElapsed: 0,
  recallSlots: [],
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

function getCardUrl(code) {
  if (!code || !FULL_DECK.includes(code)) return '';
  return codeToPath(code);
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

function startPrepare() {
  const countdownEl = el('card-prepare-countdown');
  const textEl = el('card-prepare-loading-text');
  countdownEl.textContent = state.config.prepareTime;
  textEl.textContent = 'Shuffling deck...';

  state.cards = drawCardsFromDeck(state.config.itemCount);
  textEl.textContent = 'Ready';

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

function onClickSlot(index) {
  const cardId = state.recallSlots[index];
  if (cardId) state.recallSlots[index] = null;
  state.selectedSlotIndex = index;
  renderRecall();
}

function onClickDeckCard(code) {
  if (state.selectedSlotIndex === null) return;
  if (state.recallSlots.includes(code)) return;
  state.recallSlots[state.selectedSlotIndex] = code;
  state.selectedSlotIndex =
    state.selectedSlotIndex + 1 < state.recallSlots.length ? state.selectedSlotIndex + 1 : null;
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
      <span class="slot-number">${i + 1}</span>
    </div>`
    )
    .join('');
  slotsEl.querySelectorAll('.slot-content').forEach((node) => {
    node.onclick = () => onClickSlot(parseInt(node.dataset.slot, 10));
  });

  const usedCodes = new Set(state.recallSlots.filter(Boolean));
  const deckEl = el('card-recall-deck');
  deckEl.innerHTML = FULL_DECK.map(
    (code) => {
      const used = usedCodes.has(code);
      return `<div class="deck-card ${used ? 'deck-card-used' : ''}" data-code="${code}"><img src="${getCardUrl(code)}" alt="${codeToCard(code).value} of ${codeToCard(code).suit}"></div>`;
    }
  ).join('');
  deckEl.querySelectorAll('.deck-card:not(.deck-card-used)').forEach((node) => {
    node.onclick = () => onClickDeckCard(node.dataset.code);
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
    if (e.key === '-' || e.key === '_') {
      e.preventDefault();
      if (state.recallSlots[state.selectedSlotIndex]) {
        state.recallSlots[state.selectedSlotIndex] = null;
        renderRecall();
      }
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
    <p class="stats-row"><strong>Your sequence:</strong></p>
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
