import type { FastifyInstance } from 'fastify';
import type { Namespace } from 'socket.io';
import { socketAuthMiddleware } from '../middleware/socketAuth';

export interface SocketNamespaces {
  chat: Namespace;
  game: Namespace; 
  lobby: Namespace;
  tournament: Namespace;
}

export function createSocketNamespaces(app: FastifyInstance): SocketNamespaces {
  // Create separate namespaces for different functionalities
  const chatNamespace = app.io.of('/chat');
  const gameNamespace = app.io.of('/game');
  const lobbyNamespace = app.io.of('/lobby');
  const tournamentNamespace = app.io.of('/tournament');

  // Apply authentication middleware to all namespaces
  chatNamespace.use(socketAuthMiddleware);
  gameNamespace.use(socketAuthMiddleware);
  lobbyNamespace.use(socketAuthMiddleware);
  tournamentNamespace.use(socketAuthMiddleware);

  // Log namespace connections
  chatNamespace.on('connection', (socket) => {
    console.log(`📨 Chat namespace - User ${(socket as any).userId} connected (${socket.id})`);
  });

  gameNamespace.on('connection', (socket) => {
    console.log(`🎮 Game namespace - User ${(socket as any).userId} connected (${socket.id})`);
  });

  lobbyNamespace.on('connection', (socket) => {
    console.log(`🏛️ Lobby namespace - User ${(socket as any).userId} connected (${socket.id})`);
  });

  tournamentNamespace.on('connection', (socket) => {
    console.log(`🏆 Tournament namespace - User ${(socket as any).userId} connected (${socket.id})`);
  });

  return {
    chat: chatNamespace,
    game: gameNamespace,
    lobby: lobbyNamespace,
    tournament: tournamentNamespace
  };
}
