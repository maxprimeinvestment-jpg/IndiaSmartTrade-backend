import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt.guard';
import { PaginationDto } from '../../common/dto/pagination.dto';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { NotificationService } from './notification.service';

@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationController {
  constructor(private readonly notifications: NotificationService) {}

  @Get()
  @ApiOperation({ summary: 'List notifications' })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() pg: PaginationDto,
    @Query('unreadOnly') unreadOnly?: string,
  ) {
    return this.notifications.list(user.id, pg.page, pg.limit, unreadOnly === 'true');
  }

  @Post(':id/read')
  @ApiOperation({ summary: 'Mark a notification as read' })
  read(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.notifications.markRead(user.id, id);
  }

  @Post('read-all')
  @ApiOperation({ summary: 'Mark all notifications as read' })
  readAll(@CurrentUser() user: AuthenticatedUser) {
    return this.notifications.markAllRead(user.id);
  }
}
