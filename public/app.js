const socket = io();

// stages per queue
const stages = {
  emails: {
    producer: document.getElementById('emails-stage-producer'),
    queue: document.getElementById('emails-stage-queue'),
    consumers: document.getElementById('emails-stage-consumers')
  },
  images: {
    producer: document.getElementById('images-stage-producer'),
    queue: document.getElementById('images-stage-queue'),
    consumers: document.getElementById('images-stage-consumers')
  }
};

const publishedEl = document.getElementById('published');
const consumingEl = document.getElementById('consuming');
const ackedEl = document.getElementById('acked');
const cpuFill = document.getElementById('cpu-fill');
const cpuLabel = document.getElementById('cpu-label');
const inflightEl = document.getElementById('inflight');
const qdepthEl = document.getElementById('qdepth');
const intensityRange = document.getElementById('intensity');
const intensityVal = document.getElementById('intensity-val');
const activeQueueLabel = document.getElementById('active-queue-label');
const tabEmailsBtn = document.getElementById('tab-btn-emails');
const tabImagesBtn = document.getElementById('tab-btn-images');
const tabEmails = document.getElementById('tab-emails');
const tabImages = document.getElementById('tab-images');

let activeQueue = 'emails';
const countsByQueue = {
  emails: { published: 0, consuming: 0, acked: 0 },
  images: { published: 0, consuming: 0, acked: 0 }
};

function updateStats() {
  const c = countsByQueue[activeQueue];
  publishedEl.textContent = c.published;
  consumingEl.textContent = c.consuming;
  ackedEl.textContent = c.acked;
}

function createEnvelope(id, queue) {
  const el = document.createElement('div');
  el.className = 'envelope';
  el.dataset.id = id;
  el.dataset.queue = queue;
  const icon = queue === 'images' ? '🖼️' : '✉️';
  el.innerHTML = `<span>${icon}</span>`;
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

function findEnvelope(id, queue) {
  return document.querySelector(`.envelope[data-id="${id}"][data-queue="${queue}"]`);
}

socket.on('hello', () => {});

socket.on('published', ({ queue = 'emails', id }) => {
  const counts = countsByQueue[queue];
  counts.published++;
  if (queue === activeQueue) updateStats();
  const env = createEnvelope(id, queue);
  stages[queue].producer.appendChild(env);
  setTimeout(() => moveToStage(env, stages[queue].queue), 200 + Math.random() * 400);
});

socket.on('consuming', ({ queue = 'emails', id }) => {
  const counts = countsByQueue[queue];
  counts.consuming++;
  if (queue === activeQueue) updateStats();
  const env = findEnvelope(id, queue);
  if (env) moveToStage(env, stages[queue].consumers);
});

socket.on('acked', ({ queue = 'emails', id }) => {
  const counts = countsByQueue[queue];
  counts.acked++;
  counts.consuming = Math.max(0, counts.consuming - 1);
  if (queue === activeQueue) updateStats();
  const env = findEnvelope(id, queue);
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

// tab switching
function setActiveQueue(q) {
  activeQueue = q;
  if (activeQueueLabel) activeQueueLabel.textContent = q === 'images' ? 'Images' : 'Emails';
  // toggle content
  if (q === 'emails') {
    tabEmails?.classList.remove('hidden');
    tabImages?.classList.add('hidden');
    tabEmailsBtn?.classList.add('active');
    tabImagesBtn?.classList.remove('active');
  } else {
    tabImages?.classList.remove('hidden');
    tabEmails?.classList.add('hidden');
    tabImagesBtn?.classList.add('active');
    tabEmailsBtn?.classList.remove('active');
  }
  updateStats();
}

tabEmailsBtn?.addEventListener('click', () => setActiveQueue('emails'));
tabImagesBtn?.addEventListener('click', () => setActiveQueue('images'));

// controls
const sendBatchBtn = document.getElementById('sendBatch');
const sendSmallBtn = document.getElementById('sendSmall');
const countInput = document.getElementById('count');

async function publish(count) {
  const res = await fetch('/api/publish', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ count, queue: activeQueue })
  });
  const data = await res.json();
  if (!data.ok) alert('Publish failed: ' + data.error);
}

sendBatchBtn.addEventListener('click', () => publish(parseInt(countInput.value || '1', 10)));
sendSmallBtn.addEventListener('click', () => publish(10));

// initialize
setActiveQueue('emails');
