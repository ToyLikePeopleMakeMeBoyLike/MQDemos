require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const amqp = require('amqplib');

const PORT = process.env.PORT || 3000;
const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672';
const QUEUE = process.env.QUEUE || 'emails';
const QUEUE_IMAGES = process.env.QUEUE_IMAGES || 'images';
const QUEUE_INSCRIPTIONS = process.env.QUEUE_INSCRIPTIONS || 'inscriptions';

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*'} });

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

let channel;
let connection;
let publishedCount = 0;
let consumedCount = 0;
let ackedCount = 0;
let inFlight = 0; // total in-flight
let queueDepth = 0; // total queue depth observed
const inFlightByQ = { emails: 0, images: 0, inscriptions: 0 };
const queueDepthByQ = { emails: 0, images: 0, inscriptions: 0 };
let workIntensity = 0.5; // 0..1, controlled from UI

async function setupRabbit() {
  connection = await amqp.connect(RABBITMQ_URL);
  connection.on('error', (e) => console.error('RabbitMQ connection error:', e.message));
  connection.on('close', () => {
    console.warn('RabbitMQ connection closed');
    channel = undefined;
  });
  channel = await connection.createChannel();
  await channel.assertQueue(QUEUE, { durable: false });
  await channel.assertQueue(QUEUE_IMAGES, { durable: false });
  await channel.assertQueue(QUEUE_INSCRIPTIONS, { durable: false });
  await channel.prefetch(10);

  async function consumeQueue(qname, label) {
    await channel.consume(qname, async (msg) => {
      if (!msg) return;
      try {
        const content = JSON.parse(msg.content.toString());
        consumedCount++;
        inFlight++;
        inFlightByQ[label] = (inFlightByQ[label] || 0) + 1;
        io.emit('consuming', { queue: label, id: content.id, subject: content.subject });

        // simulate processing time
        const base = 200;
        const variable = 1200;
        const intensityFactor = 0.2 + workIntensity * 1.2; // 0.2..1.4
        const delay = base + Math.floor(Math.random() * variable * intensityFactor);
        await new Promise((res) => setTimeout(res, delay));

        channel.ack(msg);
        ackedCount++;
        inFlight = Math.max(0, inFlight - 1);
        inFlightByQ[label] = Math.max(0, (inFlightByQ[label] || 0) - 1);
        io.emit('acked', { queue: label, id: content.id });
      } catch (err) {
        console.error('Consumer error:', err);
        channel.nack(msg, false, false); // drop bad message
        io.emit('error-event', { message: 'Consumer error, message dropped.' });
      }
    });
  }

  await consumeQueue(QUEUE, 'emails');
  await consumeQueue(QUEUE_IMAGES, 'images');
  await consumeQueue(QUEUE_INSCRIPTIONS, 'inscriptions');
}

async function connectWithRetry({ tries = 0 } = {}) {
  const maxDelay = 5000;
  const delay = Math.min(300 + tries * 700, maxDelay);
  try {
    await setupRabbit();
    console.log('Connected to RabbitMQ:', RABBITMQ_URL);
  } catch (e) {
    console.error('RabbitMQ connect failed:', e.message);
    console.log(`Retrying in ${delay}ms...`);
    setTimeout(() => connectWithRetry({ tries: tries + 1 }), delay);
  }
}

// Publish single or batch
app.post('/api/publish', async (req, res) => {
  try {
    const { count = 1, queue: q = 'emails' } = req.body || {};
    if (!channel) {
      return res.status(503).json({ ok: false, error: 'Not connected to RabbitMQ. Ensure the RabbitMQ service is running on localhost:5672.' });
    }
    const published = [];
    for (let i = 0; i < count; i++) {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const msg = {
        id,
        subject:
          q === 'images'
            ? `Image Task #${(publishedCount + 1).toString().padStart(3, '0')}`
            : q === 'inscriptions'
              ? `Registration Request #${(publishedCount + 1).toString().padStart(3, '0')}`
              : `Newsletter #${(publishedCount + 1).toString().padStart(3, '0')}`,
        createdAt: Date.now()
      };
      const qname = q === 'images' ? QUEUE_IMAGES : q === 'inscriptions' ? QUEUE_INSCRIPTIONS : QUEUE;
      const ok = channel.sendToQueue(qname, Buffer.from(JSON.stringify(msg)), { persistent: false });
      if (ok) {
        publishedCount++;
        published.push(msg);
        io.emit('published', { queue: q, id: msg.id, subject: msg.subject });
      }
    }
    res.json({ ok: true, published: published.length });
  } catch (err) {
    console.error('Publish error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// health
app.get('/api/metrics', (req, res) => {
  res.json({ publishedCount, consumedCount, ackedCount });
});

io.on('connection', (socket) => {
  socket.emit('hello', { message: 'Connected to RabbitMQ visualizer' });
  socket.emit('settings', { workIntensity });

  socket.on('setIntensity', (val) => {
    const n = Number(val);
    if (!Number.isFinite(n)) return;
    workIntensity = Math.max(0, Math.min(1, n));
    io.emit('settings', { workIntensity });
  });
});

server.listen(PORT, async () => {
  console.log(`Server listening on http://localhost:${PORT}`);
  // try to connect and keep retrying until the local RabbitMQ service is reachable
  connectWithRetry();

  // Poll queue depth periodically when connected
  setInterval(async () => {
    if (!channel) return;
    try {
      const q1 = await channel.checkQueue(QUEUE);
      const q2 = await channel.checkQueue(QUEUE_IMAGES);
      const q3 = await channel.checkQueue(QUEUE_INSCRIPTIONS);
      queueDepthByQ.emails = q1.messageCount || 0;
      queueDepthByQ.images = q2.messageCount || 0;
      queueDepthByQ.inscriptions = q3.messageCount || 0;
      queueDepth = (queueDepthByQ.emails || 0) + (queueDepthByQ.images || 0) + (queueDepthByQ.inscriptions || 0);
    } catch {}
  }, 1500);

  // Simulate CPU usage and broadcast every second
  setInterval(() => {
    // Simple model: base + inFlight * factor + queueDepth * small factor + noise, scaled by intensity
    const base = 8;
    const usage = Math.max(
      0,
      Math.min(
        100,
        base + (inFlight * 12 + queueDepth * 0.2) * (0.4 + workIntensity) + (Math.random() * 8 - 4)
      )
    );
    io.emit('cpu', {
      usage: Math.round(usage),
      inFlight,
      queueDepth,
      workIntensity,
      inFlightByQ,
      queueDepthByQ
    });
  }, 1000);
});
