import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';

@ApiTags('public')
@Controller('public')
export class PublicController {
  @Get('health')
  @ApiOkResponse({
    description: 'Health check',
    schema: { example: { status: 'ok' } },
  })
  health(): { status: string } {
    return { status: 'ok' };
  }
}
