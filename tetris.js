/* =========================
   TETRIS — Single-file JS
   ========================= */

/* --- Canvas / DOM elements --- */
const canvas = document.getElementById('tetris');
const context = canvas.getContext('2d');
context.scale(20, 20);                    // draw in grid units

const nextCanvas = document.getElementById('next-piece');
const nextCtx    = nextCanvas.getContext('2d');

const holdCanvas = document.getElementById('hold-piece');
const holdCtx    = holdCanvas.getContext('2d');

const scoreElem     = document.getElementById('score');
const highScoreElem = document.getElementById('high-score');
const startBtn      = document.getElementById('start-btn');
const pauseBtn      = document.getElementById('pause-btn');
const rotateBtn     = document.getElementById('rotate-btn');
const settingsBtn   = document.getElementById('settings-btn');
const helpBtn       = document.getElementById('help-btn');
const leaderboardBtn= document.getElementById('leaderboard-btn');

const settingsModal   = document.getElementById('settings-modal');
const helpModal       = document.getElementById('help-modal');
const leaderboardModal= document.getElementById('leaderboard-modal');

const gameOverElem = document.getElementById('game-over');

/* --- Pause overlay (fixed: single variable) --- */
let pauseOverlay = document.getElementById('pause-overlay');
if (!pauseOverlay) {
  pauseOverlay = document.createElement('div');
  pauseOverlay.id = 'pause-overlay';
  Object.assign(pauseOverlay.style, {
    position: 'fixed', inset: '0', display: 'none',
    background: 'rgba(0,0,0,0.65)', color: '#00ffe7',
    fontFamily: "'Press Start 2P', cursive", fontSize: '2.2rem',
    alignItems: 'center', justifyContent: 'center', zIndex: '1000'
  });
  pauseOverlay.textContent = 'PAUSED';
  document.body.appendChild(pauseOverlay);
}

/* --- Game constants --- */
const COLS = 12, ROWS = 20;
const LOCK_DELAY_MS = 500;

/* Scoring/levels */
const LINE_SCORES = [0, 100, 300, 500, 800];      // x level
const LEVEL_SPEED_MS = [1000, 820, 680, 560, 460, 380, 310, 260, 220, 190, 160, 140, 120, 100, 85, 75];
const SOFT_DROP_POINT = 1;                         // per cell
const HARD_DROP_POINT = 2;

/* Shapes (index 1..7) */
const SHAPES = [
  [],
  [[1,1,1,1]],                // I
  [[2,0,0],[2,2,2]],          // J
  [[0,0,3],[3,3,3]],          // L
  [[4,4],[4,4]],              // O
  [[0,5,5],[5,5,0]],          // S
  [[0,6,0],[6,6,6]],          // T
  [[7,7,0],[0,7,7]],          // Z
];

const COLORS = [
  null,
  '#00f0f0', // I
  '#0000f0', // J
  '#f0a000', // L
  '#f0f000', // O
  '#00f000', // S
  '#a000f0', // T
  '#f00000', // Z
];

/* --- State --- */
let arena       = createMatrix(COLS, ROWS);
let player      = { pos:{x:0,y:0}, matrix:null, score:0, type:null };
let nextQueue   = [];                 // next pieces (from bag)
let holdPiece   = null;
let canHold     = true;

let dropCounter = 0;
let dropInterval= 1000;
let lastTime    = 0;
let lockStartAt = null;

let linesClearedTotal = 0;
let level = 1;

let paused  = false;
let gameOver= false;
let animationId = null;

let highScore = parseInt(localStorage.getItem('tetrisHighScore') || '0', 10);

/* --- 7-bag generator --- */
const TYPES = ['I','J','L','O','S','T','Z']; // maps to SHAPES index 1..7
function* bagGenerator(){
  while(true){
    const b = TYPES.slice();
    for (let i=b.length-1;i>0;i--){
      const j = (Math.random()*(i+1))|0;
      [b[i],b[j]]=[b[j],b[i]];
    }
    for (const t of b) yield t;
  }
}
const BAG = bagGenerator();

function takeFromBag(){
  if (nextQueue.length < 5) {
    while (nextQueue.length < 5) nextQueue.push(BAG.next().value);
  }
  return nextQueue.shift();
}

/* --- Matrix helpers --- */
function createMatrix(w,h){ const m=[]; while(h--) m.push(new Array(w).fill(0)); return m; }

function merge(arena, p){
  p.matrix.forEach((row,y)=>{
    row.forEach((v,x)=>{ if(v) arena[y+p.pos.y][x+p.pos.x]=v; });
  });
}

function collide(arena,p){
  const m=p.matrix, o=p.pos;
  for(let y=0;y<m.length;y++){
    for(let x=0;x<m[y].length;x++){
      if(m[y][x]!==0 && (arena[y+o.y] && arena[y+o.y][x+o.x])!==0) return true;
    }
  }
  return false;
}

/* --- Rotation (matrix rotate) --- */
function rotateMatrix(mat, dir){
  // transpose
  const t = mat[0].map((_,i)=>mat.map(r=>r[i]));
  // clockwise vs counter
  return dir>0 ? t.map(r=>r.reverse()) : t.reverse();
}

/* SRS wall-kicks (JLSTZ) and I piece */
const JLSTZ_KICKS = {
  '0>1': [[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]],
  '1>0': [[0,0],[1,0],[1,-1],[0,2],[1,2]],
  '1>2': [[0,0],[1,0],[1,-1],[0,2],[1,2]],
  '2>1': [[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]],
  '2>3': [[0,0],[1,0],[1,1],[0,-2],[1,-2]],
  '3>2': [[0,0],[-1,0],[-1,-1],[0,2],[-1,2]],
  '3>0': [[0,0],[ -1,0],[-1,-1],[0,2],[-1,2]],
  '0>3': [[0,0],[1,0],[1,1],[0,-2],[1,-2]],
};
const I_KICKS = {
  '0>1': [[0,0],[-2,0],[1,0],[-2,-1],[1,2]],
  '1>0': [[0,0],[2,0],[-1,0],[2,1],[-1,-2]],
  '1>2': [[0,0],[-1,0],[2,0],[-1,2],[2,-1]],
  '2>1': [[0,0],[1,0],[-2,0],[1,-2],[-2,1]],
  '2>3': [[0,0],[2,0],[-1,0],[2,1],[-1,-2]],
  '3>2': [[0,0],[-2,0],[1,0],[-2,-1],[1,2]],
  '3>0': [[0,0],[1,0],[-2,0],[1,-2],[-2,1]],
  '0>3': [[0,0],[-1,0],[2,0],[-1,2],[2,-1]],
};

function getTypeIndex(t){ return TYPES.indexOf(t)+1; }

function tryRotate(dir){
  const from = player.rot || 0;
  const to   = (from + (dir>0?1:-1) + 4) % 4;
  const isI  = player.type === 'I';
  const kicks = (isI ? I_KICKS : JLSTZ_KICKS)[`${from}>${to}`] || [[0,0]];
  const rotated = rotateMatrix(player.matrix, dir);

  for (const [dx,dy] of kicks){
    const ox = player.pos.x + dx, oy = player.pos.y + dy;
    const test = { pos:{x:ox,y:oy}, matrix: rotated };
    if (!collide(arena, test)){
      player.matrix = rotated;
      player.pos.x  = ox; player.pos.y = oy;
      player.rot = to;
      resetLockDelay();               // touching stack but still adjusting
      return true;
    }
  }
  return false;
}

/* --- Spawning / resetting --- */
function makePieceFromType(type){
  const idx = getTypeIndex(type);
  return SHAPES[idx].map(r=>r.slice());
}

function playerReset(){
  const type = takeFromBag();
  player.type   = type;
  player.matrix = makePieceFromType(type);
  player.pos.y  = 0;
  player.pos.x  = (COLS>>1) - Math.floor(player.matrix[0].length/2);
  player.rot    = 0;
  canHold = true;
  updatePanels();
  if (collide(arena, player)) endGame();
}

/* --- Panels (Next / Hold) --- */
function drawMiniMatrix(ctx, matrix){
  ctx.clearRect(0,0,ctx.canvas.width,ctx.canvas.height);
  if (!matrix) return;
  const rows = matrix.length, cols = matrix[0].length;
  const size = Math.min(ctx.canvas.width/cols, ctx.canvas.height/rows);
  const ox = (ctx.canvas.width  - cols*size)/2;
  const oy = (ctx.canvas.height - rows*size)/2;
  for (let y=0;y<rows;y++) for (let x=0;x<cols;x++){
    const v = matrix[y][x];
    if (!v) continue;
    ctx.fillStyle = COLORS[v];
    ctx.fillRect(ox + x*size, oy + y*size, size, size);
    ctx.lineWidth = Math.max(1, size*0.06);
    ctx.strokeStyle = '#fff';
    ctx.strokeRect(ox + x*size, oy + y*size, size, size);
  }
}

function updatePanels(){
  // Next preview = nextQueue[0]
  const nextType = nextQueue[0];
  drawMiniMatrix(nextCtx, nextType ? makePieceFromType(nextType) : null);
  drawMiniMatrix(holdCtx, holdPiece ? holdPiece.matrix : null);
}

/* --- Drawing --- */
function drawMatrix(matrix, offset){
  matrix.forEach((row,y)=>{
    row.forEach((value,x)=>{
      if (value){
        context.fillStyle = COLORS[value];
        context.fillRect(x+offset.x, y+offset.y, 1,1);
        context.lineWidth = 0.08;
        context.strokeStyle = '#fff';
        context.strokeRect(x+offset.x, y+offset.y, 1,1);
      }
    });
  });
}

function getGhost(){
  const ghost = { pos:{x:player.pos.x, y:player.pos.y}, matrix: player.matrix };
  while (!collide(arena, ghost)) ghost.pos.y++;
  ghost.pos.y--;
  return ghost;
}

function drawGhostPiece(){
  const g = getGhost();
  context.save();
  context.globalAlpha = 0.3;
  drawMatrix(g.matrix, g.pos);
  context.restore();
}

function draw(){
  // clear only logical playfield
  context.fillStyle = '#111';
  context.fillRect(0,0, COLS, ROWS);

  drawMatrix(arena, {x:0,y:0});
  drawGhostPiece();
  drawMatrix(player.matrix, player.pos);
}

/* --- Update / RAF loop (time-based) --- */
function resetLockDelay(){ lockStartAt = null; }

function stepDown(isSoft=false){
  if (isSoft) player.score += SOFT_DROP_POINT;      // per cell
  player.pos.y++;
  if (collide(arena, player)){
    player.pos.y--;
    if (lockStartAt == null) lockStartAt = performance.now();
  } else {
    resetLockDelay();
  }
}

function hardDrop(){
  let cells = 0;
  while (!collide(arena, player)){ player.pos.y++; cells++; }
  player.pos.y--; cells--;
  player.score += Math.max(0, cells) * HARD_DROP_POINT;
  lockNow();
}

function lockNow(){
  merge(arena, player);
  clearLines();
  playerReset();
  dropCounter = 0;
  resetLockDelay();
}

function update(time = 0){
  if (paused || gameOver) return;
  const dt = time - lastTime;
  lastTime = time;
  dropCounter += dt;

  // gravity step
  if (dropCounter >= dropInterval){
    player.pos.y++;
    if (collide(arena, player)){
      player.pos.y--;
      if (lockStartAt == null) lockStartAt = time;
      if (time - lockStartAt >= LOCK_DELAY_MS){
        lockNow();
      }
    } else {
      dropCounter = 0;
    }
  }

  draw();
  animationId = requestAnimationFrame(update);
}

/* --- Lines / scoring / level --- */
function clearLines(){
  let lines = 0;
  outer: for (let y=arena.length-1; y>=0; y--){
    for (let x=0;x<arena[y].length;x++){
      if (arena[y][x]===0) continue outer;
    }
    // full line
    const row = arena.splice(y,1)[0].fill(0);
    arena.unshift(row);
    y++; lines++;
  }
  if (lines>0){
    player.score += LINE_SCORES[lines] * level;
    linesClearedTotal += lines;
    level = Math.floor(linesClearedTotal / 10) + 1;
    dropInterval = LEVEL_SPEED_MS[Math.min(level-1, LEVEL_SPEED_MS.length-1)];
    updateScore();
  }
}

function updateScore(){
  scoreElem.textContent = player.score;
  if (player.score > highScore){
    highScore = player.score;
    localStorage.setItem('tetrisHighScore', highScore);
  }
  highScoreElem.textContent = highScore;
}

/* --- Hold --- */
function holdCurrentPiece(){
  if (!canHold) return;
  if (!holdPiece){
    holdPiece = { matrix: player.matrix.map(r=>r.slice()) };
    playerReset();
  } else {
    const tmp = holdPiece.matrix;
    holdPiece.matrix = player.matrix.map(r=>r.slice());
    player.matrix = tmp.map(r=>r.slice());
    player.pos.y = 0;
    player.pos.x = (COLS>>1) - Math.floor(player.matrix[0].length/2);
    player.rot = 0;
  }
  canHold = false;
  updatePanels();
}

/* --- Controls --- */
const DEFAULT_BINDINGS = {
  left: 'ArrowLeft',
  right: 'ArrowRight',
  softDrop: 'ArrowDown',
  hardDrop: ' ',
  rotate: 'ArrowUp',
  hold: 'c',
  pause: 'p',
};
function getBindings(){
  try{ return JSON.parse(localStorage.getItem('tetrisBindings')) || {...DEFAULT_BINDINGS}; }
  catch { return {...DEFAULT_BINDINGS}; }
}
function saveBindings(b){ localStorage.setItem('tetrisBindings', JSON.stringify(b)); }
function resetBindings(){ saveBindings(DEFAULT_BINDINGS); }

let bindings = getBindings();

document.addEventListener('keydown', e => {
  // prevent page scroll for used keys
  const used = Object.values(bindings);
  if (used.includes(e.key)) e.preventDefault();
  if (gameOver || paused && e.key !== bindings.pause) return;

  if (e.key === bindings.left)  { player.pos.x--; if (collide(arena, player)) player.pos.x++; else resetLockDelay(); }
  else if (e.key === bindings.right) { player.pos.x++; if (collide(arena, player)) player.pos.x--; else resetLockDelay(); }
  else if (e.key === bindings.softDrop){ stepDown(true); }
  else if (e.key === bindings.rotate){ tryRotate(1); }
  else if (e.key === bindings.hardDrop){ hardDrop(); }
  else if (e.key === bindings.hold){ holdCurrentPiece(); }
  else if (e.key === bindings.pause){ togglePause(); }
});

if (rotateBtn) rotateBtn.onclick = ()=> tryRotate(1);

/* Touch buttons (from your HTML) */
function bindBtn(id, fn){
  const el = document.getElementById(id);
  if (!el) return;
  const tap = ev => { ev.preventDefault(); fn(); el.classList.add('active'); setTimeout(()=>el.classList.remove('active'),120); };
  el.addEventListener('click', tap);
  el.addEventListener('touchstart', tap, {passive:false});
}
bindBtn('btn-left',  ()=> { player.pos.x--; if (collide(arena, player)) player.pos.x++; else resetLockDelay(); });
bindBtn('btn-right', ()=> { player.pos.x++; if (collide(arena, player)) player.pos.x--; else resetLockDelay(); });
bindBtn('btn-down',  ()=> stepDown(true));
bindBtn('btn-hard',  ()=> hardDrop());
bindBtn('btn-rotate',()=> tryRotate(1));
bindBtn('btn-hold',  ()=> holdCurrentPiece());
bindBtn('btn-pause', ()=> togglePause());

/* --- Start / Pause / End --- */
function startGame(){
  cancelAnimationFrame(animationId);
  arena = createMatrix(COLS, ROWS);
  player.score = 0;
  linesClearedTotal = 0;
  level = 1;
  dropInterval = LEVEL_SPEED_MS[0];
  nextQueue.length = 0;   // refill from bag
  holdPiece = null;
  canHold = true;
  gameOver = false;
  gameOverElem.style.display = 'none';
  updatePanels();
  updateScore();
  playerReset();
  lastTime = performance.now();
  dropCounter = 0;
  resetLockDelay();
  paused = false;
  pauseOverlay.style.display = 'none';
  animationId = requestAnimationFrame(update);
}
function togglePause(){
  if (gameOver) return;
  paused = !paused;
  if (paused){
    cancelAnimationFrame(animationId);
    pauseOverlay.style.display = 'flex';
  } else {
    pauseOverlay.style.display = 'none';
    lastTime = performance.now();
    animationId = requestAnimationFrame(update);
  }
}
function endGame(){
  gameOver = true;
  cancelAnimationFrame(animationId);
  gameOverElem.style.display = 'block';
  saveLeaderboardScore();
}

/* --- Leaderboard (localStorage) --- */
const LB_KEY = 'tetris.leaderboard.v1';
function loadLB(){ try { return JSON.parse(localStorage.getItem(LB_KEY)) || []; } catch { return []; } }
function saveLB(list){ localStorage.setItem(LB_KEY, JSON.stringify(list)); }
function addLBEntry(entry){
  const list = loadLB();
  list.push(entry);
  list.sort((a,b)=>b.score-a.score);
  saveLB(list.slice(0,10));
}
function saveLeaderboardScore(){
  const name = prompt('New High Score! Enter your name:', 'Player');
  addLBEntry({ name: name || 'Player', score: player.score, level, date: new Date().toISOString().slice(0,10) });
}
function showLeaderboard(){
  const rows = loadLB().map((r,i)=>`<tr><td>${i+1}</td><td>${r.name}</td><td>${r.score}</td><td>${r.level}</td><td>${r.date}</td></tr>`).join('');
  leaderboardModal.innerHTML = `
    <div class="modal-content">
      <h2>Leaderboard</h2>
      <table><thead><tr><th>Rank</th><th>Name</th><th>Score</th><th>Level</th><th>Date</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="5">No scores yet</td></tr>'}</tbody></table>
      <button class="modal-close" id="lb-close">Close</button>
    </div>`;
  leaderboardModal.classList.remove('hidden');
  leaderboardModal.onclick = e => { if (e.target === leaderboardModal) leaderboardModal.classList.add('hidden'); };
  document.getElementById('lb-close').onclick = ()=> leaderboardModal.classList.add('hidden');
}

/* --- Settings (theme + key rebind) --- */
function setTheme(theme){
  document.body.className = document.body.className
    .split(' ')
    .filter(c=>!c.startsWith('theme-'))
    .join(' ')
    .trim();
  document.body.classList.add('theme-'+theme);
  localStorage.setItem('tetrisTheme', theme);
}
function getTheme(){ return localStorage.getItem('tetrisTheme') || 'retro'; }
setTheme(getTheme());

function renderSettings(){
  const theme = getTheme();
  const radio = n => `<label style="margin:0 8px;"><input type="radio" name="th" value="${n}" ${theme===n?'checked':''}/> ${n[0].toUpperCase()+n.slice(1)}</label>`;
  const ctrl = (label, key, id) => `
    <tr><td style="text-align:right;padding-right:8px;">${label}</td>
    <td><button class="rebind-btn" data-act="${id}">${bindings[id].replace(' ','Space')}</button></td></tr>`;
  settingsModal.innerHTML = `
    <div class="modal-content">
      <h2>Settings</h2>
      <div style="margin-bottom:10px;">
        Theme: ${['light','dark','neon','pastel','retro','vaporwave','mono'].map(radio).join(' ')}
      </div>
      <div style="margin-top:8px;margin-bottom:6px;">Controls:</div>
      <table style="margin:0 auto;font-size:0.8em;">
        ${ctrl('Move Left','left','left')}
        ${ctrl('Move Right','right','right')}
        ${ctrl('Soft Drop','softDrop','softDrop')}
        ${ctrl('Hard Drop','hardDrop','hardDrop')}
        ${ctrl('Rotate','rotate','rotate')}
        ${ctrl('Hold','hold','hold')}
        ${ctrl('Pause','pause','pause')}
      </table>
      <div style="margin-top:12px;">
        <button class="modal-close" id="reset-keys">Reset to Default</button>
        <button class="modal-close" id="close-settings">Close</button>
      </div>
    </div>`;
  settingsModal.classList.remove('hidden');

  // theme change
  settingsModal.querySelectorAll('input[name="th"]').forEach(r => {
    r.onchange = e => setTheme(e.target.value);
  });
  // rebinding
  settingsModal.querySelectorAll('.rebind-btn').forEach(btn=>{
    btn.onclick = ()=>{
      btn.textContent = 'Press key...';
      const action = btn.dataset.act;
      const onKey = ev => {
        ev.preventDefault();
        let k = ev.key;
        bindings[action] = k;
        saveBindings(bindings);
        document.removeEventListener('keydown', onKey, true);
        renderSettings();
      };
      document.addEventListener('keydown', onKey, true);
    };
  });
  document.getElementById('reset-keys').onclick = ()=>{
    resetBindings(); bindings = getBindings(); renderSettings();
  };
  const close = ()=> settingsModal.classList.add('hidden');
  document.getElementById('close-settings').onclick = close;
  settingsModal.onclick = e => { if (e.target === settingsModal) close(); };
}

function renderHelp(){
  helpModal.innerHTML = `
    <div class="modal-content">
      <h2>How to Play</h2>
      <ul style="text-align:left;font-size:0.8em;">
        <li>Arrow keys: move, rotate (↑), soft drop (↓)</li>
        <li>Space: hard drop</li>
        <li>C: hold piece</li>
        <li>P: pause / resume</li>
      </ul>
      <button class="modal-close" id="close-help">Close</button>
    </div>`;
  helpModal.classList.remove('hidden');
  const close = ()=> helpModal.classList.add('hidden');
  document.getElementById('close-help').onclick = close;
  helpModal.onclick = e => { if (e.target === helpModal) close(); };
}

/* --- Buttons --- */
if (startBtn)      startBtn.onclick = startGame;
if (pauseBtn)      pauseBtn.onclick = togglePause;
if (settingsBtn)   settingsBtn.onclick = renderSettings;
if (helpBtn)       helpBtn.onclick = renderHelp;
if (leaderboardBtn)leaderboardBtn.onclick = showLeaderboard;

/* --- Init --- */
updatePanels();
updateScore();
draw();

/* =========================
   END OF FILE
   ========================= */
