import { SaveRecord, Summary, TaxInput, DerivedValues } from './types';

const STORAGE_KEY = 'tax-sim:saves:v1';

type SaveStore = {
  schemaVersion: 1;
  records: SaveRecord[];
};

const emptyStore: SaveStore = { schemaVersion: 1, records: [] };

const loadStore = (): SaveStore => {
  if (typeof localStorage === 'undefined') return emptyStore;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return emptyStore;
  try {
    const parsed = JSON.parse(raw) as SaveStore;
    if (!parsed.records) return emptyStore;
    return parsed;
  } catch {
    return emptyStore;
  }
};

const saveStore = (store: SaveStore) => {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
};

export const loadSaves = (): SaveRecord[] => loadStore().records.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

export const generateSaveName = (year: number): string => {
  const today = new Date();
  const ymd = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
  const prefix = `${year}年度_納税金額試算_${ymd}-`;
  const existing = loadStore().records.filter((r) => r.name.startsWith(prefix));
  const nums = existing
    .map((r) => r.name.slice(prefix.length))
    .map((s) => parseInt(s, 10))
    .filter((n) => !Number.isNaN(n));
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return `${prefix}${String(next).padStart(3, '0')}`;
};

export const saveItem = (name: string, year: number, input: TaxInput, summary: Summary, derived: DerivedValues): SaveRecord => {
  const store = loadStore();
  if (store.records.some((r) => r.name === name)) {
    throw new Error('SAVE_NAME_DUPLICATED');
  }
  const now = new Date().toISOString();
  const record: SaveRecord = {
    id: crypto.randomUUID(),
    schemaVersion: 1,
    year,
    name,
    input,
    summary,
    derived,
    previousYearTotalIncome: derived.totalIncomeGeneral,
    createdAt: now,
    updatedAt: now,
  };
  store.records.unshift(record);
  saveStore(store);
  return record;
};

export const renameItem = (id: string, name: string) => {
  const store = loadStore();
  if (store.records.some((r) => r.name === name && r.id !== id)) {
    throw new Error('SAVE_NAME_DUPLICATED');
  }
  store.records = store.records.map((r) => (r.id === id ? { ...r, name, updatedAt: new Date().toISOString() } : r));
  saveStore(store);
};

export const deleteItem = (id: string) => {
  const store = loadStore();
  store.records = store.records.filter((r) => r.id !== id);
  saveStore(store);
};

