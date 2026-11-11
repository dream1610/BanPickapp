const SETTINGS_KEY = 'gdreed-media-settings';
const defaults = { master: 0.55, music: 0.5, sfx: 0.7, muted: false };
const publicAsset = (path) => `${import.meta.env.BASE_URL}${path}`;
const files = {
  background: publicAsset('media/background-video/background.mp4'),
  music: ['1.opus','2.opus','3.opus','4.opus','5.opus','6.wav','7.opus','8.opus','9.opus','10.opus'].map((file) => publicAsset(`media/background-music/${file}`)),
  veto: publicAsset('media/ban-pick-music/ban-pick.opus'),
  select: publicAsset('media/sfx/select.mp3'), ban: publicAsset('media/sfx/bansound.mp3'), pick: publicAsset('media/sfx/chonsound.mp3'),
};
let settings = { ...defaults, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') };
let roomPreferences = { musicEnabled:true, vetoMusicEnabled:true, sfxEnabled:true };
let unlocked = false; let vetoMode = false; let index = Math.floor(Math.random() * files.music.length); let failedTracks = 0; let lastSelect = 0;
const music = new Audio(); music.preload = 'none'; music.loop = false;
const veto = new Audio(files.veto); veto.preload = 'none'; veto.loop = true;
const sound = (src) => { const audio = new Audio(src); audio.preload = 'auto'; audio.volume = volume('sfx'); return audio; };
function volume(kind) { return settings.muted ? 0 : settings.master * settings[kind]; }
function save() { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); apply(); }
function fade(audio, target, ms = 700) { const start = audio.volume, tick = 50, steps = Math.max(1, ms / tick), delta = (target - start) / steps; const timer = setInterval(() => { audio.volume = Math.max(0, Math.min(1, audio.volume + delta)); if ((delta >= 0 && audio.volume >= target) || (delta < 0 && audio.volume <= target)) { audio.volume = target; clearInterval(timer); if (target === 0 && ((audio === music && vetoMode) || (audio === veto && !vetoMode))) audio.pause(); } }, tick); }
function nextTrack() { if (!roomPreferences.musicEnabled || vetoMode || failedTracks >= files.music.length) return; index = (index + 1) % files.music.length; failedTracks += 1; music.src = files.music[index]; music.volume = 0; music.play().then(() => { failedTracks = 0; fade(music, volume('music')); }).catch(() => {}); }
music.addEventListener('ended', () => { failedTracks = 0; nextTrack(); });
music.addEventListener('error', nextTrack);
export function unlockMedia() { if (unlocked) return; unlocked = true; if (vetoMode && roomPreferences.vetoMusicEnabled) setVetoMedia(true); else nextTrack(); }
export function setRoomMediaPreferences(preferences = {}) {
  roomPreferences = { ...roomPreferences, ...preferences };
  if (!roomPreferences.musicEnabled) { fade(music, 0, 400); music.pause(); }
  else if (unlocked && !vetoMode && music.paused) nextTrack();
  if (!roomPreferences.vetoMusicEnabled) { fade(veto, 0, 400); veto.pause(); }
  else if (unlocked && vetoMode && veto.paused) setVetoMedia(true);
}
export function setVetoMedia(active) {
  if (unlocked && vetoMode === active && (active ? !veto.paused : !music.paused)) return;
  vetoMode = active;
  if (!unlocked) return;
  if (active) {
    fade(music, 0, 1000);
    if (roomPreferences.vetoMusicEnabled) { veto.volume = 0; veto.play().then(() => fade(veto, volume('music'), 1000)).catch(() => {}); }
    else { veto.pause(); if (roomPreferences.musicEnabled) nextTrack(); }
  } else {
    fade(veto, 0, 650);
    if (roomPreferences.musicEnabled) nextTrack();
    else music.pause();
  }
}
export function playSfx(type) { if (!unlocked || settings.muted || !roomPreferences.sfxEnabled) return; if (type === 'select') { if (Date.now() - lastSelect < 90) return; lastSelect = Date.now(); } const audio = sound(files[type]); audio.play().catch(() => {}); }
export function getMediaSettings() { return { ...settings }; }
export function updateMediaSettings(patch) { settings = { ...settings, ...patch }; save(); }
export function videoMarkup(preferences = {}) { const enabled = preferences.videoEnabled !== false; const opacity = preferences.videoOpacity ?? 0.32; return `<video class="background-video ${enabled ? '' : 'is-hidden'}" style="--video-opacity:${opacity}" autoplay muted loop playsinline aria-hidden="true" onloadeddata="this.classList.add('is-ready')" onerror="this.classList.add('has-error')"><source src="${files.background}" type="video/mp4"></video>`; }
function apply() { music.volume = volume('music'); veto.volume = volume('music'); }
