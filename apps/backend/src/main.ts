import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { MikroORM } from '@mikro-orm/core';
import { cleanupOpenApiDoc } from 'nestjs-zod';
import { NotificationsService } from './features/notifications/notifications.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const orm = app.get(MikroORM);
  await orm.migrator.up();

  app.setGlobalPrefix('/api/v1');
  app.use(cookieParser());
  await app.init();

  const notificationsService = app.get(NotificationsService);
  await notificationsService.ensureVapidKeys();
  if (!(await notificationsService.resolveVapidSubject())) {
    console.warn(
      'VAPID_EMAIL is not configured (env or admin settings); web push notifications are disabled',
    );
  }

  const config = new DocumentBuilder()
    .setTitle('Konvoez API')
    .setDescription('Self-hosted voice and text chat app')
    .setVersion('1.0')
    .build();
  const documentFactory = () =>
    cleanupOpenApiDoc(SwaggerModule.createDocument(app, config));
  SwaggerModule.setup('docs', app, documentFactory);

  app.enableShutdownHooks();
  const server = app.getHttpServer();
  server.requestTimeout = 15 * 60 * 1000;
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
