'use strict';

const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const { RoomManager } = require('./game');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: true },
  pingTimeout: 30000,
});

app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('/healthz', (_req, res) => res.send('ok'));

const manager = new RoomManager();
setInterval(() => manager.cleanup(), 60_000).unref();

// Track which room/player each socket belongs to
// socket.data = { roomCode, playerId }

function broadcast(room) {
  for (const p of room.players) {
    if (p.connected && p.socketId) {
      io.to(p.socketId).emit('state', room.stateFor(p.id));
    }
  }
}

function withRoom(socket, fn) {
  const { roomCode, playerId } = socket.data;
  const room = manager.get(roomCode);
  if (!room || !playerId) {
    socket.emit('errorMsg', 'You are not in a room');
    return;
  }
  try {
    fn(room, playerId);
    broadcast(room);
  } catch (err) {
    socket.emit('errorMsg', err.message || 'Something went wrong');
  }
}

io.on('connection', (socket) => {
  socket.on('createRoom', ({ name }, ack) => {
    try {
      const room = manager.create();
      const player = room.addPlayer(name, socket.id);
      socket.data.roomCode = room.code;
      socket.data.playerId = player.id;
      if (typeof ack === 'function') ack({ ok: true, roomCode: room.code, playerId: player.id });
      broadcast(room);
    } catch (err) {
      if (typeof ack === 'function') ack({ ok: false, error: err.message });
    }
  });

  socket.on('joinRoom', ({ code, name }, ack) => {
    try {
      const room = manager.get(code);
      if (!room) throw new Error('Room not found — check the code');
      const player = room.addPlayer(name, socket.id);
      socket.data.roomCode = room.code;
      socket.data.playerId = player.id;
      if (typeof ack === 'function') ack({ ok: true, roomCode: room.code, playerId: player.id });
      broadcast(room);
    } catch (err) {
      if (typeof ack === 'function') ack({ ok: false, error: err.message });
    }
  });

  socket.on('rejoin', ({ code, playerId }, ack) => {
    const room = manager.get(code);
    const player = room ? room.reconnect(playerId, socket.id) : null;
    if (!room || !player) {
      if (typeof ack === 'function') ack({ ok: false, error: 'Session expired' });
      return;
    }
    socket.data.roomCode = room.code;
    socket.data.playerId = player.id;
    if (typeof ack === 'function') ack({ ok: true, roomCode: room.code, playerId: player.id });
    broadcast(room);
  });

  socket.on('startGame', () => withRoom(socket, (room, pid) => room.start(pid)));
  socket.on('giveClue', ({ cardId, clue }) =>
    withRoom(socket, (room, pid) => room.giveClue(pid, Number(cardId), clue))
  );
  socket.on('submitCards', ({ cardIds }) =>
    withRoom(socket, (room, pid) => room.submitCards(pid, (cardIds || []).map(Number)))
  );
  socket.on('vote', ({ cardId }) => withRoom(socket, (room, pid) => room.vote(pid, Number(cardId))));
  socket.on('nextRound', () => withRoom(socket, (room, pid) => room.nextRound(pid)));
  socket.on('playAgain', () => withRoom(socket, (room, pid) => room.playAgain(pid)));
  socket.on('endGame', () => withRoom(socket, (room, pid) => room.hostEndGame(pid)));

  socket.on('leaveRoom', () => {
    const { roomCode, playerId } = socket.data;
    const room = manager.get(roomCode);
    if (room && playerId) {
      room.leave(playerId);
      socket.data.roomCode = null;
      socket.data.playerId = null;
      if (room.players.length === 0) manager.delete(room.code);
      else broadcast(room);
    }
  });

  socket.on('disconnect', () => {
    const { roomCode, playerId } = socket.data;
    const room = manager.get(roomCode);
    if (room && playerId) {
      room.markDisconnected(playerId);
      if (room.players.length === 0) manager.delete(room.code);
      else broadcast(room);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Dixit Online listening on port ${PORT}`);
});
