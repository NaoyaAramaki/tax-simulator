import { describe, expect, it } from 'vitest';
import { validateInput } from '../src/domain/validation';
import { createEmptyInput } from '../src/domain/sample';

describe('validation.validateInput', () => {
  it('前年所得の入力方法が未選択（none）はエラー', () => {
    const input = createEmptyInput(2024);
    const v = validateInput(input);
    expect(v.errors.some((e) => e.field === 'save.previousYearInputMode')).toBe(true);
  });

  it('前年所得の入力方法がfromSaveで、保存選択がない場合はエラー', () => {
    const input = {
      ...createEmptyInput(2024),
      save: { ...createEmptyInput(2024).save, previousYearInputMode: 'fromSave' as const, selectedSaveId: null },
    };
    const v = validateInput(input);
    expect(v.errors.some((e) => e.field === 'save.selectedSaveId')).toBe(true);
  });

  it('複合ブロック合計月数が12以外はエラー', () => {
    const input = {
      ...createEmptyInput(2024),
      save: { ...createEmptyInput(2024).save, previousYearInputMode: 'useCurrent' as const },
      insurance: {
        ...createEmptyInput(2024).insurance,
        mode: 'mixed' as const,
        mixed: {
          blocks: [
            {
              id: 'b1',
              type: 'employee' as const,
              months: 11,
              breakdown: [{ id: 's1', mode: 'manual' as const, months: 11, amount: 0 }],
            },
          ],
        },
      },
    };
    const v = validateInput(input as any);
    expect(v.errors.some((e) => e.field === 'insurance.mixed.blocks')).toBe(true);
  });
});


