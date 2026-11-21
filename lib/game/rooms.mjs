import {summary} from './service.mjs';

export const HOST_TIMEOUT_MS = 3 * 60_000;
const HEARTBEAT_WRITE_MS = 15_000;
const LEGACY_WINDOW_MS = 24 * 60 * 60_000;

export function roomRepository(db, now = Date.now) {
  // Legacy rooms receive one grace period on their first visit after upgrading.
  const active = "status <> 'closed' AND (host_seen > ? OR (host_seen IS NULL AND updated > ?))";
  const cutoffs = time => [time - HOST_TIMEOUT_MS, time - LEGACY_WINDOW_MS];
  const values = (room, time) => [room.rev, time, Number(room.listed), room.status, JSON.stringify(summary(room)), JSON.stringify(room)];
  function selectRoom(code, time) {
    return db.first('SELECT state,host_seen FROM rooms WHERE code=? AND '+active, code, ...cutoffs(time));
  }
  return {
    async read(code, key) {
      const time = now();
      const row = await selectRoom(code, time);
      if (!row) return null;
      const room = JSON.parse(row.state);
      const owner = room.seats.find(seat => seat.id === room.host);
      if (row.host_seen === null) {
        await db.change('UPDATE rooms SET host_seen=? WHERE code=? AND host_seen IS NULL AND '+active, time, code, ...cutoffs(time));
      } else if (key && owner?.key === key && time - row.host_seen >= HEARTBEAT_WRITE_MS) {
        await db.change("UPDATE rooms SET host_seen=? WHERE code=? AND status<>'closed' AND host_seen>? AND host_seen<=?", time, code, time - HOST_TIMEOUT_MS, time - HEARTBEAT_WRITE_MS);
      } else {
        return room;
      }
      const fresh = await selectRoom(code, now());
      return fresh ? JSON.parse(fresh.state) : null;
    },
    async list() {
      const time = now();
      const query = "SELECT code,summary,host_seen FROM rooms WHERE listed=1 AND status IN ('waiting','playing') AND "+active+" ORDER BY updated DESC LIMIT 80";
      let rows = await db.all(query, ...cutoffs(time));
      const legacy = rows.filter(row => row.host_seen === null).map(row => row.code);
      if (legacy.length) {
        const placeholders = legacy.map(() => '?').join(',');
        await db.change('UPDATE rooms SET host_seen=? WHERE host_seen IS NULL AND code IN ('+placeholders+') AND '+active, time, ...legacy, ...cutoffs(time));
        rows = await db.all(query, ...cutoffs(now()));
      }
      return rows.map(row => JSON.parse(row.summary));
    },
    async create(room) {
      const time = now();
      return await db.change('INSERT OR IGNORE INTO rooms(revision,updated,listed,status,summary,state,code,host_seen) VALUES(?,?,?,?,?,?,?,?)',
        ...values(room, time), room.code, time) === 1;
    },
    async update(room, previous) {
      const time = now();
      return await db.change("UPDATE rooms SET revision=?,updated=?,listed=?,status=?,summary=?,state=? WHERE code=? AND revision=? AND status<>'closed' AND host_seen>?",
        ...values(room, time), room.code, previous, time - HOST_TIMEOUT_MS) === 1;
    },
    async closeByHost(code, hostId) {
      // A concurrent move or chat must never override the owner's decision to close.
      await db.change(`UPDATE rooms SET listed=0,status='closed',revision=revision+1,
        summary=json_set(summary,'$.status','closed'),
        state=json_set(state,'$.status','closed','$.listed',json('false'),'$.rev',revision+1)
        WHERE code=? AND json_extract(state,'$.host')=? AND status<>'closed'`, code, hostId);
    },
  };
}
