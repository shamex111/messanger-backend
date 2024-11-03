import { IoAdapter } from '@nestjs/platform-socket.io';

export class MyIoAdapter extends IoAdapter {
  createIOServer(port: number, options?: any): any {
    options = {
      ...options,
      cors: {
        origin: 'http://localhost:3000', // Ваш фронтенд URL
        methods: ['GET', 'POST'],
        allowedHeaders: ['Content-Type', 'Authorization'],
        credentials: true,
      },
    };
    return super.createIOServer(port, options);
  }
}
