// Bot players that join a room and auto-play; usage: node test/bots.js ROOMCODE [count]
const { io } = require('socket.io-client');
const CODE = process.argv[2];
const COUNT = Number(process.argv[3] || 2);
if (!CODE) { console.error('usage: node test/bots.js ROOMCODE [count]'); process.exit(1); }

for (let i = 0; i < COUNT; i++) {
  const name = 'Bot' + (i + 1);
  const socket = io('http://localhost:3000');
  let acted = { key: '' };
  socket.on('connect', () => {
    socket.emit('joinRoom', { code: CODE, name }, (res) => {
      if (!res.ok) { console.error(name, 'join failed:', res.error); process.exit(1); }
      console.log(name, 'joined', CODE);
    });
  });
  socket.on('errorMsg', (m) => console.log(name, 'err:', m));
  socket.on('state', (s) => {
    const key = s.phase + ':' + s.round;
    if (acted.key === key) return;
    const delay = 800 + Math.random() * 1200;
    if (s.phase === 'clue' && s.you.isStoryteller) {
      acted.key = key;
      setTimeout(() => socket.emit('giveClue', { cardId: s.you.hand[0], clue: 'a dream within a dream' }), delay);
    } else if (s.phase === 'submit' && !s.you.isStoryteller && !s.you.submitted.length) {
      acted.key = key;
      setTimeout(() => socket.emit('submitCards', { cardIds: s.you.hand.slice(0, s.requiredSubmissions) }), delay);
    } else if (s.phase === 'vote' && !s.you.isStoryteller && s.you.vote === null) {
      acted.key = key;
      const options = s.tableCards.filter((t) => !t.isMine);
      const pick = options[Math.floor(Math.random() * options.length)];
      setTimeout(() => socket.emit('vote', { cardId: pick.cardId }), delay);
    }
  });
}
