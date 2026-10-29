/* TEN NIGHTS IN A HOTEL — mobile/PC build with persistent save + Network Integration */
const SAVE_KEY = 'ten_nights_hotel_save_v7';
const LEGACY_SAVE_KEY = 'ten_nights_hotel_save_v5';
let nightTransitioning = false;
let memorySave = null;

// ==========================================
// СЕТЕВОЕ ПОДКЛЮЧЕНИЕ И SOCKET.IO
// ==========================================
const socket = io('https://ten-nights-server.onrender.com');
let myRole = null;
let currentRoom = null;

socket.on('assignedRole', (role) => {
    myRole = role;
    console.log('Назначена роль по сети:', role);
});

socket.on('updateState', (gameState) => {
    // Синхронизация общего игрового состояния от сервера
    console.log('Получено обновление состояния:', gameState);
});

function sendNetworkAction(actionData) {
    if (!currentRoom) return;
    socket.emit('playerAction', {
        room: currentRoom,
        action: actionData
    });
}
// ==========================================

function readSave(){
  try {
    const current=localStorage.getItem(SAVE_KEY);
    if(current){
      try { const parsed=JSON.parse(current); if(Number.isFinite(Number(parsed.noche_actual)) && Number(parsed.noche_actual)>=1) return current; } catch(e){}
    }
    const legacy=localStorage.getItem(LEGACY_SAVE_KEY);
    if(legacy){
      try { const parsed=JSON.parse(legacy); if(Number.isFinite(Number(parsed.noche_actual)) && Number(parsed.noche_actual)>=1) return legacy; } catch(e){}
    }
    return memorySave;
  } catch(e){ return memorySave; }
}
function writeSave(v){ try { localStorage.setItem(SAVE_KEY,v); } catch(e){ memorySave=v; } }
function removeSave(){ try { localStorage.removeItem(SAVE_KEY); localStorage.removeItem(LEGACY_SAVE_KEY); } catch(e){} memorySave=null; }
let gameRunning = false, game_over = false;
let hora_actual = 0, static_segundos = 0;
let direction = 0, is_flashlight_on = false, is_tablet_open = false, is_curtains_closed = false;
let current_camera = 1, noche_actual = 1;
let tiempo_povar = 0, rabat_stage = 0, rabat_room = 0, mimic_stage = 0, killer_stage = 0, maid_stage = 0;
let maniac_alert = false, maniac_angry = false, maniac_angry_since = 0, maniac_alert_since = 0, maniac_run = false, maniac_run_since = 0;
let cook_sound_timer = 0, cook_breath_timer = 0, rabat_sound_timer = 0, maniac_run_sound_timer = 0;
let maid_timer_running = false, maid_deadline = 0, rabat_glitch = false;
let cook_cooldown_until = 0, maid_cooldown_until = 0;
let rabat_move_timer = 0, killer_move_timer = 0, killer_deadline = 0, killer_watch_timer = 0, rabat_tablet_ticks = 0, maniac_curtain_cause = false;
let kid_stage = 0, kid_cooldown_until = 0, kid_deadline = 0, mask_on = false, mask_until = 0, mask_cd_until = 0, stolen_item = '', stolen_until = 0;
let maniac_charge = 0, maniac_charge_state = 'idle', maniac_charge_release_at = 0, maniac_charge_started_at = 0, maniac_light_out = false;
let saveClock = 0, lastTick = Date.now();
let audioStarted = false;
const sounds = {};
function initAudio(){
  if(audioStarted) return;
  audioStarted = true;
  sounds.ambient = new Audio('sounds/ambient_hotel.wav'); sounds.ambient.loop = true; sounds.ambient.volume = 0.22;
  sounds.click = new Audio('sounds/ui_click.wav'); sounds.click.volume = 0.35;
  sounds.static = new Audio('sounds/static.wav'); sounds.static.volume = 0.28;
  sounds.warning = new Audio('sounds/warning.wav'); sounds.warning.volume = 0.45;
  sounds.step = new Audio('sounds/enemy_step.wav'); sounds.step.volume = 0.38;
  sounds.cookStep = new Audio('sounds/cook_steps.wav'); sounds.cookStep.volume = 0.62;
  sounds.cookBreath = new Audio('sounds/cook_breath.wav'); sounds.cookBreath.volume = 0.58;
  sounds.rabatStep = new Audio('sounds/rabat_metal_step.wav'); sounds.rabatStep.volume = 0.58;
  sounds.maniacScream = new Audio('sounds/maniac_scream.wav'); sounds.maniacScream.volume = 0.72;
  sounds.maniacRun = new Audio('sounds/maniac_run.wav'); sounds.maniacRun.volume = 0.62;
  sounds.scare = new Audio('sounds/jumpscare.wav'); sounds.scare.volume = 0.7;
  sounds.lullaby = new Audio('sounds/lullaby.wav'); sounds.lullaby.loop = true; sounds.lullaby.volume = 0.16;
  sounds.kidLadder = new Audio('sounds/kid_ladder.wav'); sounds.kidLadder.volume = 0.7;
  sounds.maskOn = new Audio('sounds/mask_on.wav'); sounds.maskOn.volume = 0.6;
  sounds.kidScared = new Audio('sounds/kid_scared.wav'); sounds.kidScared.volume = 0.6;
  sounds.kidSteal = new Audio('sounds/kid_steal.wav'); sounds.kidSteal.volume = 0.75;
  sounds.ambient.play().catch(()=>{});
}
function playSound(name, volume=null){
  const a=sounds[name]; if(!a) return;
  try{ if(volume!==null) a.volume=volume; a.currentTime=0; a.play().catch(()=>{}); }catch(e){}
}
function play3DSound(name, volume, pan){
  const src=sounds[name]; if(!src) return;
  try{
    const a=new Audio(src.src); a.volume=Math.max(0,Math.min(1,volume));
    if(window.AudioContext||window.webkitAudioContext){
      const C=window.AudioContext||window.webkitAudioContext;
      if(!window.hotelAudioCtx) window.hotelAudioCtx=new C();
      const ctx=window.hotelAudioCtx; if(ctx.state==='suspended') ctx.resume().catch(()=>{});
      const node=ctx.createMediaElementSource(a); const p=ctx.createStereoPanner?ctx.createStereoPanner():null;
      if(p){p.pan=Math.max(-1,Math.min(1,pan)); node.connect(p); p.connect(ctx.destination);} else node.connect(ctx.destination);
    }
    const p=a.play(); if(p&&p.catch)p.catch(()=>{});
    a.addEventListener('ended',()=>{try{a.src='';}catch(e){}});
  }catch(e){ try{src.currentTime=0;src.volume=volume;src.play().catch(()=>{});}catch(_){} }
}
function stopTransientSounds(){ ['cookBreath','cookStep','rabatStep','maniacScream','maniacRun','lullaby','kidLadder'].forEach(n=>{const a=sounds[n];if(a){try{a.pause();a.currentTime=0;}catch(e){}}}); }
function stopAudio(){
  if(sounds.ambient){ try{sounds.ambient.pause(); sounds.ambient.currentTime=0;}catch(e){} }
  stopTransientSounds();
}

const timeDisplay = document.getElementById('time-display');
const accessTimerDisplay = document.getElementById('access-timer');
let gamePaused = false;
const office = document.getElementById('office');
const tabletScreen = document.getElementById('tablet-screen');
const cameraMonitor = document.getElementById('camera-monitor');
const monitorTextBox = document.getElementById('monitor-text-box');
const actionMonitorBtn = document.getElementById('action-monitor-btn');
const curtainBtn = document.getElementById('curtain-btn');
const flashlightBtn = document.getElementById('flashlight-btn');
const mainMenu = document.getElementById('main-menu');

const GAME_IMAGES = [
 'office_front_empty.jpg','office_front_rabat.jpg','office_back.jpg','office_curtains.jpg',
 'cam1_hall.jpg','cam1_rabat.jpg','cam1_maniac.jpg','cam2_empty.jpg','cam2_mimic_grate.jpg','cam3_stairs.jpg','cam3_killer.jpg','cam4_room5005.jpg','cam4_cook.jpg','cam4_cook_gone.jpg',
 'cam5_elevator.jpg','cam5_rabat.jpg','cam6_lobby.jpg','cam6_rabat.jpg','cam7_laundry.jpg','cam7_maid.jpg','cam7_maid_window.jpg','cam8_kitchen.jpg','cam8_maniac.jpg','cam8_maniac_alert.jpg',
 'cam9_cradle_sleep.jpg','cam9_cradle_empty.jpg','cam10_hatch.jpg','cam10_kid.jpg','jumpscare_cook.jpg','jumpscare_rabat.jpg','jumpscare_mimic.jpg','jumpscare_killer.jpg','jumpscare_maid.jpg','jumpscare_maniac.jpg','menu_bg.png'
];
GAME_IMAGES.forEach(src => { const img = new Image(); img.src = src; });

function secondsPerHour(){ return 20 + ((noche_actual - 1) * 10); }
function getDifficultyMultiplier(){ return (1 + Math.max(0, noche_actual - 1) * 0.22) * 0.98; }
function getDifficulty(){ return getDifficultyMultiplier(); }

function kidArrivalDelay(){ return noche_actual<=4 ? 8000 : (noche_actual<=8 ? 6000 : 3500); }
function resetKid(){ kid_stage=0; kid_deadline=0; kid_cooldown_until=Date.now()+scaledTimer(18000,8000); mask_on=false; mask_until=0; mask_cd_until=0; stolen_item=''; stolen_until=0; refreshKidUI(); }
function easeFactor(){ return noche_actual===1 ? 0.72 : noche_actual===2 ? 0.84 : noche_actual===3 ? 0.94 : Math.min(1.15, 1 + (noche_actual-4)*0.025); }
function rabatTabletGrace(){ return Math.max(1,6-noche_actual); }
function maniacAttackDelay(){ return Math.max(8, 15-(noche_actual-1)*0.55); }

function maniacDrainDurationMs(){ return Math.max(30, 40 - (noche_actual - 1) * 1.11) * 1000; }
function resetManiacBox(){ maniac_charge=1; maniac_charge_state='draining'; maniac_charge_release_at=Date.now(); maniac_charge_started_at=0; maniac_light_out=false; }
function killerAttackWindowMs(){
  const n=Math.max(1,noche_actual);
  const seconds=n<=4 ? 13-(n-1)*0.5 : Math.max(8,11-(n-5)*0.35);
  return seconds*1000;
}
function getBaseChance(){ return Math.min(0.45, 0.012 * getDifficultyMultiplier()); }
function scaledTimer(base, minimum){ return Math.max(minimum, Math.round(base / getDifficultyMultiplier())); }
function resetNightState(){
  hora_actual=0; static_segundos=0; direction=0; is_flashlight_on=false; is_tablet_open=false; is_curtains_closed=false; current_camera=1;
  tiempo_povar=0; rabat_stage=0; rabat_room=0; mimic_stage=0; killer_stage=0; maid_stage=0; cook_cooldown_until=0; maid_cooldown_until=0; rabat_move_timer=0; killer_move_timer=0; killer_deadline=0; killer_watch_timer=0; rabat_tablet_ticks=0; maniac_curtain_cause=false; resetKid(); resetManiacBox();
  maniac_alert=false; maniac_angry=false; maniac_angry_since=0; maniac_alert_since=0; maniac_run=false; maniac_run_since=0; maid_timer_running=false; maid_deadline=0; rabat_glitch=false; cook_sound_timer=0; cook_breath_timer=0; rabat_sound_timer=0; maniac_run_sound_timer=0;
  saveClock=0; nightTransitioning=false;
}

function updateMenu(){
  const continueButton=document.getElementById('continue-btn');
  const newButton=document.getElementById('new-game-btn');
  const raw=readSave();
  if(newButton) newButton.disabled=false;
  const info=document.getElementById('save-info');
  if(raw){
    try{
      const s=JSON.parse(raw);
      if(continueButton) continueButton.disabled=false;
      if(info) info.textContent=`Сохранение: Ночь ${s.noche_actual} — продолжение доступно`;
    }catch(e){
      if(continueButton) continueButton.disabled=true;
      if(info) info.textContent='Сохранение повреждено';
    }
  }else{
    if(continueButton) continueButton.disabled=true;
    if(info) info.textContent='Сохранения нет — начните новую игру';
  }
}

function resetState(){
  game_over=false; gameRunning=false; hora_actual=0; static_segundos=0; direction=0; is_flashlight_on=false; is_tablet_open=false; is_curtains_closed=false; current_camera=1;
  noche_actual=1; tiempo_povar=0; rabat_stage=0; rabat_room=0; mimic_stage=0; killer_stage=0; maid_stage=0; cook_cooldown_until=0; maid_cooldown_until=0; rabat_move_timer=0; killer_move_timer=0; killer_deadline=0; killer_watch_timer=0; rabat_tablet_ticks=0; maniac_curtain_cause=false; resetKid(); resetManiacBox();
  maniac_alert=false; maniac_angry=false; maniac_angry_since=0; maniac_alert_since=0; maniac_run=false; maniac_run_since=0; maid_timer_running=false; maid_deadline=0; rabat_glitch=false; cook_sound_timer=0; cook_breath_timer=0; rabat_sound_timer=0; maniac_run_sound_timer=0;
}

function newGame(){
  initAudio(); playSound('click');
  removeSave();
  resetState();
  startGame(false);
}

function continueGame(){
  initAudio(); playSound('click');
  const raw = readSave();
  if(!raw) return;
  try{ loadSave(JSON.parse(raw)); startGame(true); }catch(e){ newGame(); }
}

function startGame(fromSave){
  gamePaused=false; const pm=document.getElementById('pause-menu'); if(pm)pm.style.display='none'; const pb=document.getElementById('pause-btn'); if(pb)pb.style.display='block';
  initAudio();
  if(sounds.ambient) sounds.ambient.play().catch(()=>{});
  nightTransitioning=false; gameRunning=true; game_over=false; mainMenuHide();
  if(!fromSave) saveGame(true);
  updateAllVisuals();
  if(is_tablet_open) { is_tablet_open=false; tabletScreen.style.display='none'; }
  updateMenu();
  lastTick=Date.now();
}
function mainMenuHide(){ mainMenu.style.display='none'; }
function returnToMenu(){ saveGame(true); gameRunning=false; gamePaused=false; stopAudio(); if(tabletScreen) tabletScreen.style.display='none'; is_tablet_open=false; const pm=document.getElementById('pause-menu'); if(pm)pm.style.display='none'; const pb=document.getElementById('pause-btn'); if(pb)pb.style.display='none'; mainMenu.style.display='flex'; updateMenu(); }
function pauseGame(){if(!gameRunning||game_over)return;saveGame(true);gamePaused=true;gameRunning=false;stopAudio();if(tabletScreen)tabletScreen.style.display='none';is_tablet_open=false;const pm=document.getElementById('pause-menu');if(pm)pm.style.display='flex';}
function resumeGame(){if(!gamePaused)return;gamePaused=false;gameRunning=true;lastTick=Date.now();const pm=document.getElementById('pause-menu');if(pm)pm.style.display='none';const pb=document.getElementById('pause-btn');if(pb)pb.style.display='block';initAudio();if(sounds.ambient)sounds.ambient.play().catch(()=>{});updateAllVisuals();}

function snapshot(){
  const now=Date.now();
  return {
    version:4, noche_actual, direction, is_flashlight_on, is_tablet_open:false, is_curtains_closed, current_camera,
    tiempo_povar, rabat_stage, rabat_room, mimic_stage, killer_stage, maid_stage, maniac_alert, maniac_angry,
    maniac_angry_remaining: maniac_angry && maniac_angry_since ? Math.max(0, scaledTimer(5000,1200)-(now-maniac_angry_since)) : 0,
    maniac_alert_remaining: maniac_alert && maniac_alert_since ? Math.max(0, 8000-(now-maniac_alert_since)) : 0,
    maniac_run, maniac_run_remaining: maniac_run && maniac_run_since ? Math.max(0, maniacAttackDelay()*1000-(now-maniac_run_since)) : 0,
    maid_remaining: maid_deadline ? Math.max(0, maid_deadline-now) : 0,
    maniac_charge, maniac_charge_state, maniac_light_out,
    kid_stage: Math.min(kid_stage,1), stolen_item, stolen_remaining: stolen_item ? Math.max(0,stolen_until-now) : 0,
    savedAt: now
  };
}
function saveGame(force=false){
  if(!gameRunning && !force) return;
  try{
    noche_actual=Math.min(10,Math.max(1,Math.floor(Number(noche_actual)||1)));
    const data=snapshot();
    data.noche_actual=noche_actual;
    writeSave(JSON.stringify(data));
  }catch(e){ console.warn('Save failed:',e); }
}
function loadSave(s){
  noche_actual=Math.min(10,Math.max(1,Number(s.noche_actual)||1)); hora_actual=0; static_segundos=0;
  direction=Number(s.direction)||0; is_flashlight_on=!!s.is_flashlight_on; is_tablet_open=false; is_curtains_closed=!!s.is_curtains_closed; current_camera=Math.min(10,Math.max(1,Number(s.current_camera)||1));
  tiempo_povar=Math.max(0,Number(s.tiempo_povar)||0); rabat_stage=Math.max(0,Number(s.rabat_stage)||0); rabat_room=Math.max(0,Number(s.rabat_room)||0); mimic_stage=Math.max(0,Number(s.mimic_stage)||0); killer_stage=Math.max(0,Number(s.killer_stage)||0); maid_stage=Math.max(0,Number(s.maid_stage)||0);
  maniac_curtain_cause=!!s.is_curtains_closed; maniac_alert=!!s.maniac_alert; maniac_angry=!!s.maniac_angry; maniac_run=!!s.maniac_run; rabat_glitch=false; maid_timer_running=false;
  const now=Date.now();
  maniac_angry_since=maniac_angry && s.maniac_angry_remaining ? now-(scaledTimer(5000,1200)-Number(s.maniac_angry_remaining)) : 0;
  maniac_alert_since=maniac_alert && s.maniac_alert_remaining ? now-(8000-Number(s.maniac_alert_remaining)) : 0;
  maniac_run_since=maniac_run && s.maniac_run_remaining ? now-(maniacAttackDelay()*1000-Number(s.maniac_run_remaining)) : 0;
  maid_deadline=Number(s.maid_remaining)>0 ? now+Number(s.maid_remaining) : 0;
  if(maid_deadline) maid_timer_running=true;
  maniac_charge=Math.max(0,Math.min(1,Number(s.maniac_charge)||0)); maniac_charge_state=s.maniac_charge_state==='full'?'full':'idle'; maniac_light_out=!!s.maniac_light_out; maniac_charge_release_at=0;
  kid_stage=Math.min(1,Math.max(0,Number(s.kid_stage)||0)); kid_deadline=0; kid_cooldown_until=now+3000; mask_on=false; mask_until=0; mask_cd_until=0;
  stolen_item=(s.stolen_item==='flashlight'||s.stolen_item==='tablet')?s.stolen_item:''; stolen_until=stolen_item?now+Math.max(0,Number(s.stolen_remaining)||0):0;
  if(stolen_item==='flashlight') is_flashlight_on=false;
}

function updateClock(){ if(timeDisplay) timeDisplay.textContent=`${hora_actual}:00 AM | Ночь ${noche_actual}`; }
function updateOfficeVisuals(){
  if(!office) return;
  let img='office_front_empty.jpg';
  if(direction===1) img='office_back.jpg';
  else if(is_curtains_closed) img='office_curtains.jpg';
  else if(rabat_stage>=3) img='office_front_rabat.jpg';
  office.style.backgroundImage=`url('${img}')`;
  office.style.filter=is_flashlight_on?'brightness(1)':'brightness(.2)';
  if(flashlightBtn){ flashlightBtn.classList.toggle('on',is_flashlight_on); flashlightBtn.textContent=is_flashlight_on?'ФОНАРИК: ВКЛ':'ФОНАРИК'; }
  if(curtainBtn){ curtainBtn.classList.toggle('closed',is_curtains_closed); curtainBtn.textContent=is_curtains_closed?'ШТОРЫ: ЗАКРЫТЫ':'ШТОРЫ: ОТКР'; }
  const tabletBtn=document.getElementById('tablet-btn'); if(tabletBtn) tabletBtn.style.visibility=direction===1?'hidden':'visible';
  updateClock();
}
function updateAllVisuals(){ updateOfficeVisuals(); if(is_tablet_open) switchCamera(current_camera); }

function gameTick(){
  if(!gameRunning || game_over || nightTransitioning) return;
  static_segundos++;
  if(static_segundos>=30){
    static_segundos=0; onHoraCambiada(); if(game_over) return;
  }
  const totalNightSeconds=hora_actual*secondsPerHour()+static_segundos;
  const now=Date.now();
  
  if(maniac_charge_state==='charging' && current_camera===8){
    maniac_charge=Math.min(1,Math.max(0,(now-maniac_charge_started_at)/5000));
    if(maniac_charge>=1) maniac_charge_state='full';
  } else if(maniac_charge_state==='draining'){
    maniac_charge=Math.max(0,1-(now-maniac_charge_release_at)/maniacDrainDurationMs());
    if(maniac_charge<=0){
      maniac_charge=0; maniac_charge_state='idle'; maniac_light_out=true; maniac_curtain_cause=false;
      if(!maniac_run){ maniac_run=true; maniac_run_since=now; maniac_run_sound_timer=0; playSound('maniacScream',0.78); }
    }
  }
  if(totalNightSeconds<=12+Math.round((1-easeFactor())*40)){ if(is_tablet_open) switchCamera(current_camera); autosave(); return; }
  const ease=easeFactor();
  const chance=getBaseChance()*ease;
  const difficulty=getDifficultyMultiplier();

  // COOK
  const povarLimit=Math.round(scaledTimer(220-(noche_actual*4), 30)/ease);
  if(direction===1 && is_flashlight_on){
    if(tiempo_povar>0){ cook_cooldown_until=now+scaledTimer(9000,4500); }
    tiempo_povar=0;
  } else if(now < cook_cooldown_until){
    tiempo_povar=0;
  }  else {
    tiempo_povar++;
    if(tiempo_povar>=povarLimit){ triggerScreamer('cook','ПОВАР напал со спины!'); return; }
  }

  cook_sound_timer++; cook_breath_timer++;
  if(direction===0 && tiempo_povar>povarLimit*0.42){
    const close=tiempo_povar/povarLimit;
    if(cook_sound_timer >= (close>0.78?1:2)){ cook_sound_timer=0; play3DSound('cookStep',0.32+close*0.42, (Math.random()*0.3)-0.15); }
    if(close>0.72 && cook_breath_timer>=3){ cook_breath_timer=0; playSound('cookBreath',0.28+close*0.5); }
  } else { cook_sound_timer=0; cook_breath_timer=0; }

  // RABAT
  rabat_move_timer++;
  const rabatNightStep=Math.max(0,noche_actual-1);
  const rabatMoveEvery=Math.max(140,Math.round((50 + rabatNightStep*1.2) / Math.min(1.25,0.95 + rabatNightStep*0.025)));

  if(rabat_move_timer>=rabatMoveEvery && rabat_stage<3 && !is_tablet_open){
    rabat_move_timer=0; rabat_stage++;
    rabat_room=rabat_stage===1?5:(rabat_stage===2?6:1);
    rabat_glitch=true; playSound(rabat_stage===3?'step':'static');
    setTimeout(()=>{rabat_glitch=false; if(is_tablet_open)switchCamera(current_camera)},650);
  }

  if(rabat_stage===3){
    if(is_tablet_open){
      rabat_tablet_ticks++;
      if(rabat_tablet_ticks>=rabatTabletGrace()){ triggerScreamer('rabat','РАБАТ увидел, что ты сидишь в планшете!'); return; }
    } else rabat_tablet_ticks=0;
  } else rabat_tablet_ticks=0;

  if(rabat_stage===3 && !is_tablet_open){
    if((!is_flashlight_on && Math.random()<0.20+(1-ease)*0.3) || (is_flashlight_on && direction===0 && Math.random()<0.12+(1-ease)*0.3)){
      rabat_stage=0; rabat_room=0; rabat_move_timer=0;
    }
  }

  rabat_sound_timer++;
  if(!is_tablet_open && rabat_stage>=2 && rabat_sound_timer >= (rabat_stage===3?1:2)){
    rabat_sound_timer=0; play3DSound('rabatStep',0.3+(rabat_stage===3?0.28:0.12),(Math.random()*0.5)-0.25);
  }

  // MIMIC
  if(Math.random()<Math.min(0.9, chance*.72)){
    if(mimic_stage<2) mimic_stage++;
    else { triggerScreamer('mimic','МИМИК вырвался из вентиляции!'); return; }
  }

  // KILLER
  killer_move_timer++;
  const killerNightStep=Math.max(0,noche_actual-1);
  const killerMoveEvery=Math.max(17,Math.round(31/Math.min(1.45,1+killerNightStep*0.07)));
  const watchingKiller=is_tablet_open && current_camera===3;
  if(watchingKiller) killer_watch_timer++; else killer_watch_timer=0;

  if(watchingKiller && killer_watch_timer>=2 && killer_stage>=1){
    killer_watch_timer=0;
    killer_stage=Math.max(0,killer_stage-1);
    killer_deadline=0;
    killer_move_timer=0;
    playSound('static',0.22);
  }
  if(killer_stage<3 && killer_move_timer>=killerMoveEvery){
    killer_move_timer=0;
    killer_stage++;
    if(killer_stage>=3){ killer_deadline=now+killerAttackWindowMs(); playSound('warning',0.5); }
  }
  if(killer_stage>=3){
    if(watchingKiller){
      killer_deadline=0;
    } else if(!killer_deadline) killer_deadline=now+killerAttackWindowMs();
    if(is_flashlight_on && direction===0){
      killer_stage=1; killer_deadline=0; killer_move_timer=0; playSound('static',0.4);
    } else if(!watchingKiller && now>=killer_deadline){ triggerScreamer('killer','УБИЙЦА добрался до кабинета!'); return; }
  }

  // MAID
  if(now >= maid_cooldown_until && Math.random()<Math.min(0.9, chance*.72) && maid_stage<2) maid_stage++;
  if(maid_stage===2){
    if(!is_curtains_closed && !maid_timer_running){ maid_timer_running=true; maid_deadline=now+Math.round(scaledTimer(6500,3500)*(2-ease)); }
    else if(is_curtains_closed){
      maid_stage=0; maid_timer_running=false; maid_deadline=0;
      maid_cooldown_until=now+scaledTimer(10000,5000);
    }
  }
  if(maid_timer_running && maid_deadline && now>=maid_deadline && !is_curtains_closed && maid_stage===2){ triggerScreamer('maid','ГОРНИЧНАЯ выбила окно!'); return; }

  // ПОВАРЁНОК
  if(kid_stage===0 && now>=kid_cooldown_until && Math.random()<Math.min(0.35,chance*2.5)){
    kid_stage=1; playSound('static',0.3);
  } else if(kid_stage===1 && Math.random()<Math.min(0.5,(0.15+0.025*(noche_actual-1))*Math.max(0.4,ease))){
    kid_stage=2; kidOnStairs();
  }
  refreshKidUI();

  // MANIAC
  if(is_curtains_closed && !maniac_angry && !maniac_run){ maniac_curtain_cause=true; maniac_angry=true; maniac_angry_since=now; maniac_alert=true; maniac_alert_since=now; playSound('warning',0.48); }
  if(maniac_angry && !maniac_run && !maniac_curtain_cause && !is_flashlight_on){ maniac_angry=false; maniac_angry_since=0; maniac_alert=false; maniac_alert_since=0; }
  if((maniac_angry||maniac_run) && maniac_curtain_cause && !is_curtains_closed && !maniac_light_out){
    maniac_angry=false; maniac_run=false; maniac_angry_since=0; maniac_run_since=0; maniac_alert=false; maniac_alert_since=0; maniac_curtain_cause=false;
  }
  if(maniac_angry && now-maniac_angry_since>=5000){
    maniac_angry=false; maniac_run=true; maniac_run_since=now; maniac_run_sound_timer=0;
    playSound('maniacScream',0.78);
  }
  if(maniac_run){
    maniac_run_sound_timer++;
    if(maniac_run_sound_timer>=1){ maniac_run_sound_timer=0; playSound('maniacRun',0.62); }
    if(now-maniac_run_since>=maniacAttackDelay()*1000){ triggerScreamer('maniac','МАНЬЯК прорвался после крика!'); return; }
  }
  if(is_flashlight_on && direction===0 && current_camera!==8 && !maniac_angry && !maniac_run){
    if(!maniac_alert && Math.random()<Math.min(0.6,0.018*difficulty*ease)){maniac_alert=true;maniac_alert_since=now; playSound('warning',0.4);}
  }
  if(maniac_alert && !maniac_angry && !maniac_run){
    const age=now-maniac_alert_since;
    if(is_flashlight_on && age>=8000 && Math.random()<Math.min(0.7,0.018*difficulty*ease)){ maniac_curtain_cause=false; maniac_angry=true; maniac_angry_since=now; playSound('warning',0.5); }
    if(!is_flashlight_on && age>=3000 && Math.random()<.30){maniac_alert=false;maniac_alert_since=0;}
  }

  if(is_tablet_open) switchCamera(current_camera);
  autosave();
}

function refreshKidUI(){
  const mb=document.getElementById('mask-btn'), mo=document.getElementById('mask-overlay');
  const now=Date.now();
  if(mb){ mb.classList.toggle('on',mask_on); mb.classList.toggle('cd',!mask_on && now<mask_cd_until); mb.textContent=mask_on?'СНЯТЬ МАСКУ':'НАДЕТЬ МАСКУ'; }
  if(mo) mo.classList.toggle('show',mask_on);
  document.body.classList.toggle('tablet-open',!!is_tablet_open);
  const fb=document.getElementById('flashlight-btn'), tb=document.getElementById('tablet-btn');
  if(fb){ fb.classList.toggle('stolen',stolen_item==='flashlight'); if(stolen_item==='flashlight') fb.textContent='ФОНАРИК УКРАДЕН'; }
  if(tb){ tb.classList.toggle('stolen',stolen_item==='tablet'); tb.textContent=stolen_item==='tablet'?'ПЛАНШЕТ УКРАДЕН':'ПЛАНШЕТ'; }
}
function kidOnStairs(){
  playSound('kidLadder');
  if(mask_on){ scareKid(); return; }
  kid_deadline=Date.now()+kidArrivalDelay();
}
function scareKid(){
  kid_stage=0; kid_deadline=0; kid_cooldown_until=Date.now()+scaledTimer(12000,5000);
  playSound('kidScared');
  if(is_tablet_open) switchCamera(current_camera);
}
function kidSteal(){
  const item=Math.random()<0.5?'flashlight':'tablet';
  stolen_item=item; stolen_until=Date.now()+scaledTimer(15000,6000);
  kid_stage=0; kid_deadline=0; kid_cooldown_until=Date.now()+scaledTimer(15000,6000);
  playSound('kidSteal');
  if(item==='flashlight'){ is_flashlight_on=false; }
  else {
    is_tablet_open=false;
    tabletScreen.style.display='none';
    actionMonitorBtn.style.display='none';
    document.body.classList.remove('tablet-open');
  }
  updateOfficeVisuals(); refreshKidUI(); saveGame();
}
function toggleMask(){
  if(!gameRunning||game_over||is_tablet_open)return; initAudio();
  const now=Date.now();
  if(mask_on){ mask_on=false; mask_until=0; refreshKidUI(); return; }
  if(now<mask_cd_until)return;
  mask_on=true; mask_until=0; mask_cd_until=now+450; playSound('maskOn');
  if(kid_stage===2) scareKid();
  refreshKidUI();
}
function kidFastTick(){
  if(!gameRunning||game_over){ if(sounds.lullaby&&!sounds.lullaby.paused){try{sounds.lullaby.pause();}catch(e){}} if(mask_on){mask_on=false;refreshKidUI();} return; }
  const now=Date.now();
  if(mask_on && mask_until && now>=mask_until){ mask_on=false; refreshKidUI(); }
  if(kid_stage===2 && kid_deadline && now>=kid_deadline){ if(mask_on) scareKid(); else kidSteal(); }
  if(stolen_item && now>=stolen_until){ stolen_item=''; stolen_until=0; updateOfficeVisuals(); refreshKidUI(); }
  const L=sounds.lullaby;
  if(L){ if(kid_stage===0){ if(L.paused) L.play().catch(()=>{}); } else if(!L.paused){ try{L.pause();}catch(e){} } }
}

function autosave(){ if(++saveClock>=2){saveClock=0;saveGame();} }
function onHoraCambiada(){
  if(nightTransitioning || game_over || !gameRunning) return;
  hora_actual++;
  if(hora_actual<6){ updateClock(); saveGame(true); return; }

  nightTransitioning=true;
  game_over=true;
  gameRunning=false;

  if(noche_actual>=10){
    writeSave(JSON.stringify({version:6,noche_actual:10,hora_actual:5,static_segundos:secondsPerHour()-1,completed:true,savedAt:Date.now()}));
    showNightOverlay('ИГРА ПРОЙДЕНА','Ты пережил все 10 ночей.');
    const b=document.createElement('button'); b.className='night-btn'; b.type='button'; b.textContent='продолжить';
    b.addEventListener('click', ()=>{ 
      d.remove(); 
      if(noche_actual > 10) {
        location.reload(); 
      } else {
        gameRunning=true; game_over=false; nightTransitioning=false; updateOfficeVisuals(); saveGame(true); 
      }
    });
    return;
  }

  const completedNight=noche_actual;
  noche_actual=Math.min(10,Math.max(1,noche_actual+1));
  resetNightState();
  game_over=true;
  gameRunning=false;
  is_tablet_open=false;
  if(tabletScreen) tabletScreen.style.display='none';
  const nextNightSave=snapshot();
  nextNightSave.noche_actual=noche_actual;
  nextNightSave.hora_actual=0;
  nextNightSave.static_segundos=0;
  nextNightSave.is_tablet_open=false;
  writeSave(JSON.stringify(nextNightSave));
  showNightOverlay(`НОЧЬ ${noche_actual}`,`Ночь ${completedNight} пройдена. Сложность немного увеличена.`);
}

function showNightOverlay(title,text){
  const old=document.getElementById('night-overlay'); if(old)old.remove();
  const d=document.createElement('div'); d.id='night-overlay';
  const box=document.createElement('div'); box.className='box';
  const h=document.createElement('h2'); h.textContent=title;
  const p=document.createElement('div'); p.textContent=text;
  const b=document.createElement('button'); b.className='night-btn'; b.type='button'; b.textContent='ПРОДОЛЖИТЬ';
  b.addEventListener('click', ()=>{ 
    d.remove(); 
    if(noche_actual > 10) {
      location.reload(); 
    } else {
      gameRunning=true; game_over=false; nightTransitioning=false; updateOfficeVisuals(); saveGame(true); 
    }
  });
  box.append(h,p,b); d.appendChild(box); document.body.appendChild(d);
}

function toggleDirection(){ if(!gameRunning||game_over)return; if(is_tablet_open)toggleTablet(); direction=direction===0?1:0; is_flashlight_on=false; updateOfficeVisuals(); saveGame(); }
function toggleFlashlight(){ if(!gameRunning||game_over)return; if(stolen_item==='flashlight'){playSound('warning',0.25);return;} initAudio(); playSound('click'); is_flashlight_on=!is_flashlight_on; updateOfficeVisuals(); saveGame(); }
function toggleCurtains(){
  if(!gameRunning||game_over)return; initAudio(); playSound('click'); is_curtains_closed=!is_curtains_closed;
  if(is_curtains_closed){maid_stage=0;maid_timer_running=false;maid_deadline=0;maid_cooldown_until=Date.now()+scaledTimer(10000,5000);maniac_curtain_cause=true;maniac_angry=true;maniac_angry_since=Date.now();maniac_alert=true;maniac_alert_since=Date.now(); playSound('warning');}
  else if(!maniac_light_out){maniac_curtain_cause=false;maniac_run=false;maniac_run_since=0;maniac_angry=false;maniac_angry_since=0;maniac_alert=false;maniac_alert_since=0;}
  updateOfficeVisuals();saveGame();
}
function toggleTablet(){
  if(is_tablet_open){
    is_tablet_open=false;
    if(tabletScreen) tabletScreen.style.display='none';
    if(actionMonitorBtn) actionMonitorBtn.style.display='none';
    saveGame(true);
    return;
  }
  if(!gameRunning||game_over||gamePaused||direction===1)return;
  if(stolen_item==='tablet'){playSound('warning',0.25);return;}
  initAudio(); playSound('click'); is_tablet_open=true;
  if(tabletScreen) tabletScreen.style.display='block';
  switchCamera(current_camera); refreshKidUI(); saveGame();
}
function setCameraImage(image,status){
  const changedFeed=cameraMonitor.dataset.feedImage!==image;
  cameraMonitor.style.backgroundImage=`url('${image}')`;
  cameraMonitor.dataset.feedImage=image;
  monitorTextBox.textContent=status;
  if(changedFeed){
    cameraMonitor.classList.remove('camera-switching');
    void cameraMonitor.offsetWidth;
    cameraMonitor.classList.add('camera-switching');
  }
}
function switchCamera(camNumber){
  if(stolen_item==='tablet'){ is_tablet_open=false; tabletScreen.style.display='none'; actionMonitorBtn.style.display='none'; return; }
  
  if(current_camera===8 && camNumber!==8 && maniac_charge_state==='charging'){
    maniac_charge=Math.min(1,Math.max(0,(Date.now()-maniac_charge_started_at)/5000));
    maniac_charge_state=maniac_charge>=1?'full':'idle';
    maniac_charge_started_at=0;
  }
  current_camera=camNumber;
  for(let i=1;i<=10;i++){const b=document.getElementById('cam'+i+'-btn');if(b)b.classList.remove('active')}
  const active=document.getElementById('cam'+camNumber+'-btn');if(active)active.classList.add('active');
  actionMonitorBtn.style.display='none';
  cameraMonitor.classList.toggle('signal-noise',!!(rabat_glitch&&camNumber===rabat_room));
  if(rabat_glitch&&camNumber===rabat_room){
    const feedImage=camNumber===5?'cam5_rabat.jpg':(camNumber===6?'cam6_rabat.jpg':'cam1_rabat.jpg');
    setCameraImage(feedImage,`[CAM ${camNumber}]\n⚠ ПОМЕХИ СИГНАЛА — ОБЪЕКТ ПРОДОЛЖАЕТ ДВИЖЕНИЕ`);
    return;
  }
  if(camNumber===1){
    let image='cam1_hall.jpg', status='Коридор пуст.';
    if(maniac_angry || maniac_alert){ image='cam1_maniac.jpg'; status='МАНЬЯК СТОИТ В КОРИДОРЕ!'; }
    else if(rabat_stage>=3){ image='cam1_rabat.jpg'; status='РАБАТ СТОИТ В КОРИДОРЕ!'; }
    setCameraImage(image,`[CAM 1: ГЛАВНЫЙ КОРИДОР]\n${status}`);
  } else if(camNumber===2){
    actionMonitorBtn.textContent='ЗАКРЫТЬ РЕШЁТКУ';
    actionMonitorBtn.style.setProperty('--charge','0%');
    actionMonitorBtn.style.display=mimic_stage===2?'block':'none';
    const image=mimic_stage===2?'cam2_mimic_grate.jpg':'cam2_empty.jpg';
    const status=mimic_stage===2?'МИМИК ПРЯМО У РЕШЁТКИ! ЗАКРОЙ РЕШЁТКУ.':(mimic_stage===1?'Слышен скрежет внутри вентиляции...':'В воздуховоде тихо.');
    setCameraImage(image,`[CAM 2: ВЕНТИЛЯЦИЯ]\n${status}`);
  } else if(camNumber===3){const image=killer_stage>=1?'cam3_killer.jpg':'cam3_stairs.jpg';setCameraImage(image,`[CAM 3: ЛЕСТНИЦА]\n${killer_stage>=3?'УБИЙЦА БЕЖИТ НА ВАШ ЭТАЖ!':killer_stage?'Силуэт приближается...':'Лестница пуста.'}`);}
  else if(camNumber===4){const limit=Math.round(scaledTimer(220-(noche_actual*4),30)/easeFactor());let image='cam4_room5005.jpg',status='Комната 5005 пуста.';if(tiempo_povar<limit*.45){image='cam4_cook.jpg';status='Повар сидит в комнате.'}else if(tiempo_povar<limit*.75){image='cam4_cook_gone.jpg';status='Повар исчез...'}else{image='cam4_cook_gone.jpg';status='ПОВАР ПРИБЛИЖАЕТСЯ!'}setCameraImage(image,`[CAM 4: КОМНАТА 5005]\n${status}`);}
  else if(camNumber===5){setCameraImage(rabat_room===5?'cam5_rabat.jpg':'cam5_elevator.jpg',`[CAM 5: ЛИФТ]\n${rabat_room===5?'РАБАТ В ЛИФТЕ.':'Лифт пуст.'}`);}
  else if(camNumber===6){setCameraImage(rabat_room===6?'cam6_rabat.jpg':'cam6_lobby.jpg',`[CAM 6: ЛОББИ]\n${rabat_room===6?'РАБАТ В ЛОББИ.':'Лобби пусто.'}`);}
  else if(camNumber===7){let image='cam7_laundry.jpg',status='Прачечная пуста.';if(maid_stage===1){image='cam7_maid.jpg';status='Горничная в прачечной...'}if(maid_stage===2){image='cam7_maid_window.jpg';status='ГОРНИЧНАЯ У ОКНА!'}setCameraImage(image,`[CAM 7: ПРАЧЕЧНАЯ]\n${status}`);}
  else if(camNumber===9){
    setCameraImage(kid_stage===0?'cam9_cradle_sleep.jpg':'cam9_cradle_empty.jpg',`[CAM 9: КОЛЫБЕЛЬНАЯ]\n${kid_stage===0?'Поварёнок спит в кроватке...':'КРОВАТКА ПУСТА! Поварёнок вылез.'}`);
  }
  else if(camNumber===10){
    setCameraImage(kid_stage===2?'cam10_kid.jpg':'cam10_hatch.jpg',`[CAM 10: ВЕНТИЛЯЦИЯ 2]\n${kid_stage===2?'ПОВАРЁНОК ПОЛЗЁТ ПО ВЕНТИЛЯЦИИ К ТЕБЕ!':(kid_stage===1?'По металлу доносится шорох...':'Вторая вентиляция пуста.')}`);
  }
  else if(camNumber===8){
    actionMonitorBtn.style.display='block';
    actionMonitorBtn.style.setProperty('--charge',Math.round(maniac_charge*100)+'%');
    actionMonitorBtn.textContent=maniac_charge_state==='charging'?'ЗАРЯД: '+Math.round(maniac_charge*100)+'%':(maniac_charge_state==='full'?'ЗАРЯД ПОЛОН — ОТПУСТИ':(maniac_charge_state==='draining'?'РАЗРЯД: '+Math.round(maniac_charge*100)+'%':'ЗАЖМИ: 5 СЕК'));
    const drainSeconds=Math.round(maniacDrainDurationMs()/1000);
    const status=maniac_light_out?'СВЕТ ПОГАС! МАНЬЯК БЕЖИТ К ТЕБЕ!':(maniac_charge_state==='full'?'ШКАТУЛКА ЗАРЯЖЕНА. ОТПУСТИ КНОПКУ.':(maniac_charge_state==='draining'?`ЗАРЯД РАЗРЯЖАЕТСЯ ЗА ${drainSeconds} СЕКУНД.`:'Удерживай кнопку 5 секунд, чтобы завести шкатулку.'));
    setCameraImage(maniac_light_out?'cam8_maniac_alert.jpg':'cam8_maniac.jpg',`[CAM 8: КУХНЯ]\n${status}`);
  }
}
function startManiacCharge(){
  if(!gameRunning||game_over||!is_tablet_open||current_camera!==8||maniac_light_out)return;
  initAudio();
  const now=Date.now();
  if(maniac_charge_state==='draining'){
    maniac_charge=Math.max(0,1-(now-maniac_charge_release_at)/maniacDrainDurationMs());
  } else if(maniac_charge_state==='charging') {
    maniac_charge=Math.min(1,Math.max(0,(now-maniac_charge_started_at)/5000));
  }
  maniac_charge_started_at=now-maniac_charge*5000;
  maniac_charge_state=maniac_charge>=1?'full':'charging';
  maniac_charge_release_at=0;
  switchCamera(8);
}
function stopManiacCharge(){
  if(maniac_charge_state==='charging' && maniac_charge_started_at && Date.now()-maniac_charge_started_at>=5000){
    maniac_charge=1; maniac_charge_state='full';
  }
  if(maniac_charge_state==='full' || (maniac_charge_state==='charging' && maniac_charge>=1)){
    maniac_charge=1;
    maniac_charge_state='draining';
    maniac_charge_release_at=Date.now();
    maniac_charge_started_at=0;
    return;
  }
  if(maniac_charge_state==='charging'){
    maniac_charge_state='idle';
    maniac_charge_release_at=0;
    maniac_charge_started_at=0;
  }
}
function bindManiacHold(){
  const b=document.getElementById('action-monitor-btn'); if(!b)return;
  const down=e=>{ if(current_camera===8){e.preventDefault();startManiacCharge();} };
  const up=e=>{ e.preventDefault(); stopManiacCharge(); };
  b.addEventListener('pointerdown',down); b.addEventListener('pointerup',up); b.addEventListener('pointercancel',up); b.addEventListener('pointerleave',up);
}
function handleCamAction(){
  if(!gameRunning||game_over)return; initAudio(); playSound('click');
  if(current_camera===2&&mimic_stage===2){mimic_stage=0;actionMonitorBtn.style.display='none';switchCamera(2);saveGame();}
}

document.addEventListener('keydown',event=>{
  const key=event.key.toLowerCase(),code=event.code;
  if((key==='escape'||code==='Tab'||code==='Space') && is_tablet_open){
    event.preventDefault();
    if(key==='escape'||code==='Tab'||code==='Space'){ toggleTablet(); return; }
  }
  if(!gameRunning||game_over)return;
  if(['tab',' ','escape','f','c','e','a','d','arrowleft','arrowright','1','2','3','4','5','6','7','8','9','0','m'].includes(key)||['Tab','Space'].includes(code))event.preventDefault();
  if(event.repeat)return;
  if(key==='m'){toggleMask();return;}
  if(/^[0-9]$/.test(key)){const cam=key==='0'?10:Number(key);if(stolen_item==='tablet')return;if(!is_tablet_open)toggleTablet();if(is_tablet_open)switchCamera(cam);return;}
  if(code==='Tab'||code==='Space'){toggleTablet();return;} if(key==='escape'){if(is_tablet_open)toggleTablet();return;}
  if(key==='f'){toggleFlashlight();return;} if(key==='c'){toggleCurtains();return;}
  if(key==='a'||key==='arrowleft'){if(!is_tablet_open&&direction!==1)toggleDirection();return;} if(key==='d'||key==='arrowright'){if(!is_tablet_open&&direction!==0)toggleDirection();return;}
  if(key==='e'&&is_tablet_open&&current_camera===2&&mimic_stage===2)handleCamAction();
});
window.addEventListener('pagehide',()=>saveGame(true));
window.addEventListener('beforeunload',()=>saveGame(true));
document.addEventListener('visibilitychange',()=>{
  if(document.hidden) saveGame(true);
});
window.addEventListener('error',()=>{
  try { saveGame(true); } catch(e){}
  is_tablet_open=false;
  if(tabletScreen) tabletScreen.style.display='none';
  if(actionMonitorBtn) actionMonitorBtn.style.display='none';
});

function triggerScreamer(type,reason){
  if(game_over)return; const pauseBtn=document.getElementById('pause-btn');if(pauseBtn)pauseBtn.style.display='none';const pauseMenu=document.getElementById('pause-menu');if(pauseMenu)pauseMenu.style.display='none';gamePaused=false; initAudio(); playSound('scare'); game_over=true;gameRunning=false;is_tablet_open=false;tabletScreen.style.display='none';
  const images={cook:'jumpscare_cook.jpg',rabat:'jumpscare_rabat.jpg',mimic:'jumpscare_mimic.jpg',killer:'jumpscare_killer.jpg',maid:'jumpscare_maid.jpg',maniac:'jumpscare_maniac.jpg'};
  const videos={rabat:'22334.mp4',killer:'22335.mp4',maniac:'22336.mp4',mimic:'22337.mp4',cook:'22338.mp4',maid:'22339.mp4'};
  const overlay=document.createElement('div');overlay.id='jumpscare-overlay';
  overlay.style.cssText='position:fixed;inset:0;z-index:99999;background:#000 center/cover no-repeat;display:block;padding:0;margin:0;overflow:hidden';
  const video=document.createElement('video');video.className='jumpscare-video';
  const scareImage=new URL(images[type]||images.cook,document.baseURI).href;
  video.src=new URL(videos[type]||videos.cook,document.baseURI).href;
  video.poster=scareImage;
  video.autoplay=true;video.muted=true;video.defaultMuted=true;video.loop=false;video.controls=false;
  video.removeAttribute('controls');video.setAttribute('disablepictureinpicture','');video.setAttribute('disableremoteplayback','');
  video.playsInline=true;video.setAttribute('playsinline','');video.setAttribute('webkit-playsinline','');video.preload='auto';
  video.style.cssText='position:absolute;inset:0;width:100%;height:100%;object-fit:cover;background:#000;display:block;pointer-events:none';
  const showFallback=()=>{ if(!overlay.isConnected)return; video.remove(); overlay.style.backgroundImage=`url('${scareImage}')`; };
  video.addEventListener('error',showFallback,{once:true});
  overlay.appendChild(video);document.body.appendChild(overlay);
  video.load();
  const playback=video.play();if(playback&&playback.catch)playback.catch(()=>{ showFallback(); });

  tiempo_povar=0; maid_stage=0; maid_timer_running=false; maid_deadline=0; cook_cooldown_until=Date.now()+scaledTimer(12000,6000); maid_cooldown_until=Date.now()+scaledTimer(14000,7000);
  rabat_stage=Math.min(rabat_stage,2); mimic_stage=0; killer_stage=Math.min(Math.max(0,killer_stage-1),2); killer_deadline=0; killer_watch_timer=0; rabat_tablet_ticks=0; resetKid();
  maniac_alert=false; maniac_angry=false; maniac_run=false; maniac_curtain_cause=false; maniac_angry_since=0; maniac_run_since=0; maniac_charge=0; maniac_charge_state='idle'; maniac_light_out=false; is_flashlight_on=false; is_curtains_closed=false;
  saveGame(true);
  const finishScare=()=>{ if(!overlay.isConnected)return; overlay.remove();stopAudio();mainMenu.style.display='flex';updateMenu();game_over=false; };
  video.addEventListener('ended',()=>setTimeout(finishScare,250),{once:true});
  setTimeout(finishScare, Math.max(3500, ({cook:1800,rabat:4500,killer:2500,maniac:3000,mimic:3000,maid:3500}[type]||3500)));
}

function bindControls(){
  const byId=id=>document.getElementById(id);
  const bind=(el,fn)=>{ if(!el)return; el.addEventListener('click',fn); };
  bind(byId('pause-btn'), pauseGame);
  bind(byId('resume-btn'), resumeGame);
  bind(byId('pause-home-btn'), returnToMenu);
  bind(byId('continue-btn'), continueGame);
  bind(byId('new-game-btn'), newGame);
  bind(byId('tablet-btn'), toggleTablet);
  bind(byId('flashlight-btn'), toggleFlashlight);
  bind(byId('curtain-btn'), toggleCurtains);
  bind(byId('turn-btn'), toggleDirection);
  bind(byId('action-monitor-btn'), handleCamAction);
  for(let i=1;i<=10;i++) bind(byId('cam'+i+'-btn'),()=>switchCamera(i));
  bind(byId('mask-btn'), toggleMask);
  bind(byId('close-tablet'), toggleTablet);
}

function bootGame(){
  try{
    bindControls();
    bindManiacHold();
    updateMenu();
    updateClock();
    updateOfficeVisuals();
    setInterval(()=>{
      try { gameTick(); }
      catch(err){
        console.error('Recovered game tick error:',err);
        is_tablet_open=false;
        if(tabletScreen) tabletScreen.style.display='none';
        if(actionMonitorBtn) actionMonitorBtn.style.display='none';
        if(gameRunning){ saveGame(true); }
      }
    },1000);
    setInterval(()=>{ try { kidFastTick(); } catch(err){ console.error('Recovered kid tick error:',err); mask_on=false; } },100);
  }catch(err){
    console.error('Game boot error:',err);
    const m=document.getElementById('main-menu'); if(m)m.style.display='flex';
  }
}

setInterval(() => {
  if (!gameRunning) updateMenu();
}, 1000);

if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',bootGame); else bootGame();

window.newGame=newGame; window.continueGame=continueGame; window.pauseGame=pauseGame; window.resumeGame=resumeGame; window.returnToMenu=returnToMenu; window.toggleTablet=toggleTablet; window.toggleFlashlight=toggleFlashlight; window.toggleCurtains=toggleCurtains; window.toggleDirection=toggleDirection; window.switchCamera=switchCamera; window.handleCamAction=handleCamAction; window.toggleMask=toggleMask;