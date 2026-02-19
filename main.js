/**
 * Memory Trainer - Main entry point
 * Menu and game loading.
 */
import { el } from './utils.js';
import { imageGame } from './games/image-game.js';
import { cardGame } from './games/card-game.js';

const GAMES = [imageGame, cardGame];

function showMenu() {
  el('menu').classList.add('active');
  document.querySelectorAll('.game-panel').forEach((p) => p.classList.remove('visible'));
}

function hideMenu() {
  el('menu').classList.remove('active');
}

function startGame(game) {
  hideMenu();
  game.init(() => {
    showMenu();
  });
}

function init() {
  const menuEl = el('game-menu');
  menuEl.innerHTML = GAMES.map(
    (g) => `<button class="game-option" data-game="${g.id}">${g.name}</button>`
  ).join('');

  menuEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.game-option');
    if (!btn) return;
    const game = GAMES.find((g) => g.id === btn.dataset.game);
    if (game) startGame(game);
  });

  showMenu();
}

init();
