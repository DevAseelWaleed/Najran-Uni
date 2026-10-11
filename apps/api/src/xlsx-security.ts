import { BadRequestException } from '@nestjs/common';
export function validateZip(buffer: Buffer) {
  let end = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i--)
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      end = i;
      break;
    }
  if (end < 0) throw new BadRequestException('ملف XLSX غير صالح');
  const count = buffer.readUInt16LE(end + 10);
  let offset = buffer.readUInt32LE(end + 16);
  let total = 0;
  if (count > 500 || count === 0) throw new BadRequestException('المصنف يتجاوز حد مكونات الملف');
  for (let i = 0; i < count; i++) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== 0x02014b50)
      throw new BadRequestException('هيكل المصنف غير صالح');
    if (buffer.readUInt16LE(offset + 8) & 1)
      throw new BadRequestException('المصنف المشفر غير مدعوم');
    total += buffer.readUInt32LE(offset + 24);
    if (total > 50 * 1024 * 1024)
      throw new BadRequestException('حجم المصنف بعد فك الضغط يتجاوز 50MB');
    offset +=
      46 +
      buffer.readUInt16LE(offset + 28) +
      buffer.readUInt16LE(offset + 30) +
      buffer.readUInt16LE(offset + 32);
  }
}
