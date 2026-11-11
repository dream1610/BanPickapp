import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cors from 'cors';
import { z } from 'zod';
import { createPool, migrate } from './db.js';
import { applyCommand, newRoom } from './room-service.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || jwtSecret.length < 32) throw new Error('JWT_SECRET must be at least 32 characters.');

const pool = createPool();
await migrate(pool);
const app = express();
const httpServer = createServer(app);
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',').map((value) => value.trim()).filter(Boolean) || [];
const corsOptions = { origin: allowedOrigins.length ? allowedOrigins : true, credentials: true };
const io = new Server(httpServer, { cors: corsOptions });

app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(cors(corsOptions));
app.use(express.json({ limit:'256kb' }));
app.use('/api/auth', rateLimit({ windowMs:15 * 60 * 1000, limit:20, standardHeaders:true, legacyHeaders:false }));

const sign = (user) => jwt.sign({ sub:user.id, username:user.username }, jwtSecret, { expiresIn:'7d' });
function getToken(request) {
  const header = request.get('authorization');
  return header?.startsWith('Bearer ') ? header.slice(7) : null;
}
async function authenticate(request, response, next) {
  try {
    const token = getToken(request);
    if (!token) return response.status(401).json({ error:'Authentication required.' });
    const claims = jwt.verify(token, jwtSecret);
    const result = await pool.query('SELECT username FROM users WHERE id = $1', [claims.sub]);
    if (!result.rowCount) return response.status(401).json({ error:'Session expired. Sign in again.' });
    request.user = { ...claims, username:result.rows[0].username };
    return next();
  } catch { return response.status(401).json({ error:'Session expired. Sign in again.' }); }
}
const authInput = z.object({ username:z.string().trim().regex(/^[\w.-]{3,24}$/), password:z.string().min(8).max(128) });
const commandInput = z.object({ type:z.string().min(1).max(32), payload:z.record(z.string(), z.unknown()).optional() });

app.get('/api/health', async (_request, response) => {
  await pool.query('SELECT 1');
  response.json({ status:'ok', service:'gdreed-api', now:new Date().toISOString() });
});
app.get('/api/clock', (_request, response) => response.json({ now:Date.now() }));
app.post('/api/auth/register', async (request, response, next) => {
  try {
    const { username, password } = authInput.parse(request.body);
    const passwordHash = await bcrypt.hash(password, 12);
    const result = await pool.query('INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id, username', [username, passwordHash]);
    const user = result.rows[0];
    response.status(201).json({ user, token:sign(user) });
  } catch (error) {
    if (error?.code === '23505') return response.status(409).json({ error:'This username is already in use.' });
    return next(error);
  }
});
app.post('/api/auth/login', async (request, response, next) => {
  try {
    const { username, password } = authInput.parse(request.body);
    const result = await pool.query('SELECT id, username, password_hash FROM users WHERE LOWER(username) = LOWER($1)', [username]);
    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) return response.status(401).json({ error:'Invalid username or password.' });
    response.json({ user:{ id:user.id, username:user.username }, token:sign(user) });
  } catch (error) { return next(error); }
});
app.delete('/api/account', authenticate, async (request, response, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const account = await client.query('SELECT username FROM users WHERE id = $1 FOR UPDATE', [request.user.sub]);
    if (!account.rowCount) {
      await client.query('ROLLBACK');
      return response.status(404).json({ error:'Account not found.' });
    }
    const username = account.rows[0].username;
    const sharedRooms = await client.query(
      "SELECT id, snapshot FROM rooms WHERE owner_id <> $1 AND snapshot->'members' @> jsonb_build_array(jsonb_build_object('id', $1::text)) FOR UPDATE",
      [request.user.sub],
    );
    const updatedRooms = [];
    await client.query('DELETE FROM match_records WHERE created_by = $1 OR room_id IN (SELECT id FROM rooms WHERE owner_id = $1)', [request.user.sub]);
    for (const row of sharedRooms.rows) {
      const room = row.snapshot;
      room.members = (room.members || []).filter((member) => member.id !== request.user.sub);
      for (const team of ['A','B']) if (room.teams?.[team]?.captainId === request.user.sub) room.teams[team].captainId = null;
      room.members.forEach((member) => { member.captain = room.teams?.[member.team]?.captainId === member.id; });
      room.audit = (room.audit || []).filter((entry) => entry.actor !== username);
      const updated = await client.query('UPDATE rooms SET snapshot = $1, version = version + 1, updated_at = NOW() WHERE id = $2 RETURNING version', [room, row.id]);
      updatedRooms.push({ ...room, version:updated.rows[0].version });
    }
    await client.query('DELETE FROM rooms WHERE owner_id = $1', [request.user.sub]);
    await client.query('DELETE FROM users WHERE id = $1', [request.user.sub]);
    await client.query('COMMIT');
    for (const room of updatedRooms) io.to(room.id).emit('room:updated', room);
    for (const socket of io.sockets.sockets.values()) if (socket.user?.sub === request.user.sub) socket.disconnect(true);
    response.status(204).end();
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally { client.release(); }
});
app.get('/api/rooms', authenticate, async (request, response, next) => {
  try {
    const result = await pool.query("SELECT id, code, snapshot, version FROM rooms WHERE owner_id = $1 OR snapshot->'members' @> jsonb_build_array(jsonb_build_object('id', $1::text)) ORDER BY updated_at DESC", [request.user.sub]);
    response.json({ rooms:result.rows.map((row) => ({ ...row.snapshot, version:row.version })) });
  } catch (error) { next(error); }
});
app.post('/api/rooms', authenticate, async (request, response, next) => {
  try {
    const room = newRoom({ id:request.user.sub, username:request.user.username });
    await pool.query('INSERT INTO rooms (id, code, owner_id, snapshot, version) VALUES ($1, $2, $3, $4, $5)', [room.id, room.code, request.user.sub, room, room.version]);
    response.status(201).json({ room });
  } catch (error) { next(error); }
});
app.post('/api/rooms/join', authenticate, async (request, response, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const code = z.string().trim().toUpperCase().regex(/^GD-[A-Z0-9]{4}$/).parse(request.body.code);
    const result = await client.query('SELECT snapshot, version FROM rooms WHERE code = $1 FOR UPDATE', [code]);
    if (!result.rowCount) return response.status(404).json({ error:'Room not found.' });
    const row = result.rows[0]; const room = applyCommand(row.snapshot, { id:request.user.sub, username:request.user.username }, { type:'JOIN' });
    const updated = await client.query('UPDATE rooms SET snapshot = $1, version = version + 1, updated_at = NOW() WHERE code = $2 RETURNING version', [room, code]);
    await client.query('COMMIT'); room.version = updated.rows[0].version; io.to(room.id).emit('room:updated', room); response.json({ room });
  } catch (error) { await client.query('ROLLBACK'); next(error); } finally { client.release(); }
});
app.get('/api/rooms/:id', authenticate, async (request, response, next) => {
  try {
    const result = await pool.query('SELECT snapshot, version FROM rooms WHERE id = $1', [request.params.id]);
    if (!result.rowCount) return response.status(404).json({ error:'Room not found.' });
    const room = result.rows[0].snapshot;
    if (room.ownerId !== request.user.sub && !room.members.some((member) => member.id === request.user.sub)) return response.status(403).json({ error:'Join this room before viewing it.' });
    response.json({ room:{ ...room, version:result.rows[0].version } });
  } catch (error) { next(error); }
});
app.post('/api/rooms/:id/commands', authenticate, async (request, response, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const command = commandInput.parse(request.body);
    const result = await client.query('SELECT snapshot, version FROM rooms WHERE id = $1 FOR UPDATE', [request.params.id]);
    if (!result.rowCount) return response.status(404).json({ error:'Room not found.' });
    const row = result.rows[0]; const room = applyCommand(row.snapshot, { id:request.user.sub, username:request.user.username }, command);
    const updated = await client.query('UPDATE rooms SET snapshot = $1, version = version + 1, updated_at = NOW() WHERE id = $2 AND version = $3 RETURNING version', [room, request.params.id, row.version]);
    if (!updated.rowCount) return response.status(409).json({ error:'The room changed. Reload and try again.' });
    await client.query('COMMIT'); room.version = updated.rows[0].version; io.to(room.id).emit('room:updated', room); response.json({ room });
  } catch (error) { await client.query('ROLLBACK'); next(error); } finally { client.release(); }
});
app.get('/api/matches', authenticate, async (_request, response, next) => {
  try {
    const result = await pool.query('SELECT record FROM match_records ORDER BY created_at DESC LIMIT 100');
    response.json({ matches:result.rows.map((row) => row.record) });
  } catch (error) { next(error); }
});
app.post('/api/rooms/:id/matches', authenticate, async (request, response, next) => {
  try {
    const record = z.object({ id:z.string().uuid() }).passthrough().parse(request.body.record);
    const result = await pool.query('SELECT snapshot FROM rooms WHERE id = $1', [request.params.id]);
    if (!result.rowCount) return response.status(404).json({ error:'Room not found.' });
    if (result.rows[0].snapshot.ownerId !== request.user.sub) return response.status(403).json({ error:'Only the room owner can record a match.' });
    await pool.query('INSERT INTO match_records (id, room_id, created_by, record) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO UPDATE SET record = EXCLUDED.record', [record.id, request.params.id, request.user.sub, record]);
    response.status(201).json({ record });
  } catch (error) { next(error); }
});

io.use(async (socket, next) => {
  try {
    const claims = jwt.verify(socket.handshake.auth?.token, jwtSecret);
    const result = await pool.query('SELECT username FROM users WHERE id = $1', [claims.sub]);
    if (!result.rowCount) return next(new Error('Authentication required.'));
    socket.user = { ...claims, username:result.rows[0].username };
    next();
  } catch { next(new Error('Authentication required.')); }
});
io.on('connection', (socket) => socket.on('room:watch', async (roomId) => {
  const result = await pool.query('SELECT snapshot FROM rooms WHERE id = $1', [roomId]);
  const room = result.rows[0]?.snapshot;
  if (room && (room.ownerId === socket.user.sub || room.members.some((member) => member.id === socket.user.sub))) socket.join(roomId);
}).on('room:unwatch', (roomId) => socket.leave(roomId)));

app.use(express.static(path.join(root, 'dist')));
app.get('/{*splat}', (_request, response) => response.sendFile(path.join(root, 'dist/index.html')));
app.use((error, _request, response, _next) => {
  const status = error instanceof z.ZodError ? 400 : 500;
  if (status === 500) console.error(error);
  response.status(status).json({ error: status === 400 ? 'Invalid request.' : error.message || 'Unexpected server error.' });
});

const port = Number(process.env.PORT || 10000);
httpServer.listen(port, () => console.log(`Gdreed server listening on ${port}`));
