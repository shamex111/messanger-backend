import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { CreateChatDto } from './dto/createChat.dto';
import { UserService } from 'src/user/user.service';
import { UserGateway } from 'src/user/user.gateway';

@Injectable()
export class PersonalChatService {
  constructor(
    private prisma: PrismaService,
    private userService: UserService,
    private userGateway: UserGateway,
  ) {}
  async getById(userId: number, id: number) {
    const notification = await this.prisma.personalChatNotification.findFirst({
      where: {
        personalChatId: id,
        userId: userId,
      },
    });
    const count: number =
      notification.count >= 20 ? notification.count + 20 : 20;
    const personalChat = await this.prisma.personalChat.findUnique({
      where: {
        id,
        OR: [{ user1Id: userId }, { user2Id: userId }],
      },
      include: {
        messages: {
          orderBy: {
            createdAt: 'desc',
          },
          include: {
            readUsers: {
              include: {
                user: {},
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
            readChannels: {
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
          take: count,
        },
        user1: true,
        user2: true,
        media:{}
      },
    });
    if (!personalChat) {
      throw new BadRequestException('Ошибка!');
    }
    return personalChat;
  }

  async create(dto: CreateChatDto, userId: number) {
    let isFirstUserReal = await this.userService.getById(dto.user1Id);
    if (!isFirstUserReal)
      throw new BadRequestException(
        'Одного или двух пользователей для создания чата не существует!',
      );
    let isSecondUserReal = await this.userService.getById(dto.user2Id);
    if (!isSecondUserReal)
      throw new BadRequestException(
        'Одного из пользователей для создания чата не существует!',
      );
    if (dto.user1Id === dto.user2Id)
      throw new BadRequestException(
        'Пользователь не может создать чат с самим собой!',
      );
    if (dto.user1Id !== userId && dto.user2Id !== userId) {
      throw new BadRequestException(
        'Пользователь не может создать чат другим пользователям!',
      );
    }
    const isExists = await this.prisma.personalChat.findFirst({
      where: {
        OR: [
          { user1Id: dto.user1Id, user2Id: dto.user2Id },
          { user1Id: dto.user2Id, user2Id: dto.user1Id },
        ],
      },
    });
    if (isExists)
      throw new BadRequestException(
        'Чат с такими пользователями уже существует!',
      );
    const chat = await this.prisma.personalChat.create({
      data: dto,
      include: {
        messages: {
          orderBy: {
            createdAt: 'desc',
          },
          include: {
            readUsers: {
              include: {
                user: {},
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
            readChannels: {
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
          take: 20,
        },
        user1: true,
        user2: true,
        media:{}
      },
    });
    await this.prisma.personalChatNotification.create({
      data: {
        personalChatId: chat.id,
        userId: dto.user1Id,
      },
    });
    await this.prisma.personalChatNotification.create({
      data: {
        personalChatId: chat.id,
        userId: dto.user2Id,
      },
    });

    // this.userGateway.handleChangeUserChats('chat', dto.user1Id, chat.id, 'add');
    // this.userGateway.handleChangeUserChats('chat', dto.user2Id, chat.id, 'add');

    this.userGateway.changeMember({
      type: 'chat',
      smthId: chat.id,
      userId: chat.user1Id,
      action: 'add',
      chat: chat,
    });
    this.userGateway.changeMember({
      type: 'chat',
      smthId: chat.id,
      userId: chat.user2Id,
      action: 'add',
      chat: chat,
    });

    return chat;
  }

  // async addMessage(dto: CreateMessageDto, userId: number) {
  //   let isChatIdCorrect = this.prisma.personalChat.findUnique({
  //     where: {
  //       id: dto.chatId,
  //     },
  //   });
  //   if (!isChatIdCorrect)
  //     throw new BadRequestException(
  //       'Группы указанной для добавления сообщение не существует!',
  //     );
  //   return this.messageService.create(userId, dto);
  // }

  async delete(id: number, userId: number) {
    const chat = await this.prisma.personalChat.findUnique({
      where: {
        id,
      },
      include: {
        user1: {},
        user2: {},
      },
    });
    if (!chat)
      throw new BadRequestException(
        'Чат указанный для удаление не существует!',
      );
    if (chat.user1Id !== userId && chat.user2Id !== userId)
      throw new BadRequestException(
        'Пользователь не может удалять чужие чаты!',
      );
    const deleteChat = await this.prisma.personalChat.delete({
      where: {
        id,
      },
    });

    // this.userGateway.handleChangeUserChats(
    //   'chat',
    //   chat.user1Id,
    //   chat.id,
    //   'delete',
    // );
    // this.userGateway.handleChangeUserChats(
    //   'chat',
    //   chat.user2Id,
    //   chat.id,
    //   'delete',
    // );
    this.userGateway.changeMember({
      type: 'chat',
      smthId: chat.id,
      action: 'delete',
      userId: chat.user1Id,
      name: chat.user2.name,
    });
    this.userGateway.changeMember({
      type: 'chat',
      smthId: chat.id,
      action: 'delete',
      userId: chat.user2Id,
      name: chat.user1.name,
    });
    return deleteChat;
  }
}
