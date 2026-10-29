const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
const PORT = process.env.PORT || 3000;
const rooms = new Map();

app.use(express.static(__dirname));
app.get('/health', (_req, res) => res.json({ ok: true, game: 'TEN NIGHTS IN A HOTEL 10.2' }));

function makeCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = '';
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  } while (rooms.has(code));
  return code;
}
function live(socketId) {
  return !!socketId && io.sockets.sockets.has(socketId);
}
function playerCount(room) {
  return [room.host, room.guest].filter(live).length;
}
function emitPeer(code) {
  const room = rooms.get(code);
  if (room) io.to(code).emit('room:peer', { code, count: playerCount(room) });
}
function joinSocket(socket, code, role) {
  const room = rooms.get(code);
  socket.data.room = code;
  socket.data.role = role;
  socket.join(code);
  socket.emit(role === 'host' ? 'room:created' : 'room:joined', { code, role, players: playerCount(room) });
  if (room.state) socket.emit('game:state', room.state);
  emitPeer(code);
}

io.on('connection', socket => {
  socket.on('room:create', () => {
    // If this socket already owns a room, reuse it instead of creating duplicates.
    const existingCode = socket.data.room;
    if (existingCode && rooms.has(existingCode)) {
      const existing = rooms.get(existingCode);
      if (existing.host === socket.id) {
        socket.emit('room:created', { code: existingCode, role: 'host', players: playerCount(existing) });
        emitPeer(existingCode);
        return;
      }
      socket.leave(existingCode);
      const old = rooms.get(existingCode);
      if (old) {
        if (old.guest === socket.id) old.guest = null;
        if (old.host === socket.id) old.host = null;
        if (!old.host && !old.guest) rooms.delete(existingCode);
        else emitPeer(existingCode);
      }
    }
    const code = makeCode();
    const room = { host: socket.id, guest: null, state: null };
    rooms.set(code, room);
    joinSocket(socket, code, 'host');
    console.log(`${socket.id} created room ${code}`);
  });

  socket.on('room:join', payload => {
    const code = String(payload && (payload.code || payload.room) || '')
      .toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    if (!code || !rooms.has(code)) {
      socket.emit('room:error', { message: 'Комната не найдена. Проверь код и попробуй снова.' });
      return;
    }
    const room = rooms.get(code);
    if (room.host === socket.id || room.guest === socket.id) {
      socket.emit('room:joined', { code, role: socket.data.role || (room.host === socket.id ? 'host' : 'guest'), players: playerCount(room) });
      emitPeer(code);
      return;
    }
    if (playerCount(room) >= 2) {
      socket.emit('room:error', { message: 'Комната уже заполнена (максимум 2 игрока).' });
      return;
    }
    // Move this socket out of a previous room, if necessary.
    const oldCode = socket.data.room;
    if (oldCode && oldCode !== code && rooms.has(oldCode)) {
      const old = rooms.get(oldCode);
      if (old.host === socket.id) old.host = null;
      if (old.guest === socket.id) old.guest = null;
      socket.leave(oldCode);
      if (!old.host && !old.guest) rooms.delete(oldCode);
      else emitPeer(oldCode);
    }
    room.guest = socket.id;
    joinSocket(socket, code, 'guest');
    console.log(`${socket.id} joined room ${code}`);
  });

  socket.on('game:state', payload => {
    const code = socket.data.room;
    if (!code || socket.data.role !== 'host' || !payload) return;
    const room = rooms.get(code);
    if (!room) return;
    const state = payload.state || payload;
    room.state = state;
    socket.to(code).emit('game:state', state);
  });

  socket.on('player:action', payload => {
    const code = socket.data.room;
    if (!code || !payload) return;
    socket.to(code).emit('player:action', { role: socket.data.role, action: payload.action });
  });

  socket.on('disconnect', () => {
    const code = socket.data.room;
    if (!code || !rooms.has(code)) return;
    const room = rooms.get(code);
    if (room.host === socket.id) room.host = null;
    if (room.guest === socket.id) room.guest = null;
    if (!room.host && !room.guest) rooms.delete(code);
    else emitPeer(code);
  });
});

server.listen(PORT, () => console.log(`TEN NIGHTS online server listening on ${PORT}`));
