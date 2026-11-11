import './style.css';
import './ui-enhancements.css';
import { FORMATS, MAPS, MAP_TACTICS, STATES, addAudit, assignCaptain, autoAction, balanceTeams, createRoom, currentStep, mapById, pauseDraft, performDraftAction, resumeDraft, startDraft, teamMembers } from './core.js';
import { currentUser, register, signIn, signOut } from './auth.js';
import { commandRoom, connectRealtime, createRoomRemote, disconnectRealtime, joinRoomRemote, listMatches, listRooms, saveMatchRemote, watchRoom } from './network.js';
import { getMediaSettings, playSfx, setRoomMediaPreferences, setVetoMedia, unlockMedia, updateMediaSettings, videoMarkup } from './media.js';
import { OFFICIAL_SCENE_GALLERIES } from './official-scenes.js';
import { createMatchRecord, loadMatchArchive, saveMatchRecord } from './archive.js';
const sceneImages = (map) => OFFICIAL_SCENE_GALLERIES[map.id] || [];
const coverImage = (map) => sceneImages(map)[0] || map.image;

const STORAGE = 'gdreed-draft-mvp';
const ROOMS_STORAGE = 'gdreed-local-rooms';
const ACTIVE_ROOM_STORAGE = 'gdreed-active-room';
const roomDefaults = { selectedMapIds:MAPS.map((map)=>map.id), mapPoolPreset:'ALL_OFFICIAL', turnDuration:30, startTeam:'A', timeoutBehavior:'FIRST_AVAILABLE', sideTimeout:'Attack', sideSelectionPolicy:'OPPONENT', allowPause:true, maxPauseSeconds:300, allowSpectators:true, spectatorRatings:false, maxMembers:10, readyCheck:false, visibility:'Private', teamMode:'AUTO_BALANCE', balanceBy:'RATING_SEED', discordLobby:'', discordTeamA:'', discordTeamB:'', showDiscord:true, videoEnabled:true, videoOpacity:0.32, musicEnabled:true, vetoMusicEnabled:true, sfxEnabled:true };
function normalizeRoom(value) {
  if (!value) return null;
  value.settings = { ...roomDefaults, ...(value.settings || {}) };
  value.teams ??= { A:{name:'Team Aureum', captainId:null}, B:{name:'Team Obsidian', captainId:null} };
  value.members ??= [];
  if (!value.ownerId && currentUser()) { value.ownerId = currentUser().id; value.owner = currentUser().username; }
  value.members.forEach((member) => { member.ready ??= true; });
  value.draft ??= { id:null, step:0, actions:[], deadline:null, pausedRemaining:null, pausedAt:null, sides:[], scores:{} };
  value.draft.scores ??= {};
  if (!Array.isArray(value.maps) || !value.maps.length || value.maps.some((map) => !map.image)) value.maps = structuredClone(MAPS);
  return value;
}
function readRooms() {
  try {
    const stored = JSON.parse(localStorage.getItem(ROOMS_STORAGE) || 'null');
    if (Array.isArray(stored)) return stored.map(normalizeRoom).filter(Boolean);
    const legacy = JSON.parse(localStorage.getItem(STORAGE) || 'null');
    return legacy ? [normalizeRoom(legacy)] : [];
  } catch { return []; }
}
let rooms = [];
let room = null;
let view = 'maps'; let detailId = 'ascent'; let menu = false; let authMode = 'login'; let notice = ''; let galleryIndex = 0; let audioOpen = false; let pendingView = null; let selectedMatchId = null; let matchRecords = [];
const app = document.querySelector('#app');
const save = () => {
  if (!room) return;
  normalizeRoom(room);
  const index = rooms.findIndex((item) => item.id === room.id);
  if (index < 0) rooms.push(room); else rooms[index] = room;
  localStorage.setItem(ACTIVE_ROOM_STORAGE, room.id);
};
function activateRoom(nextRoom) { room = normalizeRoom(nextRoom); save(); watchRoom(room.id); }
async function refreshRooms() {
  const result = await listRooms();
  rooms = result.rooms.map(normalizeRoom);
  const active = rooms.find((item) => item.id === localStorage.getItem(ACTIVE_ROOM_STORAGE));
  if (active) activateRoom(active);
}
async function refreshMatches() { matchRecords = (await listMatches()).matches; }
async function remoteCommand(type, payload = {}) {
  if (!room) throw new Error('Choose a room first.');
  const result = await commandRoom(room.id, type, payload);
  activateRoom(result.room);
  return room;
}
let configurationTimer;
function queueConfigurationSync() {
  if (!room || currentUser()?.id !== room.ownerId) return;
  clearTimeout(configurationTimer);
  configurationTimer = setTimeout(() => remoteCommand('UPDATE_SETTINGS', {
    name:room.name, description:room.description, format:room.format, teams:room.teams, settings:room.settings,
  }).then(render).catch((error) => feedback(error.message)), 450);
}
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const safeExternalUrl = (value) => { try { const url = new URL(value); return url.protocol === 'https:' ? esc(url.href) : ''; } catch { return ''; } };
const time = (ms) => { const n = Math.max(0, Math.ceil(ms / 1000)); return `00:${String(n).padStart(2, '0')}`; };

function header() {
  const user = currentUser(); const audio = getMediaSettings();
  return `<header class="site-header"><div class="left-actions"><button class="menu-trigger" data-action="menu"><i></i><i></i><span>MENU</span></button></div><button class="wordmark" data-view="maps"><span>G</span><b>DRAFT CONSOLE</b></button><div class="header-actions"><button class="sound-trigger" data-action="audio" aria-label="Audio settings">${audio.muted ? '◌' : '◉'}</button>${user ? `<button class="account" data-action="account">${esc(user.username)}</button>` : '<button class="account" data-action="auth">Sign in</button>'}</div></header>`;
}
function audioPanel() { const a = getMediaSettings(); return audioOpen ? `<aside class="audio-panel"><div><span>Sound</span><button data-action="audio">×</button></div><label>Master <input data-audio="master" type="range" min="0" max="1" step="0.05" value="${a.master}"></label><label>Music <input data-audio="music" type="range" min="0" max="1" step="0.05" value="${a.music}"></label><label>SFX <input data-audio="sfx" type="range" min="0" max="1" step="0.05" value="${a.sfx}"></label><button class="quiet-control" data-action="mute">${a.muted ? 'Unmute' : 'Mute'}</button></aside>` : ''; }
function footer() { return `<footer>Developed by Gdreed · Unofficial VALORANT companion experience</footer>`; }
function overlay() {
  return menu ? `<aside class="menu-overlay"><button class="close-menu" data-action="menu">× &nbsp; CLOSE</button><div class="menu-visual"></div><div class="menu-links"><button data-view="maps">Map Library</button><button data-view="banpick">Ban / Pick</button><button data-view="archive">Hall of Fame</button><button data-view="tournament">Tournament Center</button><button data-view="settings">Settings</button><button data-view="about">About Gdreed</button></div><p>VALORANT DRAFT CONSOLE</p></aside>` : '';
}
function home() {
 return `<section class="home-view"><div class="hero-copy"><p>THE RITUAL BEFORE THE MATCH</p><h1>Every map<br><em>tells a story.</em></h1><div class="hero-actions"><button class="text-link" data-view="banpick">Enter Ban / Pick <span>↗</span></button><button class="text-link" data-view="maps">Explore maps <span>↗</span></button></div></div><div class="hero-veil"><span>GDREED</span><small>FOR THE DISCIPLINED</small></div></section>`;
}
function mapLibrary() {
 return `<section class="library-view"><div class="editorial-head"><p>MAP LIBRARY</p><h1>Know the ground<br><em>before you choose it.</em></h1><span>Official VALORANT collection · ${MAPS.length} maps</span></div><div class="map-list">${MAPS.map((m) => `<button class="library-map" style="--tone:${m.tone};--image:url('${coverImage(m)}')" data-detail="${m.id}"><span class="map-preview" aria-hidden="true"></span><strong>${m.name}</strong><em>${m.district}</em><i>↗</i></button>`).join('')}</div><small class="source-note">Map imagery and descriptions sourced from the official VALORANT Maps page.</small></section>`;
}
function mapDetail() {
 const m = mapById(detailId); const gallery = sceneImages(m); const active = gallery[galleryIndex] || coverImage(m); const minimap = `${import.meta.env.BASE_URL}media/maps/minimaps/${m.id}.png`; const tactics = MAP_TACTICS[m.id];
 return `<section class="detail-view" style="--tone:${m.tone}"><button class="back-link" data-view="maps">← &nbsp; Map Library</button><div class="detail-hero"><p>${m.district}</p><h1>${m.name}</h1><span>${m.style}</span></div><div class="map-story"><article><small>THE MAP</small><p>${m.description}</p></article><article><small>TACTICAL PROFILE</small><ul>${m.profile.map((x) => `<li>${x}</li>`).join('')}</ul></article></div><section class="tactical-dossier"><small>TACTICAL DOSSIER · COMMUNITY ESTIMATE</small><div class="tactical-stats"><div><span>Sites</span><strong>${tactics.sites}</strong></div><div><span>Difficulty</span><strong>${tactics.difficulty}</strong></div><div><span>Engagement range</span><strong>${tactics.range}</strong></div><div><span>Mid priority</span><strong>${tactics.midPriority}</strong></div><div><span>Special mechanic</span><strong>${tactics.mechanic}</strong></div></div><div class="agent-recommendations"><small>AGENT RECOMMENDATIONS</small><div class="agent-list">${tactics.agents.map(([name, role, reason]) => `<article class="agent-card"><span class="agent-mark" aria-hidden="true">${name.slice(0,2).toUpperCase()}</span><div><strong>${name}</strong><span>${role} · ${reason}</span></div></article>`).join('')}</div></div></section><section class="map-gallery"><small>VISUAL ARCHIVE</small><div class="gallery-main" style="--gallery:url('${active}');--fallback:url('${coverImage(m)}')"><span>${m.name} · visual archive</span></div><div class="gallery-thumbs">${gallery.map((image,index) => `<button class="${index===galleryIndex?'active':''}" style="--thumb:url('${image}');--fallback:url('${coverImage(m)}')" data-gallery="${index}" aria-label="View ${m.name} scene ${index+1}"></button>`).join('')}</div></section><section class="minimap-section"><small>MINIMAP</small><div class="minimap-frame"><img src="${minimap}" alt="${m.name} minimap" onerror="this.style.display='none';this.nextElementSibling.style.display='grid'"/><div class="minimap-placeholder"><b>${m.code}</b><span>Add <code>public/media/maps/minimaps/${m.id}.png</code></span></div></div></section></section>`;
}
function progress() {
 const stage = room.state === STATES.SUMMARY ? 'Result' : [STATES.DRAFT, STATES.PAUSED].includes(room.state) ? 'Veto' : 'Room';
 return `<div class="flow"><span class="${stage === 'Room' ? 'now' : ''}">Room</span><i></i><span class="${stage === 'Veto' ? 'now' : ''}">Veto</span><i></i><span class="${stage === 'Result' ? 'now' : ''}">Result</span></div>`;
}
function player(m, t) { return `<button class="member ${m.captain ? 'captain' : ''}" data-captain="${t}:${m.id}"><i>${m.seed}</i><span>${esc(m.name)}</span><em>${m.rating}</em>${m.captain ? '<b>Captain</b>' : ''}</button>`; }
function legacyRoomView() {
 const a = teamMembers(room, 'A'), b = teamMembers(room, 'B'), s = room.settings;
 const pool = MAPS.map((m) => `<button class="pool-map ${s.selectedMapIds.includes(m.id)?'on':''}" style="--image:url('${coverImage(m)}')" data-pool="${m.id}"><span>${m.name}</span></button>`).join('');
 const select = (key, options) => `<select data-setting="${key}">${options.map(([v,l])=>`<option value="${v}" ${s[key]===v?'selected':''}>${l}</option>`).join('')}</select>`;
 return `<section class="banpick-view"><div class="editorial-head compact"><p>BAN / PICK · OWNER ROOM SETTINGS</p><h1>${esc(room.name)}</h1>${progress()}</div><section class="owner-settings"><div class="owner-section"><small>MATCH</small><div class="owner-fields"><label>Room name<input data-field="name" value="${esc(room.name)}"></label><label>Format<select data-field="format">${Object.entries(FORMATS).map(([k,v])=>`<option value="${k}" ${room.format===k?'selected':''}>${k} · ${v.label}</option>`).join('')}</select></label><label>Turn duration${select('turnDuration',[[15,'15 seconds'],[30,'30 seconds'],[45,'45 seconds'],[60,'60 seconds']])}</label><label>First action${select('startTeam',[['A','Team A'],['B','Team B']])}</label></div></div><div class="owner-section"><small>MAP POOL · ${s.selectedMapIds.length} SELECTED</small><div class="pool-grid">${pool}</div></div><div class="owner-section"><small>ROOM & RULES</small><div class="owner-fields"><label>Visibility${select('visibility',[['Private','Private'],['Public','Public']])}</label><label>Spectators${select('allowSpectators',[[true,'Allowed'],[false,'Disabled']])}</label><label>Team mode${select('teamMode',[['AUTO_BALANCE','Auto balance'],['MANUAL','Manual setup'],['FLEXIBLE','Flexible teams']])}</label><label>Timeout${select('timeoutBehavior',[['FIRST_AVAILABLE','First available map'],['RANDOM','Random valid map'],['PAUSE_FOR_OWNER','Pause for owner']])}</label><label>Side timeout${select('sideTimeout',[['Attack','Attack'],['Defense','Defense']])}</label></div></div><div class="owner-section"><small>DISCORD LINKS</small><div class="owner-fields discord-fields"><label>Lobby voice<input data-setting="discordLobby" placeholder="https://discord.gg/..." value="${esc(s.discordLobby)}"></label><label>Team A voice<input data-setting="discordTeamA" placeholder="https://discord.gg/..." value="${esc(s.discordTeamA)}"></label><label>Team B voice<input data-setting="discordTeamB" placeholder="https://discord.gg/..." value="${esc(s.discordTeamB)}"></label></div></div><div class="owner-section"><small>VISUAL ENVIRONMENT</small><div class="owner-fields"><label>Background video${select('videoEnabled',[[true,'Enabled'],[false,'Disabled']])}</label><label>Video opacity<input data-setting="videoOpacity" type="range" min="0.1" max="0.6" step="0.05" value="${s.videoOpacity}"></label></div></div></section><div class="teams-flow"><article><p>TEAM A</p><h2>${esc(room.teams.A.name)}</h2>${a.length?a.map((m)=>player(m,'A')).join(''):'<span class="soft">Awaiting allocation</span>'}</article><article><p>TEAM B</p><h2>${esc(room.teams.B.name)}</h2>${b.length?b.map((m)=>player(m,'B')).join(''):'<span class="soft">Awaiting allocation</span>'}</article></div><div class="flow-footer"><small>${notice||'Select captains, configure the room, then begin.'}</small><button class="text-link" data-action="balance">Balance teams ↗</button><button class="text-link" data-action="start">Begin the protocol <span>↗</span></button></div></section>`;
}
function roomView() {
 const a = teamMembers(room, 'A'), b = teamMembers(room, 'B'), s = room.settings;
 const owner = currentUser()?.id === room.ownerId;
 const lock = owner ? '' : 'disabled';
 const select = (key, options) => `<select data-setting="${key}" ${lock}>${options.map(([value, label]) => `<option value="${value}" ${s[key] === value ? 'selected' : ''}>${label}</option>`).join('')}</select>`;
 const pool = MAPS.map((map) => `<button class="pool-map ${s.selectedMapIds.includes(map.id) ? 'on' : ''}" style="--image:url('${coverImage(map)}')" data-pool="${map.id}" ${lock}><span>${map.name}</span></button>`).join('');
 const roster = room.members.map((member) => `<div class="member-assignment"><span>${esc(member.name)}</span><select data-member-team="${member.id}" ${lock}><option value="" ${!member.team ? 'selected' : ''}>Unassigned</option><option value="A" ${member.team === 'A' ? 'selected' : ''}>Team A</option><option value="B" ${member.team === 'B' ? 'selected' : ''}>Team B</option></select><button class="ready-toggle ${member.ready ? 'is-ready' : ''}" data-ready="${member.id}" aria-label="${member.ready ? 'Ready' : 'Not ready'}">${member.ready ? 'Ready' : 'Not ready'}</button></div>`).join('');
 const canStart = room.members.length >= 2 && (s.teamMode !== 'MANUAL' || (a.length > 0 && b.length > 0)) && (!s.readyCheck || room.members.every((member) => member.ready));
 return `<section class="banpick-view"><div class="editorial-head compact"><p>BAN / PICK · ROOM ${esc(room.code)}</p><h1>${esc(room.name)}</h1>${progress()}<small class="room-invite">Room code · ${esc(room.code)} · ${room.members.length}/${s.maxMembers} members</small></div><section class="owner-settings"><div class="owner-section"><small>MATCH</small><div class="owner-fields"><label>Room name<input data-field="name" value="${esc(room.name)}" ${lock}></label><label>Match / event<input data-field="description" value="${esc(room.description || '')}" placeholder="Optional" ${lock}></label><label>Format<select data-field="format" ${lock}>${Object.entries(FORMATS).map(([key, value]) => `<option value="${key}" ${room.format === key ? 'selected' : ''}>${key} · ${value.label}</option>`).join('')}</select></label><label>Turn duration${select('turnDuration',[[15,'15 seconds'],[30,'30 seconds'],[45,'45 seconds'],[60,'60 seconds']])}</label><label>First action${select('startTeam',[['A','Team A'],['B','Team B'],['COIN_TOSS','Local coin toss']])}</label><label>Rule preset<select disabled><option>${esc(room.format)} · current protocol</option></select></label></div></div><div class="owner-section"><small>MAP POOL · ${s.selectedMapIds.length} SELECTED</small><div class="pool-grid">${pool}</div><small class="settings-hint">At least 7 maps are required for the current protocols.</small></div><div class="owner-section"><small>ROOM & RULES</small><div class="owner-fields"><label>Visibility${select('visibility',[['Private','Private'],['Public','Public']])}</label><label>Spectators${select('allowSpectators',[[true,'Allowed'],[false,'Disabled']])}</label><label>Spectators see ratings${select('spectatorRatings',[[false,'Hidden'],[true,'Visible']])}</label><label>Member limit${select('maxMembers',[[2,'2'],[6,'6'],[10,'10'],[20,'20']])}</label><label>Ready check${select('readyCheck',[[false,'Off'],[true,'On']])}</label><label>Team mode${select('teamMode',[['AUTO_BALANCE','Auto balance'],['MANUAL','Manual setup'],['FLEXIBLE','Flexible teams']])}</label><label>Balance by${select('balanceBy',[['RATING_SEED','Rating + seed'],['RATING','Rating'],['SEED','Seed']])}</label><label>Timeout behavior${select('timeoutBehavior',[['FIRST_AVAILABLE','First available map'],['RANDOM','Deterministic random map'],['PAUSE_FOR_OWNER','Pause for owner']])}</label><label>Side on timeout${select('sideTimeout',[['Attack','Attack'],['Defense','Defense']])}</label><label>Side selection${select('sideSelectionPolicy',[['OPPONENT','Opponent of picker'],['PICKING_TEAM','Map-picking team'],['OWNER','Room owner'],['FORMAT','Format default']])}</label><label>Pause${select('allowPause',[[true,'Allowed'],[false,'Disabled']])}</label><label>Maximum pause${select('maxPauseSeconds',[[60,'1 minute'],[180,'3 minutes'],[300,'5 minutes'],[600,'10 minutes']])}</label></div></div><div class="owner-section"><small>TEAMS</small><div class="owner-fields"><label>Team A<input data-team-name="A" value="${esc(room.teams.A.name)}" ${lock}></label><label>Team B<input data-team-name="B" value="${esc(room.teams.B.name)}" ${lock}></label></div><div class="member-assignments">${roster || '<span class="soft">Join with the room code to add players.</span>'}</div></div><div class="owner-section"><small>DISCORD LINKS</small><div class="owner-fields discord-fields"><label>Lobby voice<input data-setting="discordLobby" placeholder="https://discord.gg/..." value="${esc(s.discordLobby)}" ${lock}></label><label>Team A voice<input data-setting="discordTeamA" placeholder="https://discord.gg/..." value="${esc(s.discordTeamA)}" ${lock}></label><label>Team B voice<input data-setting="discordTeamB" placeholder="https://discord.gg/..." value="${esc(s.discordTeamB)}" ${lock}></label><label>Show links${select('showDiscord',[[true,'Visible'],[false,'Hidden']])}</label></div></div><div class="owner-section"><small>ROOM MEDIA</small><div class="owner-fields"><label>Background video${select('videoEnabled',[[true,'Enabled'],[false,'Disabled']])}</label><label>Video opacity<input data-setting="videoOpacity" type="range" min="0.1" max="0.6" step="0.05" value="${s.videoOpacity}" ${lock}></label><label>Background music${select('musicEnabled',[[true,'On'],[false,'Off']])}</label><label>Veto music${select('vetoMusicEnabled',[[true,'On'],[false,'Off']])}</label><label>Sound effects${select('sfxEnabled',[[true,'On'],[false,'Off']])}</label></div></div></section><div class="teams-flow"><article><p>TEAM A</p><h2>${esc(room.teams.A.name)}</h2>${a.length ? a.map((member) => player(member,'A')).join('') : '<span class="soft">Awaiting allocation</span>'}</article><article><p>TEAM B</p><h2>${esc(room.teams.B.name)}</h2>${b.length ? b.map((member) => player(member,'B')).join('') : '<span class="soft">Awaiting allocation</span>'}</article></div><div class="flow-footer"><small>${notice || (room.members.length < 2 ? 'Share the room code with another local account to add a player.' : 'Assign teams, appoint captains, then begin.')}</small><button class="text-link" data-action="balance" ${room.members.length < 2 || !owner ? 'disabled' : ''}>Balance teams ↗</button><button class="text-link" data-action="start" ${!canStart || !owner ? 'disabled' : ''}>Begin the protocol <span>↗</span></button><button class="quiet-control" data-action="room-list">Room list</button></div></section>`;
}
function roomExtrasView() {
 if (!room || room.state !== STATES.WAITING) return '';
 const owner = currentUser()?.id === room.ownerId;
 const lock = owner ? '' : 'disabled';
 const allMaps = room.settings.selectedMapIds.length === MAPS.length;
 const members = room.members.map((member) => `<div class="rating-seed-row"><strong>${esc(member.name)}</strong><label>Rating<input type="number" min="0" max="100" step="1" data-member-rating="${member.id}" value="${Number(member.rating) || 0}" ${lock}></label><label>Seed<input type="number" min="1" step="1" data-member-seed="${member.id}" value="${Math.max(1, Number(member.seed) || 1)}" ${lock}></label></div>`).join('');
 const links = room.settings.showDiscord ? [['Lobby',room.settings.discordLobby],['Team A',room.settings.discordTeamA],['Team B',room.settings.discordTeamB]].map(([label, value]) => [label, safeExternalUrl(value)]).filter(([, href]) => href) : [];
 return `<section class="owner-settings room-extras"><div class="owner-section"><small>ROOM ACCESS</small><div class="room-code-actions"><span>Room code <strong>${esc(room.code)}</strong></span><button class="quiet-control" data-action="copy-room-code">Copy code</button><span>${room.settings.visibility} · ${room.settings.allowSpectators ? 'Spectators allowed' : 'No spectators'}</span></div></div><div class="owner-section"><small>MAP POOL PRESET</small><div class="owner-fields"><label>Selection mode<select data-map-preset="pool" ${lock}><option value="ALL_OFFICIAL" ${room.settings.mapPoolPreset === 'ALL_OFFICIAL' && allMaps ? 'selected' : ''}>All official maps</option><option value="MANUAL" ${room.settings.mapPoolPreset === 'MANUAL' || !allMaps ? 'selected' : ''}>Manual selection</option></select></label><span class="settings-hint">Manual mode uses the image toggles above. At least 7 maps are required.</span><span class="rule-preset-note">Rule protocol · ${esc(FORMATS[room.format].label)} · data-driven steps</span></div></div><div class="owner-section"><small>PLAYER RATINGS & SEEDS</small><div class="rating-seed-list">${members || '<span class="soft">No members in this room.</span>'}</div></div><div class="owner-section"><small>DISCORD LINKS</small><div class="room-discord-links">${links.length ? links.map(([label, href]) => `<a href="${href}" target="_blank" rel="noopener noreferrer">${label} voice ↗</a>`).join('') : `<span>${room.settings.showDiscord ? 'Add an https:// Discord invite above to show room links.' : 'Discord links are hidden for this room.'}</span>`}</div></div></section>`;
}
function mountRoomExtras() {
 const teamSection = app.querySelector('.teams-flow');
 if (!teamSection) return;
 const invite = app.querySelector('.room-invite');
 if (invite && !app.querySelector('.room-exit-link')) {
  const back = document.createElement('button');
  back.className = 'quiet-control room-exit-link';
  back.dataset.action = 'room-list';
  back.textContent = '← Back to rooms';
  invite.after(back);
 }
 if (currentUser()?.id === room?.ownerId) {
  const ruleLabel = [...app.querySelectorAll('.owner-settings .owner-section label')].find((label) => label.textContent.startsWith('Rule preset'));
  ruleLabel?.remove();
 }
 const template = document.createElement('template');
 template.innerHTML = roomExtrasView();
 teamSection.before(template.content);
}
function roomHubView() {
 const user = currentUser();
 const ownedRooms = rooms.filter((item) => item.ownerId === user.id || item.members.some((member) => member.id === user.id));
 return `<section class="simple-view room-hub"><p>BAN / PICK</p><h1>Choose your<br><em>next match.</em></h1><div class="room-entry-actions"><button class="text-link" data-action="create-room">Create room <span>↗</span></button><button class="text-link" data-view="archive">Hall of Fame <span>↗</span></button></div><form id="join-room-form" class="join-room-form"><label>Room code<input name="roomCode" autocomplete="off" placeholder="GD-XXXX" required></label><button class="text-link" type="submit">Join room <span>↗</span></button></form><section class="local-room-list"><small>YOUR SHARED ROOMS</small>${ownedRooms.length ? ownedRooms.map((item) => `<button class="local-room-row" data-room="${item.id}"><span><strong>${esc(item.name)}</strong><small>${esc(item.code)} · ${item.members.length} members</small></span><i>↗</i></button>`).join('') : '<p>No rooms yet.</p>'}<small class="local-only-note">Rooms sync securely through the shared server.</small></section></section>`;
}
function archiveView() {
 const records = matchRecords;
 const selected = records.find((record) => record.id === selectedMatchId);
 if (selected) return `<section class="simple-view archive-view"><button class="back-link" data-action="archive-back">← &nbsp; Hall of Fame</button><p>MATCH ARCHIVE · ${esc(selected.roomCode)}</p><h1>${esc(selected.teams.A)} <em>v</em> ${esc(selected.teams.B)}</h1><div class="archive-summary"><span>${esc(selected.format)} · ${new Date(selected.recordedAt).toLocaleString()}</span><strong>${selected.winner ? `${esc(selected.teams[selected.winner])} won` : 'Draw'}</strong></div><div class="result-sheet">${selected.maps.map((map, index) => `<div class="result-line"><span>Map ${index + 1}</span><strong>${esc(map.mapName)}</strong><span>${map.teamA} : ${map.teamB}</span><em>${map.type === 'DECIDER' ? 'Decider' : `Selected by Team ${map.pickedBy}`}</em></div>`).join('')}</div><small>Recorded by ${esc(selected.createdBy)} · Room ${esc(selected.roomCode)}</small></section>`;
 return `<section class="simple-view archive-view"><p>HALL OF FAME</p><h1>Match<br><em>archive.</em></h1><div class="archive-list">${records.length ? records.map((record) => `<button class="archive-row" data-match="${record.id}"><span><strong>${esc(record.teams.A)} <i>v</i> ${esc(record.teams.B)}</strong><small>${esc(record.roomCode)} · ${esc(record.format)} · ${new Date(record.recordedAt).toLocaleString()}</small></span><em>${record.winner ? esc(record.teams[record.winner]) : 'Draw'} · ${record.mapWins.A}:${record.mapWins.B}</em></button>`).join('') : '<p>No recorded matches yet.</p>'}</div></section>`;
}
function actionTitle() { const s = currentStep(room); if (!s) return 'Protocol complete'; return s[0] === 'DECIDER' ? 'The final decider' : s[0] === 'SIDE' ? `Team ${s[1]} selects side` : `Team ${s[1]} ${s[0].toLowerCase()}s a map`; }
function mapCard(m) { const a = room.draft.actions.find((x) => x.mapId === m.id), disabled = !!a || room.state === STATES.PAUSED; return `<button class="veto-map ${a ? a.type.toLowerCase() : ''}" style="--tone:${m.tone};--image:url('${coverImage(m)}')" data-map="${m.id}" ${disabled ? 'disabled' : ''}><span>${m.code}</span><strong>${m.name}</strong><small>${a ? `${a.type} · ${a.team || 'SYSTEM'}` : m.style}</small></button>`; }
function vetoView() {
 const step = currentStep(room), side = step?.[0] === 'SIDE'; const ledger = room.draft.actions.map((a) => `<li><b>${a.type}</b><span>${mapById(a.mapId)?.name}</span><em>${a.team ? `Team ${a.team}` : 'Decider'}</em></li>`).join('');
 return `<section class="veto-view"><div class="veto-heading"><p>${room.state === STATES.PAUSED ? 'PROTOCOL PAUSED' : 'LIVE DRAFT'}</p><h1>${actionTitle()}</h1><div id="timer" class="timer">${room.state === STATES.PAUSED ? 'Paused' : time(room.draft.deadline - Date.now())}</div><button class="quiet-control" data-action="${room.state === STATES.PAUSED ? 'resume' : 'pause'}" ${room.settings.allowPause === false ? 'disabled' : ''}>${room.state === STATES.PAUSED ? 'Resume' : 'Pause'}</button>${progress()}</div><div class="veto-stage">${side ? '<div class="side-picker"><button data-side="Attack">Attack</button><button data-side="Defense">Defense</button></div>' : `<div class="veto-grid">${room.maps.map(mapCard).join('')}</div>`}<aside class="veto-ledger"><p>THE RECORD</p><ol>${ledger || '<li><span>Awaiting first action</span></li>'}</ol></aside></div></section>`;
}
function resultView() {
 const picks = room.draft.actions.filter((a) => a.type === 'PICK' || a.type === 'DECIDER');
 return `<section class="result-view"><div class="editorial-head compact"><p>THE RESULT</p><h1>${esc(room.teams.A.name)} <em>v</em> ${esc(room.teams.B.name)}</h1>${progress()}</div><div class="result-sheet">${picks.map((a, i) => { const score = room.draft.scores?.[a.mapId] || {}; return `<div class="result-line"><span>Map ${i + 1}</span><strong>${mapById(a.mapId).name}</strong><input type="number" min="0" step="1" aria-label="${esc(room.teams.A.name)} score on ${mapById(a.mapId).name}" data-score-map="${a.mapId}" data-score-team="A" value="${score.A ?? 0}"><i>:</i><input type="number" min="0" step="1" aria-label="${esc(room.teams.B.name)} score on ${mapById(a.mapId).name}" data-score-map="${a.mapId}" data-score-team="B" value="${score.B ?? 0}"><em>${a.type === 'DECIDER' ? 'Decider' : `Selected by Team ${a.team}`}</em></div>`; }).join('')}</div><div class="flow-footer"><small>Scores and map actions are saved to the shared match archive.</small><button class="text-link" data-action="record">Save result <span>↗</span></button></div></section>`;
}
function tournament() { return `<section class="simple-view"><p>TOURNAMENT CENTER</p><h1>The operation<br><em>comes next.</em></h1><div class="mist"><span>Match scheduling, brackets, public pages and tournament administration will connect to the Ban / Pick core when realtime storage is introduced.</span></div></section>`; }
function settings() { return `<section class="simple-view"><p>SETTINGS</p><h1>Keep the ritual<br><em>your own.</em></h1><div class="mist settings-list"><button data-action="reset">Create a new local room ↗</button><button data-action="auth">${currentUser() ? 'Account settings' : 'Sign in or create account'} ↗</button><span>Audio folders are ready in <code>public/media</code>. Playback will activate when assets are added.</span></div></section>`; }
function about() { return `<section class="simple-view"><p>ABOUT</p><h1>Built by<br><em>Gdreed.</em></h1><div class="mist"><span>Gdreed develops focused tools for organized play. This product is a map-veto ritual for Valorant communities, teams and tournament operators.</span></div></section>`; }
function authView() {
 const user = currentUser();
 if (user) return `<section class="auth-view"><div class="auth-copy"><p>ACCOUNT</p><h1>${esc(user.username)}</h1><span>Signed in to your shared account.</span></div><div class="auth-panel"><p class="account-note">Rooms and match history sync through the secure server.</p><button class="text-link" data-action="signout">Sign out <span>↗</span></button></div></section>`;
 return `<section class="auth-view"><div class="auth-copy"><p>${authMode === 'login' ? 'WELCOME BACK' : 'CREATE ACCOUNT'}</p><h1>${authMode === 'login' ? 'Sign in.' : 'Join the ritual.'}</h1><small>Use your account to create, join and synchronize draft rooms across devices.</small></div><div class="auth-panel"><form id="auth-form"><label>Username<input name="username" autocomplete="username" required></label><label>Password<input name="password" type="password" minlength="8" autocomplete="${authMode === 'login' ? 'current-password' : 'new-password'}" required></label><button class="text-link" type="submit">${authMode === 'login' ? 'Sign in' : 'Create account'} <span>↗</span></button></form><button class="quiet-control" data-action="toggle-auth">${authMode === 'login' ? 'Create an account' : 'I already have an account'}</button></div></section>`;
}
function body() { if (view === 'maps') return mapLibrary(); if (view === 'detail') return mapDetail(); if (view === 'banpick') return !room ? roomHubView() : [STATES.DRAFT, STATES.PAUSED].includes(room.state) ? vetoView() : room.state === STATES.SUMMARY ? resultView() : roomView(); if (view === 'archive') return archiveView(); if (view === 'tournament') return tournament(); if (view === 'settings') return settings(); if (view === 'about') return about(); if (view === 'auth') return authView(); return home(); }
function render() {
 save();
 setRoomMediaPreferences(room?.settings || {});
 document.body.classList.toggle('map-detail-open', view === 'detail');
 let video = document.querySelector('.background-video');
 if (!video) {
  const template = document.createElement('template');
  template.innerHTML = videoMarkup(room?.settings || {});
  video = template.content.firstElementChild;
  document.body.insertBefore(video, app);
 }
 const videoEnabled = room?.settings?.videoEnabled !== false;
 video.classList.toggle('is-hidden', !videoEnabled);
 video.style.setProperty('--video-opacity', String(room?.settings?.videoOpacity ?? 0.32));
 if (!videoEnabled) video.pause();
 else if (!document.hidden && video.paused && !video.error) video.play().catch(() => {});
 app.innerHTML = `<div class="app-content">${header()}${body()}${footer()}${audioPanel()}${overlay()}${notice ? `<div class="app-notice" role="status">${esc(notice)}</div>` : ''}</div>`;
 mountRoomExtras();
}
function feedback(text) { notice = text; render(); setTimeout(() => { notice = ''; render(); }, 3500); }
app.addEventListener('submit', async (e) => {
 const form = e.target;
 if (!['auth-form','join-room-form'].includes(form.id)) return;
 e.preventDefault(); e.stopImmediatePropagation();
 try {
  if (form.id === 'auth-form') {
   const data = new FormData(form);
   if (authMode === 'login') await signIn(data.get('username'), data.get('password'));
   else await register(data.get('username'), data.get('password'));
   connectRealtime((updatedRoom) => { activateRoom(updatedRoom); render(); });
   await refreshRooms();
   await refreshMatches();
  view = pendingView || 'maps'; pendingView = null;
  if (view === 'banpick') {
   if (room && !room.ownerId) { room.ownerId = currentUser().id; room.owner = currentUser().username; save(); }
   room = null; localStorage.removeItem(ACTIVE_ROOM_STORAGE);
  }
   feedback('Account ready. Your rooms now sync across devices.');
   return;
  }
  const user = currentUser();
  if (!user) throw new Error('Sign in before joining a room.');
  const code = new FormData(form).get('roomCode').trim().toUpperCase();
  const result = await joinRoomRemote(code);
  activateRoom(result.room); view = 'banpick'; menu = false; feedback(`Joined ${result.room.code}.`);
 } catch (error) { feedback(error.message); }
}, true);
app.addEventListener('click', async (e) => {
 const el = e.target.closest('[data-view],[data-action],[data-room],[data-match],[data-ready]');
 if (!el) return;
 const user = currentUser();
 if (el.dataset.view && ['banpick','archive'].includes(el.dataset.view) && !user) {
  pendingView = el.dataset.view; view = 'auth'; menu = false; e.preventDefault(); e.stopImmediatePropagation(); render(); return;
 }
 if (el.dataset.action === 'create-room' || el.dataset.action === 'reset') {
  if (!user) { pendingView = 'banpick'; view = 'auth'; e.preventDefault(); e.stopImmediatePropagation(); render(); return; }
  const result = await createRoomRemote();
  activateRoom(result.room); view = 'banpick'; menu = false; e.preventDefault(); e.stopImmediatePropagation(); feedback(`Room ${result.room.code} created.`); return;
 }
 if (el.dataset.room) {
  const target = rooms.find((item) => item.id === el.dataset.room);
  if (target) { activateRoom(target); view = 'banpick'; menu = false; e.preventDefault(); e.stopImmediatePropagation(); render(); }
  return;
 }
 if (el.dataset.match) {
  selectedMatchId = el.dataset.match; e.preventDefault(); e.stopImmediatePropagation(); render(); return;
 }
 if (el.dataset.action === 'archive-back') {
  selectedMatchId = null; e.preventDefault(); e.stopImmediatePropagation(); render(); return;
 }
 if (el.dataset.action === 'room-list') {
  room = null; localStorage.removeItem(ACTIVE_ROOM_STORAGE); view = 'banpick'; e.preventDefault(); e.stopImmediatePropagation(); render(); return;
 }
 if (el.dataset.action === 'copy-room-code') {
  e.preventDefault(); e.stopImmediatePropagation();
  if (!navigator.clipboard?.writeText) { feedback('Clipboard access is unavailable in this browser.'); return; }
  navigator.clipboard.writeText(room.code).then(() => feedback(`Room code ${room.code} copied.`)).catch(() => feedback('Could not copy the room code.'));
  return;
 }
 if (el.dataset.action === 'pause' || el.dataset.action === 'resume') {
  try {
   if (currentUser()?.id !== room?.ownerId) throw new Error('Only the room owner can control the draft timer.');
   await remoteCommand(el.dataset.action === 'pause' ? 'PAUSE' : 'RESUME');
   e.preventDefault(); e.stopImmediatePropagation(); render();
  } catch (error) { e.preventDefault(); e.stopImmediatePropagation(); feedback(error.message); }
  return;
 }
 if (el.dataset.ready) {
  const member = room?.members.find((item) => item.id === el.dataset.ready);
  if (member && currentUser()?.id === member.id) { await remoteCommand('SET_READY', { ready:!member.ready }); e.preventDefault(); e.stopImmediatePropagation(); render(); }
  return;
 }
 if (el.dataset.action === 'start') {
  try {
   if (!room || currentUser()?.id !== room.ownerId) throw new Error('Only the room owner can start this draft.');
   if (room.members.length < 2) throw new Error('Invite at least one more local account before starting.');
   await remoteCommand('START'); setVetoMedia(true); e.preventDefault(); e.stopImmediatePropagation(); render();
  } catch (error) { e.preventDefault(); e.stopImmediatePropagation(); feedback(error.message); }
  return;
 }
 if (el.dataset.action === 'record') {
  try {
   const record = createMatchRecord(room, room.draft.scores || {}, user?.username || room.owner);
   await remoteCommand('RECORD_RESULT', { scores:room.draft.scores || {} });
   await saveMatchRemote(room.id, record);
   await refreshMatches();
   room.draft.recorded = true;
   selectedMatchId = record.id; view = 'archive'; setVetoMedia(false); notice = 'Match saved to Hall of Fame.'; render();
  } catch (error) { feedback(error.message); }
  e.preventDefault(); e.stopImmediatePropagation(); return;
 }
}, true);
app.addEventListener('input', (e) => {
 const input = e.target;
 if (input.dataset.teamName && room) {
  room.teams[input.dataset.teamName].name = input.value.trim() || `Team ${input.dataset.teamName}`;
  queueConfigurationSync();
 }
 if (input.dataset.memberTeam && room) {
  const member = room.members.find((item) => item.id === input.dataset.memberTeam);
  if (member) {
   const oldTeam = member.team; member.team = input.value || null; member.captain = false;
   if (oldTeam && room.teams[oldTeam].captainId === member.id) room.teams[oldTeam].captainId = null;
   for (const team of ['A','B']) room.teams[team].captainId = room.members.some((item) => item.id === room.teams[team].captainId && item.team === team) ? room.teams[team].captainId : null;
   room.members.forEach((item) => { item.captain = room.teams[item.team]?.captainId === item.id; });
  remoteCommand('UPDATE_MEMBER', { memberId:member.id, team:member.team }).then(render).catch((error) => feedback(error.message)); render();
  }
 }
 if (input.dataset.scoreMap && room) {
  const score = Math.max(0, Math.floor(Number(input.value) || 0));
  room.draft.scores ??= {};
  room.draft.scores[input.dataset.scoreMap] ??= {};
  room.draft.scores[input.dataset.scoreMap][input.dataset.scoreTeam] = score;
  save();
 }
}, true);
app.addEventListener('input', (e) => { const el = e.target; if (el.dataset.field && room) { room[el.dataset.field] = el.value; queueConfigurationSync(); } if (el.dataset.setting && room) { const numeric=['turnDuration','videoOpacity','maxMembers','maxPauseSeconds'].includes(el.dataset.setting); room.settings[el.dataset.setting] = numeric ? Number(el.value) : el.value === 'true' ? true : el.value === 'false' ? false : el.value; queueConfigurationSync(); setRoomMediaPreferences(room.settings); } if (el.dataset.audio) updateMediaSettings({ [el.dataset.audio]: Number(el.value) }); });
app.addEventListener('click', (e) => { const poolMap = e.target.closest('[data-pool]'); if (poolMap && room) { room.settings.mapPoolPreset = 'MANUAL'; queueConfigurationSync(); } }, true);
app.addEventListener('change', (e) => {
 const el = e.target;
 if (el.dataset.mapPreset && room) {
  room.settings.mapPoolPreset = el.value;
  if (el.value === 'ALL_OFFICIAL') room.settings.selectedMapIds = MAPS.map((map) => map.id);
  queueConfigurationSync(); render(); return;
 }
 if (el.dataset.memberRating && room) {
  const member = room.members.find((item) => item.id === el.dataset.memberRating);
  const rating = Number(el.value);
  if (!member || !Number.isInteger(rating) || rating < 0 || rating > 100) { feedback('Rating must be a whole number from 0 to 100.'); return; }
  member.rating = rating; remoteCommand('UPDATE_MEMBER', { memberId:member.id, rating }).then(render).catch((error) => feedback(error.message)); render(); return;
 }
 if (el.dataset.memberSeed && room) {
  const member = room.members.find((item) => item.id === el.dataset.memberSeed);
  const seed = Number(el.value);
  if (!member || !Number.isInteger(seed) || seed < 1) { feedback('Seed must be a positive whole number.'); return; }
  member.seed = seed; remoteCommand('UPDATE_MEMBER', { memberId:member.id, seed }).then(render).catch((error) => feedback(error.message)); render(); return;
 }
 if (el.dataset.field === 'format' || ['videoEnabled','showDiscord','discordLobby','discordTeamA','discordTeamB'].includes(el.dataset.setting)) render();
});
app.addEventListener('input', (e) => { if (e.target.dataset.setting === 'videoOpacity') document.querySelector('.background-video')?.style.setProperty('--video-opacity', String(e.target.value)); });
app.addEventListener('pointerover', (e) => { if (e.target.closest('button')) playSfx('select'); });
app.addEventListener('pointerdown', () => unlockMedia(), { once:true });
document.addEventListener('visibilitychange', () => { const video=document.querySelector('.background-video'); if (!video) return; if (document.hidden) video.pause(); else video.play().catch(()=>{}); });
app.addEventListener('submit', async (e) => { if (e.target.id !== 'auth-form') return; e.preventDefault(); const data = new FormData(e.target); try { if (authMode === 'login') await signIn(data.get('username'), data.get('password')); else await register(data.get('username'), data.get('password')); view = 'maps'; feedback('Account ready on this device.'); render(); } catch (error) { feedback(error.message); render(); } });
app.addEventListener('click', async (e) => { const el = e.target.closest('[data-action],[data-map],[data-side],[data-captain],[data-view],[data-detail],[data-gallery],[data-pool]'); if (!el) return; try { unlockMedia(); if (el.dataset.view) { view = el.dataset.view; menu = false; audioOpen = false; render(); return; } if (el.dataset.detail) { detailId = el.dataset.detail; galleryIndex = 0; view = 'detail'; render(); return; } if (el.dataset.gallery !== undefined) { galleryIndex = Number(el.dataset.gallery); render(); return; } if (el.dataset.pool) { const ids=room.settings.selectedMapIds; if (ids.includes(el.dataset.pool)) { if (ids.length <= 7) throw new Error('Map pool must retain at least 7 maps.'); room.settings.selectedMapIds=ids.filter((id)=>id!==el.dataset.pool); } else room.settings.selectedMapIds=[...ids,el.dataset.pool]; render(); return; } if (el.dataset.action === 'menu') { menu = !menu; render(); return; } if (el.dataset.action === 'audio') { audioOpen = !audioOpen; render(); return; } if (el.dataset.action === 'mute') { updateMediaSettings({ muted: !getMediaSettings().muted }); render(); return; } if (el.dataset.action === 'auth' || el.dataset.action === 'account') { view = 'auth'; menu = false; render(); return; } if (el.dataset.action === 'toggle-auth') { authMode = authMode === 'login' ? 'register' : 'login'; render(); return; } if (el.dataset.action === 'signout') { signOut(); disconnectRealtime(); rooms = []; room = null; view = 'maps'; feedback('Signed out.'); render(); return; } if (el.dataset.action === 'balance') { await remoteCommand('BALANCE'); feedback('Teams balanced.'); } if (el.dataset.captain) { const [team, id] = el.dataset.captain.split(':'); await remoteCommand('ASSIGN_CAPTAIN', { team, memberId:id }); feedback('Captain appointed.'); } if (el.dataset.map) { const step=currentStep(room); await remoteCommand('DRAFT_ACTION', { value:el.dataset.map }); playSfx(step?.[0] === 'BAN' ? 'ban' : 'pick'); } if (el.dataset.side) await remoteCommand('DRAFT_ACTION', { value:el.dataset.side }); render(); } catch (error) { feedback(error.message); render(); } });
setInterval(() => { if (room?.state === STATES.DRAFT) { if (Date.now() >= room.draft.deadline && currentUser()?.id === room.ownerId) remoteCommand('AUTO_ACTION').then(render).catch(() => {}); else { const timer = document.querySelector('#timer'); if (timer) timer.textContent = time(room.draft.deadline - Date.now()); } } }, 250);
setInterval(() => { if (room?.state === STATES.PAUSED && room.draft.pausedAt && Date.now() - room.draft.pausedAt >= (room.settings.maxPauseSeconds || 300) * 1000 && currentUser()?.id === room.ownerId) remoteCommand('RESUME').then(render).catch(() => {}); }, 1000);
async function boot() {
  if (currentUser()) {
    connectRealtime((updatedRoom) => { activateRoom(updatedRoom); render(); });
    try { await Promise.all([refreshRooms(), refreshMatches()]); }
    catch { signOut(); notice = 'Your session expired. Please sign in again.'; }
  }
  render();
}
boot();
