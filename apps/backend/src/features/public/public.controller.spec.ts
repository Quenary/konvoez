import { Test, TestingModule } from '@nestjs/testing';
import { PublicController } from './public.controller';

describe('PublicController', () => {
  let controller: PublicController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PublicController],
    }).compile();

    controller = module.get<PublicController>(PublicController);
  });

  it('should return status ok on health check', () => {
    expect(controller.health()).toEqual({ status: 'ok' });
  });
});
