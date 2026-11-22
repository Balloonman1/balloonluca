// Room-code multiplayer over PeerJS (WebRTC). The player who creates the
// game is the host; everyone else connects to the host with a 4-letter code.
import { Peer } from 'peerjs';

const PREFIX = 'balloonluca-v1-';
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

function peerOptions() {
  // Dev only: ?peer=localhost:9000 points at a local PeerServer.
  const o = new URLSearchParams(location.search).get('peer');
  if (!o) return {};
  const [host, port] = o.split(':');
  return { host, port: +port, path: '/', secure: false };
}

function makeCode() {
  let s = '';
  for (let i = 0; i < 4; i++) s += ALPHA[(Math.random() * ALPHA.length) | 0];
  return s;
}

export class Net {
  constructor() {
    this.peer = null;
    this.conns = new Map();
    this.hostConn = null;
    this.onGuestMsg = () => {};
    this.onGuestLeave = () => {};
    this.onHostMsg = () => {};
    this.onHostLost = () => {};
  }

  host(tries = 0) {
    return new Promise((res, rej) => {
      const code = makeCode();
      const peer = new Peer(PREFIX + code, peerOptions());
      let opened = false;
      const timer = setTimeout(() => { if (!opened) { peer.destroy(); rej(new Error('Could not reach the game server.')); } }, 12000);
      peer.on('open', () => { opened = true; clearTimeout(timer); this.peer = peer; res(code); });
      peer.on('disconnected', () => { if (opened && !peer.destroyed) peer.reconnect(); });
      peer.on('connection', (c) => {
        this.conns.set(c.peer, c);
        c.on('data', (d) => this.onGuestMsg(c.peer, d));
        const bye = () => { if (this.conns.delete(c.peer)) this.onGuestLeave(c.peer); };
        c.on('close', bye);
        c.on('error', bye);
      });
      peer.on('error', (e) => {
        if (opened) return;
        clearTimeout(timer);
        peer.destroy();
        if (e.type === 'unavailable-id' && tries < 5) this.host(tries + 1).then(res, rej);
        else rej(new Error('Could not reach the game server.'));
      });
    });
  }

  join(code) {
    return new Promise((res, rej) => {
      const peer = new Peer(peerOptions());
      let settled = false;
      const fail = (m) => { if (settled) return; settled = true; clearTimeout(timer); peer.destroy(); rej(new Error(m)); };
      const timer = setTimeout(() => fail('Could not connect. Check the code and try again.'), 15000);
      peer.on('open', () => {
        const c = peer.connect(PREFIX + code, { reliable: true, serialization: 'json' });
        c.on('open', () => {
          if (settled) return;
          settled = true; clearTimeout(timer);
          this.peer = peer; this.hostConn = c;
          res();
        });
        c.on('data', (d) => this.onHostMsg(d));
        c.on('close', () => { if (this.hostConn === c) this.onHostLost(); });
      });
      peer.on('error', (e) => {
        if (e.type === 'peer-unavailable') fail('No game found with that code.');
        else fail('Connection problem. Try again.');
      });
    });
  }

  toHost(m) { if (this.hostConn && this.hostConn.open) this.hostConn.send(m); }
  toGuest(id, m) { const c = this.conns.get(id); if (c && c.open) c.send(m); }
  broadcast(m) { for (const c of this.conns.values()) if (c.open) c.send(m); }
  close() { this.hostConn = null; if (this.peer) this.peer.destroy(); this.peer = null; this.conns.clear(); }
}
