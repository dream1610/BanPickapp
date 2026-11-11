import { request, setToken } from './network.js';

const SESSION = 'gdreed-local-session';
export function currentUser() { return JSON.parse(localStorage.getItem(SESSION) || 'null'); }
export function signOut() { localStorage.removeItem(SESSION); setToken(null); }
async function authenticate(path, username, password) {
  const { user, token } = await request(path, { method:'POST', body:JSON.stringify({ username, password }) });
  setToken(token);
  localStorage.setItem(SESSION, JSON.stringify(user));
  return user;
}
export const register = (username, password) => authenticate('/api/auth/register', username, password);
export const signIn = (username, password) => authenticate('/api/auth/login', username, password);
