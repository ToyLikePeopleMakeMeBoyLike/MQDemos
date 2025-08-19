# RabbitMQ Email Visualizer (no Docker)

A tiny Node.js + Express + Socket.IO app that visualizes emails flowing through RabbitMQ: Producer → Queue → Consumers. Envelopes animate as messages are published, consumed, and acked.

## What you'll see
- Producer shows newly published envelopes
- Queue holds envelopes briefly
- Consumers pull envelopes, process for a short random delay, then ack and remove them
- Live counters for Published / Consuming / Acked

## Prereqs (Windows, no Docker)
1. Install Erlang/OTP (required by RabbitMQ)
   - https://www.erlang.org/downloads
2. Install RabbitMQ (Windows installer)
   - https://www.rabbitmq.com/install-windows.html
   - By default, it runs a Windows service listening on AMQP 5672 and Management UI 15672.
3. Start/verify RabbitMQ service
   - Open Services app → start "RabbitMQ" if not running
   - Visit http://localhost:15672 (user: guest, pass: guest)

## Configure app
The defaults are already set for local RabbitMQ.
- `.env`:
```
RABBITMQ_URL=amqp://guest:guest@localhost:5672
QUEUE=emails
PORT=3000
```

## Run
```bash
npm i
npm start
```
Open http://localhost:3000

Use the UI buttons:
- "Send 10" or set a number and click "Send Batch"
- Optionally open the RabbitMQ UI at http://localhost:15672 to see queue `emails`

## Troubleshooting
- Connection error in server on startup
  - Ensure RabbitMQ Windows service is running
  - Check firewall is not blocking 5672
- Cannot open Management UI at 15672
  - Re-run the RabbitMQ installer or enable the management plugin (usually enabled by default on Windows). From an elevated RabbitMQ command prompt: `rabbitmq-plugins enable rabbitmq_management`
- Stuck envelopes / high queue
  - Stop and restart app; messages are non-durable (demo). You can purge queue `emails` from the Management UI.

## Notes
- This demo does NOT require Docker. A `docker-compose.yml` exists for convenience if you later decide to run RabbitMQ in a container, but it is not needed now.
- Messages are non-persistent and the queue is non-durable to keep the demo snappy.
