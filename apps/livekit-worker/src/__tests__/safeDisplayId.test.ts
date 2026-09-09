import { describe, it, expect } from 'vitest';
import { getUserSafeDisplayId } from '@nextlite/shared';

describe('getUserSafeDisplayId Utility', () => {
  it('extracts valid appointmentNumber (e.g. A-001)', () => {
    expect(getUserSafeDisplayId({ appointmentNumber: 'A-001' })).toBe('A-001');
    expect(getUserSafeDisplayId({ appointmentNumber: 'A-1024' })).toBe('A-1024');
  });

  it('extracts valid referenceNumber, orderNumber, bookingNumber, confirmationNumber, displayNumber', () => {
    expect(getUserSafeDisplayId({ referenceNumber: 'REF-98765' })).toBe('REF-98765');
    expect(getUserSafeDisplayId({ orderNumber: 'ORD-12345' })).toBe('ORD-12345');
    expect(getUserSafeDisplayId({ bookingNumber: 'BK-5521' })).toBe('BK-5521');
    expect(getUserSafeDisplayId({ confirmationNumber: 'CNF-8899' })).toBe('CNF-8899');
    expect(getUserSafeDisplayId({ displayNumber: 'DISP-001' })).toBe('DISP-001');
  });

  it('strictly rejects UUID-shaped values and does not expose them as display IDs', () => {
    // Direct UUID in id or display field
    expect(getUserSafeDisplayId({ id: '123e4567-e89b-12d3-a456-426614174000' })).toBeUndefined();
    expect(
      getUserSafeDisplayId({
        appointmentId: 'c7329124-7ef8-4903-b1d5-784f18375992',
        referenceNumber: 'c7329124-7ef8-4903-b1d5-784f18375992',
      }),
    ).toBeUndefined();
    expect(
      getUserSafeDisplayId({
        orderNumber: '00000000-0000-0000-0000-000000000000',
      }),
    ).toBeUndefined();
  });

  it('returns undefined for missing, empty, or non-string values', () => {
    expect(getUserSafeDisplayId({})).toBeUndefined();
    expect(getUserSafeDisplayId({ appointmentNumber: '' })).toBeUndefined();
    expect(getUserSafeDisplayId({ appointmentNumber: '   ' })).toBeUndefined();
    expect(getUserSafeDisplayId({ appointmentNumber: null })).toBeUndefined();
    expect(getUserSafeDisplayId({ appointmentNumber: undefined })).toBeUndefined();
    expect(getUserSafeDisplayId({ appointmentNumber: 12345 })).toBeUndefined();
  });

  it('prefers safe display candidate when both UUID and display number are present', () => {
    const mixed = {
      id: 'c7329124-7ef8-4903-b1d5-784f18375992',
      appointmentNumber: 'A-007',
    };
    expect(getUserSafeDisplayId(mixed)).toBe('A-007');
  });
});
