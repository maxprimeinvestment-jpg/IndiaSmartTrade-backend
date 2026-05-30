import { Module } from '@nestjs/common';
import { NotificationModule } from '../notification/notification.module';
import { WithdrawController } from './withdraw.controller';
import { WithdrawService } from './withdraw.service';

@Module({
  imports: [NotificationModule],
  controllers: [WithdrawController],
  providers: [WithdrawService],
  exports: [WithdrawService],
})
export class WithdrawModule {}
