import type { FastifyInstance } from 'fastify';
import { roomManager } from '../roomManager';
import { tournamentManager } from '../tournamentManager';
import { db } from '../db/db';
import { activityManager } from '../activityManager';
import type { GameSettingsWithTheme } from '../types';

// Shared per-process structures (scoped inside registration for isolation if needed)
export function registerSocketHandlers(app: FastifyInstance) {
  const onlineUsers: string[] = [];
  // Initialize centralized ActivityManager
  activityManager.initialize(app.io);
  const socketToUser = new Map<string, string>();
  const socketToRoom = new Map<string, string>();
  // Track how many active sockets each user currently has (multi-tab support)
  const userConnectionCounts = new Map<string, number>();
  // Track if we've performed an initial stale lock reset for a user in this process lifecycle
  const userInitialized = new Set<string>();
  const matchmakingQueue: string[] = [];

  const getUsername = (userId: string) => new Promise<string>((resolve) => {
    db.get('SELECT username FROM users WHERE id = ?', [userId], (err: any, row: any) => resolve(row?.username || userId));
  });

  app.io.on('connection', (socket) => {
    console.log('🔌 New socket connection:', socket.id);

    socket.on('join', async (rawUserId) => {
      // Get the authenticated user ID from the socket middleware
      const authenticatedUserId = (socket as any).userId;
      const providedUserId = String(rawUserId);
      
      // Security check: user can only join as themselves
      if (authenticatedUserId !== providedUserId) {
        console.log(`🚫 User ${authenticatedUserId} tried to join as ${providedUserId}`);
        socket.emit('error', 'Cannot join as another user');
        return;
      }
      
      const userId = authenticatedUserId;
      socket.join(userId);
      socketToUser.set(socket.id, userId);
      try { tournamentManager.updatePlayerSocket(userId, socket.id); } catch {}
      const prevCount = userConnectionCounts.get(userId) || 0;
      userConnectionCounts.set(userId, prevCount + 1);
      // First connection for this user in this server process: clear stale non-tournament locks
      if (!userInitialized.has(userId)) {
        try { activityManager.resetLocksForUser(userId); } catch {}
        userInitialized.add(userId);
      }
      // Transition to online only when first socket connects
      if (prevCount === 0) {
        if (!onlineUsers.includes(userId)) onlineUsers.push(userId);
        try {
          await new Promise<void>((resolve, reject) => {
            db.run('UPDATE users SET status = ?, last_seen = ? WHERE id = ?', ['online', new Date(), Number(userId)], function (err) { if (err) reject(err); else resolve(); });
          });
          app.io.emit('user_online', onlineUsers);
        } catch (e) { console.error('online update failed', e); }
      }
      // Push existing activity lock state to this new socket
      const lock = activityManager.isUserLocked(userId);
      if (lock.locked) {
        socket.emit('user_locked', { reason: lock.reason, inMatch: lock.reason === 'match' });
      }
    });

    socket.on('stop_typing', (rid) => app.io.to(String(rid)).emit('stop_typing'));
    socket.on('istyping', (rid) => app.io.to(String(rid)).emit('typing'));

    socket.on('send_message', async (payload) => {
      const senderId = String(payload.sender_id); const receiverId = String(payload.receiver_id);
      
      // Get the authenticated user ID
      const authenticatedUserId = (socket as any).userId;
      
      // Security check: user can only send messages as themselves
      if (authenticatedUserId !== senderId) {
        console.log(`🚫 User ${authenticatedUserId} tried to send message as ${senderId}`);
        socket.emit('error', 'Cannot send messages as another user');
        return;
      }
      
      // Basic validation
      if (!payload.text || typeof payload.text !== 'string') {
        socket.emit('error', 'Message text is required');
        return;
      }
      
      if (payload.text.length > 1000) {
        socket.emit('error', 'Message too long (max 1000 characters)');
        return;
      }
      
      try { 
        const { createMessage } = await import('../models/Message'); 
        await createMessage({ sender_id: Number(senderId), receiver_id: Number(receiverId), content: payload.text }); 
      } catch (e) { 
        console.error('save message failed', e); 
      }
      app.io.to(senderId).emit('receive_message', payload); 
      app.io.to(receiverId).emit('receive_message', payload);
    });

    // Deprecated explicit logout: status now driven purely by active socket presence.
    socket.on('logout', async (_userId) => {
      // No-op to maintain backward compatibility for clients still emitting this event.
    });

    socket.on('matchmaking_join', async (payload?: { settings?: any }) => {
      const userId = socketToUser.get(socket.id); if (!userId) { socket.emit('matchmaking_error', 'Not authenticated'); return; }
  // Prevent joining if already locked by an active match
  const currentLock = activityManager.isUserLocked(userId);
  if (currentLock.reason === 'match') { socket.emit('matchmaking_error','Already in a match'); return; }
      console.log(`[MM] matchmaking_join from socket ${socket.id} (user ${userId}) queueLen=${matchmakingQueue.length}`);
  // Prevent joining if locked by any activity
  if (activityManager.isUserLocked(userId).locked) { socket.emit('matchmaking_error','Locked by activity'); return; }
      if (socketToRoom.get(socket.id)) { socket.emit('matchmaking_error', 'Already in a room'); return; }
      if (!matchmakingQueue.includes(socket.id)) {
        matchmakingQueue.push(socket.id); socket.emit('matchmaking_status', { status: 'queued' });
        console.log(`[MM] Added socket ${socket.id} to queue. New queue: [${matchmakingQueue.join(', ')}]`);
        const timeout = setTimeout(() => { const idx = matchmakingQueue.indexOf(socket.id); if (idx !== -1) { matchmakingQueue.splice(idx,1); socket.emit('matchmaking_timeout'); } }, 30000);
        // @ts-ignore
        socket.data = socket.data || {}; socket.data.mmTimeout = timeout;
      }
      while (matchmakingQueue.length >= 2) {
        console.log('[MM] Attempting pairing. Queue snapshot before shift:', [...matchmakingQueue]);
        const s1Id = matchmakingQueue.shift()!; const s2Id = matchmakingQueue.shift()!;
        const s1 = app.io.sockets.sockets.get(s1Id); const s2 = app.io.sockets.sockets.get(s2Id);
        if (!s1 || !s2) { if (s1 && !matchmakingQueue.includes(s1.id)) matchmakingQueue.unshift(s1.id); if (s2 && !matchmakingQueue.includes(s2.id)) matchmakingQueue.unshift(s2.id); break; }
        // @ts-ignore
        if (s1?.data?.mmTimeout) clearTimeout(s1.data.mmTimeout);
        // @ts-ignore
        if (s2?.data?.mmTimeout) clearTimeout(s2.data.mmTimeout);
        const p1Id = socketToUser.get(s1.id)!; const p2Id = socketToUser.get(s2.id)!;
        if (p1Id === p2Id) { if (!matchmakingQueue.includes(s2.id)) matchmakingQueue.unshift(s2.id); continue; }
        try {
          const [p1Name, p2Name] = await Promise.all([getUsername(p1Id), getUsername(p2Id)]);
          const roomId = roomManager.createRemoteGameRoom(s1, s2, p1Id, p2Id, undefined, { matchType: 'matchmaking' });
          console.log(`[MM] Paired sockets ${s1.id} (${p1Id}) vs ${s2.id} (${p2Id}) -> room ${roomId}`);
          socketToRoom.set(s1.id, roomId);
          socketToRoom.set(s2.id, roomId);
          // Lock both users for the match
          activityManager.lockForMatch(p1Id, p2Id);
          s1.emit('remote_room_joined', { roomId, playerId: 'p1', matchType: 'matchmaking', p1Name, p2Name, p1Id: p1Id, p2Id: p2Id });
          s2.emit('remote_room_joined', { roomId, playerId: 'p2', matchType: 'matchmaking', p1Name, p2Name, p1Id: p1Id, p2Id: p2Id });
        } catch (e) {
          console.error('[MM] Pairing failed', e);
          s1.emit('matchmaking_error','Failed');
          s2.emit('matchmaking_error','Failed');
        }
      }
    });
    socket.on('matchmaking_leave', () => { const idx = matchmakingQueue.indexOf(socket.id); if (idx !== -1) matchmakingQueue.splice(idx,1); /* @ts-ignore */ if (socket.data?.mmTimeout) { /* @ts-ignore */ clearTimeout(socket.data.mmTimeout); /* @ts-ignore */ socket.data.mmTimeout = undefined; } socket.emit('matchmaking_status', { status: 'left' }); });

  socket.on('send_invite', async (selectedUser) => {
      const inviterId = socketToUser.get(socket.id); if (!inviterId) { socket.emit('error','Authentication error'); return; }
  // Prevent inviting while already in a match or handling another invite
  const currentLock = activityManager.isUserLocked(inviterId);
  if (currentLock.reason === 'match') { socket.emit('error','Already in a match'); return; }
  if (activityManager.isUserBusyForInvite(inviterId)) { socket.emit('error','Already handling an invite or busy'); return; }
      
      // Handle both { id: 123 } and direct ID formats
      const targetId = String(selectedUser?.id || selectedUser);
      if (!targetId || targetId === 'undefined' || targetId === 'null') { 
        socket.emit('error','Invalid user selection'); return; 
      }
      
      if (inviterId === targetId) { socket.emit('error','Cannot invite yourself'); return; }
  // Check target availability
  if (activityManager.isUserBusyForInvite(targetId)) { socket.emit('error','User is busy'); return; }
      try {
        const inviterInfo = await new Promise<any>((resolve, reject) => { db.get('SELECT id, username, email, avatarurl FROM users WHERE id = ?', [inviterId], (err,row)=> err?reject(err):resolve(row)); });
        if (!inviterInfo) { socket.emit('error','User not found'); return; }
  // Register pending invite state globally
  const inviteId = `${inviterId}-${targetId}-${Date.now()}`;
  activityManager.setPendingInvite(inviterId, targetId, inviteId);
        // Emit invite to all recipient sockets (we already validated availability before setting pending state)
        const sockets = await app.io.in(targetId).fetchSockets();
        if (!sockets.length) { socket.emit('error','User not online'); activityManager.clearPendingInvite(inviterId, targetId); return; }
        for (const s of sockets) {
          app.io.to(s.id).emit('receive_invite', { inviter: inviterInfo, inviterId, inviteId });
        }
        app.io.to(inviterId).emit('invite_sent', { to: targetId, inviteId });
      } catch (e) { 
        console.error('Send invite error:', e);
        socket.emit('error','Failed to send invite'); 
      }
    });

  socket.on('accept_invite', async (payload: { inviterId: string; inviteId?: string }) => {
      const accepterId = socketToUser.get(socket.id); if (!accepterId) { socket.emit('error','Not authenticated'); return; }
  // Prevent accepting if already in a match
  if (activityManager.isUserLocked(accepterId).reason === 'match') { socket.emit('error','Already in a match'); return; }
      const inviterSocketId = Array.from(socketToUser.entries()).find(([_, uid]) => uid === payload.inviterId)?.[0];
      if (!inviterSocketId) { socket.emit('error','Inviter not online'); return; }
      const inviterSocket = app.io.sockets.sockets.get(inviterSocketId); if (!inviterSocket) { socket.emit('error','Inviter socket missing'); return; }
      // Enforce single accept across multiple sockets of accepter
      // Validate pending invite state
      // Validate pending invite still present (using internal state)
  const inviterState: any = activityManager.getLockState(payload.inviterId);
  const accepterState: any = activityManager.getLockState(accepterId);
  if (!inviterState.pendingInviteId || inviterState.pendingInviteId !== accepterState.pendingInviteId) {
        socket.emit('error','No matching invite'); return;
      }
  const inviteId = inviterState.pendingInviteId; // capture before clearing
      // Prevent duplicate remote room creation if either socket already mapped
      if (socketToRoom.get(inviterSocketId) || socketToRoom.get(socket.id)) {
        console.warn('[INVITE] Duplicate accept_invite ignored; one or both players already in room', { inviterSocketId, accepterSocketId: socket.id });
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
        // Transition from invite -> match
  activityManager.clearPendingInvite(payload.inviterId, accepterId);
        activityManager.lockForMatch(payload.inviterId, accepterId);
  inviterSocket.emit('remote_room_joined', { roomId, playerId: 'p1', p1Name, p2Name, matchType: 'remote', p1Id: payload.inviterId, p2Id: accepterId });
  socket.emit('remote_room_joined', { roomId, playerId: 'p2', p1Name, p2Name, matchType: 'remote', p1Id: payload.inviterId, p2Id: accepterId });
    app.io.to(payload.inviterId).emit('invite_consumed', { by: accepterId, inviteId });
    app.io.to(accepterId).emit('invite_consumed', { inviterId: payload.inviterId, inviteId });
      } catch (e) {
        socket.emit('error','Failed to create game');
        inviterSocket.emit('error','Failed to create game');
      }
    });
  socket.on('decline_invite', (payload: { inviterId: string; inviteId?: string }) => {
      const inviterSocketId = Array.from(socketToUser.entries()).find(([_, uid]) => uid === payload.inviterId)?.[0];
      if (inviterSocketId) app.io.sockets.sockets.get(inviterSocketId)?.emit('invite_declined', { declinerId: socketToUser.get(socket.id) });
      const declinerId = socketToUser.get(socket.id);
      if (declinerId) {
    // capture inviteId BEFORE clearing
    const inviterState: any = activityManager.getLockState(payload.inviterId);
    const inviteId = inviterState?.pendingInviteId;
    activityManager.clearPendingInvite(payload.inviterId, declinerId);
    app.io.to(payload.inviterId).emit('invite_cleared', { inviteId });
    app.io.to(declinerId).emit('invite_cleared', { inviteId });
      }
    });

    socket.on('join_game', (payload: { settings?: any; userId?: string; clientRoomId?: string }) => {
      try {
        const existingRoomId = socketToRoom.get(socket.id); 
        if (existingRoomId && existingRoomId.startsWith('local_')) { 
          roomManager.deleteRoom(existingRoomId); 
          socket.leave(existingRoomId); 
          socketToRoom.delete(socket.id); 
        }
        const settingsPayload = payload?.settings; 
        let settings: GameSettingsWithTheme; 
        settings = typeof settingsPayload === 'string' ? JSON.parse(settingsPayload) : settingsPayload; 
        if (!settings) { 
          socket.emit('error','Invalid game settings'); 
          return; 
        }
        // Use createLocalRoom instead of the non-existent createGameRoom
        roomManager.createLocalRoom(socket, settings).then(roomId => {
          socketToRoom.set(socket.id, roomId); 
          socket.emit('room_joined', { roomId });
        }).catch(e => {
          console.error('Failed to create local room:', e);
          socket.emit('error','Failed to create game room');
        });
      } catch (e) { 
        console.error('join_game error:', e);
        socket.emit('error','Failed to create game room'); 
      }
    });
  socket.on('leave_game', (payload?: { roomId?: string }) => {
      const mappedRoomId = socketToRoom.get(socket.id); const targetRoomId = payload?.roomId || mappedRoomId; if (!targetRoomId) return; 
  console.log('[leave_game] request', { socket: socket.id, mappedRoomId, targetRoomId, payload, reason: 'client_initiated' });
      try { 
        if (targetRoomId.startsWith('remote_')) { 
          const remoteRoom = roomManager.getRemoteRoom(targetRoomId); 
          if (remoteRoom) { 
            remoteRoom.onPlayerExit?.(socket.id); 
            setTimeout(()=> roomManager.deleteRemoteRoom(targetRoomId), 1200); 
          } else roomManager.deleteRemoteRoom(targetRoomId); 
        } else { 
          roomManager.deleteRoom(targetRoomId); 
        } 
      } finally { 
        socket.leave(targetRoomId); 
        if (mappedRoomId === targetRoomId) socketToRoom.delete(socket.id); 
        // Clear match lock for user (best-effort) if no other remote rooms active
        const userId = socketToUser.get(socket.id);
        if (userId) {
          activityManager.unlockUser(userId);
        }
      }
    });

    // Remote room rejoin (e.g., page navigation / reconnection)
    socket.on('join_remote_room', (p: { roomId: string; playerId: 'p1'|'p2' }) => {
      console.log(`[join_remote_room] Request for room ${p?.roomId} as player ${p?.playerId} from socket ${socket.id}`);
      if (!p?.roomId || !p?.playerId) return socket.emit('remote_room_error','Invalid join payload');
      
      const userId = socketToUser.get(socket.id);
      if (!userId) return socket.emit('remote_room_error','Not authenticated');
      
      // CRITICAL FIX: Check if user is already in another remote room
      const existingRoomId = socketToRoom.get(socket.id);
      if (existingRoomId && existingRoomId.startsWith('remote_') && existingRoomId !== p.roomId) {
        console.log(`[join_remote_room] User ${userId} already in room ${existingRoomId}, cannot join ${p.roomId}`);
        return socket.emit('remote_room_error','Already in another remote game');
      }
      
      const room = roomManager.getRemoteRoom(p.roomId);
      if (!room) {
        console.log(`[join_remote_room] Room ${p.roomId} not found - sending error to client`);
        return socket.emit('remote_room_error','Room not found');
      }
      
      // CRITICAL FIX: Verify user is actually part of this room
      const roomP1Id = (room as any).getPlayer1UserId?.() || (room as any).player1UserId;
      const roomP2Id = (room as any).getPlayer2UserId?.() || (room as any).player2UserId;
      const userIdStr = String(userId);
      
      if (p.playerId === 'p1' && String(roomP1Id) !== userIdStr) {
        console.log(`[join_remote_room] User ${userId} not authorized for p1 in room ${p.roomId} (expected ${roomP1Id})`);
        return socket.emit('remote_room_error','Not authorized for this position');
      }
      
      if (p.playerId === 'p2' && String(roomP2Id) !== userIdStr) {
        console.log(`[join_remote_room] User ${userId} not authorized for p2 in room ${p.roomId} (expected ${roomP2Id})`);
        return socket.emit('remote_room_error','Not authorized for this position');
      }
      
      // DUPLICATE TAB PROTECTION: Check if another socket for this user is already in this room
      const userSockets = Array.from(socketToUser.entries())
        .filter(([_, uId]) => uId === userId)
        .map(([socketId, _]) => socketId);
      
      const otherSocketsInRoom = userSockets.filter(sId => {
        const roomId = socketToRoom.get(sId);
        return sId !== socket.id && roomId === p.roomId;
      });
      
      if (otherSocketsInRoom.length > 0) {
        console.log(`[join_remote_room] DUPLICATE TAB DETECTED: User ${userId} already has socket ${otherSocketsInRoom[0]} in room ${p.roomId}, blocking ${socket.id}`);
        return socket.emit('remote_room_error', 'Game room is already in use from another connection. Please close other tabs or wait for the current session to end.');
      }
      
      console.log(`[join_remote_room] Room ${p.roomId} found, attempting to join as ${p.playerId}`);
      try {
        if (p.playerId === 'p1') {
          // @ts-ignore replace socket ref
          room.player1 = socket;
        } else {
          // @ts-ignore replace socket ref
          room.player2 = socket;
        }
        socketToRoom.set(socket.id, p.roomId);
        socket.join(p.roomId);
        socket.emit('remote_room_joined_success');
        console.log(`[join_remote_room] Successfully joined ${p.roomId} as ${p.playerId}`);
        // Immediately push latest state so client can resume
        try { const state = room.state; socket.emit('remote_game_state', state); } catch {}
      } catch (e) {
        console.error(`[join_remote_room] Error joining room ${p.roomId}:`, e);
        socket.emit('remote_room_error','Failed to join remote room');
      }
    });

    // Tournament events
    socket.on('tournament_list', () => { socket.emit('tournament_list', tournamentManager.listAvailable()); try { socket.emit('tournament_completed_list', tournamentManager.listCompleted()); } catch {} });
    // Debug: dump tournament & lock state for a given user (admin/dev only)
    socket.on('tournament_debug_state', (p?: { userId?: string }) => {
      // Disable debug events in production
      if (process.env.NODE_ENV === 'production') {
        socket.emit('tournament_debug_state', { error: 'Debug events disabled in production' });
        return;
      }
      
      try {
        const authenticatedUserId = (socket as any).userId;
        const target = p?.userId || authenticatedUserId;
        
        // Users can only debug their own tournaments
        if (target !== authenticatedUserId) {
          socket.emit('tournament_debug_state', { error: 'Can only debug your own tournaments' });
          return;
        }
        
        const all = tournamentManager.listAll();
        const filtered = all.filter(t=> t.players.includes(String(target)));
        const summary = filtered.map(t => ({ id: t.id, status: t.status, players: t.players, eliminated: t.eliminated, bracket: t.bracket ? { semi1: { w: t.bracket.semi1?.winner }, semi2: { w: t.bracket.semi2?.winner }, final: { room: (t.bracket.final as any)?.roomId, invite: !!(t.bracket.final as any)?.invite } } : undefined }));
        const { activityManager } = require('../activityManager');
        const lockInfo = activityManager.isUserLocked(String(target));
        socket.emit('tournament_debug_state', { target, lockInfo, summary });
      } catch (e) {
        socket.emit('tournament_debug_state', { error: (e as Error).message });
      }
    });
    socket.on('tournament_create', (p: { name: string; startsInMinutes: number }) => {
      const userId = socketToUser.get(socket.id);
      if (!userId) return socket.emit('tournament_error','Not authenticated');
      if (activityManager.isUserLocked(userId).locked) return socket.emit('tournament_error','User locked by activity');
      try { const t = tournamentManager.create(p.name, userId, socket, p.startsInMinutes); socket.emit('tournament_created', t); } catch (e) { socket.emit('tournament_error', (e as Error).message || 'Create failed'); }
    });
    socket.on('tournament_join', (p: { id: string }) => {
      const userId = socketToUser.get(socket.id);
      if (!userId) return socket.emit('tournament_error','Not authenticated');
      if (activityManager.isUserLocked(userId).locked) return socket.emit('tournament_error','User locked by activity');
      try { const t = tournamentManager.join(p.id, userId, socket); socket.emit('tournament_joined', t); } catch (e) { socket.emit('tournament_error', (e as Error).message); }
    });
    socket.on('tournament_leave', (p: { id: string }) => {
      const userId = socketToUser.get(socket.id); if (!userId) return socket.emit('tournament_error','Not authenticated');
      try {
        const t = tournamentManager.leaveByUser(p.id, userId);
        // Redundant safety: unlock if no longer active anywhere
        if (!tournamentManager.isUserActive(userId)) activityManager.setTournamentLock(userId, false);
        socket.emit('tournament_left', t);
      } catch (e) { socket.emit('tournament_error', (e as Error).message); }
    });
    socket.on('tournament_match_invite_response', (p: { tournamentId: string; matchKey: 'semi1'|'semi2'|'final'; response: 'accept'|'decline' }) => { const userId = socketToUser.get(socket.id); if (!userId) return; try { tournamentManager.respondToMatchInvite(app.io, p.tournamentId, p.matchKey, userId, p.response); } catch {} });

    socket.on('disconnect', async () => {
      const userId = socketToUser.get(socket.id);
      if (userId) {
        // Decrement connection count and only mark offline if last socket disconnected
        const prev = userConnectionCounts.get(userId) || 1;
        const next = Math.max(0, prev - 1);
        userConnectionCounts.set(userId, next);
        if (next === 0) {
          try {
            await new Promise<void>((resolve, reject) => { db.run('UPDATE users SET status = ?, last_seen = ? WHERE id = ?', ['offline', new Date(), userId], function (err) { if (err) reject(err); else resolve(); }); });
            const idx = onlineUsers.indexOf(userId); if (idx !== -1) onlineUsers.splice(idx,1);
            app.io.emit('user_offline', onlineUsers);
          } catch (e) { console.error('offline update failed', e); }
        }
        socketToUser.delete(socket.id);
      }
      const roomId = socketToRoom.get(socket.id); if (roomId) { if (roomId.startsWith('remote_')) roomManager.deleteRemoteRoom(roomId); else roomManager.deleteRoom(roomId); socketToRoom.delete(socket.id); }
      try { tournamentManager.leaveAllBySocket(socket.id); } catch {}
      if (userId) {
        // On disconnect, we don't immediately clear tournament lock (managed by manager), but clear match lock.
  // Best-effort unlock on disconnect
  activityManager.unlockUser(userId);
      }
    });
  });
}
