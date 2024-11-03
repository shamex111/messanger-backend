import { Injectable } from '@nestjs/common';
import { normalizePath } from 'src/utils/mormalPath';

@Injectable()
export class FileService {
  handleUploadedFile(file: Express.Multer.File) {
    let fileType = '';

    if (file.mimetype.startsWith('image/')) {
      fileType = 'image'; 
    } else if (file.mimetype.startsWith('video/')) {
      fileType = 'video';
    } else {
      fileType = 'other'; 
    }

    return {
      originalName: file.originalname,
      filename: file.filename,
      path: normalizePath(file.path),
      size: file.size,
      type: fileType,
    };
  }
}
