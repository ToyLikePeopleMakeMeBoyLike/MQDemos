const socket = io();

const stageProducer = document.getElementById('stage-producer');
const stageQueue = document.getElementById('stage-queue');
const stageConsumers = document.getElementById('stage-consumers');

const publishedEl = document.getElementById('published');
const consumingEl = document.getElementById('consuming');
const ackedEl = document.getElementById('acked');
const cpuFill = document.getElementById('cpu-fill');
const cpuLabel = document.getElementById('cpu-label');
const inflightEl = document.getElementById('inflight');
const qdepthEl = document.getElementById('qdepth');
const intensityRange = document.getElementById('intensity');
const intensityVal = document.getElementById('intensity-val');

let counts = { published: 0, consuming: 0, acked: 0 };

function updateStats() {
  publishedEl.textContent = counts.published;
  consumingEl.textContent = counts.consuming;
  ackedEl.textContent = counts.acked;
}

function createEnvelope(id, label) {
  const el = document.createElement('div');
  el.className = 'envelope';
  el.dataset.id = id;
  el.innerHTML = `<span>✉️</span>`;
  positionRandom(el);
  return el;
}

function positionRandom(el) {
  const pad = 12;
  const maxX = (el.parentElement?.clientWidth || 280) - 36 - pad;
  const maxY = (el.parentElement?.clientHeight || 380) - 26 - pad;
  el.style.left = pad + Math.floor(Math.random() * Math.max(1, maxX)) + 'px';
  el.style.top = pad + Math.floor(Math.random() * Math.max(1, maxY)) + 'px';
}

function moveToStage(el, stage) {
  stage.appendChild(el);
  // re-randomize position in new stage after a tick
  requestAnimationFrame(() => positionRandom(el));
}

function findEnvelope(id) {
  return document.querySelector(`.envelope[data-id="${id}"]`);
}

socket.on('hello', () => {});

socket.on('published', ({ id, subject }) => {
  counts.published++;
  updateStats();
  const env = createEnvelope(id, subject);
  stageProducer.appendChild(env);
  setTimeout(() => moveToStage(env, stageQueue), 200 + Math.random() * 400);
});

socket.on('consuming', ({ id }) => {
  counts.consuming++;
  updateStats();
  const env = findEnvelope(id);
  if (env) moveToStage(env, stageConsumers);
});

socket.on('acked', ({ id }) => {
  counts.acked++;
  counts.consuming = Math.max(0, counts.consuming - 1);
  updateStats();
  const env = findEnvelope(id);
  if (env) env.remove();
});

socket.on('error-event', ({ message }) => {
  console.warn(message);
});

// telemetry
socket.on('cpu', ({ usage, inFlight, queueDepth, workIntensity }) => {
  if (cpuFill) cpuFill.style.width = `${usage}%`;
  if (cpuLabel) cpuLabel.textContent = `${usage}%`;
  if (inflightEl) inflightEl.textContent = inFlight;
  if (qdepthEl) qdepthEl.textContent = queueDepth;
  if (typeof workIntensity === 'number' && intensityRange) {
    intensityRange.value = workIntensity.toFixed(2);
    if (intensityVal) intensityVal.textContent = Number(workIntensity).toFixed(2);
  }
});

socket.on('settings', ({ workIntensity }) => {
  if (typeof workIntensity === 'number' && intensityRange) {
    intensityRange.value = workIntensity.toFixed(2);
    if (intensityVal) intensityVal.textContent = Number(workIntensity).toFixed(2);
  }
});

if (intensityRange) {
  intensityRange.addEventListener('input', (e) => {
    const v = Number(e.target.value);
    if (intensityVal) intensityVal.textContent = v.toFixed(2);
    socket.emit('setIntensity', v);
  });
}

// controls
const sendBatchBtn = document.getElementById('sendBatch');
const sendSmallBtn = document.getElementById('sendSmall');
const countInput = document.getElementById('count');

async function publish(count) {
  const res = await fetch('/api/publish', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ count })
  });
  const data = await res.json();
  if (!data.ok) alert('Publish failed: ' + data.error);
}

sendBatchBtn.addEventListener('click', () => publish(parseInt(countInput.value || '1', 10)));
sendSmallBtn.addEventListener('click', () => publish(10));
