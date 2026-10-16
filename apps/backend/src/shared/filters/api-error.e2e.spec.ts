import {
  Body,
  Controller,
  Get,
  INestApplication,
  Logger,
  Param,
  Post,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';
import { ZodValidationPipe } from 'nestjs-zod';
import { ApiErrorCode } from '@konvoez/shared';
import { HttpExceptionFilter } from './http-exception.filter';
import { AppException } from '../errors/app.exception';
import { AuthLoginDto } from '../../features/auth/auth.dto';

@Controller('test-errors')
class TestErrorController {
  @Post('login')
  login(@Body() _body: AuthLoginDto) {
    throw AppException.unauthorized(
      ApiErrorCode.AUTH_INVALID_CREDENTIALS,
      'Invalid username or password',
    );
  }

  @Get('rooms/:id')
  getRoom(@Param('id') id: string) {
    throw AppException.notFound(
      ApiErrorCode.ROOM_NOT_FOUND,
      `Room ${id} not found`,
    );
  }

  @Get('crash')
  crash() {
    throw new Error('Secret database error: sensitive stack details');
  }
}

describe('ApiError (e2e)', () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [TestErrorController],
      providers: [
        {
          provide: APP_PIPE,
          useClass: ZodValidationPipe,
        },
        {
          provide: APP_FILTER,
          useClass: HttpExceptionFilter,
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.listen(0);
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    await app.close();
  });

  it('transforms invalid login body to 400 VALIDATION_FAILED with fields', async () => {
    const res = await fetch(`${baseUrl}/test-errors/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: '' }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toMatchObject({
      code: ApiErrorCode.VALIDATION_FAILED,
      message: 'Validation failed',
    });
    expect(Array.isArray(body.fields)).toBe(true);
    expect(body.fields.length).toBeGreaterThan(0);
    expect(body.fields[0]).toHaveProperty('path');
    expect(body.fields[0]).toHaveProperty('code');
  });

  it('transforms wrong credentials to 401 AUTH_INVALID_CREDENTIALS', async () => {
    const res = await fetch(`${baseUrl}/test-errors/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        login: 'validuser',
        password: 'ValidPassword123',
      }),
    });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({
      code: ApiErrorCode.AUTH_INVALID_CREDENTIALS,
      message: 'Invalid username or password',
    });
  });

  it('transforms unknown room to 404 ROOM_NOT_FOUND', async () => {
    const res = await fetch(`${baseUrl}/test-errors/rooms/999`);

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({
      code: ApiErrorCode.ROOM_NOT_FOUND,
      message: 'Room 999 not found',
    });
  });

  it('transforms plain unhandled Error to 500 INTERNAL without leaking details', async () => {
    const res = await fetch(`${baseUrl}/test-errors/crash`);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({
      code: ApiErrorCode.INTERNAL,
      message: 'Internal server error',
    });
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain('Secret database error');
    expect(serialized).not.toContain('sensitive stack details');
    expect(body.stack).toBeUndefined();
  });
});
