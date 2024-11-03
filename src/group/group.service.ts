import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { CreateGroupDto } from './dto/createGroup.dto';
import { UserService } from 'src/user/user.service';
import { AddMemberDto } from './dto/addMember.dto';
import { CreateRoleDto } from './dto/createRole.dto';
import { RemoveRoleDto } from './dto/removeRole.dto';
import { AssignRoleDto } from './dto/assignRole.dto';
import { DeleteRoleDto } from './dto/deleteRole.dto';
import { EditRoleDto } from './dto/editRole.dto';
import { permissionsVariant } from './enums/premissionEnum';
import { DeleteMemberDto } from './dto/deleteMember.dto';
import { EditGroupDto } from './dto/editGroup.dto';
import { changeNotificationsDto } from './dto/changeNotifications.dto';
import { UserGateway } from 'src/user/user.gateway';

@Injectable()
export class GroupService {
  constructor(
    private prisma: PrismaService,
    private userService: UserService,
    private userGateway: UserGateway,
  ) {}
  async getById(userId: number, id: number) {
    const userMember = await this.prisma.groupMember.findFirst({
      where: {
        userId,
        groupId: id,
      },
    });
    const notification = await this.prisma.groupNotification.findFirst({
      where: {
        memberId: userMember.id,
        groupId: id,
      },
    });
    const count: number =
      notification.count >= 20 ? notification.count + 20 : 20;
    if (userMember) {
      return this.prisma.group.findUnique({
        where: {
          id,
        },
        include: {
          messages: {
            orderBy: {
              createdAt: 'desc',
            },
            take: count,
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
              sender: {
                include: {
                  groupMembers: {
                    include: {
                      groupRole: {},
                    },
                  },
                },
              },
            },
          },
          members: {
            include: {
              user: {},
              groupRole: {
                include: {
                  permissions: {
                    include: {
                      permission: {},
                    },
                  },
                },
              },
              GroupNotification: {},
            },
          },
          roles: {
            include: {
              permissions: {
                include: {
                  permission: {},
                },
              },
            },
          },
          media: {},
        },
      });
    }
  }
  async getByIdForInvite(userId: number, id: number) {
    const userMember = await this.prisma.groupMember.findFirst({
      where: {
        userId,
        groupId: id,
      },
    });
    if (userMember) throw new BadRequestException('Пользователь уже в группе!');

    return this.prisma.group.findUnique({
      where: {
        id,
      },
      include: {
        messages: {
          orderBy: {
            createdAt: 'desc',
          },
          take: 100,
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
            sender: {
              include: {
                groupMembers: {
                  include: {
                    groupRole: {},
                  },
                },
              },
            },
          },
        },
        members: {
          include: {
            groupRole: {
              include: {
                permissions: {
                  include: {
                    permission: {},
                  },
                },
              },
            },
            user: {},
          },
        },
        roles: {
          include: {
            permissions: {
              include: {
                permission: {},
              },
            },
          },
        },
        media: {},
      },
    });
  }

  async searchGroups(param: string) {
    return this.prisma.group.findMany({
      where: {
        name: {
          startsWith: param,
          mode: 'insensitive',
        },
        private: false,
      },
      take: 40,
    });
  }

  async create(dto: CreateGroupDto, userId: number) {
    const isUserReal = await this.userService.getById(userId);
    if (!isUserReal)
      throw new BadRequestException(
        'Пользователя для создания группы не существует!',
      );

    const newGroup = await this.prisma.group.create({
      data: dto,
    });
    const ADMIN_NAME = 'Администратор';
    await this.createRole({
      name: ADMIN_NAME,
      groupId: newGroup.id,
      permissionNames: [
        'delete',
        'edit',
        'addMember',
        'removeMember',
        'sendMessage',
        'addMedia',
        'changeRole',
      ],
      isSystemRole: true,
    });
    await this.createRole({
      name: 'Участник',
      groupId: newGroup.id,
      permissionNames: ['addMember', 'sendMessage', 'addMedia'],
      isSystemRole: true,
    });
    await this.addMember({ userId, groupId: newGroup.id });
    await this.assignRole({
      userId: userId,
      groupId: newGroup.id,
      roleName: ADMIN_NAME,
    });
    return newGroup;
  }

  async edit(dto: EditGroupDto, userId?: number) {
    if (userId) {
      await this.checkPermission(userId, dto.groupId, permissionsVariant.edit);
    }
    return this.prisma.group.update({
      where: {
        id: dto.groupId,
      },
      data: {
        name: dto.name,
        avatar: dto.avatar,
        description: dto.description,
        private: dto.private,
      },
    });
  }

  async delete(groupId: number, userId?: number) {
    if (userId) {
      await this.checkPermission(userId, groupId, permissionsVariant.delete);
    }
    this.userGateway.deleteChat('group',groupId)
    return this.prisma.group.delete({
      where: {
        id: groupId,
      },
    });
  }

  async addMember(dto: AddMemberDto, userId?: number) {
    if (userId) {
      await this.checkPermission(
        userId,
        dto.groupId,
        permissionsVariant.addMember,
      );
    }
    const group = await this.prisma.group.findUnique({
      where: {
        id: dto.groupId,
      },
      include: {
        messages: {
          orderBy: {
            createdAt: 'desc',
          },
          take: 20,
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
            sender: {
              include: {
                groupMembers: {
                  include: {
                    groupRole: {},
                  },
                },
              },
            },
          },
        },
        members: {
          include: {
            user: {},
            GroupNotification: {},
            groupRole: {
              include: {
                permissions: {
                  include: {
                    permission: {},
                  },
                },
              },
            },
          },
        },
        roles: {
          include: {
            permissions: {
              include: {
                permission: {},
              },
            },
          },
        },
        media: {},
      },
    });
    if (!group)
      throw new BadRequestException(
        'Группы для добавления пользователя не существует!',
      );
    const user = await this.prisma.user.findUnique({
      where: {
        id: dto.userId,
      },
    });
    if (!user)
      throw new BadRequestException(
        'Пользователя для добавления в группу не существует!',
      );
    const isExists = await this.prisma.groupMember.findFirst({
      where: {
        userId: dto.userId,
        groupId: dto.groupId,
      },
    });
    if (isExists)
      throw new BadRequestException('Пользователь уже находиться в группе!');
    const userRoleId = await this.getRoleIdByName('Участник', dto.groupId);
    const member = await this.prisma.groupMember.create({
      data: { ...dto, groupRoleId: userRoleId as number },
      include: {
        GroupNotification: {},
        user: {},
        groupRole: {
          include: {
            permissions: {
              include: {
                permission: {},
              },
            },
          },
        },
      },
    });
    await this.prisma.groupNotification.create({
      data: {
        memberId: member.id,
        groupId: dto.groupId,
      },
    });
    // this.userGateway.handleChangeUserChats(
    //   'group',
    //   dto.userId,
    //   dto.groupId,
    //   'add',
    // );
    
    await this.prisma.group.update({
      where: {
        id: dto.groupId,
      },
      data: {
        qtyUsers: {
          increment: 1,
        },
      },
    });

    const groupOutput = await this.prisma.group.findUnique({
      where: {
        id: dto.groupId,
      },
      include: {
        messages: {
          orderBy: {
            createdAt: 'desc',
          },
          take: 20,
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
            sender: {
              include: {
                groupMembers: {
                  include: {
                    groupRole: {},
                  },
                },
              },
            },
          },
        },
        members: {
          include: {
            user: {},
            GroupNotification: {},
            groupRole: {
              include: {
                permissions: {
                  include: {
                    permission: {},
                  },
                },
              },
            },
          },
        },
        roles: {
          include: {
            permissions: {
              include: {
                permission: {},
              },
            },
          },
        },
        media: {},
      },
    });
    this.userGateway.changeMember({
      type: 'group',
      smthId: dto.groupId,
      userId: dto.userId,
      action: 'add',
      data: member,
      chat: groupOutput,
    });
    return member;
  }
  async join(groupId: number, userId: number, isDiscussion?: boolean) {
    const group = await this.prisma.group.findUnique({
      where: {
        id: groupId,
      },
      include: {
        messages: {
          orderBy: {
            createdAt: 'desc',
          },
          take: 20,
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
            sender: {
              include: {
                groupMembers: {
                  include: {
                    groupRole: {},
                  },
                },
              },
            },
          },
        },
        members: {
          include: {
            user: {},
            GroupNotification: {},
            groupRole: {
              include: {
                permissions: {
                  include: {
                    permission: {},
                  },
                },
              },
            },
          },
        },
        roles: {
          include: {
            permissions: {
              include: {
                permission: {},
              },
            },
          },
        },
        media: {},
        channel: {},
      },
    });
    if (!group)
      throw new BadRequestException(
        'Группы для добавления пользователя не существует!',
      );

    const user = await this.prisma.user.findUnique({
      where: {
        id: userId,
      },
    });
    if (!user)
      throw new BadRequestException(
        'Пользователя для добавления в группу не существует!',
      );

    const isExists = await this.prisma.groupMember.findFirst({
      where: {
        userId: userId,
        groupId: groupId,
      },
    });
    if (isExists)
      throw new BadRequestException('Пользователь уже находиться в группе!');
    const userRoleId = await this.getRoleIdByName('Участник', groupId);
    if (!group.private) {
      const member = await this.prisma.groupMember.create({
        data: {
          userId: userId,
          groupId: groupId,
          groupRoleId: userRoleId as number,
        },
        include: {
          GroupNotification: {},
          groupRole: {
            include: {
              permissions: {
                include: {
                  permission: {},
                },
              },
            },
          },
        },
      });
      await this.prisma.groupNotification.create({
        data: {
          memberId: member.id,
          groupId: groupId,
        },
      });

      await this.prisma.group.update({
        where: {
          id: groupId,
        },
        data: {
          qtyUsers: {
            increment: 1,
          },
        },
      });

      const groupOutput = await this.prisma.group.findUnique({
        where: {
          id: groupId,
        },
        include: {
          messages: {
            orderBy: {
              createdAt: 'desc',
            },
            take: 20,
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
              sender: {
                include: {
                  groupMembers: {
                    include: {
                      groupRole: {},
                    },
                  },
                },
              },
            },
          },
          members: {
            include: {
              user: {},
              GroupNotification: {},
              groupRole: {
                include: {
                  permissions: {
                    include: {
                      permission: {},
                    },
                  },
                },
              },
            },
          },
          roles: {
            include: {
              permissions: {
                include: {
                  permission: {},
                },
              },
            },
          },
          media: {},
        },
      });
      this.userGateway.changeMember({
        type: 'group',
        smthId: groupId,
        userId: userId,
        action: 'add',
        data: member,
        chat: groupOutput,
      });
      return member;
    } else if (isDiscussion) {
      const isUserInChannel = this.prisma.channelMember.findFirst({
        where: {
          userId: userId,
          channelId: group.channel.id,
        },
      });
      if (isUserInChannel) {
        const member = await this.prisma.groupMember.create({
          data: {
            userId: userId,
            groupId: groupId,
            groupRoleId: userRoleId as number,
          },
          include: {
            GroupNotification: {},
            groupRole: {
              include: {
                permissions: {
                  include: {
                    permission: {},
                  },
                },
              },
            },
          },
        });
        await this.prisma.groupNotification.create({
          data: {
            memberId: member.id,
            groupId: groupId,
          },
        });

        await this.prisma.group.update({
          where: {
            id: groupId,
          },
          data: {
            qtyUsers: {
              increment: 1,
            },
          },
        });

        const groupOutput = await this.prisma.group.findUnique({
          where: {
            id: groupId,
          },
          include: {
            messages: {
              orderBy: {
                createdAt: 'desc',
              },
              take: 20,
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
                sender: {
                  include: {
                    groupMembers: {
                      include: {
                        groupRole: {},
                      },
                    },
                  },
                },
              },
            },
            members: {
              include: {
                user: {},
                GroupNotification: {},
                groupRole: {
                  include: {
                    permissions: {
                      include: {
                        permission: {},
                      },
                    },
                  },
                },
              },
            },
            roles: {
              include: {
                permissions: {
                  include: {
                    permission: {},
                  },
                },
              },
            },
            media: {},
          },
        });
        this.userGateway.changeMember({
          type: 'group',
          smthId: groupId,
          userId: userId,
          action: 'add',
          data: member,
          chat: groupOutput,
        });
        return member;
      }
    }
  }

  async changeUserNotification(dto: changeNotificationsDto, userId: number) {
    const isUserInGroup = await this.prisma.groupMember.findFirst({
      where: {
        userId: userId,
        groupId: dto.groupId,
      },
    });
    if (!isUserInGroup)
      throw new BadRequestException(
        'Не существует либо пользователя либо группы либо пользователь не находится в группе в которой хочет изменить состояние уведомлений!',
      );
    return this.prisma.groupMember.update({
      where: {
        id: isUserInGroup.id,
      },
      data: {
        isMuted: dto.isMuted,
      },
    });
  }

  async deleteMember(dto: DeleteMemberDto, userId?: number) {
    if (userId) {
      if (userId !== dto.userId) {
        await this.checkPermission(
          userId,
          dto.groupId,
          permissionsVariant.removeMember,
        );
      }
    }

    const user = await this.userService.getById(dto.userId);
    if (!user)
      throw new BadRequestException('Пользователя для удаления не существует!');
    const group = await this.prisma.group.findUnique({
      where: {
        id: dto.groupId,
      },
    });
    if (!group)
      throw new BadRequestException(
        'Группы для удаления пользователя не существует!',
      );
    const isUserInGroup = await this.prisma.groupMember.findFirst({
      where: {
        userId: dto.userId,
        groupId: dto.groupId,
      },
    });
    if (!isUserInGroup)
      throw new BadRequestException('Пользователя итак нет в данной группе!');
    const deleteUser = await this.prisma.groupMember.delete({
      where: {
        id: isUserInGroup.id,
      },
    });
    // this.userGateway.handleChangeUserChats(
    //   'group',
    //   dto.userId,
    //   dto.groupId,
    //   'delete',
    // );
    await this.prisma.group.update({
      where: {
        id: dto.groupId,
      },
      data: {
        qtyUsers: {
          decrement: 1,
        },
      },
    });
    this.userGateway.changeMember({
      type: 'group',
      smthId: dto.groupId,
      userId: dto.userId,
      action: 'delete',
      name: group.name,
    });
    return deleteUser;
  }

  async createRole(dto: CreateRoleDto, userId?: number) {
    if (userId) {
      await this.checkPermission(
        userId,
        dto.groupId,
        permissionsVariant.changeRole,
      );
    }

    const group = await this.prisma.group.findUnique({
      where: {
        id: dto.groupId,
      },
    });
    if (!group) throw new BadRequestException('Группа не найдена!');
    const isExists = await this.getRoleIdByName(
      dto.name,
      dto.groupId,
      false,
      true,
    );
    if (isExists)
      throw new BadRequestException('Роль с таким именем уже существует!');
    const permissions = await this.prisma.permission.findMany({
      where: {
        action: {
          in: dto.permissionNames,
        },
      },
    });

    if (permissions.length !== dto.permissionNames.length) {
      throw new BadRequestException('Некоторые пермиссии недействительны!');
    }

    const newRole = await this.prisma.groupRole.create({
      data: {
        name: dto.name,
        isSystemRole: dto.isSystemRole ? dto.isSystemRole : false,
        groupId: dto.groupId,
        color: dto.color,
        permissions: {
          create: await Promise.all(
            dto.permissionNames.map(async (permissionName) => ({
              permission: {
                connect: {
                  id: await this.getPermissionIdByName(permissionName),
                },
              },
            })),
          ),
        },
      },
      include: {
        permissions: {
          include: {
            permission: {},
          },
        },
      },
    });
    this.userGateway.createRole('group', dto.groupId, {
      name: newRole.name,
      permissions: newRole.permissions,
      color: newRole.color,
      isSystemRole:newRole.isSystemRole
    });
    return newRole;
  }

  async removeRole(dto: RemoveRoleDto, userId?: number) {
    if (userId) {
      await this.checkPermission(
        userId,
        dto.groupId,
        permissionsVariant.changeRole,
      );
    }
    const group = await this.prisma.group.findUnique({
      where: {
        id: dto.groupId,
      },
    });
    if (!group) throw new BadRequestException('Группа не найдена!');

    const user = await this.prisma.groupMember.findFirst({
      where: {
        userId: dto.userId,
        groupId: dto.groupId,
      },
    });
    if (!user)
      throw new BadRequestException(
        'Несуществует либо пользователя либо группы либо пользователь не находится в указанной группе!',
      );

    const groupMemberId = user.id;
    const roleId = await this.getRoleIdByName('Участник', dto.groupId);
    return this.prisma.groupMember.update({
      where: {
        id: groupMemberId,
      },
      data: {
        groupRoleId: roleId as number,
      },
    });
  }

  async assignRole(dto: AssignRoleDto, userId?: number) {
    if (userId) {
      await this.checkPermission(
        userId,
        dto.groupId,
        permissionsVariant.changeRole,
      );
    }
    const group = await this.prisma.group.findUnique({
      where: {
        id: dto.groupId,
      },
    });
    if (!group) throw new BadRequestException('Группа не найдена!');

    const user = await this.prisma.groupMember.findFirst({
      where: {
        userId: dto.userId,
        groupId: dto.groupId,
      },
    });
    if (!user)
      throw new BadRequestException(
        'Несуществует либо пользователя либо группы либо пользователь не находится в указанной группе!',
      );

    const groupMemberId = user.id;
    const roleId = await this.getRoleIdByName(dto.roleName, dto.groupId);
    this.userGateway.assignRole('group', dto.groupId, {
      roleName: dto.roleName,
      userId: dto.userId,
    });
    return this.prisma.groupMember.update({
      where: {
        id: groupMemberId,
      },
      data: {
        groupRoleId: roleId as number,
      },
    });
  }

  async editRole(dto: EditRoleDto, userId?: number) {
    if (userId) {
      await this.checkPermission(
        userId,
        dto.groupId,
        permissionsVariant.changeRole,
      );
    }
    const group = await this.prisma.group.findUnique({
      where: {
        id: dto.groupId,
      },
    });
    if (!group)
      throw new BadRequestException('Группы для изменения роли не существует!');

    const role = (await this.getRoleIdByName(
      dto.roleName,
      dto.groupId,
      true,
    )) as { id: number; isSystem: boolean };
    if (role.isSystem)
      throw new BadRequestException(
        'Пользователь не может изменять системные роли!',
      );
    const permissions = await this.prisma.permission.findMany({
      where: {
        action: {
          in: dto.newPermissions,
        },
      },
    });

    if (permissions.length !== dto.newPermissions.length) {
      throw new BadRequestException('Некоторые пермиссии недействительны!');
    }

    return this.prisma.$transaction(async (prisma) => {
      await prisma.groupRolePermission.deleteMany({
        where: {
          groupRoleId: role.id,
        },
      });

      return prisma.groupRole.update({
        where: {
          id: role.id,
        },
        data: {
          name: dto.newRoleName,
          permissions: {
            create: permissions.map((permission) => ({
              permission: {
                connect: {
                  id: permission.id,
                },
              },
            })),
          },
          color: dto.color,
        },
      });
    });
  }

  async deleteRole(dto: DeleteRoleDto, userId?: number) {
    if (userId) {
      await this.checkPermission(
        userId,
        dto.groupId,
        permissionsVariant.changeRole,
      );
    }
    const group = await this.prisma.group.findUnique({
      where: {
        id: dto.groupId,
      },
    });
    if (!group)
      throw new BadRequestException('Группы для удаления роли не существует!');

    const role = (await this.getRoleIdByName(
      dto.roleName,
      dto.groupId,
      true,
    )) as { id: number; isSystem: boolean };
    if (!role) throw new BadRequestException('Роль не найдена!');

    if (role.isSystem)
      throw new BadRequestException(
        'Пользователь не может удалять системные роли!',
      );

    const userRoleId = role.id;

    const membersWithRole = await this.prisma.groupMember.findMany({
      where: { groupRoleId: role.id },
    });

    for (const member of membersWithRole) {
      await this.assignUserRole(member.userId, userRoleId, dto.groupId);
    }

    await this.prisma.groupRolePermission.deleteMany({
      where: { groupRoleId: role.id },
    });

    return this.prisma.groupRole.delete({
      where: { id: role.id },
    });
  }

  async createDiscussion() {}

  async assignUserRole(userId: number, roleId: number, groupId: number) {
    const userInGroup = await this.prisma.groupMember.findFirst({
      where: { userId: userId, groupId: groupId },
    });
    if (!userInGroup)
      throw new BadRequestException(
        `Пользователь с ID ${userId} не находится в группе с ID ${groupId}`,
      );

    return this.prisma.groupMember.update({
      where: { id: userInGroup.id },
      data: { groupRoleId: roleId },
    });
  }

  async getPermissionIdByName(permissionName: string): Promise<number> {
    const permission = await this.prisma.permission.findFirst({
      where: { action: permissionName },
    });
    if (!permission) {
      throw new BadRequestException(
        `Возможность с именем ${permissionName} не найдена!`,
      );
    }
    return permission.id;
  }

  async getRoleIdByName(
    roleName: string,
    groupId: number,
    checkSystem?: boolean,
    checkIsExists?: boolean,
  ) {
    const role = await this.prisma.groupRole.findFirst({
      where: { name: roleName, groupId: groupId },
    });
    if (!role) {
      if (checkIsExists) return null;
      throw new BadRequestException(
        `Роли с именем ${roleName} в группе ${groupId} не существует!`,
      );
    }
    if (checkSystem) {
      return {
        id: role.id,
        isSystem: role.isSystemRole,
      };
    }
    return role.id;
  }

  async listMembers(groupId: number, userId: number) {
    const group = await this.prisma.group.findUnique({
      where: {
        id: groupId,
      },
    });
    if (!group)
      throw new BadRequestException(
        'Группы для получения списка пользователей не существует!',
      );
    const isUSerInGroup = await this.prisma.groupMember.findFirst({
      where: {
        groupId: groupId,
        userId: userId,
      },
    });
    if (!isUSerInGroup)
      throw new BadRequestException(
        'Пользователь не может получить данные о пользователях группы в которой он не состоит!',
      );
    return this.prisma.groupMember.findMany({
      where: {
        groupId: groupId,
      },
    });
  }

  async listRoles(groupId: number, userId: number) {
    const group = await this.prisma.group.findUnique({
      where: {
        id: groupId,
      },
    });
    if (!group)
      throw new BadRequestException(
        'Группы для получения списка ролей не существует!',
      );
    const isUSerInGroup = await this.prisma.groupMember.findFirst({
      where: {
        groupId: groupId,
        userId: userId,
      },
    });
    if (!isUSerInGroup)
      throw new BadRequestException(
        'Пользователь не может получить данные о ролях группы в которой он не состоит!',
      );
    return this.prisma.groupRole.findMany({
      where: {
        groupId: groupId,
      },
    });
  }
  async listPermissions() {
    return this.prisma.permission.findMany();
  }
  async checkPermission(
    userId: number,
    groupId: number,
    permission: permissionsVariant,
  ) {
    const member = await this.prisma.groupMember.findFirst({
      where: {
        userId: userId,
        groupId: groupId,
      },
    });
    if (!userId)
      throw new BadRequestException(
        'Пользователя отправишего запрос на добавления пользователя не существует!',
      );
    const permissionUserRole = await this.prisma.groupRolePermission.findMany({
      where: {
        groupRoleId: member.groupRoleId,
      },
    });
    if (permissionUserRole) {
      const permissionIds = permissionUserRole.map(
        (per: any) => per.permissionId,
      );
      const permissionId = await this.getPermissionIdByName(permission);
      if (permissionIds.includes(permissionId)) {
        return true;
      } else {
        throw new BadRequestException(
          'У пользователя не хватает прав для выполнения данного действия!',
        );
      }
    }
  }
  async gg(dto) {
    return this.prisma.permission.create({
      data: dto,
    });
  }
}
