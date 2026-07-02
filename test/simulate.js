// Quick simulation of full games to validate the state machine & scoring.
const { RoomManager } = require('../server/game');

function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); process.exit(1); }
}

function playGame(numPlayers) {
  const mgr = new RoomManager();
  const room = mgr.create();
  const players = [];
  for (let i = 0; i < numPlayers; i++) players.push(room.addPlayer('P' + i, 'sock' + i));
  room.start(players[0].id);
  assert(room.phase === 'clue', 'starts in clue phase');
  const handSize = numPlayers === 3 ? 7 : 6;
  assert(players.every((p) => p.hand.length === handSize), `hand size ${handSize}`);

  let rounds = 0;
  while (room.phase !== 'gameover' && rounds < 100) {
    rounds++;
    const st = room.storyteller;
    room.giveClue(st.id, st.hand[0], 'clue ' + rounds);
    assert(room.phase === 'submit', 'submit phase');
    const need = room.requiredSubmissions;
    for (const p of room.players) {
      if (p.id !== st.id) room.submitCards(p.id, p.hand.slice(0, need));
    }
    assert(room.phase === 'vote', 'vote phase');
    assert(room.tableCards.length === 1 + (numPlayers - 1) * need, 'table card count');
    // half vote storyteller card, half vote someone else's
    let i = 0;
    for (const p of room.players) {
      if (p.id === st.id) continue;
      let target;
      if (i++ % 2 === 0) target = room.storytellerCard;
      else target = room.tableCards.find((t) => t.ownerId !== p.id && t.cardId !== room.storytellerCard)?.cardId
        ?? room.storytellerCard;
      // own-card vote must throw
      const own = room.tableCards.find((t) => t.ownerId === p.id);
      let threw = false;
      try { room.vote(p.id, own.cardId); } catch { threw = true; }
      assert(threw, 'own-card vote rejected');
      room.vote(p.id, target);
    }
    assert(room.phase === 'reveal', 'reveal phase');
    const totalDelta = room.players.reduce((s, p) => s + p.lastDelta, 0);
    assert(totalDelta > 0, 'points awarded');
    room.nextRound(room.hostId);
  }
  assert(room.phase === 'gameover', 'game reaches game over');
  assert(room.winnerIds.length >= 1, 'has winner(s)');
  console.log(`OK ${numPlayers} players: game over after ${rounds} rounds, winner score ${Math.max(...room.players.map((p) => p.score))}, deck left ${room.deck.length}`);

  // play again
  room.playAgain(room.hostId);
  assert(room.phase === 'lobby' && room.players.every((p) => p.score === 0), 'playAgain resets');
}

for (const n of [3, 4, 5, 6]) playGame(n);

// scoring edge: all find storyteller card
{
  const mgr = new RoomManager();
  const room = mgr.create();
  const ps = [];
  for (let i = 0; i < 4; i++) ps.push(room.addPlayer('Q' + i, 's' + i));
  room.start(ps[0].id);
  const st = room.storyteller;
  room.giveClue(st.id, st.hand[0], 'obvious');
  for (const p of room.players) if (p.id !== st.id) room.submitCards(p.id, [p.hand[0]]);
  for (const p of room.players) if (p.id !== st.id) room.vote(p.id, room.storytellerCard);
  assert(st.lastDelta === 0, 'storyteller 0 when all find it');
  assert(room.players.filter((p) => p.id !== st.id).every((p) => p.lastDelta >= 2), 'others +2');
  console.log('OK all-found scoring');
}

// leave & end-game features
{
  const mgr = new RoomManager();
  const room = mgr.create();
  const ps = [];
  for (let i = 0; i < 5; i++) ps.push(room.addPlayer('R' + i, 's' + i));
  room.start(ps[0].id);
  const st = room.storyteller;
  room.giveClue(st.id, st.hand[0], 'clue');

  // a non-storyteller submits, then exits mid-round
  const leaver = room.players.find((p) => p.id !== st.id);
  room.submitCards(leaver.id, [leaver.hand[0]]);
  room.leave(leaver.id);
  assert(room.players.length === 4, 'leaver removed');
  assert(!room.players.some((p) => p.id === leaver.id), 'leaver gone');

  // remaining players submit -> vote phase without leaver's card
  for (const p of room.players) {
    if (p.id !== st.id && !p.submitted.length) room.submitCards(p.id, [p.hand[0]]);
  }
  assert(room.phase === 'vote', 'vote phase after leave');
  assert(room.tableCards.every((t) => t.ownerId !== leaver.id), 'leaver cards off table');

  // storyteller exits mid-vote -> round aborted, cards returned
  const stId = st.id;
  room.leave(stId);
  assert(room.phase === 'clue', 'round restarted after storyteller left');
  assert(room.storyteller && room.storyteller.id !== stId, 'new storyteller assigned');
  assert(room.players.every((p) => p.submitted.length === 0), 'submissions reset');

  // host ends the game early
  let threw = false;
  try { room.hostEndGame(room.players.find((p) => p.id !== room.hostId).id); } catch { threw = true; }
  assert(threw, 'non-host cannot end game');
  room.hostEndGame(room.hostId);
  assert(room.phase === 'gameover', 'host ended game');
  console.log('OK leave & end-game');
}

// leaving below min players ends the game
{
  const mgr = new RoomManager();
  const room = mgr.create();
  const ps = [];
  for (let i = 0; i < 3; i++) ps.push(room.addPlayer('S' + i, 's' + i));
  room.start(ps[0].id);
  room.leave(room.players.find((p) => p.id !== room.storyteller.id).id);
  assert(room.phase === 'gameover', 'game ends when players drop below minimum');
  console.log('OK min-players end');
}
console.log('All simulations passed.');
