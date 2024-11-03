import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { FileService } from './file.service';

// Функция для генерации уникальных имен файлов
const editFileName = (req, file, callback) => {
  const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
  const ext = extname(file.originalname);
  callback(null, `${uniqueSuffix}${ext}`);
};

// Фильтр для изображений
const imageFileFilter = (req, file, callback) => {
  if (!file.mimetype.match(/\/(jpg|jpeg|png|ifg|webp)$/)) {
    return callback(
      new BadRequestException('Only image files are allowed!'),
      false,
    );
  }
  callback(null, true);
};

// Фильтр для видео
const videoFileFilter = (req, file, callback) => {
  if (!file.mimetype.match(/\/(mp4|avi|mkv|mov)$/)) {
    return callback(
      new BadRequestException('Only video files are allowed!'),
      false,
    );
  }
  callback(null, true);
};

@Controller('file')
export class FileController {
  constructor(private readonly fileService: FileService) {}

  // Загрузка одного изображения
  @Post('upload-image')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './uploads/media/images',
        filename: editFileName,
      }),
      limits: {
        fileSize: 1024 * 1024 * 5, // Лимит на размер файла 5MB
      },
      fileFilter: imageFileFilter,
    }),
  )
  uploadImage(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Image file is not uploaded.');
    }
    return this.fileService.handleUploadedFile(file);
  }

  // Загрузка одного видео
  @Post('upload-video')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './uploads/media/videos',
        filename: editFileName,
      }),
      limits: {
        fileSize: 1024 * 1024 * 50, // Лимит на размер файла 50MB
      },
      fileFilter: videoFileFilter,
    }),
  )
  uploadVideo(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Video file is not uploaded.');
    }
    return this.fileService.handleUploadedFile(file);
  }

  // Загрузка аватара
  @Post('upload-avatar')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './uploads/avatars',
        filename: (req, file, callback) => {
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
          const ext = extname(file.originalname);
          callback(null, `${uniqueSuffix}${ext}`);
        },
      }),
      limits: {
        fileSize: 1024 * 1024 * 2, // Лимит на размер файла 2MB
      },
      fileFilter: (req, file, callback) => {
        if (!file.mimetype.match(/\/(jpg|jpeg|png|webp)$/)) {
          return callback(
            new BadRequestException('Only image files are allowed for avatars!'),
            false,
          );
        }
        callback(null, true);
      },
    }),
  )
  uploadAvatar(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Avatar file is not uploaded.');
    }
    return this.fileService.handleUploadedFile(file);
  }
}
