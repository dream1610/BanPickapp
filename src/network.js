import { io } from 'socket.io-client';

const TOKEN_KEY = 'gdreed-session-token';
let socket;
let roomListener = () => {};
export const token = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (value) => value ? localStorage.setItem(TOKEN_KEY, value) : localStorage.removeItem(TOKEN_KEY);
export async function request(path, options = {}) {
  const response = await fetch(path, { ...options, headers:{ 'Content-Type':'application/json', ...(token() ? { Authorization:`Bearer ${token()}` } : {}), ...(options.headers || {}) } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'Network request failed.');
  return body;
}
export const listRooms = () => request('/api/rooms');
export const createRoomRemote = () => request('/api/rooms', { method:'POST' });
export const joinRoomRemote = (code) => request('/api/rooms/join', { method:'POST', body:JSON.stringify({ code }) });
export const commandRoom = (id, type, payload = {}) => request(`/api/rooms/${id}/commands`, { method:'POST', body:JSON.stringify({ type, payload }) });
export function connectRealtime(onRoom) { roomListener = onRoom; socket?.disconnect(); if (!token()) return; socket = io({ auth:{ token:token() } }); socket.on('room:updated', (room) => roomListener(room)); }
export function watchRoom(id) { socket?.emit('room:watch', id); }
export function disconnectRealtime() { socket?.disconnect(); socket = undefined; }
