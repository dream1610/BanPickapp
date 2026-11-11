import { io } from 'socket.io-client';
import { Capacitor } from '@capacitor/core';

const TOKEN_KEY = 'gdreed-session-token';
const isDesktopFile = typeof window !== 'undefined' && window.location.protocol === 'file:';
const apiBaseUrl = (import.meta.env?.VITE_API_BASE_URL || (Capacitor.isNativePlatform() || isDesktopFile ? 'https://gdreed-draft-console.onrender.com' : '')).replace(/\/+$/, '');
let socket;
let roomListener = () => {};
let watchedRoomId;
let serverClockOffset = 0;
export const token = () => localStorage.getItem(TOKEN_KEY);
export const serverNow = () => Date.now() + serverClockOffset;
export const setToken = (value) => value ? localStorage.setItem(TOKEN_KEY, value) : localStorage.removeItem(TOKEN_KEY);
export const resolveApiUrl = (path) => `${apiBaseUrl}${path}`;
export async function syncServerClock() {
  const startedAt = Date.now();
  let response = await fetch(resolveApiUrl('/api/clock'), { cache:'no-store' });
  let body = await response.json().catch(() => ({}));
  let serverTime = Number(body.now);
  if (!Number.isFinite(serverTime)) {
    response = await fetch(resolveApiUrl('/api/health'), { cache:'no-store' });
    body = await response.json();
    serverTime = Date.parse(body.now);
  }
  const receivedAt = Date.now();
  if (!response.ok || !Number.isFinite(serverTime)) throw new Error('Could not synchronize server time.');
  serverClockOffset = serverTime - (startedAt + receivedAt) / 2;
  return serverClockOffset;
}
export async function request(path, options = {}) {
  const response = await fetch(resolveApiUrl(path), { ...options, headers:{ 'Content-Type':'application/json', ...(token() ? { Authorization:`Bearer ${token()}` } : {}), ...(options.headers || {}) } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'Network request failed.');
  return body;
}
export const listRooms = () => request('/api/rooms');
export const createRoomRemote = () => request('/api/rooms', { method:'POST' });
export const joinRoomRemote = (code) => request('/api/rooms/join', { method:'POST', body:JSON.stringify({ code }) });
export const commandRoom = (id, type, payload = {}) => request(`/api/rooms/${id}/commands`, { method:'POST', body:JSON.stringify({ type, payload }) });
export const listMatches = () => request('/api/matches');
export const deleteAccountRemote = () => request('/api/account', { method:'DELETE' });
export const saveMatchRemote = (roomId, record) => request(`/api/rooms/${roomId}/matches`, { method:'POST', body:JSON.stringify({ record }) });
export function connectRealtime(onRoom) { roomListener = onRoom; socket?.disconnect(); watchedRoomId = undefined; if (!token()) return; socket = io(apiBaseUrl || undefined, { auth:{ token:token() } }); socket.on('room:updated', (room) => roomListener(room)); }
export function watchRoom(id) { if (watchedRoomId && watchedRoomId !== id) socket?.emit('room:unwatch', watchedRoomId); watchedRoomId = id; socket?.emit('room:watch', id); }
export function disconnectRealtime() { socket?.disconnect(); socket = undefined; watchedRoomId = undefined; }
