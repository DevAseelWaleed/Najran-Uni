import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Req,
  Res,
  Body,
  Query,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { db } from './db';
import { Permit } from './security';
import { storage, detectMime } from './storage';
import { audit } from './audit';
const categories = [
  'السيرة الذاتية',
  'شهادة علمية',
  'قرار تعيين',
  'قرار ترقية',
  'أخرى',
  'صورة شخصية',
];
@Controller('documents')
export class DocumentsController {
  @Post(':facultyId')
  @Permit('document.write')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024, files: 1 } }))
  async upload(
    @Param('facultyId') facultyId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: any,
    @Req() req: any,
  ) {
    if (!file) throw new BadRequestException('اختر ملفًا');
    await db.facultyMember.findFirstOrThrow({ where: { id: facultyId, deletedAt: null } });
    const mime = detectMime(file.buffer);
    if (!categories.includes(body.category)) throw new BadRequestException('نوع المستند غير صحيح');
    if (body.category === 'صورة شخصية' && mime === 'application/pdf')
      throw new BadRequestException('الصورة يجب أن تكون PNG أو JPEG');
    const key = await storage.put(file.buffer);
    const d = await db.facultyDocument.create({
      data: {
        facultyId,
        storageKey: key,
        mime,
        size: file.size,
        originalName: file.originalname.replace(/[\x00-\x1f/\\]/g, '_').slice(0, 200),
        category: body.category,
        uploaderId: req.user.id,
      },
      select: {
        id: true,
        originalName: true,
        category: true,
        mime: true,
        createdAt: true,
        size: true,
      },
    });
    await audit(req.user.id, 'DOCUMENT_UPLOAD', d.id);
    return d;
  }
  @Get(':id') @Permit('faculty.read') async download(
    @Param('id') id: string,
    @Req() req: any,
    @Query('view') view: string,
    @Res() res: Response,
  ) {
    const d = await db.facultyDocument.findFirstOrThrow({
      where: {
        id,
        deletedAt: null,
        ...(req.user.roleId !== 'SUPER_ADMIN' ? { faculty: { deletedAt: null } } : {}),
      },
    });
    const buffer = await storage.get(d.storageKey);
    res.setHeader('Content-Type', d.mime);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader(
      'Content-Disposition',
      `${view === 'true' || d.category === 'صورة شخصية' ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(d.originalName)}`,
    );
    res.send(buffer);
  }
  @Delete(':id') @Permit('document.write') async remove(@Param('id') id: string, @Req() req: any) {
    const d = await db.facultyDocument.findFirstOrThrow({
      where: { id, deletedAt: null, faculty: { deletedAt: null } },
    });
    await db.facultyDocument.update({ where: { id: d.id }, data: { deletedAt: new Date() } });
    await audit(req.user.id, 'DOCUMENT_DELETE', id);
    return { message: 'تمت إزالة المرفق مع الاحتفاظ بالملف وفق سياسة الاحتفاظ' };
  }
}
