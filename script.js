/* cursor estrelado */
const cursor = document.getElementById('sparkleCursor');
let lastSpark = 0;
function moveSparkle(x,y){
  if(cursor){cursor.style.left=x+'px';cursor.style.top=y+'px'}
  const now=Date.now();
  if(now-lastSpark>55){
    lastSpark=now;
    const s=document.createElement('span');
    s.className='sparkle';
    s.textContent=Math.random()>.5?'✦':'✧';
    s.style.left=x+'px';s.style.top=y+'px';s.style.fontSize=(10+Math.random()*14)+'px';
    document.body.appendChild(s);
    setTimeout(()=>s.remove(),700);
  }
}
window.addEventListener('pointermove',e=>moveSparkle(e.clientX,e.clientY),{passive:true});
window.addEventListener('touchmove',e=>{const t=e.touches[0];if(t)moveSparkle(t.clientX,t.clientY)},{passive:true});

/* CONTROLADORA — música generativa em código */
const CONFIG = { video:'./asset/video.mp4', voice:'./asset/voz.mp3', bpm:145 };

const state = {
  ready:false, ctx:null, master:null, genGain:null, voiceGain:null, voiceFilter:null, voiceDelay:null, voiceFeedback:null,
  voiceBuffer:null, voiceLoop:null, voiceLoopOn:false,
  bpm:CONFIG.bpm, step:0, timer:null,
  layers:{kick:false,bass:false,hat:false,synth:false,glitch:false},
  ascii:false, braid:false, zoom:1, freezeTimer:null,
  volumeA:.85, volumeB:.82, panMix:0, videoFx:0, cross:0
};

const $ = (selector) => document.querySelector(selector);
const statusEl = $('#status');
const video = $('#vjVideo');
const videoBox = $('#videoBox');
const asciiCanvas = $('#asciiCanvas');
const asciiCtx = asciiCanvas.getContext('2d', { willReadFrequently:true });
const progressFill = $('#progressFill');
const timeLabel = $('#timeLabel');
const mainPlay = $('#mainPlay');
const startButton = $('#startButton');
const flash = $('#flash');

video.src = CONFIG.video;

function setStatus(text){ statusEl.textContent = text; }
function fmt(seconds){ return Number.isFinite(seconds) ? `${Math.floor(seconds / 60).toString().padStart(2,'0')}:${Math.floor(seconds % 60).toString().padStart(2,'0')}` : '00:00'; }
function clamp(value, min, max){ return Math.max(min, Math.min(max, value)); }

async function setupAudio(){
  if(state.ready) return;
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  state.ctx = new AudioContext();
  state.master = state.ctx.createGain();
  state.master.gain.value = .88;
  state.master.connect(state.ctx.destination);

  state.genGain = state.ctx.createGain();
  state.voiceGain = state.ctx.createGain();
  state.voiceFilter = state.ctx.createBiquadFilter();
  state.voiceDelay = state.ctx.createDelay();
  state.voiceFeedback = state.ctx.createGain();

  state.genGain.gain.value = .85;
  state.voiceGain.gain.value = .82;
  state.voiceFilter.type = 'lowpass';
  state.voiceFilter.frequency.value = 9000;
  state.voiceFilter.Q.value = .85;
  state.voiceDelay.delayTime.value = .01;
  state.voiceFeedback.gain.value = 0;

  state.voiceFilter.connect(state.voiceGain);
  state.voiceFilter.connect(state.voiceDelay);
  state.voiceDelay.connect(state.voiceFeedback);
  state.voiceFeedback.connect(state.voiceDelay);
  state.voiceDelay.connect(state.voiceGain);
  state.genGain.connect(state.master);
  state.voiceGain.connect(state.master);

  await loadVoiceBuffer();
  state.ready = true;
  applyMix();
  startButton.classList.add('is-on');
  startButton.textContent = 'CONTROLADORA LIGADA';
  setStatus('áudio pronto: música gerativa + voz');
}

async function loadVoiceBuffer(){
  try{
    const res = await fetch(CONFIG.voice);
    if(!res.ok) throw new Error('voz não encontrada');
    const arr = await res.arrayBuffer();
    state.voiceBuffer = await state.ctx.decodeAudioData(arr);
  }catch(err){
    console.warn(err);
    state.voiceBuffer = null;
    setStatus('voz não encontrada em ./asset/voz.mp3');
  }
}

function envGain(time, peak=.8, decay=.2){
  const gain = state.ctx.createGain();
  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.exponentialRampToValueAtTime(peak, time + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + decay);
  return gain;
}
function playKick(time){
  const osc = state.ctx.createOscillator();
  const gain = envGain(time, 1.0, .28);
  osc.type = 'sine';
  osc.frequency.setValueAtTime(105, time);
  osc.frequency.exponentialRampToValueAtTime(42, time + .16);
  osc.connect(gain); gain.connect(state.genGain);
  osc.start(time); osc.stop(time + .3);
}
function playBass(time, step){
  const notes = [55,55,65,55, 55,73,65,55, 55,55,65,82, 73,65,55,49];
  const osc = state.ctx.createOscillator();
  const filter = state.ctx.createBiquadFilter();
  const gain = envGain(time, .34, .115);
  osc.type = 'sawtooth';
  osc.frequency.value = notes[step % notes.length];
  filter.type = 'lowpass';
  filter.frequency.value = 950;
  filter.Q.value = 7;
  osc.connect(filter); filter.connect(gain); gain.connect(state.genGain);
  osc.start(time); osc.stop(time + .13);
}
function playHat(time){
  const length = Math.floor(state.ctx.sampleRate * .04);
  const buffer = state.ctx.createBuffer(1, length, state.ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for(let i=0;i<length;i++) data[i] = Math.random() * 2 - 1;
  const src = state.ctx.createBufferSource();
  const filter = state.ctx.createBiquadFilter();
  const gain = envGain(time, .12, .045);
  filter.type = 'highpass';
  filter.frequency.value = 7000;
  src.buffer = buffer;
  src.connect(filter); filter.connect(gain); gain.connect(state.genGain);
  src.start(time); src.stop(time + .05);
}
function playSynth(time, step){
  const scale = [220,246.94,261.63,329.63,392,440];
  const osc = state.ctx.createOscillator();
  const lfo = state.ctx.createOscillator();
  const lfoGain = state.ctx.createGain();
  const filter = state.ctx.createBiquadFilter();
  const gain = envGain(time, .16, .22);
  osc.type = 'square';
  osc.frequency.value = scale[(step + Math.floor(step / 4)) % scale.length];
  lfo.frequency.value = 9;
  lfoGain.gain.value = 18;
  lfo.connect(lfoGain); lfoGain.connect(osc.frequency);
  filter.type = 'bandpass';
  filter.frequency.value = 900 + Math.abs(state.panMix) * 2500;
  filter.Q.value = 9;
  osc.connect(filter); filter.connect(gain); gain.connect(state.genGain);
  lfo.start(time); osc.start(time);
  lfo.stop(time + .22); osc.stop(time + .22);
}
function playGlitch(time){
  for(let i=0;i<4;i++){
    const osc = state.ctx.createOscillator();
    const gain = envGain(time + i * .025, .08, .035);
    osc.type = 'triangle';
    osc.frequency.value = 300 + Math.random() * 1200;
    osc.connect(gain); gain.connect(state.genGain);
    osc.start(time + i * .025); osc.stop(time + i * .025 + .04);
  }
}
function tick(){
  const t = state.ctx.currentTime + .025;
  if(state.layers.kick && state.step % 4 === 0) playKick(t);
  if(state.layers.bass && state.step % 4 !== 0) playBass(t, state.step);
  if(state.layers.hat && state.step % 2 === 0) playHat(t);
  if(state.layers.synth && state.step % 4 === 2) playSynth(t, state.step);
  if(state.layers.glitch && state.step % 16 === 15) playGlitch(t);
  setStatus(`gerador ON • step ${state.step + 1}/16 • ${state.bpm} BPM`);
  state.step = (state.step + 1) % 16;
  state.timer = setTimeout(tick, (60 / state.bpm / 4) * 1000);
}
function toggleGenerator(force){
  const shouldStart = typeof force === 'boolean' ? force : !state.timer;
  if(!shouldStart){ clearTimeout(state.timer); state.timer = null; setStatus('gerador pausado'); return; }
  if(!Object.values(state.layers).some(Boolean)){
    state.layers.kick = state.layers.bass = true;
    document.querySelector('[data-control="pad_a_1"]')?.classList.add('layer-on');
    document.querySelector('[data-control="pad_a_2"]')?.classList.add('layer-on');
  }
  clearTimeout(state.timer);
  state.step = 0;
  tick();
}
function toggleLayer(name, button){
  state.layers[name] = !state.layers[name];
  button?.classList.toggle('layer-on', state.layers[name]);
  setStatus(`${name} ${state.layers[name] ? 'ligado' : 'desligado'}`);
  if(Object.values(state.layers).some(Boolean) && !state.timer) toggleGenerator(true);
}

function triggerVoice({rate=1, start=0, dur=.9, loop=false}={}){
  if(!state.voiceBuffer){ synthHit(220); return null; }
  const src = state.ctx.createBufferSource();
  src.buffer = state.voiceBuffer;
  src.playbackRate.value = rate;
  src.loop = loop;
  src.connect(state.voiceFilter);
  const offset = Math.min(start, Math.max(0, state.voiceBuffer.duration - .1));
  if(loop){ src.start(); }
  else { src.start(0, offset, Math.min(dur, state.voiceBuffer.duration - offset)); }
  return src;
}
function toggleVoiceLoop(){
  if(state.voiceLoopOn){
    try{ state.voiceLoop?.stop(); }catch{}
    state.voiceLoop = null;
    state.voiceLoopOn = false;
    setStatus('voz loop pausada');
    return;
  }
  state.voiceLoop = triggerVoice({rate:.92,start:0,dur:1,loop:true});
  state.voiceLoopOn = true;
  setStatus('voz loop ligada');
}
function synthHit(freq=180, type='triangle'){
  const osc = state.ctx.createOscillator();
  const gain = envGain(state.ctx.currentTime, .075, .22);
  osc.type = type; osc.frequency.value = freq;
  osc.connect(gain); gain.connect(state.master);
  osc.start(); osc.stop(state.ctx.currentTime + .24);
}
function filterSweepVoice(){
  const now = state.ctx.currentTime;
  state.voiceFilter.frequency.cancelScheduledValues(now);
  state.voiceFilter.frequency.setValueAtTime(260, now);
  state.voiceFilter.frequency.exponentialRampToValueAtTime(9000, now + .7);
}
function delayHitVoice(){
  const now = state.ctx.currentTime;
  state.voiceDelay.delayTime.cancelScheduledValues(now);
  state.voiceFeedback.gain.cancelScheduledValues(now);
  state.voiceDelay.delayTime.setValueAtTime(.07, now);
  state.voiceDelay.delayTime.linearRampToValueAtTime(.25, now + .22);
  state.voiceFeedback.gain.setValueAtTime(.32, now);
  state.voiceFeedback.gain.linearRampToValueAtTime(0, now + .82);
}
function flashScreen(){ flash.style.opacity = 1; setTimeout(() => flash.style.opacity = 0, 110); }

async function applyControl(control){
  await setupAudio();
  await state.ctx.resume();
  const el = document.querySelector(`[data-control="${control}"]`);
  el?.classList.add('active-control');
  setTimeout(() => el?.classList.remove('active-control'), 180);

  switch(control){
    case 'play_a': case 'audio': toggleGenerator(); break;
    case 'pad_a_1': toggleLayer('kick', el); break;
    case 'pad_a_2': toggleLayer('bass', el); break;
    case 'pad_a_3': toggleLayer('hat', el); break;
    case 'pad_a_4': toggleLayer('synth', el); break;
    case 'pad_a_5': toggleLayer('glitch', el); datamosh(); break;
    case 'filter_a': state.bpm = state.bpm >= 155 ? 138 : state.bpm + 3; setStatus(`BPM ${state.bpm}`); break;
    case 'fx_a': playGlitch(state.ctx.currentTime + .02); setStatus('gerador glitch fill'); break;
    case 'level_a': state.volumeA = .85; document.querySelector('[data-control="volume_a"]').value = .85; applyMix(); updateFaderCap(document.querySelector('[data-control="volume_a"]')); setStatus('gerador level reset'); break;
    case 'pan_a': state.panMix = state.panMix < 0 ? .45 : -.45; document.querySelector('[data-control="pan_mix"]').value = state.panMix; applyMix(); updateFaderCap(document.querySelector('[data-control="pan_mix"]')); setStatus('pan gerativo'); break;

    case 'play_b': toggleVoiceLoop(); video.paused ? video.play().catch(()=>{}) : video.pause(); break;
    case 'pad_b_1': triggerVoice({rate:1,start:0,dur:1.2}); setStatus('VOZ 01'); break;
    case 'pad_b_2': triggerVoice({rate:.72,start:.25,dur:1.15}); delayHitVoice(); setStatus('VOZ 02'); break;
    case 'pad_b_3': triggerVoice({rate:1.35,start:.55,dur:.55}); datamosh(); setStatus('VOZ 03'); break;
    case 'pad_b_4': case 'visual': toggleAscii(); break;
    case 'pad_b_5': case 'camera': state.zoom = state.zoom > 1 ? 1 : 1.22; video.style.transform = `scale(${state.zoom})`; setStatus('zoom câmera'); break;
    case 'effect': datamosh(); setStatus('scan / frame travado'); break;
    case 'layer': state.braid = !state.braid; videoBox.classList.toggle('braid-texture', state.braid); setStatus(state.braid ? 'textura braid ligada' : 'textura braid desligada'); break;
    case 'video': video.paused ? video.play().catch(()=>{}) : video.pause(); setStatus(video.paused ? 'vídeo pausado' : 'vídeo tocando'); break;
    case 'light': flashScreen(); datamosh(); setStatus('light flash'); break;
    case 'midi': setStatus('MIDI pronto para mapear'); break;
    case 'filter_b': filterSweepVoice(); setStatus('filter voz'); break;
    case 'fx_b': delayHitVoice(); setStatus('delay voz'); break;
    case 'level_b': state.volumeB = .82; document.querySelector('[data-control="volume_b"]').value = .82; applyMix(); updateFaderCap(document.querySelector('[data-control="volume_b"]')); setStatus('voz level reset'); break;
    case 'pan_b': state.panMix = state.panMix > 0 ? -.45 : .45; document.querySelector('[data-control="pan_mix"]').value = state.panMix; applyMix(); updateFaderCap(document.querySelector('[data-control="pan_mix"]')); setStatus('pan voz'); break;
    case 'cue_a': state.step = 0; setStatus('cue gerador'); break;
    case 'cue_b': if(state.voiceLoopOn) toggleVoiceLoop(); video.currentTime = 0; setStatus('cue voz/vídeo'); break;
    case 'sync_a': case 'sync_b': state.bpm = 145; video.playbackRate = 1; setStatus('sync 145 BPM'); break;
    case 'shift_a': case 'shift_b': setStatus('shift'); break;
  }
}

function applyMix(){
  if(!state.ready) return;
  const crossA = 1 - ((state.cross + 1) / 2);
  const crossB = (state.cross + 1) / 2;
  state.genGain.gain.setTargetAtTime(state.volumeA * crossA, state.ctx.currentTime, .015);
  state.voiceGain.gain.setTargetAtTime(state.volumeB * crossB, state.ctx.currentTime, .015);
}
function updateFaderCap(input){
  const fader = input?.closest('.fader');
  const cap = fader?.querySelector('span');
  if(!cap) return;
  const min = parseFloat(input.min || 0), max = parseFloat(input.max || 1), value = parseFloat(input.value);
  const percent = (value - min) / (max - min);
  const trackTop = 18, trackBottom = 38;
  const usable = fader.clientHeight - trackTop - trackBottom - cap.offsetHeight;
  cap.style.top = `${trackTop + (1 - percent) * usable}px`;
}
function updateCrossCap(){
  const cap = $('.cross i'), cross = $('.cross');
  if(!cap || !cross) return;
  const percent = (state.cross + 1) / 2;
  const left = 58, right = 58;
  const usable = cross.clientWidth - left - right;
  cap.style.left = `${left + percent * usable}px`;
}
function handleSlider(control, raw){
  setupAudio();
  const v = parseFloat(raw);
  if(control === 'volume_a') state.volumeA = v;
  if(control === 'volume_b') state.volumeB = v;
  if(control === 'pan_mix') state.panMix = v;
  if(control === 'crossfader') state.cross = v;
  if(['volume_a','volume_b','pan_mix','crossfader'].includes(control)) applyMix();
  if(control === 'video_fx'){
    state.videoFx = v;
    videoBox.classList.toggle('distorted', v > .08);
    video.style.filter = `contrast(${1 + v * .9}) saturate(${1 + v * 1.2}) blur(${v * 2}px)`;
  }
  const input = document.querySelector(`[data-control="${control}"]`);
  if(input?.closest('.fader')) updateFaderCap(input);
  if(control === 'crossfader') updateCrossCap();
}
function toggleAscii(){ state.ascii = !state.ascii; asciiCanvas.style.opacity = state.ascii ? .86 : 0; setStatus(state.ascii ? 'ASCII ligado' : 'ASCII desligado'); }
function datamosh(){
  videoBox.classList.add('glitch-rgb');
  const wasPaused = video.paused;
  video.pause(); clearTimeout(state.freezeTimer);
  state.freezeTimer = setTimeout(() => { videoBox.classList.remove('glitch-rgb'); if(!wasPaused) video.play().catch(()=>{}); }, 520);
}
function renderAscii(){
  if(!state.ascii || video.readyState < 2) return;
  const w = asciiCanvas.width = Math.max(120, Math.floor(videoBox.clientWidth / 7));
  const h = asciiCanvas.height = Math.max(60, Math.floor(videoBox.clientHeight / 7));
  asciiCtx.drawImage(video, 0, 0, w, h);
  const img = asciiCtx.getImageData(0, 0, w, h);
  asciiCtx.clearRect(0, 0, w, h);
  asciiCtx.font = '7px monospace'; asciiCtx.fillStyle = '#3BD67C';
  const chars = ' .:-=+*#%@';
  for(let y = 0; y < h; y += 2){
    for(let x = 0; x < w; x++){
      const i = (y * w + x) * 4;
      const lum = (img.data[i] + img.data[i + 1] + img.data[i + 2]) / 3;
      asciiCtx.fillText(chars[Math.floor((lum / 255) * (chars.length - 1))], x, y);
    }
  }
}
function setRangeValue(input, value){
  const min = parseFloat(input.min || 0), max = parseFloat(input.max || 1), step = parseFloat(input.step || .01);
  const snapped = Math.round(clamp(value, min, max) / step) * step;
  input.value = clamp(snapped, min, max);
  handleSlider(input.dataset.control, input.value);
}
function bindVerticalFader(fader){
  const input = fader.querySelector('input[type="range"]'); if(!input) return;
  let dragging = false;
  const drag = (event) => {
    const rect = fader.getBoundingClientRect();
    const y = clamp(event.clientY - rect.top, 0, rect.height);
    const percent = 1 - (y / rect.height);
    const min = parseFloat(input.min || 0), max = parseFloat(input.max || 1);
    setRangeValue(input, min + percent * (max - min));
  };
  fader.addEventListener('pointerdown', (event) => { event.preventDefault(); dragging = true; fader.classList.add('is-dragging'); fader.setPointerCapture?.(event.pointerId); drag(event); });
  fader.addEventListener('pointermove', (event) => { if(dragging) drag(event); });
  const stop = (event) => { dragging = false; fader.classList.remove('is-dragging'); try{ fader.releasePointerCapture?.(event.pointerId); }catch{} };
  fader.addEventListener('pointerup', stop); fader.addEventListener('pointercancel', stop); fader.addEventListener('lostpointercapture', () => { dragging = false; fader.classList.remove('is-dragging'); });
}
function bindHorizontalCrossfader(cross){
  const input = cross.querySelector('input[type="range"]'); if(!input) return;
  let dragging = false;
  const drag = (event) => {
    const rect = cross.getBoundingClientRect();
    const x = clamp(event.clientX - rect.left, 0, rect.width);
    setRangeValue(input, -1 + (x / rect.width) * 2);
  };
  cross.addEventListener('pointerdown', (event) => { event.preventDefault(); dragging = true; cross.classList.add('is-dragging'); cross.setPointerCapture?.(event.pointerId); drag(event); });
  cross.addEventListener('pointermove', (event) => { if(dragging) drag(event); });
  const stop = (event) => { dragging = false; cross.classList.remove('is-dragging'); try{ cross.releasePointerCapture?.(event.pointerId); }catch{} };
  cross.addEventListener('pointerup', stop); cross.addEventListener('pointercancel', stop); cross.addEventListener('lostpointercapture', () => { dragging = false; cross.classList.remove('is-dragging'); });
}

document.querySelectorAll('[data-control]').forEach((el) => {
  const control = el.dataset.control;
  if(el.type === 'range'){
    el.addEventListener('input', (event) => handleSlider(control, event.target.value));
    updateFaderCap(el);
  }else{
    el.addEventListener('pointerdown', () => applyControl(control));
  }
});
document.querySelectorAll('.fader').forEach(bindVerticalFader);
document.querySelectorAll('.cross').forEach(bindHorizontalCrossfader);
updateCrossCap();

startButton.addEventListener('click', async () => { await setupAudio(); await state.ctx.resume(); video.play().catch(()=>{}); setStatus('controladora ligada'); });
mainPlay.addEventListener('click', async () => { await setupAudio(); video.paused ? video.play().catch(()=>{}) : video.pause(); });
video.addEventListener('timeupdate', () => { progressFill.style.width = `${video.duration ? (video.currentTime / video.duration) * 100 : 0}%`; timeLabel.textContent = `${fmt(video.currentTime)} / ${fmt(video.duration)}`; });
video.addEventListener('loadedmetadata', () => { timeLabel.textContent = `00:00 / ${fmt(video.duration)}`; });
(function loop(){ requestAnimationFrame(loop); renderAscii(); })();

/* LOJA */
const cart=[];
let currentProduct=null;
const money=v=>v.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const overlay=document.getElementById('overlay');
const drawer=document.getElementById('cartDrawer');
const modal=document.getElementById('productModal');
const shipping=document.getElementById('shipping');
const payment=document.getElementById('payment');

function extraFromText(text){ const pos=text.indexOf('+ R$'); if(pos<0)return 0; return Number(text.slice(pos+4).trim()) || 0; }
function baseData(el){return {id:el.dataset.id,title:el.dataset.title,price:Number(el.dataset.price),img:el.dataset.img,desc:el.dataset.desc,options:el.dataset.options.split('|')}}
function openOverlay(){overlay.classList.add('open')}
function closeAll(){overlay.classList.remove('open');drawer.classList.remove('open');modal.classList.remove('open')}
function openCart(){openOverlay();drawer.classList.add('open')}
function openProduct(el){
  currentProduct=baseData(el);
  document.getElementById('modalImg').src=currentProduct.img;
  document.getElementById('modalImg').alt=currentProduct.title;
  document.getElementById('modalTitle').textContent=currentProduct.title;
  document.getElementById('modalDesc').textContent=currentProduct.desc;
  document.getElementById('modalPrice').textContent=money(currentProduct.price);
  document.getElementById('modalQty').value=1;
  const select=document.getElementById('modalVariant');
  select.innerHTML='';
  currentProduct.options.forEach(opt=>{const option=document.createElement('option');option.textContent=opt;select.appendChild(option)});
  openOverlay();modal.classList.add('open')
}
function addItem(product,variant,qty){
  const price=product.price+extraFromText(variant);
  const id=product.id+'-'+variant;
  const existing=cart.find(item=>item.id===id);
  if(existing)existing.qty+=qty;else cart.push({id,title:product.title,img:product.img,variant,price,qty});
  renderCart();openCart()
}
function renderCart(){
  const area=document.getElementById('cartItems');area.innerHTML='';
  if(cart.length===0)area.innerHTML='<p style="opacity:.8;padding:20px 0">seu carrinho está vazio.</p>';
  cart.forEach(item=>{const row=document.createElement('div');row.className='cart-item';row.innerHTML='<img src="'+item.img+'" alt="'+item.title+'"><div><h3>'+item.title+'</h3><p>'+item.variant+'</p><p>'+money(item.price)+' cada</p><p>quantidade: '+item.qty+'</p><button type="button" data-remove="'+item.id+'">remover</button></div><strong>'+money(item.price*item.qty)+'</strong>';area.appendChild(row)});
  document.querySelectorAll('[data-remove]').forEach(btn=>btn.onclick=()=>{const i=cart.findIndex(item=>item.id===btn.dataset.remove);if(i>=0)cart.splice(i,1);renderCart()});
  updateTotals()
}
function updateTotals(){
  const subtotal=cart.reduce((s,item)=>s+item.price*item.qty,0);
  const ship=subtotal>0?Number(shipping.value):0;
  const total=subtotal+ship;
  document.getElementById('cartCount').textContent=cart.reduce((s,item)=>s+item.qty,0);
  document.getElementById('subtotal').textContent=money(subtotal);
  document.getElementById('frete').textContent=money(ship);
  document.getElementById('total').textContent=money(total);
  document.getElementById('deliveryTime').textContent='tempo estimado: '+(subtotal>0?shipping.selectedOptions[0].dataset.days:'—');
  document.getElementById('pixCode').textContent='PIX-FADAISI-'+total.toFixed(2).replace('.','-')
}
function updatePayment(){
  document.getElementById('pixBox').classList.toggle('show',payment.value==='pix');
  document.getElementById('cardBox').classList.toggle('show',payment.value==='card');
  document.getElementById('boletoBox').classList.toggle('show',payment.value==='boleto')
}
document.querySelectorAll('.product-card').forEach(btn=>btn.onclick=()=>openProduct(btn.closest('.product')));
document.querySelectorAll('.buy').forEach(btn=>btn.onclick=()=>openProduct(btn.closest('.product')));
document.getElementById('modalAdd').onclick=()=>addItem(currentProduct,document.getElementById('modalVariant').value,Number(document.getElementById('modalQty').value)||1);
document.getElementById('openCart').onclick=openCart;
document.getElementById('closeCart').onclick=closeAll;
document.getElementById('closeModal').onclick=closeAll;
overlay.onclick=closeAll;
shipping.onchange=updateTotals;
payment.onchange=updatePayment;
document.getElementById('clearCart').onclick=()=>{cart.length=0;renderCart()};
document.getElementById('finish').onclick=()=>alert(cart.length?'pedido simulado criado. agora conecte gateway real de pagamento.':'adicione um produto antes de finalizar.');
renderCart();
