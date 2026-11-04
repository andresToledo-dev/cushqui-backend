import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { UpdateAccountDto } from './update-account.dto';

describe('UpdateAccountDto', () => {
  // Same options as the global pipe in app.setup.ts
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  });
  const validate = (body: Record<string, unknown>): Promise<UpdateAccountDto> =>
    pipe.transform(body, { type: 'body', metatype: UpdateAccountDto });

  it('should not inherit defaults: a PATCH of one field leaves the others undefined', async () => {
    const dto = await validate({ balanceVisible: false });

    expect(dto.balanceVisible).toBe(false);
    expect(dto.currency).toBeUndefined();
    expect(dto.visibleInList).toBeUndefined();
  });

  it.each([
    ['visibleInList', 'false'],
    ['balanceVisible', 'no'],
    ['visibleInList', 1],
    ['isActive', 'false'],
  ])('should reject %s = %j: only real booleans are valid', async (field, value) => {
    await expect(validate({ [field]: value })).rejects.toThrow(BadRequestException);
  });
});
