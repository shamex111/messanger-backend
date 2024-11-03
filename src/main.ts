import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { MyIoAdapter } from './my-io.adapter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.enableCors({
    origin: process.env.APP_URL, // Ваш фронтенд URL
    methods: 'GET,POST,DELETE,PATCH',
    credentials: true, // Разрешить отправку cookies
    allowedHeaders: 'Content-Type,Authorization',
  });

  app.useWebSocketAdapter(new MyIoAdapter(app)); // Используйте кастомный адаптер

  await app.listen(4200);
}
bootstrap();
