import assert from 'node:assert/strict';
import { FORMATS, MAPS, MAP_TACTICS, STATES, autoAction, balanceTeams, createRoom, currentStep, startDraft } from '../src/core.js';
import { OFFICIAL_SCENE_GALLERIES } from '../src/official-scenes.js';
import { createMatchRecord, loadMatchArchive, saveMatchRecord } from '../src/archive.js';

for (const map of MAPS) {
  const scenes = OFFICIAL_SCENE_GALLERIES[map.id];
  assert.ok(Array.isArray(scenes) && scenes.length >= 1, `${map.name}: has official landscape scene`);
  assert.ok(scenes.every((url) => /-(915x515|914x514|1980x1083|2560x1400|3840x2160|915x513)\.(jpg|png|webp)\?/.test(url)), `${map.name}: gallery only uses landscape assets`);
  assert.ok(!scenes.includes(map.image), `${map.name}: square preview asset is not used as a visual scene`);
  assert.ok(MAP_TACTICS[map.id], `${map.name}: tactical dossier exists`);
  assert.ok([2,3].includes(MAP_TACTICS[map.id].sites), `${map.name}: site count is valid`);
  assert.ok(MAP_TACTICS[map.id].agents.length >= 3, `${map.name}: agent recommendations exist`);
}

for (const format of Object.keys(FORMATS)) {
  const room = createRoom();
  room.format = format;
  const totals = balanceTeams(room);
  assert.equal(room.members.filter((member) => member.team === 'A').length, 3, `${format}: Team A size`);
  assert.equal(room.members.filter((member) => member.team === 'B').length, 3, `${format}: Team B size`);
  assert.ok(totals.A > 0 && totals.B > 0, `${format}: team totals`);
  startDraft(room);
  let guard = 40;
  while (room.state === STATES.DRAFT && guard-- > 0) autoAction(room);
  assert.equal(room.state, STATES.SUMMARY, `${format}: reaches summary`);
  assert.equal(room.draft.step, FORMATS[format].steps.length, `${format}: completes all protocol steps`);
}

const archiveRoom = createRoom();
archiveRoom.draft.id = 'draft-archive-test';
archiveRoom.draft.actions = [
  { type:'PICK', team:'A', mapId:'ascent' },
  { type:'PICK', team:'B', mapId:'bind' },
  { type:'DECIDER', team:null, mapId:'haven' },
];
const record = createMatchRecord(archiveRoom, { ascent:{A:13,B:8}, bind:{A:9,B:13}, haven:{A:13,B:11} }, 'Gdreed', '2026-11-10T00:00:00.000Z');
assert.equal(record.mapWins.A, 2);
assert.equal(record.mapWins.B, 1);
assert.equal(record.winner, 'A');
assert.equal(record.maps[1].teamB, 13);
const archiveStorage = new Map();
const storage = { getItem:(key) => archiveStorage.get(key) ?? null, setItem:(key, value) => archiveStorage.set(key, value) };
assert.equal(saveMatchRecord(record, storage), true);
const correctedRecord = { ...record, maps:record.maps.map((map) => map.mapId === 'ascent' ? { ...map, teamA:14 } : map) };
assert.equal(saveMatchRecord(correctedRecord, storage), true);
assert.equal(loadMatchArchive(storage).length, 1);
assert.equal(loadMatchArchive(storage)[0].maps[0].teamA, 14);
assert.throws(() => createMatchRecord(archiveRoom, { ascent:{A:-1,B:0} }, 'Gdreed'), /không âm/);

const ownerRoom = createRoom({ owner:{id:'owner-1',username:'Gdreed'}, empty:true });
assert.equal(ownerRoom.ownerId, 'owner-1');
assert.equal(ownerRoom.members.length, 1);
assert.equal(ownerRoom.settings.mapPoolPreset, 'ALL_OFFICIAL');

const readyRoom = createRoom();
balanceTeams(readyRoom);
readyRoom.settings.readyCheck = true;
readyRoom.members[0].ready = false;
assert.throws(() => startDraft(readyRoom), /sẵn sàng/);

const teamBRoom = createRoom();
balanceTeams(teamBRoom);
teamBRoom.settings.startTeam = 'B';
startDraft(teamBRoom);
assert.equal(currentStep(teamBRoom)[1], 'B');

const randomRoomA = createRoom();
balanceTeams(randomRoomA);
randomRoomA.settings.timeoutBehavior = 'RANDOM';
startDraft(randomRoomA);
const randomRoomB = structuredClone(randomRoomA);
autoAction(randomRoomA);
autoAction(randomRoomB);
assert.equal(randomRoomA.draft.actions[0].mapId, randomRoomB.draft.actions[0].mapId);

const pauseRoom = createRoom();
balanceTeams(pauseRoom);
pauseRoom.settings.timeoutBehavior = 'PAUSE_FOR_OWNER';
startDraft(pauseRoom);
autoAction(pauseRoom);
assert.equal(pauseRoom.state, STATES.PAUSED);

const sideRoom = createRoom();
balanceTeams(sideRoom);
startDraft(sideRoom);
sideRoom.draft.step = 3;
sideRoom.draft.actions = [{ type:'PICK', team:'A', mapId:'ascent' }];
sideRoom.settings.sideSelectionPolicy = 'PICKING_TEAM';
assert.equal(currentStep(sideRoom)[1], 'A');
sideRoom.settings.sideSelectionPolicy = 'OPPONENT';
assert.equal(currentStep(sideRoom)[1], 'B');
sideRoom.settings.sideTimeout = 'Defense';
autoAction(sideRoom);
assert.equal(sideRoom.draft.sides[0].side, 'Defense');
console.log('Core rule-engine tests passed for BO1, BO3, BO5, and BO7.');
