const canvas = document.getElementById('tetris');
const context = canvas.getContext('2d');
context.scale(20, 20);

const scoreElem = document.getElementById('score');
const startBtn = document.getElementById('start-btn');
const gameOverElem = document.getElementById('game-over');
const highScoreElem = document.getElementById('high-score');
let highScore = parseInt(localStorage.getItem('tetrisHighScore') || '0', 10);

const COLS = 12, ROWS = 20;
let arena, player, dropCounter, dropInterval, lastTime, gameOver, animationId;

const SHAPES = [
  [],
  [[1,1,1,1]], // I
  [[2,0,0],[2,2,2]], // J
  [[0,0,3],[3,3,3]], // L
  [[4,4],[4,4]],     // O
  [[0,5,5],[5,5,0]], // S
  [[0,6,0],[6,6,6]], // T
  [[7,7,0],[0,7,7]], // Z
];
const COLORS = [
  null,
  '#00f0f0', // I - Cyan
  '#0000f0', // J - Blue
  '#f0a000', // L - Orange
  '#f0f000', // O - Yellow
  '#00f000', // S - Green
  '#a000f0', // T - Purple
  '#f00000', // Z - Red
];

function createMatrix(w, h) {
  const matrix = [];
  while (h--) matrix.push(new Array(w).fill(0));
  return matrix;
}

function merge(arena, player) {
  player.matrix.forEach((row, y) => {
    row.forEach((value, x) => {
      if (value !== 0) {
        arena[y + player.pos.y][x + player.pos.x] = value;
      }
    });
  });
}

function collide(arena, player) {
  const m = player.matrix, o = player.pos;
  for (let y = 0; y < m.length; ++y) {
    for (let x = 0; x < m[y].length; ++x) {
      if (m[y][x] !== 0 &&
          (arena[y + o.y] && arena[y + o.y][x + o.x]) !== 0) {
        return true;
      }
    }
  }
  return false;
}

function playerDrop() {
  player.pos.y++;
  softDropCells++;
  if (collide(arena, player)) {
    player.pos.y--;
    if (softDropCells > 1) player.score += getDropScore(true, softDropCells-1) * level;
    softDropCells = 0;
    merge(arena, player);
    playerReset();
    arenaSweep();
    updateScore();
    if (collide(arena, player)) {
      endGame();
      return;
    }
  }
  dropCounter = 0;
}

function playerMove(dir) {
  player.pos.x += dir;
  if (collide(arena, player)) {
    player.pos.x -= dir;
  }
}

function rotate(matrix, dir) {
  // Transpose
  const result = matrix[0].map((_, i) => matrix.map(row => row[i]));
  // Reverse rows for clockwise, columns for counterclockwise
  if (dir > 0) {
    return result.map(row => row.reverse());
  } else {
    return result.reverse();
  }
}

function playerRotate(dir = 1) {
  console.log('Rotating piece', JSON.parse(JSON.stringify(player.matrix)));
  const oldMatrix = player.matrix;
  const rotated = rotate(player.matrix, dir);
  player.matrix = rotated;
  let offset = 1;
  while (collide(arena, player)) {
    player.pos.x += offset;
    offset = -(offset + (offset > 0 ? 1 : -1));
    if (Math.abs(offset) > player.matrix[0].length) {
      player.matrix = oldMatrix;
      player.pos.x = Math.floor(COLS / 2) - Math.floor(player.matrix[0].length / 2);
      return;
    }
  }
}

// --- NEXT & HOLD PIECE LOGIC ---
let nextPiece = null;
let holdPiece = null;
let canHold = true;
const nextCanvas = document.getElementById('next-piece');
const nextCtx = nextCanvas.getContext('2d');
const holdCanvas = document.getElementById('hold-piece');
const holdCtx = holdCanvas.getContext('2d');

function drawMiniMatrix(ctx, matrix) {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  if (!matrix) return;
  const size = ctx.canvas.width / matrix.length;
  matrix.forEach((row, y) => {
    row.forEach((value, x) => {
      if (value !== 0) {
        ctx.fillStyle = COLORS[value];
        ctx.fillRect(x * size, y * size, size, size);
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x * size, y * size, size, size);
      }
    });
  });
}

function updatePanels() {
  drawMiniMatrix(nextCtx, nextPiece?.matrix);
  drawMiniMatrix(holdCtx, holdPiece?.matrix);
}

function getRandomPiece() {
  const pieces = 'IJLOSTZ';
  const type = pieces[Math.floor(Math.random() * pieces.length)];
  const idx = pieces.indexOf(type) + 1;
  return {
    matrix: SHAPES[idx].map(row => row.slice()),
    type: type
  };
}

function playerReset() {
  console.log('playerReset called');
  if (!nextPiece) nextPiece = getRandomPiece();
  player.matrix = nextPiece.matrix.map(row => row.slice());
  nextPiece = getRandomPiece();
  player.pos.y = 0;
  player.pos.x = Math.floor(COLS / 2) - Math.floor(player.matrix[0].length / 2);
  canHold = true;
  updatePanels();
  if (collide(arena, player)) {
    gameOver = true;
  }
}

function holdCurrentPiece() {
  console.log('Holding piece', JSON.parse(JSON.stringify(player.matrix)));
  if (!canHold) return;
  if (!holdPiece) {
    holdPiece = { matrix: player.matrix.map(row => row.slice()), type: null };
    playerReset();
  } else {
    [holdPiece, player.matrix] = [
      { matrix: player.matrix.map(row => row.slice()), type: null },
      holdPiece.matrix.map(row => row.slice())
    ];
    player.pos.y = 0;
    player.pos.x = Math.floor(COLS / 2) - Math.floor(player.matrix[0].length / 2);
  }
  canHold = false;
  updatePanels();
}

// --- PARTICLE SYSTEM ---
let particles = [];

function spawnParticles(x, y, color, count = 12) {
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count;
    const speed = 0.1 + Math.random() * 0.15;
    particles.push({
      x: x + 0.5,
      y: y + 0.5,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      alpha: 1,
      color: color,
      radius: 0.18 + Math.random() * 0.12
    });
  }
}

function updateParticles() {
  particles.forEach(p => {
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.01; // gravity
    p.alpha -= 0.025;
  });
  particles = particles.filter(p => p.alpha > 0);
}

function drawParticles() {
  particles.forEach(p => {
    context.save();
    context.globalAlpha = Math.max(0, p.alpha);
    context.fillStyle = p.color;
    context.beginPath();
    context.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    context.fill();
    context.restore();
  });
}

// --- ADVANCED SCORING & LEVEL SYSTEM ---
let linesClearedTotal = 0;
let combo = 0;
let backToBackTetris = false;
let level = 1;
const levelSpeeds = [1000, 800, 650, 500, 370, 250, 160, 100, 80, 60, 40];
let comboMessage = '';
let comboMessageTimer = 0;

function getDropScore(soft, cells) {
  return soft ? cells : cells * 2;
}

function updateLevel() {
  level = Math.floor(linesClearedTotal / 10) + 1;
  dropInterval = levelSpeeds[Math.min(level - 1, levelSpeeds.length - 1)];
  // Optionally: change music/background here
}

function showComboMessage(msg) {
  comboMessage = msg;
  comboMessageTimer = 60; // frames
}

// --- ENHANCED arenaSweep for combos, Tetris, back-to-back ---
function arenaSweep() {
  let rowCount = 1;
  let linesCleared = 0;
  let tetris = false;
  outer: for (let y = arena.length - 1; y >= 0; --y) {
    for (let x = 0; x < arena[y].length; ++x) {
      if (arena[y][x] === 0) continue outer;
    }
    for (let x = 0; x < arena[y].length; ++x) {
      if (arena[y][x] !== 0) {
        spawnParticles(x, y, COLORS[arena[y][x]]);
      }
    }
    const row = arena.splice(y, 1)[0].fill(0);
    arena.unshift(row);
    ++y;
    player.score += rowCount * 100 * level;
    rowCount *= 2;
    linesCleared++;
  }
  if (linesCleared > 0) {
    linesClearedTotal += linesCleared;
    stats.linesCleared += linesCleared;
    updateLevel();
    if (linesCleared === 4) {
      stats.tetrises++;
      if (backToBackTetris) {
        player.score += 1200 * level; // back-to-back bonus
        showComboMessage('Back-to-Back TETRIS!');
        stats.backToBacks++;
      } else {
        player.score += 800 * level;
        showComboMessage('TETRIS!');
      }
      backToBackTetris = true;
    } else {
      if (linesCleared > 1) {
        player.score += [0,0,300,500][linesCleared] * level;
        showComboMessage(`${linesCleared} Lines!`);
      }
      backToBackTetris = false;
    }
    combo++;
    if (combo > 1) showComboMessage(`Combo x${combo}`);
    if (combo > stats.maxCombo) stats.maxCombo = combo;
    playSound(linesCleared === 4 ? sounds.tetris : sounds.line);
  } else {
    combo = 0;
  }
  stats.score = player.score;
  unlockAchievements(stats);
}

function drawMatrix(matrix, offset) {
  matrix.forEach((row, y) => {
    row.forEach((value, x) => {
      if (value !== 0) {
        context.fillStyle = COLORS[value];
        context.fillRect(x + offset.x, y + offset.y, 1, 1);
        context.strokeStyle = '#fff';
        context.lineWidth = 0.08;
        context.strokeRect(x + offset.x, y + offset.y, 1, 1);
      }
    });
  });
}

function getGhostPosition() {
  // Clone player position and matrix
  const ghost = {
    pos: { x: player.pos.x, y: player.pos.y },
    matrix: player.matrix
  };
  // Drop ghost down until collision
  while (!collide(arena, ghost)) {
    ghost.pos.y++;
  }
  ghost.pos.y--; // Step back to last valid position
  return ghost;
}

function drawGhostPiece() {
  const ghost = getGhostPosition();
  context.save();
  context.globalAlpha = 0.3;
  drawMatrix(ghost.matrix, ghost.pos);
  context.restore();
}

function draw() {
  context.fillStyle = '#111';
  context.fillRect(0, 0, canvas.width, canvas.height);
  drawMatrix(arena, {x:0, y:0});
  drawGhostPiece();
  drawMatrix(player.matrix, player.pos);
  drawParticles();
  // Draw level
  context.save();
  context.globalAlpha = 0.8;
  context.font = 'bold 1.1em "Press Start 2P", cursive';
  context.fillStyle = '#FFD700';
  context.fillText(`LEVEL ${level}`, 0.5, 1.2);
  context.restore();
  // Draw combo/Tetris message
  if (comboMessageTimer > 0 && comboMessage) {
    context.save();
    context.globalAlpha = Math.min(1, comboMessageTimer / 30);
    context.font = 'bold 1.2em "Press Start 2P", cursive';
    context.fillStyle = '#00ffe7';
    context.fillText(comboMessage, 2.5, 10.5);
    context.restore();
    comboMessageTimer--;
    if (comboMessageTimer === 0) comboMessage = '';
  }
  // Draw badges at top right
  const badges = getUnlockedBadges();
  if (badges.length) {
    context.save();
    context.globalAlpha = 0.95;
    context.font = '1.2em serif';
    let x = COLS - 0.5 - badges.length * 1.2;
    badges.forEach((b, i) => {
      context.fillText(b.emoji, x + i * 1.5, 1.2);
    });
    context.restore();
  }
}

function updateScore() {
  scoreElem.textContent = player.score;
  if (player.score > highScore) {
    highScore = player.score;
    localStorage.setItem('tetrisHighScore', highScore);
  }
  highScoreElem.textContent = highScore;
}

let paused = false;
const pauseOverlay = document.getElementById('pause-overlay');
if (!pauseOverlay) {
  const pauseOverlay = document.createElement('div');
  pauseOverlay.id = 'pause-overlay';
  pauseOverlay.style.position = 'absolute';
  pauseOverlay.style.top = '0';
  pauseOverlay.style.left = '0';
  pauseOverlay.style.width = '100vw';
  pauseOverlay.style.height = '100vh';
  pauseOverlay.style.display = 'none'; // Hide by default!
  pauseOverlay.style.background = 'rgba(0,0,0,0.6)';
  pauseOverlay.style.color = '#00ffe7';
  pauseOverlay.style.fontFamily = "'Press Start 2P', cursive";
  pauseOverlay.style.fontSize = '2em';
  pauseOverlay.style.justifyContent = 'center';
  pauseOverlay.style.alignItems = 'center';
  pauseOverlay.style.zIndex = '1000';
  pauseOverlay.innerText = 'PAUSED';
  document.body.appendChild(pauseOverlay);
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (pauseOverlay) pauseOverlay.style.display = paused ? 'flex' : 'none';
  const pauseBtn = document.getElementById('pause-btn');
  if (pauseBtn) pauseBtn.textContent = paused ? 'Resume' : 'Pause';
  if (!paused) update();
}

function update(time = 0) {
  if (gameOver) return;
  if (paused) return;
  const deltaTime = time - lastTime;
  lastTime = time;
  dropCounter += deltaTime;
  if (dropCounter > dropInterval) {
    playerDrop();
  }
  updateParticles();
  draw();
  animationId = requestAnimationFrame(update);
}

// --- LEADERBOARD LOGIC ---
const LEADERBOARD_KEY = 'tetrisLeaderboard';
function getLeaderboard() {
  return JSON.parse(localStorage.getItem(LEADERBOARD_KEY) || '[]');
}
function saveLeaderboard(lb) {
  localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(lb));
}
function addScoreToLeaderboard(name, score, level) {
  let lb = getLeaderboard();
  lb.push({ name, score, level });
  lb = lb.sort((a, b) => b.score - a.score).slice(0, 5);
  saveLeaderboard(lb);
}
function renderLeaderboardModal(latestScore = null) {
  if (!leaderboardModal) return;
  const lb = getLeaderboard();
  leaderboardModal.innerHTML = `<div class='modal-content'>
    <h2>Leaderboard</h2>
    <table style='width:100%;text-align:center;font-size:0.9em;'>
      <tr><th>Rank</th><th>Name</th><th>Score</th><th>Level</th><th>Badges</th></tr>
      ${lb.map((entry, i) => {
        const ach = getAchievements();
        const badges = ACHIEVEMENTS.filter(a => ach[a.id]).map(a => a.emoji).join(' ');
        return `<tr><td>${i+1}</td><td>${entry.name}</td><td>${entry.score}</td><td>${entry.level}</td><td>${badges}</td></tr>`;
      }).join('')}
    </table>
    <button class='modal-close' id='close-leaderboard'>Close</button>
  </div>`;
  leaderboardModal.classList.remove('hidden');
  const closeBtn = leaderboardModal.querySelector('#close-leaderboard');
  if (closeBtn) closeBtn.onclick = () => leaderboardModal.classList.add('hidden');
  leaderboardModal.onclick = e => { if (e.target === leaderboardModal) leaderboardModal.classList.add('hidden'); };
}
const leaderboardBtn = document.getElementById('leaderboard-btn');
const leaderboardModal = document.getElementById('leaderboard-modal');
if (leaderboardBtn) leaderboardBtn.onclick = () => renderLeaderboardModal();

// --- NAME ENTRY AFTER GAME OVER ---
function endGame() {
  gameOver = true;
  gameOverElem.style.display = '';
  startBtn.disabled = false;
  cancelAnimationFrame(animationId);
  playSound(sounds.gameover);
  setMusicEnabled(false);
  // Prompt for name if score qualifies
  setTimeout(() => {
    let lb = getLeaderboard();
    const minScore = lb.length < 5 ? 0 : lb[lb.length-1].score;
    if (player.score > minScore) {
      let name = prompt('New High Score! Enter your name:', 'Player');
      if (!name) name = 'Player';
      addScoreToLeaderboard(name, player.score, level);
      renderLeaderboardModal({ name, score: player.score, level });
    }
  }, 500);
}

// --- SOFT DROP SCORING ---
let softDropCells = 0;
function playerHardDrop() {
  let dropped = false;
  let cells = 0;
  while (!collide(arena, player)) {
    player.pos.y++;
    dropped = true;
    cells++;
  }
  player.pos.y--;
  if (dropped) {
    player.score += getDropScore(false, cells) * level;
    spawnParticlesForPiece(player.matrix, player.pos, COLORS[getPieceColor(player.matrix)]);
    playSound(sounds.drop);
    merge(arena, player);
    playerReset();
    arenaSweep();
    updateScore();
    if (collide(arena, player)) {
      endGame();
      return;
    }
    dropCounter = 0;
  }
}
function getPieceColor(matrix) {
  for (let row of matrix) for (let v of row) if (v) return v;
  return 1;
}
function spawnParticlesForPiece(matrix, pos, color) {
  for (let y = 0; y < matrix.length; ++y) {
    for (let x = 0; x < matrix[y].length; ++x) {
      if (matrix[y][x] !== 0) {
        spawnParticles(pos.x + x, pos.y + y, color, 8);
      }
    }
  }
}

// --- ENHANCED playSound ---
function playSound(sound) {
  if (soundEnabled && sound) {
    try {
      sound.currentTime = 0;
      sound.play();
    } catch(e) {}
  }
}

// --- RESET LEVEL/COMBO ON NEW GAME ---
function startGame() {
  arena = createMatrix(COLS, ROWS);
  player = {pos: {x:0, y:0}, matrix: null, score: 0};
  dropCounter = 0;
  dropInterval = 1000;
  lastTime = 0;
  gameOver = false;
  paused = false;
  if (pauseOverlay) pauseOverlay.style.display = 'none';
  const pauseBtn = document.getElementById('pause-btn');
  if (pauseBtn) pauseBtn.textContent = 'Pause';
  gameOverElem.style.display = 'none';
  startBtn.disabled = true;
  nextPiece = null;
  holdPiece = null;
  canHold = true;
  linesClearedTotal = 0;
  combo = 0;
  backToBackTetris = false;
  level = 1;
  comboMessage = '';
  comboMessageTimer = 0;
  stats = { tetrises: 0, linesCleared: 0, score: 0, maxCombo: 0, backToBacks: 0 };
  playerReset();
  updateScore();
  updatePanels();
  setMusicEnabled(soundEnabled);
  update();
}

// Defensive: Ensure all UI elements exist before using
const settingsBtn = document.getElementById('settings-btn');
const helpBtn = document.getElementById('help-btn');
const settingsModal = document.getElementById('settings-modal');
const helpModal = document.getElementById('help-modal');
const pauseBtn = document.getElementById('pause-btn');
const rotateBtn = document.getElementById('rotate-btn');

// --- THEME SWITCHER & SOUND TOGGLE ---
const THEMES = ['light', 'dark', 'neon', 'pastel', 'retro', 'vaporwave', 'mono'];
const FONTS = [
  { id: 'pressstart', label: 'Press Start 2P', class: 'font-pressstart' },
  { id: 'vt323', label: 'VT323', class: 'font-vt323' },
  { id: 'sharetech', label: 'Share Tech Mono', class: 'font-sharetech' },
];
let soundEnabled = localStorage.getItem('tetrisSound') !== '0';
function setTheme(theme) {
  document.body.classList.remove('theme-light', 'theme-dark', 'theme-neon');
  document.body.classList.add('theme-' + theme);
  localStorage.setItem('tetrisTheme', theme);
}
function getTheme() {
  return localStorage.getItem('tetrisTheme') || 'dark';
}
setTheme(getTheme());

function setFont(fontId) {
  document.body.classList.remove(...FONTS.map(f => f.class));
  const font = FONTS.find(f => f.id === fontId) || FONTS[0];
  document.body.classList.add(font.class);
  localStorage.setItem('tetrisFont', fontId);
}
function getFont() {
  return localStorage.getItem('tetrisFont') || FONTS[0].id;
}
setFont(getFont());

// --- SOUND & MUSIC ASSETS (placeholders, user to provide actual files) ---
const sounds = {
  move: new Audio('move.wav'),
  rotate: new Audio('rotate.wav'),
  drop: new Audio('drop.wav'),
  line: new Audio('line.wav'),
  tetris: new Audio('tetris.wav'),
  hold: new Audio('hold.wav'),
  gameover: new Audio('gameover.wav'),
};
let music = new Audio('music.mp3');
music.loop = true;

// --- SOUND TOGGLE ---
function setMusicEnabled(enabled) {
  if (enabled) {
    music.volume = 0.5;
    music.play().catch(()=>{});
  } else {
    music.pause();
    music.currentTime = 0;
  }
}
if (typeof soundEnabled === 'undefined') soundEnabled = true;
setMusicEnabled(soundEnabled);

// --- ACHIEVEMENTS & BADGES ---
const ACHIEVEMENTS = [
  { id: 'first-tetris', label: 'First Tetris', emoji: '🎉', check: (stats) => stats.tetrises >= 1 },
  { id: 'ten-lines', label: '10 Lines', emoji: '🔟', check: (stats) => stats.linesCleared >= 10 },
  { id: 'hundred-k', label: '100k Score', emoji: '💯', check: (stats) => stats.score >= 100000 },
  { id: 'combo3', label: 'Combo x3', emoji: '🔥', check: (stats) => stats.maxCombo >= 3 },
  { id: 'b2b', label: 'Back-to-Back', emoji: '💎', check: (stats) => stats.backToBacks >= 2 },
];
const ACHIEVEMENTS_KEY = 'tetrisAchievements';
function getAchievements() {
  return JSON.parse(localStorage.getItem(ACHIEVEMENTS_KEY) || '{}');
}
function saveAchievements(ach) {
  localStorage.setItem(ACHIEVEMENTS_KEY, JSON.stringify(ach));
}
function unlockAchievements(stats) {
  let ach = getAchievements();
  let unlocked = false;
  for (const a of ACHIEVEMENTS) {
    if (!ach[a.id] && a.check(stats)) {
      ach[a.id] = true;
      unlocked = true;
      showComboMessage(`Achievement: ${a.label} ${a.emoji}`);
    }
  }
  if (unlocked) saveAchievements(ach);
}
function getUnlockedBadges() {
  const ach = getAchievements();
  return ACHIEVEMENTS.filter(a => ach[a.id]);
}
// --- TRACK STATS FOR ACHIEVEMENTS ---
let stats = { tetrises: 0, linesCleared: 0, score: 0, maxCombo: 0, backToBacks: 0 };

// --- HARD DROP LOGIC ---
function playerHardDrop() {
  let dropped = false;
  let cells = 0;
  while (!collide(arena, player)) {
    player.pos.y++;
    dropped = true;
    cells++;
  }
  player.pos.y--;
  if (dropped) {
    player.score += getDropScore(false, cells) * level;
    spawnParticlesForPiece(player.matrix, player.pos, COLORS[getPieceColor(player.matrix)]);
    playSound(sounds.drop);
    merge(arena, player);
    playerReset();
    arenaSweep();
    updateScore();
    if (collide(arena, player)) {
      endGame();
      return;
    }
    dropCounter = 0;
  }
}
function getPieceColor(matrix) {
  for (let row of matrix) for (let v of row) if (v) return v;
  return 1;
}
function spawnParticlesForPiece(matrix, pos, color) {
  for (let y = 0; y < matrix.length; ++y) {
    for (let x = 0; x < matrix[y].length; ++x) {
      if (matrix[y][x] !== 0) {
        spawnParticles(pos.x + x, pos.y + y, color, 8);
      }
    }
  }
}

// --- CUSTOMIZABLE CONTROLS ---
const DEFAULT_BINDINGS = {
  left: 'ArrowLeft',
  right: 'ArrowRight',
  softDrop: 'ArrowDown',
  hardDrop: ' ',
  rotate: 'ArrowUp',
  hold: 'c',
  pause: 'p',
};
const BINDINGS_KEY = 'tetrisBindings';
function getBindings() {
  return JSON.parse(localStorage.getItem(BINDINGS_KEY) || JSON.stringify(DEFAULT_BINDINGS));
}
function saveBindings(bindings) {
  localStorage.setItem(BINDINGS_KEY, JSON.stringify(bindings));
}
let bindings = getBindings();
function resetBindings() {
  bindings = { ...DEFAULT_BINDINGS };
  saveBindings(bindings);
}
// --- SETTINGS MODAL: CONTROLS SECTION ---
function renderSettingsModal() {
  if (!settingsModal) return;
  const currentTheme = getTheme();
  const currentFont = getFont();
  settingsModal.innerHTML = `<div class='modal-content'>
    <h2>Settings</h2>
    <div style='margin-bottom:1em;'>
      <label style='font-size:0.8em;'>Theme:</label><br>
      ${THEMES.map(t => `<label style='margin-right:1em;'><input type='radio' name='theme' value='${t}' ${currentTheme===t?'checked':''}/> ${t.charAt(0).toUpperCase()+t.slice(1)}</label>`).join('')}
    </div>
    <div style='margin-bottom:1em;'>
      <label style='font-size:0.8em;'>Font:</label><br>
      ${FONTS.map(f => `<label style='margin-right:1em;'><input type='radio' name='font' value='${f.id}' ${currentFont===f.id?'checked':''}/> ${f.label}</label>`).join('')}
    </div>
    <div style='margin-bottom:1em;'>
      <label style='font-size:0.8em;'>Sound:</label>
      <label style='margin-left:1em;'><input type='checkbox' id='sound-toggle' ${soundEnabled ? 'checked' : ''}/> Enable Sound</label>
      <label style='margin-left:1em;'><input type='checkbox' id='music-toggle' ${!music.paused ? 'checked' : ''}/> Music</label>
    </div>
    <div style='margin-bottom:1em;'>
      <label style='font-size:0.8em;'>Controls:</label>
      <table style='margin:0 auto;font-size:0.8em;'>
        <tr><td>Move Left</td><td><button class='rebind-btn' data-action='left'>${bindings.left}</button></td></tr>
        <tr><td>Move Right</td><td><button class='rebind-btn' data-action='right'>${bindings.right}</button></td></tr>
        <tr><td>Soft Drop</td><td><button class='rebind-btn' data-action='softDrop'>${bindings.softDrop}</button></td></tr>
        <tr><td>Hard Drop</td><td><button class='rebind-btn' data-action='hardDrop'>${bindings.hardDrop === ' ' ? 'Space' : bindings.hardDrop}</button></td></tr>
        <tr><td>Rotate</td><td><button class='rebind-btn' data-action='rotate'>${bindings.rotate}</button></td></tr>
        <tr><td>Hold</td><td><button class='rebind-btn' data-action='hold'>${bindings.hold}</button></td></tr>
        <tr><td>Pause</td><td><button class='rebind-btn' data-action='pause'>${bindings.pause}</button></td></tr>
      </table>
      <button id='reset-controls' style='margin-top:8px;'>Reset to Default</button>
    </div>
    <button class='modal-close' id='close-settings'>Close</button>
  </div>`;
  settingsModal.classList.remove('hidden');
  settingsModal.querySelectorAll('input[name="theme"]').forEach(radio => {
    radio.onchange = e => {
      setTheme(e.target.value);
      renderSettingsModal();
    };
  });
  settingsModal.querySelectorAll('input[name="font"]').forEach(radio => {
    radio.onchange = e => {
      setFont(e.target.value);
      renderSettingsModal();
    };
  });
  const soundToggle = settingsModal.querySelector('#sound-toggle');
  if (soundToggle) soundToggle.onchange = e => {
    soundEnabled = e.target.checked;
    localStorage.setItem('tetrisSound', soundEnabled ? '1' : '0');
    setMusicEnabled(soundEnabled);
    renderSettingsModal();
  };
  const musicToggle = settingsModal.querySelector('#music-toggle');
  if (musicToggle) musicToggle.onchange = e => {
    setMusicEnabled(e.target.checked);
    renderSettingsModal();
  };
  // --- Controls rebinding ---
  settingsModal.querySelectorAll('.rebind-btn').forEach(btn => {
    btn.onclick = () => {
      btn.textContent = 'Press key...';
      const action = btn.getAttribute('data-action');
      function onKey(e) {
        e.preventDefault();
        let key = e.key;
        if (key === ' ') key = ' ';
        bindings[action] = key;
        saveBindings(bindings);
        document.removeEventListener('keydown', onKey, true);
        renderSettingsModal();
      }
      document.addEventListener('keydown', onKey, true);
    };
  });
  const resetBtn = settingsModal.querySelector('#reset-controls');
  if (resetBtn) resetBtn.onclick = () => {
    resetBindings();
    bindings = getBindings();
    renderSettingsModal();
  };
  const closeBtn = settingsModal.querySelector('#close-settings');
  if (closeBtn) closeBtn.onclick = () => settingsModal.classList.add('hidden');
  settingsModal.onclick = e => { if (e.target === settingsModal) settingsModal.classList.add('hidden'); };
}
function renderHelpModal() {
  if (!helpModal) return;
  helpModal.innerHTML = `<div class='modal-content'>
    <h2>How to Play</h2>
    <ul style='text-align:left;font-size:0.7em;'>
      <li>Arrow keys or touch: Move/rotate/drop pieces</li>
      <li>Space: Hard drop</li>
      <li>C: Hold piece</li>
      <li>P: Pause/Resume</li>
    </ul>
    <button class='modal-close' id='close-help'>Close</button>
  </div>`;
  helpModal.classList.remove('hidden');
  const closeBtn = helpModal.querySelector('#close-help');
  if (closeBtn) closeBtn.onclick = () => helpModal.classList.add('hidden');
  helpModal.onclick = e => { if (e.target === helpModal) helpModal.classList.add('hidden'); };
}
if (settingsBtn) settingsBtn.onclick = renderSettingsModal;
if (helpBtn) helpBtn.onclick = renderHelpModal;

// --- PAUSE/RESUME FIX ---
if (pauseBtn) pauseBtn.onclick = togglePause;

// --- KEYBOARD CONTROLS (robust) ---
// --- USE CUSTOM BINDINGS IN EVENT LISTENER ---
document.addEventListener('keydown', e => {
  if (gameOver) return;
  if (settingsModal && !settingsModal.classList.contains('hidden')) return;
  if (helpModal && !helpModal.classList.contains('hidden')) return;
  if (e.key === bindings.left) { playerMove(-1); playSound(sounds.move); }
  else if (e.key === bindings.right) { playerMove(1); playSound(sounds.move); }
  else if (e.key === bindings.softDrop) { playerDrop(); playSound(sounds.move); }
  else if (e.key === bindings.rotate) { playerRotate(1); playSound(sounds.rotate); }
  else if (e.key === bindings.hardDrop) { e.preventDefault(); playerHardDrop(); }
  else if (e.key === bindings.hold) { holdCurrentPiece(); playSound(sounds.hold); }
  else if (e.key === bindings.pause) togglePause();
});

startBtn.addEventListener('click', startGame);
if (rotateBtn) rotateBtn.onclick = () => {
  if (!gameOver && !paused && player && player.matrix) {
    console.log('Rotate button clicked');
    playerRotate(1); playSound(sounds.rotate);
    draw();
  }
};

// --- TOUCH CONTROLS ---
function addTouchControls() {
  const btns = [
    { id: 'btn-left', action: () => { if (!gameOver && !paused) { playerMove(-1); playSound(sounds.move); } } },
    { id: 'btn-right', action: () => { if (!gameOver && !paused) { playerMove(1); playSound(sounds.move); } } },
    { id: 'btn-down', action: () => { if (!gameOver && !paused) { playerDrop(); playSound(sounds.move); } } },
    { id: 'btn-hard', action: () => { if (!gameOver && !paused) { playerHardDrop(); } } },
    { id: 'btn-rotate', action: () => { if (!gameOver && !paused) { playerRotate(1); playSound(sounds.rotate); } } },
    { id: 'btn-hold', action: () => { if (!gameOver && !paused) { holdCurrentPiece(); playSound(sounds.hold); } } },
    { id: 'btn-pause', action: () => { if (!gameOver) { togglePause(); } } },
  ];
  btns.forEach(({id, action}) => {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.addEventListener('touchstart', e => { e.preventDefault(); btn.classList.add('active'); action(); });
    btn.addEventListener('touchend', e => { btn.classList.remove('active'); });
    btn.addEventListener('mousedown', e => { e.preventDefault(); btn.classList.add('active'); action(); });
    btn.addEventListener('mouseup', e => { btn.classList.remove('active'); });
    btn.addEventListener('mouseleave', e => { btn.classList.remove('active'); });
  });
}
addTouchControls();

// Initial state
arena = createMatrix(COLS, ROWS);
player = {pos: {x:0, y:0}, matrix: null, score: 0};
draw();
updateScore();