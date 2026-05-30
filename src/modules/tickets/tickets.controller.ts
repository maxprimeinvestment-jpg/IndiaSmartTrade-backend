import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt.guard';
import { PaginationDto } from '../../common/dto/pagination.dto';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { CreateTicketDto, TicketMessageDto } from './dto/create-ticket.dto';
import { TicketsService } from './tickets.service';

@ApiTags('tickets')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('tickets')
export class TicketsController {
  constructor(private readonly tickets: TicketsService) {}

  @Post()
  @ApiOperation({ summary: 'Open a new support ticket' })
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateTicketDto) {
    return this.tickets.create(user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List my tickets' })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() pg: PaginationDto,
    @Query('status') status?: string,
  ) {
    return this.tickets.list(user.id, pg.page, pg.limit, status);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a ticket and its messages' })
  getOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.tickets.getOne(user.id, id);
  }

  @Post(':id/messages')
  @ApiOperation({ summary: 'Reply to my ticket' })
  reply(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: TicketMessageDto,
  ) {
    return this.tickets.addMessage(user.id, id, dto.message);
  }
}
