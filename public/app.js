/* Dixit Online — client */
'use strict';

const socket = io();
let state = null; // latest server state
let selectedCards = []; // local selection (hand or table)
let clueDraft = '';

const $app = document.getElementById('app');
const $toast = document.getElementById('toast');

/* ---------- helpers ---------- */

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

let toastTimer = null;
function toast(msg, isError = true) {
  $toast.textContent = msg;
  $toast.classList.toggle('error', isError);
  $toast.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $toast.classList.add('hidden'), 3500);
}

function saveSession(roomCode, playerId) {
  sessionStorage.setItem('dixit', JSON.stringify({ roomCode, playerId }));
}
function loadSession() {
  try { return JSON.parse(sessionStorage.getItem('dixit')); } catch { return null; }
}
function clearSession() {
  sessionStorage.removeItem('dixit');
}

/* ---------- socket wiring ---------- */

socket.on('state', (s) => {
  const phaseChanged = !state || state.phase !== s.phase || state.round !== s.round;
  state = s;
  if (phaseChanged) selectedCards = [];
  render();
});

socket.on('errorMsg', (msg) => toast(msg));

socket.on('connect', () => {
  const sess = loadSession();
  if (sess && sess.roomCode && sess.playerId) {
    socket.emit('rejoin', sess, (res) => {
      if (!res.ok) {
        clearSession();
        state = null;
        render();
      }
    });
  }
});

socket.on('disconnect', () => toast('Connection lost — reconnecting…'));

function createRoom(name) {
  socket.emit('createRoom', { name }, (res) => {
    if (res.ok) saveSession(res.roomCode, res.playerId);
    else toast(res.error);
  });
}

function joinRoom(code, name) {
  socket.emit('joinRoom', { code, name }, (res) => {
    if (res.ok) saveSession(res.roomCode, res.playerId);
    else toast(res.error);
  });
}

function leaveRoom() {
  socket.emit('leaveRoom');
  clearSession();
  state = null;
  selectedCards = [];
  render();
}

/* ---------- rendering ---------- */

function cardHTML(id, opts = {}) {
  const cls = ['card'];
  if (opts.selectable) cls.push('selectable');
  if (opts.selected) cls.push('selected');
  if (opts.mine) cls.push('mine');
  if (opts.storyteller) cls.push('storyteller-card');
  const badge = opts.badge ? `<div class="card-badge">${opts.badge}</div>` : '';
  const footer = opts.footer ? `<div class="card-footer">${opts.footer}</div>` : '';
  const art = `<img src="cards/${id}.webp" alt="card ${id}" loading="lazy" draggable="false"/>`;
  return `<div class="${cls.join(' ')}" data-card="${id}">${art}${badge}${footer}</div>`;
}

function playersBar() {
  return `<div class="players-bar">${state.players.map((p) => {
    const cls = ['player-chip'];
    if (p.isStoryteller) cls.push('storyteller');
    if (!p.connected) cls.push('offline');
    let status = '';
    if (state.phase === 'submit' && !p.isStoryteller) status = p.hasSubmitted ? '✔' : '…';
    if (state.phase === 'vote' && !p.isStoryteller) status = p.hasVoted ? '✔' : '…';
    return `<div class="${cls.join(' ')}" title="${p.connected ? '' : 'disconnected'}">
      ${p.isStoryteller ? '📖 ' : ''}${p.isHost ? '👑 ' : ''}<span class="pname">${esc(p.name)}</span>
      <span class="pscore">${p.score}</span>
      ${status ? `<span class="pstatus">${status}</span>` : ''}
    </div>`;
  }).join('')}</div>`;
}

function headerHTML(subtitle) {
  return `<header class="game-header">
    <div class="logo-small">🐇 Dixit Online</div>
    <div class="room-info">Room <button class="room-code" id="copyCode" title="Copy invite code">${esc(state.code)}</button>
      · Round ${state.round} · Deck ${state.deckCount}</div>
    <div class="subtitle">${subtitle}</div>
    ${playersBar()}
  </header>`;
}

function handHTML(selectable, maxSelect) {
  if (!state.you || !state.you.hand.length) return '';
  return `<section class="hand-section">
    <h3>Your hand</h3>
    <div class="card-grid hand">${state.you.hand.map((id) =>
      cardHTML(id, {
        selectable,
        selected: selectedCards.includes(id),
      })
    ).join('')}</div>
  </section>`;
}

function renderHome() {
  $app.innerHTML = `
    <div class="home">
      <div class="hero">
        <h1>🐇 Dixit <span>Online</span></h1>
        <p>A game of imagination, clues and beautiful cards.<br/>Create a room, share the code, play with 3–6 friends.</p>
      </div>
      <div class="home-card">
        <label>Your name</label>
        <input id="nameInput" maxlength="20" placeholder="e.g. Luna" autocomplete="off" />
        <button id="createBtn" class="btn primary">Create a room</button>
        <div class="divider"><span>or join a friend</span></div>
        <label>Room code</label>
        <input id="codeInput" maxlength="5" placeholder="ABCDE" autocomplete="off" style="text-transform:uppercase" />
        <button id="joinBtn" class="btn secondary">Join room</button>
      </div>
      <div class="rules-hint">
        <h3>How to play</h3>
        <ol>
          <li>Each round, the <b>storyteller</b> picks a card and gives a clue — a word, phrase or sound.</li>
          <li>Everyone else secretly plays a card that fits the clue.</li>
          <li>Cards are shuffled and revealed. Everyone (except the storyteller) votes for the storyteller's card.</li>
          <li>If <b>everyone or no one</b> finds it, the storyteller gets 0 and others get 2. Otherwise the storyteller and correct guessers get 3. Each vote on your own card is +1.</li>
          <li>First to <b>30 points</b> wins!</li>
        </ol>
      </div>
    </div>`;

  const nameInput = document.getElementById('nameInput');
  const codeInput = document.getElementById('codeInput');
  nameInput.value = localStorage.getItem('dixitName') || '';
  const getName = () => {
    const n = nameInput.value.trim();
    if (!n) { toast('Please enter your name'); nameInput.focus(); return null; }
    localStorage.setItem('dixitName', n);
    return n;
  };
  document.getElementById('createBtn').onclick = () => {
    const n = getName(); if (n) createRoom(n);
  };
  document.getElementById('joinBtn').onclick = () => {
    const n = getName(); if (!n) return;
    const code = codeInput.value.trim().toUpperCase();
    if (code.length !== 5) { toast('Room codes are 5 characters'); codeInput.focus(); return; }
    joinRoom(code, n);
  };
  codeInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') document.getElementById('joinBtn').click(); });
  nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') document.getElementById('createBtn').click(); });
}

function renderLobby() {
  const canStart = state.you.isHost && state.players.length >= state.minPlayers;
  $app.innerHTML = `
    <div class="lobby">
      <div class="logo-small">🐇 Dixit Online</div>
      <h2>Waiting room</h2>
      <p class="lobby-hint">Share this code with your friends:</p>
      <button class="room-code big" id="copyCode" title="Click to copy">${esc(state.code)}</button>
      <p class="copy-hint">click to copy invite link</p>
      <div class="lobby-players">
        ${state.players.map((p) => `
          <div class="lobby-player">
            <span class="avatar">${esc(p.name[0].toUpperCase())}</span>
            <span>${esc(p.name)}</span>
            ${p.isHost ? '<span class="tag">host</span>' : ''}
            ${p.id === state.you.id ? '<span class="tag you">you</span>' : ''}
          </div>`).join('')}
        ${Array.from({ length: Math.max(0, state.minPlayers - state.players.length) }, () =>
          '<div class="lobby-player empty">waiting for player…</div>').join('')}
      </div>
      <p class="lobby-count">${state.players.length}/${state.maxPlayers} players — need at least ${state.minPlayers}</p>
      ${state.you.isHost
        ? `<button id="startBtn" class="btn primary big" ${canStart ? '' : 'disabled'}>Start game</button>`
        : `<p class="waiting-pulse">Waiting for the host to start…</p>`}
      <button id="leaveBtn" class="btn ghost">Leave room</button>
    </div>`;
  if (state.you.isHost) {
    document.getElementById('startBtn').onclick = () => socket.emit('startGame');
  }
  bindCommon();
}

function renderClue() {
  const isST = state.you.isStoryteller;
  const stName = state.players.find((p) => p.isStoryteller)?.name || '';
  if (isST) {
    const ready = selectedCards.length === 1 && clueDraft.trim().length > 0;
    $app.innerHTML = `
      ${headerHTML('📖 You are the storyteller! Pick a card and give a clue.')}
      <div class="clue-form">
        <input id="clueInput" maxlength="120" placeholder="Your clue — a word, a phrase, a sound…" value="${esc(clueDraft)}" autocomplete="off"/>
        <button id="clueBtn" class="btn primary" ${ready ? '' : 'disabled'}>Tell the story</button>
      </div>
      ${handHTML(true, 1)}`;
    const input = document.getElementById('clueInput');
    input.addEventListener('input', () => {
      clueDraft = input.value;
      document.getElementById('clueBtn').disabled = !(selectedCards.length === 1 && clueDraft.trim());
    });
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
    document.getElementById('clueBtn').onclick = () => {
      if (selectedCards.length === 1 && clueDraft.trim()) {
        socket.emit('giveClue', { cardId: selectedCards[0], clue: clueDraft.trim() });
        clueDraft = '';
      }
    };
    bindHandSelection(1);
  } else {
    $app.innerHTML = `
      ${headerHTML(`📖 <b>${esc(stName)}</b> is the storyteller — thinking of a clue…`)}
      <div class="waiting-pulse center">Waiting for the storyteller…</div>
      ${handHTML(false, 0)}`;
  }
  bindCommon();
}

function renderSubmit() {
  const isST = state.you.isStoryteller;
  const need = state.requiredSubmissions;
  const done = state.you.submitted.length > 0;
  if (isST) {
    $app.innerHTML = `
      ${headerHTML(`Your clue: <b class="clue">“${esc(state.clue)}”</b>`)}
      <div class="waiting-pulse center">Players are choosing their cards…</div>
      ${handHTML(false, 0)}`;
  } else if (done) {
    $app.innerHTML = `
      ${headerHTML(`Clue: <b class="clue">“${esc(state.clue)}”</b>`)}
      <div class="waiting-pulse center">Card played ✔ — waiting for the others…</div>
      ${handHTML(false, 0)}`;
  } else {
    const ready = selectedCards.length === need;
    $app.innerHTML = `
      ${headerHTML(`Clue: <b class="clue">“${esc(state.clue)}”</b>`)}
      <div class="action-row">
        <p>Pick ${need === 1 ? 'a card' : `${need} cards`} from your hand that best match${need === 1 ? 'es' : ''} the clue.</p>
        <button id="submitBtn" class="btn primary" ${ready ? '' : 'disabled'}>Play ${need === 1 ? 'card' : 'cards'} (${selectedCards.length}/${need})</button>
      </div>
      ${handHTML(true, need)}`;
    document.getElementById('submitBtn').onclick = () => {
      if (selectedCards.length === need) socket.emit('submitCards', { cardIds: selectedCards });
    };
    bindHandSelection(need);
  }
  bindCommon();
}

function renderVote() {
  const isST = state.you.isStoryteller;
  const voted = state.you.vote !== null;
  const canVote = !isST && !voted;
  let subtitle;
  if (isST) subtitle = `Your clue: <b class="clue">“${esc(state.clue)}”</b> — players are voting…`;
  else if (voted) subtitle = `Vote cast ✔ — waiting for the others…`;
  else subtitle = `Clue: <b class="clue">“${esc(state.clue)}”</b> — which card is the storyteller's?`;

  $app.innerHTML = `
    ${headerHTML(subtitle)}
    ${canVote ? `<div class="action-row">
      <p>You can't vote for your own card.</p>
      <button id="voteBtn" class="btn primary" ${selectedCards.length === 1 ? '' : 'disabled'}>Confirm vote</button>
    </div>` : ''}
    <section>
      <div class="card-grid table">${state.tableCards.map((t) =>
        cardHTML(t.cardId, {
          selectable: canVote && !t.isMine,
          selected: selectedCards.includes(t.cardId),
          mine: t.isMine,
          badge: t.isMine ? 'your card' : '',
        })
      ).join('')}</div>
    </section>`;

  if (canVote) {
    document.getElementById('voteBtn').onclick = () => {
      if (selectedCards.length === 1) socket.emit('vote', { cardId: selectedCards[0] });
    };
    document.querySelectorAll('.card.selectable').forEach((el) => {
      el.onclick = () => {
        const id = Number(el.dataset.card);
        selectedCards = selectedCards.includes(id) ? [] : [id];
        render();
      };
    });
  }
  bindCommon();
}

function renderReveal() {
  const rs = state.roundSummary;
  const canContinue = state.you.isHost || state.you.isStoryteller;
  let banner;
  if (rs.allFound) banner = 'Everyone found the storyteller\'s card — too obvious! Storyteller gets 0, everyone else +2.';
  else if (rs.noneFound) banner = 'No one found the storyteller\'s card — too obscure! Storyteller gets 0, everyone else +2.';
  else banner = 'Storyteller and correct guessers score +3. Votes on your card are +1 each.';

  $app.innerHTML = `
    ${headerHTML(`Clue was: <b class="clue">“${esc(rs.clue)}”</b>`)}
    <div class="banner">${banner}</div>
    <section>
      <div class="card-grid table">${rs.cards.map((c) =>
        cardHTML(c.cardId, {
          storyteller: c.isStoryteller,
          badge: c.isStoryteller ? '⭐ storyteller' : '',
          footer: `<b>${esc(c.ownerName)}</b>${c.voters.length ? `<br/><span class="votes">🗳 ${c.voters.map(esc).join(', ')}</span>` : ''}`,
        })
      ).join('')}</div>
    </section>
    <section class="score-summary">
      <h3>Scores</h3>
      ${rs.deltas.slice().sort((a, b) => b.score - a.score).map((d) => `
        <div class="score-row">
          <span>${esc(d.name)}</span>
          <span class="delta ${d.delta > 0 ? 'pos' : ''}">${d.delta > 0 ? '+' + d.delta : d.delta}</span>
          <div class="score-bar"><div style="width:${Math.min(100, (d.score / state.winScore) * 100)}%"></div></div>
          <span class="total">${d.score}</span>
        </div>`).join('')}
      <p class="win-hint">First to ${state.winScore} wins</p>
    </section>
    <div class="center">
      ${canContinue
        ? '<button id="nextBtn" class="btn primary big">Next round →</button>'
        : '<p class="waiting-pulse">Waiting for the next round…</p>'}
    </div>`;
  if (canContinue) document.getElementById('nextBtn').onclick = () => socket.emit('nextRound');
  bindCommon();
}

function renderGameOver() {
  const winners = state.players.filter((p) => state.winnerIds.includes(p.id));
  const sorted = state.players.slice().sort((a, b) => b.score - a.score);
  $app.innerHTML = `
    <div class="gameover">
      <div class="logo-small">🐇 Dixit Online</div>
      <h1>🏆 ${winners.map((w) => esc(w.name)).join(' & ')} win${winners.length === 1 ? 's' : ''}!</h1>
      <div class="final-scores">
        ${sorted.map((p, i) => `
          <div class="final-row ${state.winnerIds.includes(p.id) ? 'winner' : ''}">
            <span class="rank">#${i + 1}</span>
            <span>${esc(p.name)}</span>
            <span class="total">${p.score} pts</span>
          </div>`).join('')}
      </div>
      ${state.you.isHost
        ? '<button id="againBtn" class="btn primary big">Play again</button>'
        : '<p class="waiting-pulse">Waiting for the host…</p>'}
      <button id="leaveBtn" class="btn ghost">Leave room</button>
    </div>`;
  if (state.you.isHost) document.getElementById('againBtn').onclick = () => socket.emit('playAgain');
  bindCommon();
}

function bindHandSelection(maxSelect) {
  document.querySelectorAll('.hand .card.selectable').forEach((el) => {
    el.onclick = () => {
      const id = Number(el.dataset.card);
      if (selectedCards.includes(id)) {
        selectedCards = selectedCards.filter((c) => c !== id);
      } else if (maxSelect === 1) {
        selectedCards = [id];
      } else if (selectedCards.length < maxSelect) {
        selectedCards = [...selectedCards, id];
      } else {
        return;
      }
      render();
    };
  });
}

function bindCommon() {
  const copy = document.getElementById('copyCode');
  if (copy) {
    copy.onclick = async () => {
      const link = `${location.origin}/?room=${state.code}`;
      try {
        await navigator.clipboard.writeText(link);
        toast(`Invite link copied: ${link}`, false);
      } catch {
        toast(`Room code: ${state.code}`, false);
      }
    };
  }
  const leave = document.getElementById('leaveBtn');
  if (leave) leave.onclick = leaveRoom;
}

function render() {
  if (!state || !state.you) return renderHome();
  switch (state.phase) {
    case 'lobby': return renderLobby();
    case 'clue': return renderClue();
    case 'submit': return renderSubmit();
    case 'vote': return renderVote();
    case 'reveal': return renderReveal();
    case 'gameover': return renderGameOver();
    default: return renderHome();
  }
}

/* Support invite links: ?room=CODE prefills the join box */
window.addEventListener('DOMContentLoaded', () => {
  render();
  const params = new URLSearchParams(location.search);
  const room = params.get('room');
  if (room && !loadSession()) {
    const codeInput = document.getElementById('codeInput');
    if (codeInput) {
      codeInput.value = room.toUpperCase();
      document.getElementById('nameInput')?.focus();
    }
  }
});
