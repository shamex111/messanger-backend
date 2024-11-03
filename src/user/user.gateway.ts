import { BadRequestException, Logger } from '@nestjs/common';
import {
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { EventEmitter } from 'events';
import { UserService } from './user.service';
import { PrismaService } from 'src/prisma.service';
import { returnUserObject } from './objects/returnUser.object';
type TYPE = 'channel' | 'group' | 'chat';

EventEmitter.defaultMaxListeners = 14;
@WebSocketGateway()
export class UserGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  constructor(private prisma: PrismaService) {}

  private readonly logger = new Logger(UserGateway.name);
  afterInit(server: Server) {
    this.server = server;
  }

  handleConnection(client: any, ...args: any[]) {
    const { sockets } = this.server.sockets;

    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: any) {
    this.logger.log(`Client id:${client.id} disconnected`);
  }

  @SubscribeMessage('joinPersonalRoom')
  joinPersonalRoom(socket: Socket, userId: number) {
    socket.join(`user_${userId}`);
  }

  @SubscribeMessage('leavePersonalRoom')
  leavePersonalRoom(socket: Socket, userId: number) {
    socket.leave(`user_${userId}`);
  }

  // handleChangeUserChats(
  //   type: TYPE,
  //   userId: number,
  //   smthId: number,
  //   event: 'delete' | 'add',
  // ) {
  //   this.server.to(`user_${userId}`).emit('user-chats', {
  //     event,
  //     type,
  //     smthId,
  //   });
  // }

  editUser(userId: number) {
    this.server.to(`user_${userId}`).emit('edit-user');
  }
  changeMember(dto: {
    type: TYPE;
    smthId: number;
    userId?: number;
    action: 'delete' | 'add';
    data?: any;
    chat?: any;
    name?: string;
  }) {
    if (dto.type !== 'chat') {
      this.server.to(`${dto.type}_${dto.smthId}`).emit('change-member', {
        type: dto.type,
        smthId: dto.smthId,
        userId: dto.userId || null,
        data: dto.data || null,
        action: dto.action,
        chat: dto.chat,
        name: dto.name || null,
      });
    }
    if (dto.action === 'add' || dto.type === 'chat') {
      this.server.to(`user_${dto.userId}`).emit('change-member', {
        type: dto.type,
        smthId: dto.smthId,
        userId: dto.userId || null,
        data: dto.data || null,
        action: dto.action,
        chat: dto.chat,
        name: dto.name || null,
      });
    }
  }

  handleChatUpdated(
    type: TYPE,
    smthId: number,
    data: {
      event:
        | 'message'
        | 'message-delete'
        | 'message-status'
        | 'notification'
        | 'message-edit';
      messageId?: number;
      userId?: number;
      newContent?: string;
      newMessageData?: any;
      incrementOrDecrement?: 'increment' | 'decrement';
    },
  ) {
    this.server
      .to(`${type}_${smthId}`)
      .emit('chat-updated', { ...data, smthId, type });
    console.log(`${type}_${smthId}`);
  }

  createRole(
    type: 'group' | 'channel',
    smthId: number,
    data: {
      name: string;
      permissions: any[];
      color: string;
      isSystemRole: boolean;
    },
  ) {
    this.server
      .to(`${type}_${smthId}`)
      .emit('create-role', { ...data, smthId, type });
  }
  assignRole(
    type: 'group' | 'channel',
    smthId: number,
    data: { userId: number; roleName: string },
  ) {
    this.server
      .to(`${type}_${smthId}`)
      .emit('assign-role', { ...data, smthId, type });
  }

  deleteChat(type: 'group' | 'channel', smthId: number) {
    this.server.to(`${type}_${smthId}`).emit('delete-chat', { type ,smthId});
  }

  @SubscribeMessage('subscribeToStatus')
  handleSubscribeToStatus(socket: Socket, data: { targetUserIds: number[] }) {
    const { targetUserIds } = data;
    console.log('sub', data.targetUserIds, socket.id);
    targetUserIds.forEach((userId) => {
      socket.join(`status_${userId}`);
    });
  }

  @SubscribeMessage('unsubscribeFromStatus')
  handleUnsubscribeFromStatus(
    socket: Socket,
    @MessageBody() data: { targetUserIds: number[] },
  ) {
    const { targetUserIds } = data;
    targetUserIds.forEach((userId) => {
      socket.leave(`status_${userId}`);
    });
  }

  changeOnline(userId: number, event: 'online' | 'offline') {
    this.server
      .to(`status_${userId}`)
      .emit(`set-status-online`, { userId, event });
  }

  @SubscribeMessage('typing')
  handleTyping(dto: { type: TYPE; smthId: number; writersId: number }) {
    this.server.to(`${dto.type}_${dto.smthId}`).emit('typing', dto.writersId);
  }

  @SubscribeMessage('typing-stop')
  handleStopTyping(dto: { type: TYPE; smthId: number; writersId: number }) {
    this.server
      .to(`${dto.type}_${dto.smthId}`)
      .emit('typing-stop', dto.writersId);
  }

  @SubscribeMessage('join-room')
  joinRoom(socket: Socket, payload: { type: TYPE; smthId: number }) {
    socket.join(`${payload.type}_${payload.smthId}`);
  }

  @SubscribeMessage('leave-room')
  leaveRoom(socket: Socket, payload: { type: TYPE; smthId: number }) {
    socket.leave(`${payload.type}_${payload.smthId}`);
  }
}
// /set-online
