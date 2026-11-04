const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const state = {
  character: "Peter Parker", characterStyle: "red", player: "", score: 0,
  level: 1, time: 30, running: false, targetTimer: null, clockTimer: null,
  port: null, reader: null, writer: null, serialBuffer: "", shots: 0, hits: 0,
  aimX: 0.5, aimY: 0.5, combo: 0, maxCombo: 0, totalElapsed: 0, comboTimer: null,
  levelStartedAt: 0
};

const levelSettings = {
  1: { interval: 1050, targetLife: 2400, targetCount: 1, chapter: "CAPÍTULO 01 · PATRULHA NOTURNA", mission: "CAPTURE OS INIMIGOS!" },
  2: { interval: 780, targetLife: 1800, targetCount: 2, chapter: "CAPÍTULO 02 · INVASÃO DIGITAL", mission: "RECUPERE OS DADOS!" },
  3: { interval: 560, targetLife: 1450, targetCount: 2, chapter: "CAPÍTULO 03 · A BATALHA FINAL", mission: "PROTEJA A CIDADE!" }
};

const RANKING_KEY = "gameranhaRanking";

function getRanking() {
  try { return JSON.parse(localStorage.getItem(RANKING_KEY) || "[]"); }
  catch { return []; }
}

$$('.tab').forEach(btn => btn.addEventListener('click', () => showView(btn.dataset.view)));
function showView(id) {
  $$('.tab').forEach(b => b.classList.toggle('active', b.dataset.view === id));
  $$('.view').forEach(v => v.classList.toggle('active-view', v.id === id));
  if (id === 'rankingView') renderRanking();
}

$$('.character-card').forEach(card => card.addEventListener('click', () => {
  $$('.character-card').forEach(c => c.classList.remove('selected'));
  card.classList.add('selected');
  state.character = card.dataset.character;
  state.characterStyle = card.dataset.color;
}));

$('#startBtn').addEventListener('click', startGame);
$('#shootBtn').addEventListener('click', () => shootAtAim());
$('#connectBtn').addEventListener('click', connectSerial);
$('#clearRankingBtn').addEventListener('click', () => {
  if (confirm('Tem certeza que deseja apagar o ranking salvo neste navegador?')) {
    localStorage.removeItem(RANKING_KEY);
    renderRanking();
    toast('Ranking local apagado.');
  }
});

document.addEventListener('keydown', event => {
  if (event.code === 'Space' && state.running) {
    event.preventDefault();
    shootAtAim();
  }
  const typing = event.target && (event.target.matches('input, textarea, select') || event.target.isContentEditable);
  if (!typing && event.key.toLowerCase() === 'c' && state.writer) {
    event.preventDefault();
    sendSerialCommand('CENTER\n');
    toast('Centro da mira recalibrado.');
  }
});

async function sendSerialCommand(command) {
  if (!state.writer) {
    toast('Conecte o controle antes de recalibrar.');
    return;
  }
  try { await state.writer.write(new TextEncoder().encode(command)); }
  catch (error) { console.error(error); toast('Falha ao enviar comando. Reconecte o controle.'); }
}

$('#arena').addEventListener('pointermove', event => {
  const rect = $('#arena').getBoundingClientRect();
  const mouseX = event.clientX - rect.left;
  const mouseY = event.clientY - rect.top;
  state.aimX = Math.max(0, Math.min(1, mouseX / rect.width));
  state.aimY = Math.max(0, Math.min(1, mouseY / rect.height));
  $('#crosshair').style.left = `${mouseX}px`;
  $('#crosshair').style.top = `${mouseY}px`;
  $('#crosshair').style.opacity = 1;

  const overTarget = $$('.target').some(target => {
    const r = target.getBoundingClientRect();
    return event.clientX >= r.left && event.clientX <= r.right && event.clientY >= r.top && event.clientY <= r.bottom;
  });
  $('#crosshair').classList.toggle('locked', overTarget);
});
$('#arena').addEventListener('pointerleave', () => {
  $('#crosshair').style.opacity = 0;
  $('#crosshair').classList.remove('locked');
});

function startGame() {
  const name = $('#playerName').value.trim().replace(/[<>]/g, '').slice(0, 16);
  if (!name) { toast('Digite seu codinome antes de começar.'); $('#playerName').focus(); return; }
  state.player = name;
  state.score = 0; state.level = 1; state.time = 30; state.shots = 0; state.hits = 0;
  state.combo = 0; state.maxCombo = 0; state.totalElapsed = 0;
  state.running = true;
  $('#setupPanel').classList.add('hidden');
  $('#playPanel').classList.remove('hidden');
  $('#hudHero').textContent = state.character.toUpperCase();
  $('#heroAvatar').className = `hero-avatar ${state.characterStyle}`;
  const selectedCard = $('.character-card.selected');
  const selectedImage = selectedCard ? selectedCard.dataset.image : 'assets/spider-man-peter.png';
  const avatarImage = $('#heroAvatar img');
  avatarImage.src = selectedImage;
  avatarImage.alt = `Personagem escolhido: ${state.character}`;
  $('#arenaMessage').classList.add('hidden-message');
  $('#scoreValue').textContent = '0000';
  updateComboUI();
  updateLevelUI();
  clearInterval(state.targetTimer); clearInterval(state.clockTimer); clearTimeout(state.comboTimer);
  clearTargets();
  resetTimerUI();
  showPhaseIntro(1, true);
  flashArena('start');
  setTimeout(() => {
    if (!state.running) return;
    hidePhaseIntro();
    spawnTargets();
    state.targetTimer = setInterval(spawnTargets, levelSettings[state.level].interval);
    state.clockTimer = setInterval(tick, 1000);
  }, 900);
}

function tick() {
  if (!state.running) return;
  state.time--;
  state.totalElapsed++;
  updateTimerUI();
  if (state.time <= 0) endLevel();
}

function updateTimerUI() {
  const timer = $('#timeValue');
  timer.textContent = `${Math.max(0, state.time)}s`;
  const card = timer.closest('.timer-card');
  card.classList.toggle('warning', state.time <= 10 && state.time > 5);
  card.classList.toggle('critical', state.time <= 5);
  if (state.time <= 10 && state.time > 0) {
    timer.animate([{transform:'scale(1)'},{transform:'scale(1.12)'},{transform:'scale(1)'}], {duration:420,easing:'ease-out'});
  }
}

function resetTimerUI() {
  $('#timeValue').textContent = '30s';
  $('#timeValue').closest('.timer-card').classList.remove('warning','critical');
}

function updateLevelUI() {
  $('#levelValue').innerHTML = `0${state.level} <small>/ 03</small>`;
  $('#chapterLabel').textContent = levelSettings[state.level].chapter;
  $('#missionText').textContent = levelSettings[state.level].mission;
}

function showPhaseIntro(level, first = false) {
  const overlay = $('#phaseOverlay');
  const data = levelSettings[level];
  overlay.innerHTML = `<img class="overlay-logo" src="assets/gameranha-logo.png" alt="GAMERANHA"><span>FASE 0${level} / 03</span><strong>${data.chapter.split(' · ')[1]}</strong><small>${data.mission}</small>${first ? '<em>PREPARE-SE</em>' : ''}`;
  overlay.classList.remove('hidden-message');
  overlay.classList.add('phase-enter');
  setTimeout(() => overlay.classList.remove('phase-enter'), 650);
}
function hidePhaseIntro() { $('#phaseOverlay').classList.add('hidden-message'); }

function endLevel() {
  clearInterval(state.targetTimer); clearTargets();
  if (state.level < 3) {
    const completed = state.level;
    state.level++;
    state.time = 30;
    state.combo = 0;
    updateComboUI();
    updateLevelUI();
    resetTimerUI();
    showPhaseTransition(completed, state.level);
    setTimeout(() => {
      if (!state.running) return;
      hidePhaseIntro();
      state.targetTimer = setInterval(spawnTargets, levelSettings[state.level].interval);
      spawnTargets();
    }, 1150);
  } else {
    finishGame();
  }
}

function showPhaseTransition(completedLevel, nextLevel) {
  const overlay = $('#phaseOverlay');
  overlay.innerHTML = `<img class="overlay-logo compact-logo" src="assets/gameranha-logo.png" alt="GAMERANHA"><span>FASE CONCLUÍDA!</span><strong>+500</strong><small>PRÓXIMA FASE · 0${nextLevel} / 03</small>`;
  overlay.classList.remove('hidden-message');
  overlay.classList.add('phase-complete');
  state.score += 500;
  $('#scoreValue').textContent = String(state.score).padStart(4, '0');
  setTimeout(() => overlay.classList.remove('phase-complete'), 700);
}

function finishGame() {
  state.running = false;
  clearInterval(state.targetTimer); clearInterval(state.clockTimer); clearTargets(); clearTimeout(state.comboTimer);
  hidePhaseIntro();
  saveScore();
  const minutes = String(Math.floor(state.totalElapsed / 60)).padStart(2,'0');
  const seconds = String(state.totalElapsed % 60).padStart(2,'0');
  const accuracy = state.shots ? Math.round((state.hits / state.shots) * 100) : 0;
  $('#victoryOverlay').innerHTML = `
    <img class="result-logo" src="assets/gameranha-logo.png" alt="GAMERANHA">
    <span class="result-kicker">MISSÃO CONCLUÍDA!</span>
    <strong class="result-hero">${escapeHTML(state.character).toUpperCase()}</strong>
    <div class="result-stats">
      <div><small>PONTUAÇÃO</small><b>${state.score.toLocaleString('pt-BR')}</b></div>
      <div><small>ACERTOS</small><b>${state.hits} / ${state.shots}</b></div>
      <div><small>TEMPO</small><b>${minutes}:${seconds}</b></div>
      <div><small>COMBO MÁXIMO</small><b>x${state.maxCombo}</b></div>
    </div>
    <div class="result-stars">★★★★★</div>
    <p>Você protegeu a cidade!</p>
    <small class="result-accuracy">PRECISÃO ${accuracy}%</small>
    <div class="result-actions"><button id="againBtn" class="primary-btn">JOGAR NOVAMENTE</button><button id="resultRankingBtn" class="secondary-btn">VER RANKING</button></div>`;
  $('#victoryOverlay').classList.remove('hidden-message');
  $('#victoryOverlay').classList.add('result-show');
  $('#againBtn').addEventListener('click', resetGame);
  $('#resultRankingBtn').addEventListener('click', () => { resetGame(); showView('rankingView'); });
  toast('Resultado salvo no Hall dos Heróis!');
}

function showDefeat() {
  state.running = false;
  clearInterval(state.targetTimer); clearInterval(state.clockTimer); clearTargets();
  $('#defeatOverlay').innerHTML = `<img class="result-logo" src="assets/gameranha-logo.png" alt="GAMERANHA"><span class="result-kicker">MISSÃO FALHOU</span><strong class="result-hero">A CIDADE AINDA PRECISA DE VOCÊ.</strong><p>Respire, recalibre a mira e tente novamente.</p><div class="result-actions"><button id="retryBtn" class="primary-btn">TENTAR NOVAMENTE</button></div>`;
  $('#defeatOverlay').classList.remove('hidden-message');
  $('#defeatOverlay').classList.add('result-show');
  $('#retryBtn').addEventListener('click', resetGame);
}

function resetGame() {
  clearInterval(state.targetTimer); clearInterval(state.clockTimer); clearTimeout(state.comboTimer); clearTargets();
  $('#playPanel').classList.add('hidden');
  $('#setupPanel').classList.remove('hidden');
  $('#arenaMessage').classList.remove('hidden-message');
  $('#arenaMessage').textContent = 'PREPARE-SE...';
  $('#phaseOverlay').classList.add('hidden-message');
  $('#victoryOverlay').classList.add('hidden-message');
  $('#defeatOverlay').classList.add('hidden-message');
  state.running = false;
}

function spawnTargets() {
  if (!state.running) return;
  const settings = levelSettings[state.level];
  const current = $$('.target').length;
  for (let i = current; i < settings.targetCount; i++) createTarget(settings);
}

function createTarget(settings) {
  const arena = $('#arena');
  const target = document.createElement('button');
  const gold = Math.random() < 0.2;
  target.className = `target${gold ? ' gold' : ''}`;
  target.type = 'button';
  target.setAttribute('aria-label', gold ? 'Inimigo especial, vale 50 pontos' : 'Bandido, vale 10 pontos');
  target.innerHTML = '<span class="villain-shadow"><i class="villain-hood"></i><i class="villain-face"></i><i class="villain-body"></i><i class="villain-arm left"></i><i class="villain-arm right"></i></span><span class="wanted-tag">PROCURADO</span>';
  const maxX = Math.max(70, arena.clientWidth - 75);
  const maxY = Math.max(150, arena.clientHeight - 120);
  target.style.left = `${45 + Math.random() * (maxX - 45)}px`;
  target.style.top = `${95 + Math.random() * (maxY - 95)}px`;
  target.classList.add('target-enter');
  target.addEventListener('pointerenter', () => $('#crosshair').classList.add('locked'));
  target.addEventListener('pointerleave', () => $('#crosshair').classList.remove('locked'));
  target.addEventListener('click', event => {
    event.stopPropagation();
    if (!state.running) return;
    state.hits++;
    const points = gold ? 50 : 10;
    registerHit(points, target, gold);
    target.classList.add('popped');
    setTimeout(() => target.remove(), 180);
  });
  $('#targetLayer').appendChild(target);
  target._expiry = setTimeout(() => {
    if (target.isConnected) {
      target.classList.add('target-expired');
      resetCombo('ALVO ESCAPOU');
      setTimeout(() => target.remove(), 140);
    }
  }, settings.targetLife);
}

function registerHit(points, target, gold) {
  state.combo++;
  state.maxCombo = Math.max(state.maxCombo, state.combo);
  state.score += points;
  $('#scoreValue').textContent = String(state.score).padStart(4, '0');
  const scoreEl = $('#scoreValue');
  scoreEl.animate([{transform:'scale(1)',textShadow:'0 0 0 transparent'},{transform:'scale(1.16)',textShadow:'0 0 16px rgba(53,231,255,.8)'},{transform:'scale(1)',textShadow:'0 0 0 transparent'}], {duration:320,easing:'ease-out'});
  updateComboUI();
  drawWeb(target);
  spawnParticles(target);
  flashArena(gold ? 'gold-hit' : 'hit');
  showHitFeedback(points, state.combo, target, gold);
  clearTimeout(state.comboTimer);
  state.comboTimer = setTimeout(() => resetCombo(), 1500);
}

function resetCombo(message = '') {
  if (state.combo > 0 && message) showCenterFeedback(message, 'miss');
  state.combo = 0;
  updateComboUI();
}

function updateComboUI() {
  const el = $('#comboValue');
  el.textContent = `x${state.combo}`;
  const card = el.closest('.combo-card');
  card.classList.toggle('combo-hot', state.combo >= 3);
  card.classList.toggle('combo-epic', state.combo >= 5);
  if (state.combo >= 2) {
    el.animate([{transform:'scale(1)'},{transform:'scale(1.18)'},{transform:'scale(1)'}], {duration:260,easing:'ease-out'});
    showCenterFeedback(`COMBO x${state.combo}`, state.combo >= 5 ? 'combo-epic' : 'combo');
  }
}

function showHitFeedback(points, combo, target, gold) {
  const arena = $('#arena').getBoundingClientRect();
  const rect = target.getBoundingClientRect();
  const x = rect.left - arena.left + rect.width / 2;
  const y = rect.top - arena.top + rect.height / 2;
  const item = document.createElement('div');
  item.className = `score-pop ${gold ? 'gold-pop' : ''}`;
  item.style.left = `${x}px`; item.style.top = `${y}px`;
  item.innerHTML = `<strong>+${points}</strong><small>COMBO x${combo}</small>`;
  $('#feedbackLayer').appendChild(item);
  item.animate([{opacity:0,transform:'translate(-50%,0) scale(.7)'},{opacity:1,transform:'translate(-50%,-12px) scale(1)'},{opacity:0,transform:'translate(-50%,-55px) scale(1.08)'}], {duration:720,easing:'ease-out'}).finished.finally(() => item.remove());
}

function showCenterFeedback(text, type = 'hit') {
  const item = document.createElement('div');
  item.className = `center-feedback ${type}`;
  item.textContent = text;
  $('#feedbackLayer').appendChild(item);
  item.animate([{opacity:0,transform:'translate(-50%,-50%) scale(.8)'},{opacity:1,transform:'translate(-50%,-50%) scale(1)'},{opacity:0,transform:'translate(-50%,-75%) scale(1.05)'}], {duration:600,easing:'ease-out'}).finished.finally(() => item.remove());
}

function spawnParticles(target) {
  const arena = $('#arena').getBoundingClientRect();
  const rect = target.getBoundingClientRect();
  const x = rect.left - arena.left + rect.width / 2;
  const y = rect.top - arena.top + rect.height / 2;
  for (let i = 0; i < 10; i++) {
    const p = document.createElement('i');
    p.className = 'hit-particle';
    p.style.left = `${x}px`; p.style.top = `${y}px`;
    p.style.setProperty('--dx', `${(Math.random() - .5) * 90}px`);
    p.style.setProperty('--dy', `${(Math.random() - .5) * 90}px`);
    $('#feedbackLayer').appendChild(p);
    p.animate([{opacity:1,transform:'translate(-50%,-50%) scale(1)'},{opacity:0,transform:`translate(calc(-50% + var(--dx)),calc(-50% + var(--dy))) scale(.2)`}], {duration:500,easing:'ease-out'}).finished.finally(() => p.remove());
  }
}

function addPoints(points) { // compatibilidade com chamadas antigas
  state.score += points;
  $('#scoreValue').textContent = String(state.score).padStart(4, '0');
}

function updateAim(normalizedX, normalizedY) {
  state.aimX = Math.max(0, Math.min(1, normalizedX / 1000));
  state.aimY = Math.max(0, Math.min(1, normalizedY / 1000));
  const arena = $('#arena');
  const x = state.aimX * arena.clientWidth;
  const y = state.aimY * arena.clientHeight;
  $('#crosshair').style.left = `${x}px`;
  $('#crosshair').style.top = `${y}px`;
  $('#crosshair').style.opacity = 1;
}

function shootAtAim() {
  if (!state.running) { toast('Inicie uma missão antes de disparar.'); return; }
  state.shots++;
  const arena = $('#arena');
  const rect = arena.getBoundingClientRect();
  const x = state.aimX * rect.width;
  const y = state.aimY * rect.height;
  const hit = $$('.target').find(target => {
    const r = target.getBoundingClientRect();
    const left = r.left - rect.left;
    const top = r.top - rect.top;
    return x >= left && x <= left + r.width && y >= top && y <= top + r.height;
  });
  if (hit) {
    hit.click();
  } else {
    resetCombo('ERROU');
    drawMissAt(x, y);
    drawWebAt(x, y);
    flashArena('miss');
    $('#crosshair').classList.add('missed');
    setTimeout(() => $('#crosshair').classList.remove('missed'), 220);
    showCenterFeedback('SEM ALVO', 'miss');
  }
}

function drawWeb(target) {
  const arena = $('#arena'), a = arena.getBoundingClientRect(), t = target.getBoundingClientRect();
  const svg = $('#webSvg'), group = $('#webEffect'), line = $('#webLine');
  const x1 = a.width / 2, y1 = a.height - 42;
  const x2 = t.left - a.left + t.width / 2, y2 = t.top - a.top + t.height / 2;
  svg.setAttribute('viewBox', `0 0 ${a.width} ${a.height}`); group.replaceChildren();
  line.setAttribute('x1', x1); line.setAttribute('y1', y1); line.setAttribute('x2', x2); line.setAttribute('y2', y2); line.style.opacity = '1'; line.setAttribute('stroke-width', '5');
  line.animate([{opacity:1,strokeWidth:5},{opacity:1,strokeWidth:2},{opacity:0,strokeWidth:1}], {duration:560,easing:'ease-out'});
  const length = Math.hypot(x2-x1,y2-y1) || 1, webLength = Math.min(104, Math.max(58, length * .34));
  const makeLine = (ax,ay,bx,by,cls='web-strand') => { const el=document.createElementNS('http://www.w3.org/2000/svg','line'); el.setAttribute('x1',ax);el.setAttribute('y1',ay);el.setAttribute('x2',bx);el.setAttribute('y2',by);el.setAttribute('class',cls);group.appendChild(el);return el; };
  for(let i=0;i<12;i++){const ang=Math.PI*2*i/12;makeLine(x2,y2,x2+Math.cos(ang)*webLength,y2+Math.sin(ang)*webLength,'web-strand');}
  for(let ring=1;ring<=3;ring++){const radius=webLength*ring/3;for(let i=0;i<12;i++){const a1=Math.PI*2*i/12,a2=Math.PI*2*(i+1)/12;makeLine(x2+Math.cos(a1)*radius,y2+Math.sin(a1)*radius,x2+Math.cos(a2)*radius,y2+Math.sin(a2)*radius,'web-ring');}}
  group.querySelectorAll('line').forEach((el,i)=>{el.style.opacity='0';el.animate([{opacity:0,strokeWidth:1},{opacity:1,strokeWidth:2.6,offset:.22},{opacity:1,strokeWidth:1.5,offset:.62},{opacity:0,strokeWidth:.5}],{duration:680,delay:Math.min(i*4,100),easing:'ease-out'});});
  const impact=document.createElementNS('http://www.w3.org/2000/svg','circle');impact.setAttribute('cx',x2);impact.setAttribute('cy',y2);impact.setAttribute('r',4);impact.setAttribute('class','web-impact');group.appendChild(impact);impact.animate([{r:3,opacity:1},{r:webLength*.8,opacity:.75,offset:.35},{r:webLength,opacity:0}],{duration:520,easing:'ease-out'});
  setTimeout(()=>{line.style.opacity='0';group.replaceChildren();},720);
}

function drawMissAt(x,y){
  const line=$('#webLine'),svg=$('#webSvg'),a=$('#arena').getBoundingClientRect();
  $('#webEffect').replaceChildren();svg.setAttribute('viewBox',`0 0 ${a.width} ${a.height}`);line.setAttribute('x1',a.width/2);line.setAttribute('y1',a.height-42);line.setAttribute('x2',x);line.setAttribute('y2',y);line.style.opacity='1';line.animate([{opacity:1,strokeWidth:5},{opacity:0,strokeWidth:1}],{duration:360});setTimeout(()=>line.style.opacity='0',380);
}
function drawWebAt(x,y){
  const arena=$('#arena'),rect=arena.getBoundingClientRect(),svg=$('#webSvg'),group=$('#webEffect');svg.setAttribute('viewBox',`0 0 ${rect.width} ${rect.height}`);group.replaceChildren();const radius=54;
  const addLine=(x1,y1,x2,y2,className)=>{const line=document.createElementNS('http://www.w3.org/2000/svg','line');line.setAttribute('x1',x1);line.setAttribute('y1',y1);line.setAttribute('x2',x2);line.setAttribute('y2',y2);line.setAttribute('class',className);group.appendChild(line);};
  for(let i=0;i<12;i++){const angle=Math.PI*2*i/12;addLine(x,y,x+Math.cos(angle)*radius,y+Math.sin(angle)*radius,'web-strand');}
  for(let ring=1;ring<=3;ring++){const r=radius*ring/3;for(let i=0;i<12;i++){const a1=Math.PI*2*i/12,a2=Math.PI*2*(i+1)/12;addLine(x+Math.cos(a1)*r,y+Math.sin(a1)*r,x+Math.cos(a2)*r,y+Math.sin(a2)*r,'web-ring');}}
  group.querySelectorAll('line').forEach((line,i)=>line.animate([{opacity:0,strokeWidth:1},{opacity:1,strokeWidth:2.6,offset:.25},{opacity:0,strokeWidth:.5}],{duration:650,delay:Math.min(i*4,100),easing:'ease-out'}));
  const impact=document.createElementNS('http://www.w3.org/2000/svg','circle');impact.setAttribute('cx',x);impact.setAttribute('cy',y);impact.setAttribute('r',4);impact.setAttribute('class','web-impact');group.appendChild(impact);impact.animate([{r:3,opacity:1},{r:radius,opacity:0}],{duration:520,easing:'ease-out'});setTimeout(()=>group.replaceChildren(),700);
}

function flashArena(type='hit') {
  const arena = $('#arena');
  arena.classList.remove('arena-flash-hit','arena-flash-gold','arena-flash-miss','arena-flash-start');
  void arena.offsetWidth;
  arena.classList.add(type === 'gold-hit' ? 'arena-flash-gold' : type === 'miss' ? 'arena-flash-miss' : type === 'start' ? 'arena-flash-start' : 'arena-flash-hit');
  setTimeout(() => arena.classList.remove('arena-flash-hit','arena-flash-gold','arena-flash-miss','arena-flash-start'), 420);
}

function clearTargets(){ $$('.target').forEach(t=>{if(t._expiry)clearTimeout(t._expiry);t.remove();}); }
function saveScore(){ const scores=getRanking();scores.push({name:state.player,character:state.character,score:state.score,level:3,hits:state.hits,shots:state.shots,maxCombo:state.maxCombo,date:new Date().toLocaleDateString('pt-BR')});scores.sort((a,b)=>b.score-a.score);localStorage.setItem(RANKING_KEY,JSON.stringify(scores.slice(0,20))); }
function renderRanking(){ const list=getRanking(),container=$('#rankingList');if(!list.length){container.innerHTML='<div class="empty-ranking">✦<br><br>Nenhum herói no placar ainda.<br>Jogue a primeira missão para inaugurar o ranking!</div>';return;}container.innerHTML=list.map((entry,i)=>`<div class="ranking-row ${i<3?'ranking-top':''}"><span class="rank-number ${i<3?'top':''}">${String(i+1).padStart(2,'0')}</span><div><div class="rank-player">${escapeHTML(entry.name)}</div><div class="rank-meta">${escapeHTML(entry.character)} · ${entry.score.toLocaleString('pt-BR')} pts${entry.maxCombo != null ? ` · COMBO x${entry.maxCombo}` : ''}</div></div><strong class="rank-score">${entry.score.toLocaleString('pt-BR')}</strong></div>`).join(''); }
function escapeHTML(value){return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
let toastTimeout;function toast(message){const el=$('#toast');el.textContent=message;el.classList.add('show');clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>el.classList.remove('show'),2600);}

async function connectSerial(){
  if(!('serial' in navigator)){toast('Web Serial não disponível. Use Chrome ou Edge atualizado.');return;}
  try{state.port=await navigator.serial.requestPort();await state.port.open({baudRate:115200});if(state.port.writable)state.writer=state.port.writable.getWriter();$('#connectionDot').classList.add('connected');$('#connectionText').textContent='DISPARADOR CONECTADO';$('#connectBtn').textContent='DISPARADOR CONECTADO';toast('Controle conectado! Mantenha o pulso no centro e pressione C para recalibrar a mira.');readSerial();}
  catch(error){toast('Não foi possível conectar. Confira a placa e a permissão USB.');console.error(error);}
}

async function readSerial(){
  while(state.port&&state.port.readable){state.reader=state.port.readable.getReader();try{while(true){const{value,done}=await state.reader.read();if(done)break;state.serialBuffer+=new TextDecoder().decode(value);const lines=state.serialBuffer.split(/\r?\n/);state.serialBuffer=lines.pop()||'';for(const rawLine of lines){const line=rawLine.trim().toUpperCase();if(line==='SHOOT')shootAtAim();else if(line.startsWith('AIM:')){const parts=line.slice(4).split(',');if(parts.length===2){const x=Number(parts[0]),y=Number(parts[1]);if(Number.isFinite(x)&&Number.isFinite(y))updateAim(x,y);}}}}}catch(error){console.error('Leitura serial interrompida',error);}finally{state.reader.releaseLock();}}
}

renderRanking();
