import type { FastifyInstance } from 'fastify';
import type { Socket } from 'socket.io';
import { createSocketNamespaces, SocketNamespaces } from './namespaces';
import { socketAuthMiddleware } from '../middleware/socketAuth';
import { 
  validateSocketData,
  SendMessageSchema,
  JoinGameSchema,
  LeaveGameSchema,
  JoinRemoteRoomSchema,
  SendInviteSchema,
  AcceptInviteSchema,
  DeclineInviteSchema,
  MatchmakingJoinSchema,
  TypingSchema,
  TournamentCreateSchema,
  TournamentJoinSchema,
  TournamentLeaveSchema,
  TournamentInviteResponseSchema,
  TournamentDebugSchema
} from './validation';

import { roomManager } from '../roomManager';
import { tournamentManager } from '../tournamentManager';
import { db } from '../db/db';
import { activityManager } from '../activityManager';
import type { GameSettingsWithTheme } from '../types';

interface SocketUserData {
  userId: string;
  userInfo: {
    id: string;
    username: string;
    email: string;
  };
}

// Rate limiting for socket events
const eventRateLimits = new Map<string, { count: number; resetTime: number }>();

function checkEventRateLimit(socketId: string, event: string, maxEvents: number = 10, windowMs: number = 60000): boolean {
  const key = `${socketId}:${event}`;
  const now = Date.now();
  const limit = eventRateLimits.get(key);

  if (!limit || now > limit.resetTime) {
    eventRateLimits.set(key, { count: 1, resetTime: now + windowMs });
    return true;
  }

  if (limit.count >= maxEvents) {
    return false;
  }

  limit.count++;
  return true;
}

export function registerSecureSocketHandlers(app: FastifyInstance) {
  // Apply authentication middleware to the default namespace for backward compatibility
  app.io.use(socketAuthMiddleware);
  
  // Create secure namespaces but also maintain default namespace functionality
  const namespaces = createSocketNamespaces(app);
  
  // Shared state - these should ideally be moved to a proper state store in production
  const onlineUsers: string[] = [];
  const socketToUser = new Map<string, string>();
  const socketToRoom = new Map<string, string>();
  const userConnectionCounts = new Map<string, number>();
  const userInitialized = new Set<string>();
  const matchmakingQueue: string[] = [];

  const getUsername = (userId: string) => new Promise<string>((resolve) => {
    db.get('SELECT username FROM users WHERE id = ?', [userId], (err: any, row: any) => 
      resolve(row?.username || userId)
    );
  });

  // Enhanced authentication for the default namespace (backward compatibility)
  // Register handlers on DEFAULT namespace for backward compatibility
  app.io.on('connection', (socket) => {
    const socketData = socket as Socket & { userId: string; userInfo: any };
    console.log(`🔌 Authenticated socket connection: ${socket.id} for user ${socketData.userId}`);

    // Rate limit check for connections
    if (!checkEventRateLimit(socket.id, 'connection', 5, 60000)) {
      console.log(`🚫 Rate limit exceeded for socket ${socket.id}`);
      socket.emit('error', 'Rate limit exceeded');
      socket.disconnect();
      return;
    }

    // Register ALL handlers on the default namespace for backward compatibility
    registerAllHandlers(socket, socketData, app);
  });

  // Also register handlers for each namespace (for future use)
  registerChatHandlers(namespaces.chat, app);
  registerGameHandlers(namespaces.game, app);
  registerLobbyHandlersNamespace(namespaces.lobby, app);
  registerTournamentHandlers(namespaces.tournament, app);

  // Combined handler registration for backward compatibility
  function registerAllHandlers(socket: Socket, socketData: SocketUserData, fastifyApp: FastifyInstance) {
    const userId = socketData.userId;

  // Chat namespace handlers
  function registerChatHandlers(namespace: any) {
    namespace.on('connection', (socket: Socket & SocketUserData) => {
      socket.on('send_message', async (payload) => {
        if (!checkEventRateLimit(socket.id, 'send_message', 20, 60000)) {
          return socket.emit('error', 'Rate limit exceeded');
        }

        try {
          const validatedPayload = validateSocketData(SendMessageSchema, payload);
          const senderId = socket.userId;
          const receiverId = validatedPayload.receiver_id;
          
          // Authorization check - user can only send messages as themselves
          if (senderId !== validatedPayload.sender_id) {
            return socket.emit('error', 'Cannot send messages as another user');
          }

          const timestamp = new Date().toISOString();
          
          // Save message to database
          const { createMessage } = await import('../models/chat/Message');
          await createMessage({
            sender_id: Number(senderId),
            receiver_id: Number(receiverId),
            content: validatedPayload.content
          });

          const enriched = { ...validatedPayload, timestamp };
          namespace.to(senderId).emit('receive_message', enriched);
          namespace.to(receiverId).emit('receive_message', enriched);

        } catch (error) {
          console.error('Send message error:', error);
          socket.emit('error', 'Invalid message data');
        }
      });

      socket.on('istyping', (roomId) => {
        if (!checkEventRateLimit(socket.id, 'typing', 30, 60000)) return;
        
        try {
          const validatedRoomId = validateSocketData(TypingSchema, roomId);
          namespace.to(validatedRoomId).emit('typing');
        } catch {
          socket.emit('error', 'Invalid room ID');
        }
      });

      socket.on('stop_typing', (roomId) => {
        try {
          const validatedRoomId = validateSocketData(TypingSchema, roomId);
          namespace.to(validatedRoomId).emit('stop_typing');
        } catch {
          socket.emit('error', 'Invalid room ID');
        }
      });
    });
  }

  // Game namespace handlers
  function registerGameHandlers(namespace: any) {
    namespace.on('connection', (socket: Socket & SocketUserData) => {
      socket.on('join_game', async (payload) => {
        if (!checkEventRateLimit(socket.id, 'join_game', 5, 60000)) {
          return socket.emit('error', 'Rate limit exceeded');
        }

        try {
          const validatedPayload = validateSocketData(JoinGameSchema, payload);
          const userId = socket.userId;

          // Check if user is locked
          if (activityManager.isUserLocked(userId).locked) {
            return socket.emit('error', 'User locked by activity');
          }

          const existingRoomId = socketToRoom.get(socket.id);
          if (existingRoomId && existingRoomId.startsWith('local_')) {
            roomManager.deleteRoom(existingRoomId);
            socket.leave(existingRoomId);
            socketToRoom.delete(socket.id);
          }

          const settings: GameSettingsWithTheme = validatedPayload.settings ? {
            ballSpeed: validatedPayload.settings.ballSpeed || 'normal',
            canvasShape: validatedPayload.settings.canvasShape || 'rectangle',
            scoreToWin: (validatedPayload.settings.scoreToWin || validatedPayload.settings.winCondition || 5) as 3 | 5 | 7,
            canvasWidth: 800,
            canvasHeight: 600,
            paddleWidth: 15,
            paddleHeight: 100,
            paddleSpeed: validatedPayload.settings.paddleSpeed || 10,
            paddleOffset: 20,
            ballSize: 8,
            theme: {
              id: validatedPayload.settings.theme || 'default',
              name: 'Default',
              colors: {
                background: '#000000',
                paddle: '#ffffff',
                ball: '#ffffff', 
                text: '#ffffff',
                accent: '#00ff00'
              },
              centerSymbol: '|',
              fontFamily: 'monospace',
              glowEffect: false
            }
          } : {
            ballSpeed: "normal",
            canvasShape: "rectangle",
            scoreToWin: 5,
            canvasWidth: 800,
            canvasHeight: 600,
            paddleWidth: 15,
            paddleHeight: 100,
            paddleSpeed: 10,
            paddleOffset: 20,
            ballSize: 8,
            theme: {
              id: 'default',
              name: 'Default',
              colors: {
                background: '#000000',
                paddle: '#ffffff',
                ball: '#ffffff',
                text: '#ffffff', 
                accent: '#00ff00'
              },
              centerSymbol: '|',
              fontFamily: 'monospace',
              glowEffect: false
            }
          };
          
          const roomId = await roomManager.createLocalRoom(socket, settings);
          socketToRoom.set(socket.id, roomId);
          socket.emit('room_joined', { roomId });

        } catch (error) {
          console.error('Join game error:', error);
          socket.emit('error', 'Failed to create game room');
        }
      });

      socket.on('leave_game', (payload) => {
        try {
          const validatedPayload = validateSocketData(LeaveGameSchema, payload);
          const mappedRoomId = socketToRoom.get(socket.id);
          const targetRoomId = validatedPayload.roomId || mappedRoomId;
          
          if (!targetRoomId) return;

          handleGameLeave(socket, targetRoomId, mappedRoomId);
        } catch (error) {
          console.error('Leave game error:', error);
        }
      });

      socket.on('join_remote_room', (payload) => {
        if (!checkEventRateLimit(socket.id, 'join_remote_room', 3, 60000)) {
          return socket.emit('error', 'Rate limit exceeded');
        }

        try {
          const validatedPayload = validateSocketData(JoinRemoteRoomSchema, payload);
          handleRemoteRoomJoin(socket, validatedPayload);
        } catch (error) {
          console.error('Join remote room error:', error);
          socket.emit('remote_room_error', 'Invalid join payload');
        }
      });
    });
  }

  // Lobby namespace handlers (includes matchmaking and invites)
  function registerLobbyHandlersNamespace(namespace: any) {
    namespace.on('connection', (socket: Socket & SocketUserData) => {
      registerLobbyHandlers(socket, socket);
    });
  }

  // Shared lobby handlers (used by both default namespace and lobby namespace)
  function registerLobbyHandlers(socket: Socket, socketData: SocketUserData) {
    const userId = socketData.userId;

    // User join/presence
    socket.on('join', async (rawUserId) => {
      try {
        // Validate that the user can only join as themselves
        const providedUserId = String(rawUserId);
        if (providedUserId !== userId) {
          console.log(`🚫 User ${userId} tried to join as ${providedUserId}`);
          return socket.emit('error', 'Cannot join as another user');
        }

        socket.join(userId);
        socketToUser.set(socket.id, userId);
        
        try { 
          tournamentManager.updatePlayerSocket(userId, socket.id); 
        } catch {}

        const prevCount = userConnectionCounts.get(userId) || 0;
        userConnectionCounts.set(userId, prevCount + 1);

        if (!userInitialized.has(userId)) {
          try { 
            activityManager.resetLocksForUser(userId); 
          } catch {}
          userInitialized.add(userId);
        }

        if (prevCount === 0) {
          if (!onlineUsers.includes(userId)) onlineUsers.push(userId);
          try {
            await new Promise<void>((resolve, reject) => {
              db.run('UPDATE users SET status = ?, last_seen = ? WHERE id = ?', 
                ['online', new Date(), Number(userId)], 
                function (err) { 
                  if (err) reject(err); 
                  else resolve(); 
                });
            });
            app.io.emit('user_online', onlineUsers);
          } catch (e) { 
            console.error('online update failed', e); 
          }
        }

        const lock = activityManager.isUserLocked(userId);
        if (lock.locked) {
          socket.emit('user_locked', { reason: lock.reason, inMatch: lock.reason === 'match' });
        }

      } catch (error) {
        console.error('Join error:', error);
        socket.emit('error', 'Failed to join');
      }
    });

    // Matchmaking
    socket.on('matchmaking_join', async (payload) => {
      if (!checkEventRateLimit(socket.id, 'matchmaking_join', 3, 60000)) {
        return socket.emit('matchmaking_error', 'Rate limit exceeded');
      }

      try {
        const validatedPayload = validateSocketData(MatchmakingJoinSchema, payload);
        handleMatchmakingJoin(socket, userId, validatedPayload);
      } catch (error) {
        console.error('Matchmaking join validation error:', error);
        // Fallback: handle as empty payload (original behavior)
        try {
          handleMatchmakingJoin(socket, userId, {});
        } catch (fallbackError) {
          console.error('Matchmaking join fallback error:', fallbackError);
          socket.emit('matchmaking_error', 'Invalid matchmaking data');
        }
      }
    });

    socket.on('matchmaking_leave', () => {
      const idx = matchmakingQueue.indexOf(socket.id);
      if (idx !== -1) matchmakingQueue.splice(idx, 1);
      
      // @ts-ignore
      if (socket.data?.mmTimeout) {
        // @ts-ignore
        clearTimeout(socket.data.mmTimeout);
        // @ts-ignore
        socket.data.mmTimeout = undefined;
      }
      socket.emit('matchmaking_status', { status: 'left' });
    });

    // Invites
    socket.on('send_invite', async (selectedUser) => {
      if (!checkEventRateLimit(socket.id, 'send_invite', 5, 60000)) {
        return socket.emit('error', 'Rate limit exceeded');
      }

      try {
        const validatedUser = validateSocketData(SendInviteSchema, selectedUser);
        handleSendInvite(socket, userId, validatedUser.id);
      } catch (error) {
        console.error('Send invite validation error:', error);
        // Fallback: try to handle the original format directly
        try {
          const targetId = String(selectedUser?.id || selectedUser);
          if (targetId && targetId !== 'undefined' && targetId !== 'null') {
            handleSendInvite(socket, userId, targetId);
          } else {
            socket.emit('error', 'Invalid invite data - missing user ID');
          }
        } catch (fallbackError) {
          console.error('Send invite fallback error:', fallbackError);
          socket.emit('error', 'Invalid invite data');
        }
      }
    });

    socket.on('accept_invite', async (payload) => {
      if (!checkEventRateLimit(socket.id, 'accept_invite', 3, 60000)) {
        return socket.emit('error', 'Rate limit exceeded');
      }

      try {
        const validatedPayload = validateSocketData(AcceptInviteSchema, payload);
        handleAcceptInvite(socket, userId, validatedPayload);
      } catch (error) {
        console.error('Accept invite error:', error);
        socket.emit('error', 'Invalid invite response');
      }
    });

    socket.on('decline_invite', (payload) => {
      try {
        const validatedPayload = validateSocketData(DeclineInviteSchema, payload);
        handleDeclineInvite(socket, userId, validatedPayload);
      } catch (error) {
        console.error('Decline invite error:', error);
        socket.emit('error', 'Invalid invite response');
      }
    });

    // Disconnect handling
    socket.on('disconnect', async () => {
      await handleUserDisconnect(socket, userId);
    });
  }

  // Tournament namespace handlers
  function registerTournamentHandlers(namespace: any) {
    namespace.on('connection', (socket: Socket & SocketUserData) => {
      socket.on('tournament_list', () => {
        socket.emit('tournament_list', tournamentManager.listAvailable());
        try {
          socket.emit('tournament_completed_list', tournamentManager.listCompleted());
        } catch {}
      });

      // Remove or secure debug events in production
      socket.on('tournament_debug_state', (payload) => {
        if (process.env.NODE_ENV === 'production') {
          return socket.emit('error', 'Debug events disabled in production');
        }

        try {
          const validatedPayload = validateSocketData(TournamentDebugSchema, payload);
          const target = validatedPayload.userId || socket.userId;
          
          // Only allow users to debug their own tournaments
          const all = tournamentManager.listAll();
          const filtered = all.filter(t => t.players.includes(String(target)));
          
          const summary = filtered.map(t => ({
            id: t.id,
            status: t.status,
            players: t.players,
            eliminated: t.eliminated
          }));

          const lockInfo = activityManager.isUserLocked(String(target));
          socket.emit('tournament_debug_state', { target, lockInfo, summary });
        } catch (error) {
          socket.emit('tournament_debug_state', { error: 'Invalid debug request' });
        }
      });

      socket.on('tournament_create', (payload) => {
        if (!checkEventRateLimit(socket.id, 'tournament_create', 2, 300000)) { // 2 per 5 minutes
          return socket.emit('tournament_error', 'Rate limit exceeded');
        }

        try {
          const validatedPayload = validateSocketData(TournamentCreateSchema, payload);
          const userId = socket.userId;

          if (activityManager.isUserLocked(userId).locked) {
            return socket.emit('tournament_error', 'User locked by activity');
          }

          const tournament = tournamentManager.create(
            validatedPayload.name,
            userId,
            socket,
            validatedPayload.startsInMinutes
          );
          socket.emit('tournament_created', tournament);
        } catch (error) {
          console.error('Tournament create error:', error);
          socket.emit('tournament_error', 'Failed to create tournament');
        }
      });

      socket.on('tournament_join', (payload) => {
        try {
          const validatedPayload = validateSocketData(TournamentJoinSchema, payload);
          const userId = socket.userId;

          if (activityManager.isUserLocked(userId).locked) {
            return socket.emit('tournament_error', 'User locked by activity');
          }

          const tournament = tournamentManager.join(validatedPayload.id, userId, socket);
          socket.emit('tournament_joined', tournament);
        } catch (error) {
          console.error('Tournament join error:', error);
          socket.emit('tournament_error', 'Failed to join tournament');
        }
      });

      socket.on('tournament_leave', (payload) => {
        try {
          const validatedPayload = validateSocketData(TournamentLeaveSchema, payload);
          const userId = socket.userId;

          const tournament = tournamentManager.leaveByUser(validatedPayload.id, userId);
          
          if (!tournamentManager.isUserActive(userId)) {
            activityManager.setTournamentLock(userId, false);
          }
          socket.emit('tournament_left', tournament);
        } catch (error) {
          console.error('Tournament leave error:', error);
          socket.emit('tournament_error', 'Failed to leave tournament');
        }
      });

      socket.on('tournament_match_invite_response', (payload) => {
        try {
          const validatedPayload = validateSocketData(TournamentInviteResponseSchema, payload);
          const userId = socket.userId;

          tournamentManager.respondToMatchInvite(
            app.io,
            validatedPayload.tournamentId,
            validatedPayload.matchKey,
            userId,
            validatedPayload.response
          );
        } catch (error) {
          console.error('Tournament match invite response error:', error);
        }
      });
    });
  }

  // Helper functions
  async function handleMatchmakingJoin(socket: Socket, userId: string, payload: any) {
    const currentLock = activityManager.isUserLocked(userId);
    if (currentLock.reason === 'match') {
      return socket.emit('matchmaking_error', 'Already in a match');
    }

    if (activityManager.isUserLocked(userId).locked) {
      return socket.emit('matchmaking_error', 'Locked by activity');
    }

    if (socketToRoom.get(socket.id)) {
      return socket.emit('matchmaking_error', 'Already in a room');
    }

    if (!matchmakingQueue.includes(socket.id)) {
      matchmakingQueue.push(socket.id);
      socket.emit('matchmaking_status', { status: 'queued' });

      const timeout = setTimeout(() => {
        const idx = matchmakingQueue.indexOf(socket.id);
        if (idx !== -1) {
          matchmakingQueue.splice(idx, 1);
          socket.emit('matchmaking_timeout');
        }
      }, 30000);

      // @ts-ignore
      socket.data = socket.data || {};
      // @ts-ignore 
      socket.data.mmTimeout = timeout;
    }

    // Process matchmaking queue
    await processMatchmakingQueue();
  }

  async function processMatchmakingQueue() {
    while (matchmakingQueue.length >= 2) {
      const s1Id = matchmakingQueue.shift()!;
      const s2Id = matchmakingQueue.shift()!;
      
      const s1 = app.io.sockets.sockets.get(s1Id);
      const s2 = app.io.sockets.sockets.get(s2Id);

      if (!s1 || !s2) {
        if (s1 && !matchmakingQueue.includes(s1.id)) matchmakingQueue.unshift(s1.id);
        if (s2 && !matchmakingQueue.includes(s2.id)) matchmakingQueue.unshift(s2.id);
        break;
      }

      // @ts-ignore
      if (s1?.data?.mmTimeout) clearTimeout(s1.data.mmTimeout);
      // @ts-ignore
      if (s2?.data?.mmTimeout) clearTimeout(s2.data.mmTimeout);

      const p1Id = socketToUser.get(s1.id)!;
      const p2Id = socketToUser.get(s2.id)!;

      if (p1Id === p2Id) {
        if (!matchmakingQueue.includes(s2.id)) matchmakingQueue.unshift(s2.id);
        continue;
      }

      try {
        const [p1Name, p2Name] = await Promise.all([getUsername(p1Id), getUsername(p2Id)]);
        const roomId = roomManager.createRemoteGameRoom(s1, s2, p1Id, p2Id, undefined, { matchType: 'matchmaking' });

        socketToRoom.set(s1.id, roomId);
        socketToRoom.set(s2.id, roomId);
        
        activityManager.lockForMatch(p1Id, p2Id);

        s1.emit('remote_room_joined', {
          roomId, playerId: 'p1', matchType: 'matchmaking',
          p1Name, p2Name, p1Id, p2Id
        });
        s2.emit('remote_room_joined', {
          roomId, playerId: 'p2', matchType: 'matchmaking',
          p1Name, p2Name, p1Id, p2Id
        });
      } catch (error) {
        console.error('Matchmaking pairing failed', error);
        s1.emit('matchmaking_error', 'Failed');
        s2.emit('matchmaking_error', 'Failed');
      }
    }
  }

  async function handleSendInvite(socket: Socket, inviterId: string, targetId: string) {
    const currentLock = activityManager.isUserLocked(inviterId);
    if (currentLock.reason === 'match') {
      return socket.emit('error', 'Already in a match');
    }

    if (activityManager.isUserBusyForInvite(inviterId)) {
      return socket.emit('error', 'Already handling an invite or busy');
    }

    if (inviterId === targetId) {
      return socket.emit('error', 'Cannot invite yourself');
    }

    if (activityManager.isUserBusyForInvite(targetId)) {
      return socket.emit('error', 'User is busy');
    }

    try {
      const inviterInfo = await new Promise<any>((resolve, reject) => {
        db.get('SELECT id, username, email, avatarurl FROM users WHERE id = ?', [inviterId], (err, row) =>
          err ? reject(err) : resolve(row)
        );
      });

      if (!inviterInfo) {
        return socket.emit('error', 'User not found');
      }

      const inviteId = `${inviterId}-${targetId}-${Date.now()}`;
      activityManager.setPendingInvite(inviterId, targetId, inviteId);

      const sockets = await app.io.in(targetId).fetchSockets();
      if (!sockets.length) {
        socket.emit('error', 'User not online');
        activityManager.clearPendingInvite(inviterId, targetId);
        return;
      }

      for (const s of sockets) {
        app.io.to(s.id).emit('receive_invite', { inviter: inviterInfo, inviterId, inviteId });
      }

      app.io.to(inviterId).emit('invite_sent', { to: targetId, inviteId });
    } catch (error) {
      console.error('Send invite error:', error);
      socket.emit('error', 'Failed to send invite');
    }
  }

  async function handleAcceptInvite(socket: Socket, accepterId: string, payload: any) {
    if (activityManager.isUserLocked(accepterId).reason === 'match') {
      return socket.emit('error', 'Already in a match');
    }

    const inviterSocketId = Array.from(socketToUser.entries())
      .find(([_, uid]) => uid === payload.inviterId)?.[0];
    
    if (!inviterSocketId) {
      return socket.emit('error', 'Inviter not online');
    }

    const inviterSocket = app.io.sockets.sockets.get(inviterSocketId);
    if (!inviterSocket) {
      return socket.emit('error', 'Inviter socket missing');
    }

    const inviterState: any = activityManager.getLockState(payload.inviterId);
    const accepterState: any = activityManager.getLockState(accepterId);

    if (!inviterState.pendingInviteId || inviterState.pendingInviteId !== accepterState.pendingInviteId) {
      return socket.emit('error', 'No matching invite');
    }

    if (socketToRoom.get(inviterSocketId) || socketToRoom.get(socket.id)) {
      console.warn('Duplicate accept_invite ignored; one or both players already in room');
      return;
    }

    try {
      const roomId = roomManager.createRemoteGameRoom(inviterSocket, socket, payload.inviterId, accepterId);
      socketToRoom.set(inviterSocketId, roomId);
      socketToRoom.set(socket.id, roomId);

      const [p1Name, p2Name] = await Promise.all([
        getUsername(payload.inviterId),
        getUsername(accepterId)
      ]);

      activityManager.clearPendingInvite(payload.inviterId, accepterId);
      activityManager.lockForMatch(payload.inviterId, accepterId);

      inviterSocket.emit('remote_room_joined', {
        roomId, playerId: 'p1', p1Name, p2Name, matchType: 'remote',
        p1Id: payload.inviterId, p2Id: accepterId
      });

      socket.emit('remote_room_joined', {
        roomId, playerId: 'p2', p1Name, p2Name, matchType: 'remote',
        p1Id: payload.inviterId, p2Id: accepterId
      });

      app.io.to(payload.inviterId).emit('invite_consumed', { by: accepterId });
      app.io.to(accepterId).emit('invite_consumed', { inviterId: payload.inviterId });
    } catch (error) {
      console.error('Accept invite error:', error);
      socket.emit('error', 'Failed to create game');
      inviterSocket.emit('error', 'Failed to create game');
    }
  }

  function handleDeclineInvite(socket: Socket, declinerId: string, payload: any) {
    const inviterSocketId = Array.from(socketToUser.entries())
      .find(([_, uid]) => uid === payload.inviterId)?.[0];
    
    if (inviterSocketId) {
      app.io.sockets.sockets.get(inviterSocketId)?.emit('invite_declined', { declinerId });
    }

    const inviterState: any = activityManager.getLockState(payload.inviterId);
    const inviteId = inviterState?.pendingInviteId;
    
    activityManager.clearPendingInvite(payload.inviterId, declinerId);
    app.io.to(payload.inviterId).emit('invite_cleared', { inviteId });
    app.io.to(declinerId).emit('invite_cleared', { inviteId });
  }

  function handleRemoteRoomJoin(socket: Socket, payload: any) {
    const userId = (socket as any).userId;
    if (!userId) {
      return socket.emit('remote_room_error', 'Not authenticated');
    }

    const existingRoomId = socketToRoom.get(socket.id);
    if (existingRoomId && existingRoomId.startsWith('remote_') && existingRoomId !== payload.roomId) {
      return socket.emit('remote_room_error', 'Already in another remote game');
    }

    const room = roomManager.getRemoteRoom(payload.roomId);
    if (!room) {
      return socket.emit('remote_room_error', 'Room not found');
    }

    // Verify user authorization for this room
    const roomP1Id = (room as any).getPlayer1UserId?.() || (room as any).player1UserId;
    const roomP2Id = (room as any).getPlayer2UserId?.() || (room as any).player2UserId;
    const userIdStr = String(userId);

    if (payload.playerId === 'p1' && String(roomP1Id) !== userIdStr) {
      return socket.emit('remote_room_error', 'Not authorized for this position');
    }

    if (payload.playerId === 'p2' && String(roomP2Id) !== userIdStr) {
      return socket.emit('remote_room_error', 'Not authorized for this position');
    }

    // Check for duplicate tab connections
    const userSockets = Array.from(socketToUser.entries())
      .filter(([_, uId]) => uId === userId)
      .map(([socketId, _]) => socketId);

    const otherSocketsInRoom = userSockets.filter(sId => {
      const roomId = socketToRoom.get(sId);
      return sId !== socket.id && roomId === payload.roomId;
    });

    if (otherSocketsInRoom.length > 0) {
      return socket.emit('remote_room_error', 
        'Game room is already in use from another connection. Please close other tabs or wait for the current session to end.');
    }

    try {
      if (payload.playerId === 'p1') {
        // @ts-ignore
        room.player1 = socket;
      } else {
        // @ts-ignore
        room.player2 = socket;
      }

      socketToRoom.set(socket.id, payload.roomId);
      socket.join(payload.roomId);
      socket.emit('remote_room_joined_success');

      try {
        const state = room.state;
        socket.emit('remote_game_state', state);
      } catch {}
    } catch (error) {
      console.error('Error joining remote room:', error);
      socket.emit('remote_room_error', 'Failed to join remote room');
    }
  }

  function handleGameLeave(socket: Socket, targetRoomId: string, mappedRoomId: string | undefined) {
    try {
      if (targetRoomId.startsWith('remote_')) {
        const remoteRoom = roomManager.getRemoteRoom(targetRoomId);
        if (remoteRoom) {
          remoteRoom.onPlayerExit?.(socket.id);
          setTimeout(() => roomManager.deleteRemoteRoom(targetRoomId), 1200);
        } else {
          roomManager.deleteRemoteRoom(targetRoomId);
        }
      } else {
        roomManager.deleteRoom(targetRoomId);
      }
    } finally {
      socket.leave(targetRoomId);
      if (mappedRoomId === targetRoomId) {
        socketToRoom.delete(socket.id);
      }

      const userId = socketToUser.get(socket.id);
      if (userId) {
        activityManager.unlockUser(userId);
      }
    }
  }

  async function handleUserDisconnect(socket: Socket, userId: string) {
    if (userId) {
      const prev = userConnectionCounts.get(userId) || 1;
      const next = Math.max(0, prev - 1);
      userConnectionCounts.set(userId, next);

      if (next === 0) {
        try {
          await new Promise<void>((resolve, reject) => {
            db.run('UPDATE users SET status = ?, last_seen = ? WHERE id = ?',
              ['offline', new Date(), userId],
              function (err) {
                if (err) reject(err);
                else resolve();
              }
            );
          });

          const idx = onlineUsers.indexOf(userId);
          if (idx !== -1) onlineUsers.splice(idx, 1);
          app.io.emit('user_offline', onlineUsers);
        } catch (e) {
          console.error('offline update failed', e);
        }
      }

      socketToUser.delete(socket.id);
    }

    const roomId = socketToRoom.get(socket.id);
    if (roomId) {
      if (roomId.startsWith('remote_')) {
        roomManager.deleteRemoteRoom(roomId);
      } else {
        roomManager.deleteRoom(roomId);
      }
      socketToRoom.delete(socket.id);
    }

    try {
      tournamentManager.leaveAllBySocket(socket.id);
    } catch {}

    if (userId) {
      activityManager.unlockUser(userId);
    }
  }

  console.log('🛡️ Secure socket handlers registered with authentication and validation');
}
