import { Body, Controller, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt.guard';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { OpenPositionDto } from './dto/open-position.dto';
import { UpdateSlTpDto } from './dto/update-sltp.dto';
import { TradingService } from './trading.service';

@ApiTags('trade')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('trade')
export class TradingController {
  constructor(private readonly trading: TradingService) {}

  @Post('open')
  @ApiOperation({ summary: 'Open a new position' })
  open(@CurrentUser() user: AuthenticatedUser, @Body() dto: OpenPositionDto) {
    return this.trading.openPosition(user.id, dto);
  }

  @Post(':id/close')
  @ApiOperation({ summary: 'Close an open position at the current market price' })
  close(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.trading.closePosition(user.id, id);
  }

  @Patch(':id/sl-tp')
  @ApiOperation({ summary: 'Update stop-loss / take-profit' })
  sltp(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateSlTpDto,
  ) {
    return this.trading.updateSlTp(user.id, id, dto);
  }
}
