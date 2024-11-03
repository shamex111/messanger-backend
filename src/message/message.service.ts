import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { CreateMessageDto } from './dto/createMessage.dto';
import { EditMessageDto } from './dto/editMessage.dto';
import { channel } from 'diagnostics_channel';
import { GroupService } from 'src/group/group.service';
import { permissionsVariant } from 'src/group/enums/premissionEnum';
import { ChannelService } from 'src/channel/channel.service';
import { AttachmentDto } from './dto/attachment.dto';
import { UserGateway } from 'src/user/user.gateway';
@Injectable()
export class MessageService {
  constructor(
    private prisma: PrismaService,
    private groupService: GroupService,
    private channelService: ChannelService,
    private userGateway: UserGateway,
  ) {}
  async create(userId: number, dto: CreateMessageDto) {
    if (dto.groupId) {
      await this.groupService.checkPermission(
        userId,
        dto.groupId,
        permissionsVariant.sendMessage,
      );
    } else if (dto.channelId) {
      await this.channelService.checkPermission(
        userId,
        dto.channelId,
        permissionsVariant.sendMessage,
      );
    }

    if (dto.channelId) {
      const channel = await this.prisma.channel.findUnique({
        where: {
          id: dto.channelId,
        },
        include: {
          members: {
            include: {
              user: true,
            },
          },
        },
      });
      if (!channel) {
        throw new NotFoundException('Канал не найден!');
      }

      const userInGroup = channel.members.some(
        (member) => member.user.id === userId,
      );

      if (!userInGroup) {
        throw new ForbiddenException(
          'Пользователь не может отправлять сообщения в этот Канал!',
        );
      }
    } else if (dto.chatId) {
      const chat = await this.prisma.personalChat.findUnique({
        where: {
          id: dto.chatId,
        },
      });
      if (!chat)
        throw new ForbiddenException(
          'Пользователь не может отправлять сообщения в эту группу!',
        );
      let userInChat = chat.user1Id === userId;
      !userInChat ? (userInChat = chat.user2Id === userId) : '';
      if (!userInChat)
        throw new ForbiddenException(
          'Пользователь не может отправлять сообщения в этот чат!',
        );
    } else if (dto.groupId) {
      const group = await this.prisma.group.findUnique({
        where: {
          id: dto.groupId,
        },
        include: {
          members: {
            include: {
              user: true,
            },
          },
        },
      });

      if (!group) {
        throw new NotFoundException('Группа не найдена!');
      }

      const userInGroup = group.members.some(
        (member) => member.user.id === userId,
      );

      if (!userInGroup) {
        throw new ForbiddenException(
          'Пользователь не можете отправлять сообщения в эту группу!',
        );
      }
    }
    if (dto.chatId) {
      await this.prisma.personalChatNotification.updateMany({
        where: {
          personalChatId: dto.chatId,
          userId: {
            not: userId,
          },
        },
        data: {
          count: {
            increment: 1,
          },
        },
      });
      this.userGateway.handleChatUpdated('chat', dto.chatId, {
        event: 'notification',
        incrementOrDecrement: 'increment',
        userId: userId,
      });
    } else if (dto.groupId) {
      const member = await this.prisma.groupMember.findFirst({
        where: {
          groupId: dto.groupId,
          userId: userId,
        },
      });
      await this.prisma.groupNotification.updateMany({
        where: {
          groupId: dto.groupId,
          memberId: {
            not: member.id,
          },
        },
        data: {
          count: {
            increment: 1,
          },
        },
      });
      this.userGateway.handleChatUpdated('group', dto.groupId, {
        event: 'notification',
        incrementOrDecrement: 'increment',
        userId: userId,
      });
    } else if (dto.channelId) {
      const member = await this.prisma.channelMember.findFirst({
        where: {
          channelId: dto.channelId,
          userId: userId,
        },
      });
      await this.prisma.channelNotification.updateMany({
        where: {
          channelId: dto.channelId,
          memberId: {
            not: member.id,
          },
        },
        data: {
          count: {
            increment: 1,
          },
        },
      });
      this.userGateway.handleChatUpdated('channel', dto.channelId, {
        event: 'notification',
        incrementOrDecrement: 'increment',
        userId: userId,
      });
    }
    let message: any = await this.prisma.message.create({
      data: {
        channelId: dto.channelId,
        groupId: dto.groupId,
        chatId: dto.chatId,
        content: dto.content,
        senderId: userId,
      },
      include: {
        readUsers: {
          include: {
            user: {},
          },
        },
        readChannels: {
          include: {
            member: {
              include: {
                user: {},
              },
            },
          },
        },
        readGroups: {
          include: {
            member: {
              include: {
                user: {},
              },
            },
          },
        },
        media: {},
        sender: {},
      },
    });

    if (dto.media) {
      for (const i of dto.media) {
        i.messageId = message.id;

        if (message.groupId) i.groupId = message.groupId;
        if (message.channelId) i.channelId = message.channelId;
        if (message.chatId) i.chatId = message.chatId;

        message = await this.attachment(i, userId); // дожидаемся каждого вызова
      }
    }

    const type = dto.channelId ? 'channel' : dto.groupId ? 'group' : 'chat';
    const typeId = dto.channelId || dto.groupId || dto.chatId;

    this.userGateway.handleChatUpdated(type, typeId, {
      messageId: message.id,
      event: 'message',
      newMessageData: message,
    });

    // console.log(message);
    return message;
  }
  async edit(id: number, newContent: string, userId: number) {
    const message = await this.prisma.message.findUnique({
      where: { id },
    });
    if (!message) throw new NotFoundException('Сообщение не найдено!');
    if (message.senderId !== userId)
      throw new ForbiddenException(
        'Пользователь не можете изменять это сообщение!',
      );

    const newMessage = await this.prisma.message.update({
      where: {
        id,
      },
      data: { content: newContent, isEdit: true },
    });
    const type = newMessage.channelId
      ? 'channel'
      : newMessage.groupId
        ? 'group'
        : 'chat';
    const typeId =
      newMessage.channelId || newMessage.groupId || newMessage.chatId;
    this.userGateway.handleChatUpdated(type, typeId, {
      messageId: newMessage.id,
      event: 'message-edit',
      newContent: newContent,
    });
    return newMessage;
  }

  async delete(userId: number, id: number) {
    const message = await this.prisma.message.findUnique({
      where: { id },
      include: {
        readChannels: {},
        readGroups: {},
        readUsers: {},
      },
    });
    if (!message) throw new NotFoundException('Сообщение не найдено!');
    if (message.senderId !== userId)
      throw new ForbiddenException(
        'Пользователь не может удалять это сообщение!',
      );

    if (message.channelId) {
      const member = await this.prisma.channelMember.findFirst({
        where: {
          channelId: message.channelId,
          userId: userId,
        },
      });
      if (!member) {
        throw new BadRequestException(
          'Пользователь не является членом канала!',
        );
      }

      const members = await this.prisma.channelMember.findMany({
        where: {
          channelId: message.channelId,
        },
      });

      for (const otherMember of members) {
        if (otherMember.userId !== userId) {
          const isExists = message.readChannels.some(
            (c) => c.memberId === otherMember.id,
          );
          if (!isExists) {
            const notifId = await this.prisma.channelNotification.findFirst({
              where: {
                channelId: message.channelId,
                memberId: otherMember.id,
              },
            });
            await this.prisma.channelNotification.update({
              where: {
                id: notifId.id,
              },
              data: {
                count: {
                  decrement: 1,
                },
              },
            });
            await this.prisma.messageReadChannel.create({
              data: {
                messageId: id,
                channelId: message.channelId,
                memberId: otherMember.id,
              },
            });
          }
        }
      }
    }

    if (message.groupId) {
      const member = await this.prisma.groupMember.findFirst({
        where: {
          groupId: message.groupId,
          userId: userId,
        },
      });
      if (!member) {
        throw new BadRequestException(
          'Пользователь не является членом группы!',
        );
      }

      const members = await this.prisma.groupMember.findMany({
        where: {
          groupId: message.groupId,
        },
      });

      for (const otherMember of members) {
        if (otherMember.userId !== userId) {
          const isExists = message.readGroups.some(
            (c) => c.memberId === otherMember.id,
          );
          if (!isExists) {
            const notifId = await this.prisma.groupNotification.findFirst({
              where: {
                groupId: message.groupId,
                memberId: otherMember.id,
              },
            });
            await this.prisma.groupNotification.update({
              where: {
                id: notifId.id,
              },
              data: {
                count: {
                  decrement: 1,
                },
              },
            });
            await this.prisma.messageReadGroup.create({
              data: {
                messageId: id,
                groupId: message.groupId,
                memberId: otherMember.id,
              },
            });
          }
        }
      }
    }

    if (message.chatId) {
      const chat = await this.prisma.personalChat.findUnique({
        where: {
          id: message.chatId,
        },
      });
      if (!chat) throw new BadRequestException('Такого чата нет!');

      const otherUserId = chat.user1Id === userId ? chat.user2Id : chat.user1Id;

      const isRead = await this.prisma.messageReadUser.findFirst({
        where: {
          messageId: message.id,
          userId: otherUserId,
        },
      });

      if (!isRead) {
        const notifId = await this.prisma.personalChatNotification.findFirst({
          where: {
            personalChatId: message.chatId,
            userId: otherUserId,
          },
        });

        if (notifId) {
          await this.prisma.personalChatNotification.update({
            where: {
              id: notifId.id,
            },
            data: {
              count: {
                decrement: 1,
              },
            },
          });
        }
      }
    }

    const deleteMessage = await this.prisma.message.delete({
      where: {
        id,
      },
    });
    const type = deleteMessage.channelId
      ? 'channel'
      : deleteMessage.groupId
        ? 'group'
        : 'chat';
    const typeId =
      deleteMessage.channelId || deleteMessage.groupId || deleteMessage.chatId;
    this.userGateway.handleChatUpdated(type, typeId, {
      event: 'message-delete',
      messageId: deleteMessage.id,
    });
    return deleteMessage;
  }

  async getMessages(
    userId: number,
    dto: {
      lastMessageId: number;
      count: number;
      smthId: number;
      type: 'chat' | 'group' | 'channel';
    },
  ) {
    const { lastMessageId, count, smthId, type } = dto;
    const whereCondition: any = {};

    switch (type) {
      case 'group':
        whereCondition.groupId = smthId;
        break;
      case 'channel':
        whereCondition.channelId = smthId;
        break;
      case 'chat':
        whereCondition.chatId = smthId;
        break;
      default:
        throw new BadRequestException('Неверный тип запроса!');
    }

    const lastMessage = await this.prisma.message.findUnique({
      where: { id: lastMessageId },
    });

    if (!lastMessage) {
      throw new NotFoundException('Последнее сообщение не найдено!');
    }

    const messages = await this.prisma.message.findMany({
      where: {
        ...whereCondition,
        createdAt: {
          lt: lastMessage.createdAt,
        },
      },
      orderBy: { createdAt: 'desc' },
      take: count,
      include: {
        group: {
          include: {
            members: {
              include: {
                user: true,
              },
            },
          },
        },
        channel: {
          include: {
            members: {
              include: {
                user: true,
              },
            },
          },
        },
        chat: {
          include: {
            user1: true,
            user2: true,
          },
        },
        readUsers: {
          include: {
            user: {},
          },
        },
        readChannels: {
          include: {
            member: {
              include: {
                user: {},
              },
            },
          },
        },
        readGroups: {
          include: {
            member: {
              include: {
                user: {},
              },
            },
          },
        },
        media: {},
        sender: {},
      },
    });

    // Если сообщений нет, дальнейшая проверка прав не имеет смысла
    if (messages.length === 0) {
      return [];
    }

    // Проверка доступа в группе
    if (type === 'group') {
      const group = messages[0].group;
      if (!group) throw new NotFoundException('Группа не найдена!');
      const userInGroup = group.members.some(
        (member) => member.user.id === userId,
      );
      if (!userInGroup) {
        throw new ForbiddenException('Нет доступа к сообщению в группе!');
      }
    }

    // Проверка доступа в канале
    else if (type === 'channel') {
      const channel = messages[0].channel;
      if (!channel) throw new NotFoundException('Канал не найден!');
      const userInChannel = channel.members.some(
        (member) => member.user.id === userId,
      );
      if (!userInChannel) {
        throw new ForbiddenException('Нет доступа к сообщению в канале!');
      }
    } else if (type === 'chat') {
      const chat = messages[0].chat;
      if (!chat) throw new NotFoundException('Чат не найден!');
      const isUserInChat = chat.user1.id === userId || chat.user2.id === userId;
      if (!isUserInChat) {
        throw new ForbiddenException('Нет доступа к сообщению в чате!');
      }
    }

    return messages;
  }

  async readUser(id: number, userId: number) {
    const message = await this.prisma.message.findUnique({
      where: {
        id,
      },
      include: {
        readChannels: {},
        readGroups: {},
        readUsers: {},
      },
    });
    if (!message)
      throw new BadRequestException(
        'Нельзя прочитать несуществующее сообщение!',
      );
    if (message.senderId === userId)
      throw new BadRequestException(
        'Пользователь не может пометить прочитанным свое же сообщение!',
      );
    if (!message.isRead) {
      await this.prisma.message.update({
        where: {
          id,
        },
        data: {
          isRead: true,
        },
      });
      const type = message.channelId
        ? 'channel'
        : message.groupId
          ? 'group'
          : 'chat';
      const typeId = message.channelId || message.groupId || message.chatId;
      this.userGateway.handleChatUpdated(type, typeId, {
        event: 'message-status',
        messageId: message.id,
      });
    }

    if (message.channelId) {
      const member = await this.prisma.channelMember.findFirst({
        where: {
          channelId: message.channelId,
          userId: userId,
        },
      });
      if (!member) {
        throw new BadRequestException(
          'Пользователь не является членом канала!',
        );
      }
      const isExists = message.readChannels.some(
        (c) => c.memberId === member.id,
      );
      if (!isExists) {
        const notifId = await this.prisma.channelNotification.findFirst({
          where: {
            channelId: message.channelId,
            memberId: member.id,
          },
        });
        await this.prisma.channelNotification.update({
          where: {
            id: notifId.id,
          },
          data: {
            count: {
              decrement: 1,
            },
          },
        });
        const mesReadChannel = await this.prisma.messageReadChannel.create({
          data: {
            messageId: id,
            channelId: message.channelId,
            memberId: member.id,
          },
        });

        this.userGateway.handleChatUpdated('channel', message.channelId, {
          event: 'notification',
          incrementOrDecrement: 'decrement',
        });
        return mesReadChannel;
      }
    }

    if (message.groupId) {
      const member = await this.prisma.groupMember.findFirst({
        where: {
          groupId: message.groupId,
          userId: userId,
        },
      });
      if (!member) {
        throw new BadRequestException(
          'Пользователь не является членом группы!',
        );
      }
      const isExists = message.readGroups.some((c) => c.memberId === member.id);
      if (!isExists) {
        const notifId = await this.prisma.groupNotification.findFirst({
          where: {
            groupId: message.groupId,
            memberId: member.id,
          },
        });
        await this.prisma.groupNotification.update({
          where: {
            id: notifId.id,
          },
          data: {
            count: {
              decrement: 1,
            },
          },
        });
        const mesReadGroup = await this.prisma.messageReadGroup.create({
          data: {
            messageId: id,
            groupId: message.groupId,
            memberId: member.id,
          },
        });
        this.userGateway.handleChatUpdated('group', message.groupId, {
          event: 'notification',
          incrementOrDecrement: 'decrement',
        });
        return mesReadGroup;
      }
    }

    if (message.chatId) {
      const isExists = message.readUsers.some((c) => c.userId === userId);
      if (!isExists) {
        const notifId = await this.prisma.personalChatNotification.findFirst({
          where: {
            personalChatId: message.chatId,
            userId: userId,
          },
        });
        await this.prisma.personalChatNotification.update({
          where: {
            id: notifId.id,
          },
          data: {
            count: {
              decrement: 1,
            },
          },
        });

        const mesReadChat = await this.prisma.messageReadUser.create({
          data: {
            messageId: id,
            userId: userId,
            personalChatId: message.chatId,
          },
        });
        this.userGateway.handleChatUpdated('chat', message.chatId, {
          event: 'notification',
          incrementOrDecrement: 'decrement',
        });
        return mesReadChat;
      }
    }
  }

  async attachment(dto: AttachmentDto, userId: number) {
    if (dto.groupId) {
      await this.groupService.checkPermission(
        userId,
        dto.groupId,
        permissionsVariant.addMedia,
      );
    } else if (dto.channelId) {
      await this.channelService.checkPermission(
        userId,
        dto.channelId,
        permissionsVariant.addMedia,
      );
    }
    const message = await this.prisma.message.findFirst({
      where: {
        id: dto.messageId,
        senderId: userId,
      },
    });
    if (!message)
      throw new BadRequestException(
        'Либо не существует такого сообщения либо оно написано не указанным пользователем!',
      );

    const media = await this.prisma.media.create({
      data: dto,
    });
    return this.prisma.message.update({
      where: {
        id: dto.messageId,
      },
      data: {
        media: {
          connect: { id: media.id },
        },
      },
      include: {
        readUsers: {
          include: {
            user: {},
          },
        },
        readChannels: {
          include: {
            member: {
              include: {
                user: {},
              },
            },
          },
        },
        readGroups: {
          include: {
            member: {
              include: {
                user: {},
              },
            },
          },
        },
        media: {},
        sender: {},
      },
    });
  }

  async addReaction() {}

  //   async getMessages(userId,) {}
}
