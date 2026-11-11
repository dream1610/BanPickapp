import { mapById } from './core.js';

export const MATCH_ARCHIVE_KEY = 'gdreed-match-archive';

function scoreValue(value) {
  const score = Number(value);
  if (!Number.isInteger(score) || score < 0) throw new Error('Tỉ số phải là số nguyên không âm.');
  return score;
}

export function createMatchRecord(room, scores, username, recordedAt = new Date().toISOString()) {
  const maps = room.draft.actions
    .filter((action) => action.type === 'PICK' || action.type === 'DECIDER')
    .map((action) => {
      const score = scores[action.mapId] ?? {};
      return {
        mapId: action.mapId,
        mapName: mapById(action.mapId)?.name ?? action.mapId,
        type: action.type,
        pickedBy: action.team,
        teamA: scoreValue(score.A ?? 0),
        teamB: scoreValue(score.B ?? 0),
      };
    });
  const wins = maps.reduce((total, map) => {
    if (map.teamA > map.teamB) total.A += 1;
    if (map.teamB > map.teamA) total.B += 1;
    return total;
  }, { A:0, B:0 });

  return {
    id: room.draft.id || crypto.randomUUID(),
    roomId: room.id,
    roomCode: room.code,
    roomName: room.name,
    format: room.format,
    teams: { A:room.teams.A.name, B:room.teams.B.name },
    maps,
    mapActions: room.draft.actions.map((action) => ({ ...action })),
    sides: room.draft.sides.map((side) => ({ ...side })),
    mapWins: wins,
    winner: wins.A === wins.B ? null : wins.A > wins.B ? 'A' : 'B',
    createdBy: username,
    recordedAt,
  };
}

export function loadMatchArchive(storage = localStorage) {
  try {
    const records = JSON.parse(storage.getItem(MATCH_ARCHIVE_KEY) || '[]');
    return Array.isArray(records) ? records : [];
  } catch {
    return [];
  }
}

export function saveMatchRecord(record, storage = localStorage) {
  const records = loadMatchArchive(storage);
  const existingIndex = records.findIndex((item) => item.id === record.id);
  if (existingIndex >= 0) records.splice(existingIndex, 1);
  storage.setItem(MATCH_ARCHIVE_KEY, JSON.stringify([record, ...records]));
  return true;
}