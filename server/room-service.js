import { addAudit, assignCaptain, autoAction, balanceTeams, createRoom, currentStep, pauseDraft, performDraftAction, resumeDraft, startDraft, STATES } from '../src/core.js';

const clone = (value) => structuredClone(value);
const ownerOnly = new Set(['BALANCE', 'ASSIGN_CAPTAIN', 'START', 'PAUSE', 'RESUME', 'UPDATE_SETTINGS', 'UPDATE_MEMBER', 'RECORD_RESULT']);

function requireOwner(room, userId) {
  if (room.ownerId !== userId) throw new Error('Only the room owner can perform this action.');
}

function requireCaptain(room, userId) {
  const draft = room.state === STATES.DRAFT ? room.draft : null;
  const member = room.members.find((item) => item.id === userId);
  if (!draft || !member?.captain) throw new Error('Only the active team captain can make a draft action.');
  const [, team] = currentStep(room);
  if (team && member.team !== team) throw new Error('It is not your team\'s turn.');
}

export function newRoom(owner) {
  return createRoom({ owner, empty: true });
}

export function applyCommand(snapshot, actor, command) {
  const room = clone(snapshot);
  const { type, payload = {} } = command;
  if (ownerOnly.has(type)) requireOwner(room, actor.id);

  switch (type) {
    case 'JOIN': {
      if (room.members.some((member) => member.id === actor.id)) return room;
      if (room.members.length >= Number(room.settings.maxMembers || 10)) throw new Error('This room is full.');
      room.members.push({ id:actor.id, name:actor.username, rating:0, seed:room.members.length + 1, team:null, captain:false, ready:false });
      addAudit(room, 'MEMBER_JOINED', actor.username, 'Joined room');
      break;
    }
    case 'SET_READY': {
      const member = room.members.find((item) => item.id === actor.id);
      if (!member) throw new Error('Join the room before setting readiness.');
      member.ready = Boolean(payload.ready);
      addAudit(room, 'READY_CHANGED', actor.username, member.ready ? 'Ready' : 'Not ready');
      break;
    }
    case 'BALANCE': balanceTeams(room); break;
    case 'ASSIGN_CAPTAIN': assignCaptain(room, payload.team, payload.memberId); break;
    case 'START':
      if (!room.members.every((member) => member.team)) balanceTeams(room);
      startDraft(room);
      break;
    case 'PAUSE': pauseDraft(room); break;
    case 'RESUME': resumeDraft(room); break;
    case 'DRAFT_ACTION': requireCaptain(room, actor.id); performDraftAction(room, payload.value); break;
    case 'AUTO_ACTION': requireOwner(room, actor.id); autoAction(room); break;
    case 'UPDATE_SETTINGS': {
      const allowed = ['name','description','format','teams','settings'];
      for (const key of allowed) if (key in payload) room[key] = clone(payload[key]);
      addAudit(room, 'ROOM_UPDATED', actor.username, 'Room settings updated');
      break;
    }
    case 'UPDATE_MEMBER': {
      const member = room.members.find((item) => item.id === payload.memberId);
      if (!member) throw new Error('Member not found.');
      if (payload.team !== undefined) member.team = payload.team || null;
      if (payload.rating !== undefined) member.rating = Math.max(0, Math.min(100, Number(payload.rating)));
      if (payload.seed !== undefined) member.seed = Math.max(1, Math.floor(Number(payload.seed)));
      for (const team of ['A', 'B']) {
        const captainId = room.teams[team].captainId;
        if (!room.members.some((item) => item.id === captainId && item.team === team)) room.teams[team].captainId = null;
      }
      room.members.forEach((item) => { item.captain = room.teams[item.team]?.captainId === item.id; });
      break;
    }
    case 'RECORD_RESULT':
      room.draft.scores = clone(payload.scores || {});
      addAudit(room, 'RESULT_RECORDED', actor.username, 'Scores saved');
      break;
    default: throw new Error('Unsupported room action.');
  }
  return room;
}
