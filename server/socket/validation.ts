import { z } from 'zod';

// Message validation schemas
export const SendMessageSchema = z.object({
  sender_id: z.union([z.string(), z.number()]).transform(String),
  receiver_id: z.union([z.string(), z.number()]).transform(String),
  content: z.string().min(1, 'Message cannot be empty').max(1000, 'Message too long (max 1000 chars)')
});

// Game schemas
export const JoinGameSchema = z.object({
  settings: z.object({
    paddleSpeed: z.number().min(1).max(20).optional(),
    ballSpeed: z.enum(['slow', 'normal', 'fast']).optional(),
    canvasShape: z.enum(['rectangle', 'square', 'wide']).optional(),
    scoreToWin: z.union([z.literal(3), z.literal(5), z.literal(7)]).optional(),
    winCondition: z.union([z.literal(3), z.literal(5), z.literal(7)]).optional(), // Legacy support
    theme: z.string().max(50).optional(),
    difficulty: z.enum(['easy', 'medium', 'hard']).optional()
  }).optional(),
  userId: z.union([z.string(), z.number()]).transform(String).optional(),
  clientRoomId: z.string().max(100).optional()
});

export const LeaveGameSchema = z.object({
  roomId: z.string().max(100).optional()
});

// Remote game schemas  
export const JoinRemoteRoomSchema = z.object({
  roomId: z.string().min(1, 'Room ID required').max(100, 'Room ID too long'),
  playerId: z.enum(['p1', 'p2']).refine(val => ['p1', 'p2'].includes(val), {
    message: 'Player ID must be p1 or p2'
  })
});

// Invite schemas - Handle both flat and nested user objects
export const SendInviteSchema = z.union([
  // Handle { id: "123" } format
  z.object({
    id: z.union([z.string(), z.number()]).transform(String)
  }),
  // Handle selectedUser object format: { id: 123, username: "...", ... }
  z.object({
    id: z.union([z.string(), z.number()]).transform(String),
    username: z.string().optional(),
    email: z.string().optional(),
    avatarurl: z.string().optional()
  }).transform(obj => ({ id: obj.id }))
]);

export const AcceptInviteSchema = z.object({
  inviterId: z.union([z.string(), z.number()]).transform(String),
  inviteId: z.string().max(100).optional()
});

export const DeclineInviteSchema = z.object({
  inviterId: z.union([z.string(), z.number()]).transform(String),
  inviteId: z.string().max(100).optional()
});

// Tournament schemas
export const TournamentCreateSchema = z.object({
  name: z.string().min(1, 'Tournament name required').max(100, 'Tournament name too long'),
  startsInMinutes: z.number().min(1, 'Start time must be positive').max(1440, 'Cannot schedule more than 24 hours ahead')
});

export const TournamentJoinSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String)
});

export const TournamentLeaveSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String)
});

export const TournamentInviteResponseSchema = z.object({
  tournamentId: z.union([z.string(), z.number()]).transform(String),
  matchKey: z.enum(['semi1', 'semi2', 'final']),
  response: z.enum(['accept', 'decline'])
});

// Matchmaking schemas - Handle empty payload or settings object
export const MatchmakingJoinSchema = z.union([
  z.undefined(), // Handle no payload
  z.null(), // Handle null payload
  z.object({
    settings: z.object({
      paddleSpeed: z.number().min(1).max(20).optional(),
      ballSpeed: z.enum(['slow', 'normal', 'fast']).optional(),
      canvasShape: z.enum(['rectangle', 'square', 'wide']).optional(),
      scoreToWin: z.union([z.literal(3), z.literal(5), z.literal(7)]).optional(),
      winCondition: z.union([z.literal(3), z.literal(5), z.literal(7)]).optional(), // Legacy support
      theme: z.string().max(50).optional(),
      difficulty: z.enum(['easy', 'medium', 'hard']).optional()
    }).optional()
  }).optional()
]).transform(val => val || {});

// Chat typing schemas
export const TypingSchema = z.string().min(1, 'Room ID required').max(100, 'Room ID too long');

// Debug schema (only for development)
export const TournamentDebugSchema = z.object({
  userId: z.union([z.string(), z.number()]).transform(String).optional()
});

// Utility function to validate data
export function validateSocketData<T>(schema: z.ZodSchema<T>, data: unknown): T {
  return schema.parse(data);
}
