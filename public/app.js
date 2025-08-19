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
  },
  inscriptions: null // different UI, no envelopes animation
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
const tabInscBtn = document.getElementById('tab-btn-inscriptions');
const tabEmails = document.getElementById('tab-emails');
const tabImages = document.getElementById('tab-images');
const tabInsc = document.getElementById('tab-inscriptions');

let activeQueue = 'emails';
const countsByQueue = {
  emails: { published: 0, consuming: 0, acked: 0 },
  images: { published: 0, consuming: 0, acked: 0 },
  inscriptions: { published: 0, consuming: 0, acked: 0 }
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
  // only animate for queues with lanes
  if (stages[queue]?.producer && stages[queue]?.queue) {
    const env = createEnvelope(id, queue);
    stages[queue].producer.appendChild(env);
    setTimeout(() => moveToStage(env, stages[queue].queue), 200 + Math.random() * 400);
  }
});

socket.on('consuming', ({ queue = 'emails', id }) => {
  const counts = countsByQueue[queue];
  counts.consuming++;
  if (queue === activeQueue) updateStats();
  if (stages[queue]?.consumers) {
    const env = findEnvelope(id, queue);
    if (env) moveToStage(env, stages[queue].consumers);
  }
});

socket.on('acked', ({ queue = 'emails', id }) => {
  const counts = countsByQueue[queue];
  counts.acked++;
  counts.consuming = Math.max(0, counts.consuming - 1);
  if (queue === activeQueue) updateStats();
  if (stages[queue]) {
    const env = findEnvelope(id, queue);
    if (env) env.remove();
  }
  // update inscriptions progress
  if (queue === 'inscriptions') updateInscriptionsBars();
});

socket.on('error-event', ({ message }) => {
  console.warn(message);
});

// telemetry
socket.on('cpu', ({ usage, inFlight, queueDepth, workIntensity, inFlightByQ, queueDepthByQ }) => {
  if (cpuFill) cpuFill.style.width = `${usage}%`;
  if (cpuLabel) cpuLabel.textContent = `${usage}%`;
  if (inflightEl) inflightEl.textContent = inFlight;
  if (qdepthEl) qdepthEl.textContent = queueDepth;
  if (typeof workIntensity === 'number' && intensityRange) {
    intensityRange.value = workIntensity.toFixed(2);
    if (intensityVal) intensityVal.textContent = Number(workIntensity).toFixed(2);
  }
  // inscriptions mini cpu
  if (cpuMiniFill) cpuMiniFill.style.width = `${usage}%`;
  if (cpuMiniLabel) cpuMiniLabel.textContent = `${usage}%`;
  handleCpuSpike(usage);
  currentQueueDepthInsc = queueDepthByQ?.inscriptions ?? currentQueueDepthInsc;
  updateInscriptionsBars();
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
  if (activeQueueLabel) activeQueueLabel.textContent = q === 'images' ? 'Images' : (q === 'inscriptions' ? 'Inscriptions' : 'Emails');
  // toggle content
  if (q === 'emails') {
    tabEmails?.classList.remove('hidden');
    tabImages?.classList.add('hidden');
    tabInsc?.classList.add('hidden');
    tabEmailsBtn?.classList.add('active');
    tabImagesBtn?.classList.remove('active');
    tabInscBtn?.classList.remove('active');
  } else {
    if (q === 'images') {
      tabImages?.classList.remove('hidden');
      tabEmails?.classList.add('hidden');
      tabInsc?.classList.add('hidden');
      tabImagesBtn?.classList.add('active');
      tabEmailsBtn?.classList.remove('active');
      tabInscBtn?.classList.remove('active');
    } else {
      tabInsc?.classList.remove('hidden');
      tabEmails?.classList.add('hidden');
      tabImages?.classList.add('hidden');
      tabInscBtn?.classList.add('active');
      tabEmailsBtn?.classList.remove('active');
      tabImagesBtn?.classList.remove('active');
    }
  }
  updateStats();
}

tabEmailsBtn?.addEventListener('click', () => setActiveQueue('emails'));
tabImagesBtn?.addEventListener('click', () => setActiveQueue('images'));
tabInscBtn?.addEventListener('click', () => setActiveQueue('inscriptions'));

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

async function publishTo(queue, count) {
  const res = await fetch('/api/publish', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ count, queue })
  });
  const data = await res.json();
  if (!data.ok) alert('Publish failed: ' + data.error);
  return data;
}

// initialize
setActiveQueue('emails');

// ===== Inscriptions Tab Logic =====
// elements
const inscTotalInput = document.getElementById('insc-total');
const inscBatchInput = document.getElementById('insc-batch');
const inscIntervalInput = document.getElementById('insc-interval');
const inscStartBtn = document.getElementById('insc-start');
const inscStopBtn = document.getElementById('insc-stop');
const inscOnceBtn = document.getElementById('insc-once');
const inscResetBtn = document.getElementById('insc-reset');

const barReleased = document.getElementById('bar-released');
const barReleasedLabel = document.getElementById('bar-released-label');
const barProcessed = document.getElementById('bar-processed');
const barProcessedLabel = document.getElementById('bar-processed-label');
const barQueue = document.getElementById('bar-queue');
const barQueueLabel = document.getElementById('bar-queue-label');

const cpuMiniFill = document.getElementById('cpu-mini-fill');
const cpuMiniLabel = document.getElementById('cpu-mini-label');
const spikesList = document.getElementById('spikes-list');
const spikeThresholdInput = document.getElementById('spike-threshold');
const spikesClearBtn = document.getElementById('spikes-clear');

let inscTimer = null;
let releasedInsc = 0;
let currentQueueDepthInsc = 0;
let spikes = [];

function pct(part, total) {
  if (!total || total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((part / total) * 100)));
}

function updateInscriptionsBars() {
  const total = Number(inscTotalInput?.value || 0);
  const releasedPct = pct(releasedInsc, total);
  const processed = countsByQueue.inscriptions.acked;
  const processedPct = pct(processed, total);
  const queuePct = pct(currentQueueDepthInsc, total);
  if (barReleased) barReleased.style.width = releasedPct + '%';
  if (barReleasedLabel) barReleasedLabel.textContent = releasedPct + '%';
  if (barProcessed) barProcessed.style.width = processedPct + '%';
  if (barProcessedLabel) barProcessedLabel.textContent = processedPct + '%';
  if (barQueue) barQueue.style.width = queuePct + '%';
  if (barQueueLabel) barQueueLabel.textContent = queuePct + '%';
}

function handleCpuSpike(usage) {
  const threshold = Number(spikeThresholdInput?.value || 85);
  if (usage >= threshold) {
    const item = { t: new Date().toLocaleTimeString(), usage };
    spikes.push(item);
    if (spikes.length > 50) spikes.shift();
    if (spikesList) {
      const li = document.createElement('li');
      li.textContent = `${item.t} — ${usage}%`;
      spikesList.appendChild(li);
    }
  }
}

spikesClearBtn?.addEventListener('click', () => {
  spikes = [];
  if (spikesList) spikesList.innerHTML = '';
});

function startBatching() {
  stopBatching();
  const total = Number(inscTotalInput?.value || 0);
  const batch = Number(inscBatchInput?.value || 0);
  const intervalSec = Math.max(1, Number(inscIntervalInput?.value || 5));
  if (!total || !batch) return;
  inscTimer = setInterval(async () => {
    if (releasedInsc >= total) {
      stopBatching();
      return;
    }
    const remaining = total - releasedInsc;
    const count = Math.min(batch, remaining);
    await publishTo('inscriptions', count);
    releasedInsc += count;
    updateInscriptionsBars();
  }, intervalSec * 1000);
}

function stopBatching() {
  if (inscTimer) {
    clearInterval(inscTimer);
    inscTimer = null;
  }
}

inscStartBtn?.addEventListener('click', startBatching);
inscStopBtn?.addEventListener('click', stopBatching);
inscOnceBtn?.addEventListener('click', async () => {
  const total = Number(inscTotalInput?.value || 0);
  const batch = Number(inscBatchInput?.value || 0);
  if (!total || !batch) return;
  const remaining = Math.max(0, total - releasedInsc);
  const count = Math.min(batch, remaining || batch);
  await publishTo('inscriptions', count);
  releasedInsc += count;
  updateInscriptionsBars();
});

inscResetBtn?.addEventListener('click', () => {
  stopBatching();
  releasedInsc = 0;
  countsByQueue.inscriptions = { published: 0, consuming: 0, acked: 0 };
  updateStats();
  updateInscriptionsBars();
  // clear spikes visuals (optional)
  spikes = [];
  if (spikesList) spikesList.innerHTML = '';
});

