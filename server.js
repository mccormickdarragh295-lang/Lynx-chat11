// ============================================================
//  LYNX CHAT v2 — Stranger Chat with Video + Voice + Country
//  Drop-in upgrade: same Socket.IO events + country matching.
//  Deploy whole folder to Render (free). One deploy = all works.
// ============================================================
const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*', methods: ['GET', 'POST'] } });
const PORT = process.env.PORT || 3000;

// Serve the frontend (put index.html in /public)
app.use(express.static(path.join(__dirname, 'public')));

// ---------- state ----------
// waiting queue: [{ socketId, interests: Set, country, pref, since: ms }]
let waiting = [];
// pairs: socketId -> { partner: socketId }
const pairs = new Map();
const MAX_MSG = 2000;

function broadcastOnline() {
  io.emit('online', io.engine.clientsCount);
}

function leaveCurrent(socket, notifyPartner) {
  const p = pairs.get(socket.id);
  if (!p) return;
  if (notifyPartner) {
    io.to(p.partner).emit('partner:left');
    pairs.delete(p.partner);
  }
  pairs.delete(socket.id);
}

function removeFromWaiting(socketId) {
  waiting = waiting.filter(w => w.socketId !== socketId);
}

// Decide if two waiting entries are compatible given their country + pref.
// pref: 'same' = only match same country; 'worldwide' = match anyone.
function compatible(a, b) {
  if (a.pref === 'same' || b.pref === 'same') {
    return a.country && b.country && a.country === b.country;
  }
  return true; // both worldwide
}

// Match a joining socket. Prefers shared interests + same country, else longest-waiting compatible.
function tryMatch(socket) {
  const myInts = new Set((socket.data.interests || []).map(s => String(s).toLowerCase().trim()).filter(Boolean));
  const myCountry = socket.data.country || '';
  const myPref = socket.data.pref || 'worldwide';

  // 1) Best: compatible + shared interest
  // 2) Good: compatible + same country (bonus)
  // 3) Fallback: longest-waiting compatible
  let partner = null;
  for (const w of waiting) {
    if (w.room) continue; // private friend rooms never join random matching
    if (!compatible({ country: myCountry, pref: myPref }, w)) continue;
    if (w.interests.size && [...w.interests].some(i => myInts.has(i))) { partner = w; break; }
  }
  if (!partner) {
    for (const w of waiting) {
      if (w.room) continue;
      if (!compatible({ country: myCountry, pref: myPref }, w)) continue;
      if (w.country && myCountry && w.country === myCountry) { partner = w; break; }
    }
  }
  if (!partner) {
    partner = waiting.find(w => !w.room && compatible({ country: myCountry, pref: myPref }, w)) || null;
  }

  if (!partner) {
    waiting.push({ socketId: socket.id, interests: myInts, country: myCountry, pref: myPref, room: '', since: Date.now() });
    io.to(socket.id).emit('searching');
    return;
  }

  removeFromWaiting(partner.socketId);
  const partnerSocket = io.sockets.sockets.get(partner.socketId);
  if (!partnerSocket || !partnerSocket.connected) return tryMatch(socket);

  pairs.set(socket.id, { partner: partner.socketId });
  pairs.set(partner.socketId, { partner: socket.id });

  // The older socket initiates the WebRTC offer. Tell each side the partner's country.
  io.to(partner.socketId).emit('matched', { initiator: true,  partnerCountry: socket.data.country || '' });
  io.to(socket.id).emit('matched',          { initiator: false, partnerCountry: partner.country || '' });
}

io.on('connection', (socket) => {
  broadcastOnline();

  socket.on('join', (payload) => {
    const p = payload || {};
    const interests = Array.isArray(p.interests) ? p.interests.slice(0, 10) : [];
    socket.data.interests = interests;
    socket.data.country = String(p.country || '').slice(0, 8);
    socket.data.pref = (p.pref === 'same') ? 'same' : 'worldwide';
    socket.data.room = String(p.room || '').trim().toUpperCase().slice(0, 24);
    leaveCurrent(socket, true);
    removeFromWaiting(socket.id);

    // Private friend room: match only with the person holding the same code
    if (socket.data.room) {
      const partner = waiting.find(w => w.room === socket.data.room);
      if (partner) {
        removeFromWaiting(partner.socketId);
        const partnerSocket = io.sockets.sockets.get(partner.socketId);
        if (partnerSocket && partnerSocket.connected) {
          pairs.set(socket.id, { partner: partner.socketId });
          pairs.set(partner.socketId, { partner: socket.id });
          io.to(partner.socketId).emit('matched', { initiator: true,  partnerCountry: socket.data.country || '', isFriend: true });
          io.to(socket.id).emit('matched',          { initiator: false, partnerCountry: partner.country || '', isFriend: true });
          return;
        }
      }
      waiting.push({ socketId: socket.id, interests: new Set(), country: socket.data.country, pref: 'worldwide', room: socket.data.room, since: Date.now() });
      io.to(socket.id).emit('searching');
      return;
    }

    tryMatch(socket);
  });

  socket.on('chat:message', (text) => {
    const p = pairs.get(socket.id);
    if (!p) return;
    const clean = String(text == null ? '' : text).slice(0, MAX_MSG);
    if (!clean.trim()) return;
    io.to(p.partner).emit('chat:message', clean);
  });

  socket.on('typing', () => {
    const p = pairs.get(socket.id);
    if (p) io.to(p.partner).emit('typing');
  });
  socket.on('stop:typing', () => {
    const p = pairs.get(socket.id);
    if (p) io.to(p.partner).emit('stop:typing');
  });

  // WebRTC signaling relay (video + voice)
  socket.on('webrtc:offer', (offer) => {
    const p = pairs.get(socket.id);
    if (p) io.to(p.partner).emit('webrtc:offer', offer);
  });
  socket.on('webrtc:answer', (answer) => {
    const p = pairs.get(socket.id);
    if (p) io.to(p.partner).emit('webrtc:answer', answer);
  });
  socket.on('webrtc:ice', (candidate) => {
    const p = pairs.get(socket.id);
    if (p) io.to(p.partner).emit('webrtc:ice', candidate);
  });

  // Soundboard relay — both people hear the same funny sound
  socket.on('sound:play', (name) => {
    const p = pairs.get(socket.id);
    if (p) io.to(p.partner).emit('sound:play', String(name || '').slice(0, 24));
  });

  // Friends system: exchange friend codes + nicknames during a match
  socket.on('friend:request', (data) => {
    const p = pairs.get(socket.id);
    if (!p) return;
    io.to(p.partner).emit('friend:request', {
      code: String((data && data.code) || '').slice(0, 24),
      nick: String((data && data.nick) || 'Stranger').slice(0, 24)
    });
  });
  socket.on('friend:accept', (data) => {
    const p = pairs.get(socket.id);
    if (!p) return;
    io.to(p.partner).emit('friend:accept', {
      code: String((data && data.code) || '').slice(0, 24),
      nick: String((data && data.nick) || 'Stranger').slice(0, 24)
    });
  });

  socket.on('leave', () => {
    leaveCurrent(socket, true);
    removeFromWaiting(socket.id);
  });

  socket.on('disconnect', () => {
    leaveCurrent(socket, true);
    removeFromWaiting(socket.id);
    broadcastOnline();
  });
});

// Clean stale waiting entries every 30s
setInterval(() => {
  const cutoff = Date.now() - 5 * 60 * 1000;
  waiting = waiting.filter(w => {
    if (w.since < cutoff) { io.to(w.socketId).emit('search:timeout'); return false; }
    return true;
  });
}, 30000);

server.listen(PORT, '0.0.0.0', () => {
  console.log('LYNX CHAT v4 live on http://localhost:' + PORT);
});
