import type { FastifyRequest, FastifyReply } from 'fastify';
import { activityManager } from '../activityManager';
import { roomManager } from '../roomManager';

// Helper to find remote room & side for a user
function findRemote(userId: string) {
  const res = roomManager.findRemoteRoomByUserId?.(userId);
  return res; // { room, side }
}

export const cliStart = async (req: FastifyRequest, reply: FastifyReply) => {
  const userId = req.cliUserId!;
  const lock = activityManager.isUserLocked(userId);
  console.log(`[CLI] start called for user ${userId}, lock:`, lock);
  if (lock.reason === 'match') return reply.send({ message: 'already in game' });
  if (lock.reason === 'tournament') return reply.send({ message: 'locked in tournament' });
  // Not locked: trigger matchmaking join via socket
  const io: any = (global as any).io;
  const socket = io?.sockets?.sockets?.get(req.cliSocketId!);
  if (!socket) return reply.status(500).send({ message: 'socket unavailable' });
  console.log(`[CLI] emitting matchmaking_join for socket ${req.cliSocketId}`);
  socket.emit('matchmaking_join');
  // Optionally instruct client navigation
  socket.emit('cli_navigate', { path: '/matchmaking' });
  reply.send({ message: 'matchmaking', timeout: 30 });
};

export const cliMove = async (req: FastifyRequest<{ Body: { direction: 'up'|'down' } }>, reply: FastifyReply) => {
  const userId = req.cliUserId!;
  const remote = findRemote(userId);
  console.log(`[CLI] move called for user ${userId}, remote:`, remote);
  if (!remote) return reply.send({ message: 'not in remote game' });
  const { room, side } = remote;
  const dir = req.body?.direction;
  if (dir !== 'up' && dir !== 'down') return reply.status(400).send({ message: 'direction required' });
  console.log(`[CLI] moving paddle for side ${side} direction ${dir}`);
  const pos = room.movePaddleBySide?.(side, dir);
  console.log(`[CLI] move result position:`, pos);
  if (pos === undefined) return reply.status(500).send({ message: 'move failed' });
  reply.send({ message: 'ok', position: pos });
};

export const cliStatus = async (req: FastifyRequest, reply: FastifyReply) => {
  const userId = req.cliUserId!;
  const remote = findRemote(userId);
  if (!remote) return reply.send({ message: 'not in remote game' });
  const { room, side } = remote;
  const s: any = room.state;
  reply.send({
    message: 'ok',
    you: side,
    score: s.score,
    paddles: s.paddles,
    gameStarted: s.gameStarted,
    gameOver: s.gameOver,
    endReason: s.endReason
  });
};
