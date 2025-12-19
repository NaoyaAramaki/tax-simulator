import React, { useEffect, useState } from 'react';
import { calculateAll } from './domain/engine';
import { createDemoInput, createEmptyInput } from './domain/sample';
import { getRule, supportedYears } from './domain/rules';
import { CalcLine, MixedBlock, SaveRecord, TaxInput, ValidationResult } from './domain/types';
import { deleteItem, generateSaveName, loadSaves, renameItem, saveItem } from './domain/storage';
import { validateInput } from './domain/validation';
import { formatYen } from './utils/format';
import { logger } from './utils/logger';
import './styles/App.css';

const Section: React.FC<{ title: string; children: React.ReactNode; infoButton?: React.ReactNode }> = ({ title, children, infoButton }) => (
  <section className="section">
    <h3 className="section-title">
      {title}
      {infoButton && <span className="section-title-info">{infoButton}</span>}
    </h3>
    {children}
  </section>
);

const Field: React.FC<{ label: string; children: React.ReactNode; required?: boolean; fieldId?: string; style?: React.CSSProperties; className?: string }> = ({ label, children, required, fieldId, style, className }) => (
  <div className={`field ${className || ''}`} data-field={fieldId} style={style}>
    <label className="field-label">
      {required && <span className="required-mark">*</span>}
      {label}
      {required && <span className="required-text">必須</span>}
    </label>
    {children}
  </div>
);

const InputNumber: React.FC<{ value: number; onChange: (v: number) => void; min?: number; max?: number; disabled?: boolean; placeholder?: string; required?: boolean }> = ({ value, onChange, min, max, disabled, placeholder, required }) => (
  <input 
    type="number" 
    className="input-number" 
    value={value === 0 ? 0 : value || ''} 
    min={min} 
    max={max}
    onChange={(e) => {
      const val = e.target.value;
      if (val === '' || val === '-') {
        onChange(0);
      } else {
        const num = Number(val);
        onChange(isNaN(num) ? 0 : num);
      }
    }} 
    disabled={disabled}
    placeholder={placeholder}
    required={required}
  />
);

const CalcLineCard: React.FC<{ line: CalcLine }> = ({ line }) => (
  <div className="calc-line-card">
    <div className="calc-line-header">
      <div>
        <div className="calc-line-title">{line.title}</div>
        <div className="calc-line-expression">{line.expression}</div>
      </div>
      {line.display === 'info' ? (
        <span className="calc-line-info">INFO</span>
      ) : (
        <div className="calc-line-result">{line.result !== undefined ? formatYen(line.result) : ''}</div>
      )}
    </div>
    {line.terms.length > 0 && (
      <div className="calc-line-terms">
        {line.terms.map((t) => (
          <div key={`${line.id}-${t.name}`}>・{t.name}: {t.displayValue ?? (typeof t.value === 'number' ? formatYen(t.value) : t.value)}</div>
        ))}
      </div>
    )}
    {line.notes && line.notes.length > 0 && (
      <div className="calc-line-notes">
        {line.notes.map((n) => (
          <div key={n}>※ {n}</div>
        ))}
      </div>
    )}
  </div>
);

const InfoButton: React.FC<{ onClick: () => void }> = ({ onClick }) => (
  <button className="info-button" onClick={onClick} type="button" aria-label="情報を表示">
    i
  </button>
);

const InfoModal: React.FC<{ isOpen: boolean; onClose: () => void; title: string; children: React.ReactNode }> = ({ isOpen, onClose, title, children }) => {
  if (!isOpen) return null;
  
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">{title}</h3>
          <button className="modal-close" onClick={onClose} aria-label="閉じる">×</button>
        </div>
        <div className="modal-body">
          {children}
        </div>
      </div>
    </div>
  );
};

const App: React.FC = () => {
  const [input, setInput] = useState<TaxInput>(createDemoInput(2024));
  const [saves, setSaves] = useState<SaveRecord[]>([]);
  const [validation, setValidation] = useState<ValidationResult>({ errors: [], warnings: [] });
  const [infoModal, setInfoModal] = useState<{ isOpen: boolean; title: string; content: React.ReactNode }>({ isOpen: false, title: '', content: null });
  const [output, setOutput] = useState<ReturnType<typeof calculateAll> | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [openSection, setOpenSection] = useState<Record<string, boolean>>({
    year: true,
    income: true,
    deductions: true,
    insurance: true,
    overrides: true,
    comparison: false,
    result: true,
  });
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [helpPage, setHelpPage] = useState(1);
  const [showMobileMenu, setShowMobileMenu] = useState(false);

  useEffect(() => {
    setSaves(loadSaves());
  }, []);

  useEffect(() => {
    setValidation(validateInput(input));
  }, [input]);

  useEffect(() => {
    // 初期計算
    handleCalculate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateInput = (patch: (prev: TaxInput) => TaxInput) => setInput((prev) => patch(prev));

  const addSalarySource = () => {
    const id = crypto.randomUUID();
    updateInput((prev) => ({
      ...prev,
      salary: { ...prev.salary, sources: [...prev.salary.sources, { id, name: `支払先${prev.salary.sources.length + 1}`, annual: 0 }] },
    }));
  };

  const addComparison = () => {
    const id = crypto.randomUUID();
    updateInput((prev) => ({ ...prev, comparisonSites: [...prev.comparisonSites, { id, name: `サイト${prev.comparisonSites.length + 1}`, amount: 0 }] }));
  };

  const addMixedBlock = (type: MixedBlock['type']) => {
    const id = crypto.randomUUID();
    if (type === 'employee') {
      const block: MixedBlock = {
        id,
        type: 'employee',
        months: 1,
        breakdown: [{ id: crypto.randomUUID(), mode: 'estimate', months: 1, baseSalarySourceId: input.salary.mainSourceId ?? undefined }],
      };
      updateInput((prev) => ({ ...prev, insurance: { ...prev.insurance, mixed: { blocks: [...(prev.insurance.mixed?.blocks ?? []), block] } } }));
    } else {
      const block: MixedBlock = {
        id,
        type: 'national',
        months: 1,
        nhiBreakdown: [{ id: crypto.randomUUID(), mode: 'estimate', months: 1 }],
        npPayMonths: 1,
        npExemptMonths: 0,
        npMonthlyOverride: null,
      };
      updateInput((prev) => ({ ...prev, insurance: { ...prev.insurance, mixed: { blocks: [...(prev.insurance.mixed?.blocks ?? []), block] } } }));
    }
  };

  const handleSave = () => {
    if (!output) {
      logger.warn('保存失敗: 計算結果がありません');
      return;
    }
    try {
      const name = generateSaveName(input.year);
      const saved = saveItem(name, input.year, input, output.summary, output.derived);
      setSaves(loadSaves());
      setInput((prev) => ({ ...prev, save: { ...prev.save, selectedSaveId: saved.id } }));
      logger.log('保存成功', { saveId: saved.id, name: saved.name });
      
      // 年度・保存アコーディオンを開く
      setOpenSection((prev) => ({ ...prev, year: true }));
      
      // 保存/読み込みまでスクロール（ヘッダー分余分にスクロール）
      setTimeout(() => {
        const yearDetails = document.querySelector('details[data-section="year"]') as HTMLDetailsElement;
        if (yearDetails) {
          yearDetails.open = true;
          const headerHeight = document.querySelector('.app-header')?.getBoundingClientRect().height ?? 0;
          const elementTop = yearDetails.getBoundingClientRect().top + window.pageYOffset;
          window.scrollTo({ top: elementTop - headerHeight - 20, behavior: 'smooth' });
        }
      }, 100);
    } catch (e: any) {
      const errorMessage = e?.message === 'SAVE_NAME_DUPLICATED' ? '保存名が既に存在します。別名を指定してください。' : '保存に失敗しました';
      alert(errorMessage);
      logger.error('保存エラー', { message: errorMessage }, e);
    }
  };

  const handleRename = (id: string) => {
    const name = prompt('保存名を入力してください');
    if (!name) return;
    try {
      renameItem(id, name);
      setSaves(loadSaves());
      logger.log('名前変更成功', { id, name });
    } catch (e: any) {
      const errorMessage = e?.message === 'SAVE_NAME_DUPLICATED' ? '保存名が既に存在します。別名を指定してください。' : '名前変更に失敗しました';
      alert(errorMessage);
      logger.error('名前変更エラー', { message: errorMessage, id }, e);
    }
  };

  const handleDelete = (id: string) => {
    try {
      deleteItem(id);
      setSaves(loadSaves());
      if (input.save.selectedSaveId === id) {
        setInput((prev) => ({ ...prev, save: { ...prev.save, selectedSaveId: null, previousYearTotalIncome: null } }));
      }
      logger.log('削除成功', { id });
    } catch (e: any) {
      logger.error('削除エラー', { id }, e);
    }
  };

  const applySave = (id: string) => {
    const found = saves.find((s) => s.id === id);
    if (!found) return;
    setInput(found.input);
  };

  const applyDemo = () => setInput(createDemoInput(input.year));
  
  const clearAllInputs = () => {
    setInput(createEmptyInput(input.year));
    logger.log('すべての入力値をクリア');
  };

  const toggleSection = (key: string) => {
    setOpenSection((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleDetailsToggle = (key: string, e: React.SyntheticEvent<HTMLDetailsElement>) => {
    const details = e.currentTarget;
    setOpenSection((prev) => ({ ...prev, [key]: details.open }));
  };

  const handleExpandAll = () => {
    setOpenSection({
      year: true,
      income: true,
      deductions: true,
      insurance: true,
      overrides: true,
      comparison: true,
      result: true,
    });
    logger.log('すべてのアコーディオンを開く');
  };

  const handleCollapseAll = () => {
    setOpenSection({
      year: false,
      income: false,
      deductions: false,
      insurance: false,
      overrides: false,
      comparison: false,
      result: false,
    });
    logger.log('すべてのアコーディオンを閉じる');
  };

  const handleCalculate = () => {
    logger.log('計算開始', { year: input.year });
    const v = validateInput(input);
    setValidation(v);
    if (v.errors.length > 0) {
      setOutput(null);
      setErrorMsg('入力エラーがあります。修正してください。');
      logger.error('計算エラー: バリデーション失敗', { errors: v.errors });
      
      // 最初のエラーフィールドにフォーカスとスクロール
      setTimeout(() => {
        const firstError = v.errors[0];
        if (firstError) {
          const fieldId = firstError.field.replace(/\./g, '-').replace(/\[|\]/g, '-');
          const element = document.querySelector(`[data-field="${fieldId}"]`) as HTMLElement;
          if (element) {
            const headerOffset = document.querySelector('.app-header')?.clientHeight ?? 0;
            const elementPosition = element.getBoundingClientRect().top + window.pageYOffset;
            const offsetPosition = elementPosition - headerOffset - 10; // 10px additional padding
            window.scrollTo({
              top: offsetPosition,
              behavior: 'smooth'
            });
            const input = element.querySelector('input, select, textarea') as HTMLElement;
            if (input) {
              input.focus();
            }
          }
        }
      }, 100);
      return;
    }
    try {
      const out = calculateAll(input);
      setOutput(out);
      setErrorMsg(null);
      logger.log('計算完了', { 
        incomeTax: out.summary.incomeTaxGeneral,
        residentTax: out.summary.residentTaxTotal
      });
      
      // 結果アコーディオンを開いてスクロール（ヘッダー分余分にスクロール）
      setOpenSection((prev) => ({ ...prev, result: true }));
      setTimeout(() => {
        const resultDetails = document.querySelector('details[data-section="result"]') as HTMLDetailsElement;
        if (resultDetails) {
          resultDetails.open = true;
          const headerHeight = document.querySelector('.app-header')?.getBoundingClientRect().height ?? 0;
          const elementTop = resultDetails.getBoundingClientRect().top + window.pageYOffset;
          window.scrollTo({ top: elementTop - headerHeight - 20, behavior: 'smooth' });
        }
      }, 100);
    } catch (e: any) {
      setOutput(null);
      const errorMessage = e?.message ?? '計算に失敗しました';
      setErrorMsg(errorMessage);
      logger.error('計算エラー', { message: errorMessage, input }, e);
    }
  };

  const renderValidation = () => (
    <div>
      {validation.errors.length === 0 ? (
        <div className="success-message">入力エラーはありません</div>
      ) : (
        <div className="validation-errors">
          {validation.errors.map((e) => (
            <div key={e.field}>・{e.message}</div>
          ))}
        </div>
      )}
      {validation.warnings.length > 0 && (
        <div className="validation-warnings">
          {validation.warnings.map((w) => (
            <div key={w.field}>▲ {w.message}</div>
          ))}
        </div>
      )}
    </div>
  );

  const YearPanel = (
    <div>
      <Section title="年度選択">
        <Field label="年度" required fieldId="year">
          <select 
            value={input.year} 
            onChange={(e) => setInput(createDemoInput(Number(e.target.value)))} 
            className="select"
            data-field="year"
          >
            {supportedYears.map((y) => (
              <option key={y} value={y}>
                {y}年度
              </option>
            ))}
          </select>
        </Field>
        <div className="municipality-info">
          基準自治体: {getRule(input.year).resident_tax.municipality} / 税率 {getRule(input.year).resident_tax.income_rate * 100}%
        </div>
      </Section>
      <Section
        title="保存/読み込み"
        infoButton={
          <InfoButton onClick={() => {
            const demo = createDemoInput(input.year);
            setInfoModal({
              isOpen: true,
              title: 'デモ値を反映',
              content: (
                <div>
                  <p>シミュレーター検証用のデータを反映します。実際に入力される情報は以下の通りです：</p>
                  <ul>
                    <li>納税者年齢: {demo.family.taxpayerAge}歳</li>
                    <li>配偶者人数: {demo.family.spouseCount}人</li>
                    <li>扶養人数: {demo.family.dependentCount}人</li>
                    <li>給与収入: 支払先A {formatYen(demo.salary.sources[0]?.annual || 0)}、支払先B {formatYen(demo.salary.sources[1]?.annual || 0)}</li>
                    <li>事業: 売上 {formatYen(demo.business.sales)}、経費 {formatYen(demo.business.expenses)}（青色申告: 電子帳簿方式）</li>
                    <li>株式: 配当 {formatYen(demo.stocks.dividend.amount)}（{demo.stocks.dividend.taxMode === 'general' ? '総合課税' : '申告分離課税'}）、売買益 {formatYen(demo.stocks.capitalGain.amount)}（{demo.stocks.capitalGain.taxMode === 'general' ? '総合課税' : '申告分離課税'}）</li>
                    <li>iDeCo: {formatYen(demo.deductions.ideco)}</li>
                    <li>小規模企業共済: {formatYen(demo.deductions.smallBizMutualAid)}</li>
                    <li>経営セーフティ共済: {formatYen(demo.deductions.safetyMutualAid)}</li>
                    <li>生命保険料: 一般 {formatYen(demo.deductions.lifeInsurance.general)}、介護医療 {formatYen(demo.deductions.lifeInsurance.nursingMedical)}、個人年金 {formatYen(demo.deductions.lifeInsurance.pension)}</li>
                    <li>地震保険料: {formatYen(demo.deductions.earthquake)}</li>
                    <li>医療費控除: 治療費等 {formatYen(demo.deductions.medical.treatment)}、通院交通費 {formatYen(demo.deductions.medical.transport)}</li>
                    <li>保険モード: 複合（社保6ヶ月、国保+国年6ヶ月）</li>
                    <li>国保世帯: 加入者数 {demo.insurance.nhiHousehold.membersIncludingTaxpayer}人、40-64歳 {demo.insurance.nhiHousehold.members4064}人</li>
                  </ul>
                </div>
              ),
            });
          }} />
        }
        >
        <div className="button-group-inline">
          <button onClick={handleSave} className="btn-primary">自動命名で保存</button>
          <div className="button-with-info">
            <button onClick={applyDemo} className="btn-secondary">デモ値を反映</button>
          </div>
          <button onClick={clearAllInputs} className="btn-secondary">入力値の一括削除</button>
        </div>
        {saves.length === 0 && <div>保存はまだありません。</div>}
        {saves.map((s) => (
          <div key={s.id} className={`save-item ${input.save.selectedSaveId === s.id ? 'selected' : ''}`}>
            <div className="save-item-name">{s.name}</div>
            <div className="save-item-meta">
              {s.year}年度 / 作成 {new Date(s.createdAt).toLocaleString()}
            </div>
            <div className="save-item-income">前年所得として使用: {formatYen(s.previousYearTotalIncome)}</div>
            <div className="save-item-actions">
              <button onClick={() => applySave(s.id)} className="btn-small">読み込み</button>
              <button onClick={() => handleRename(s.id)} className="btn-small">名前変更</button>
              <button onClick={() => handleDelete(s.id)} className="btn-small btn-small-danger">削除</button>
            </div>
          </div>
        ))}
      </Section>
      <Section 
        title="前年所得として使用"
        infoButton={
          <InfoButton onClick={() => {
            setInfoModal({
              isOpen: true,
              title: '前年所得として使用',
              content: (
                <div>
                  <p>国民年金保険料と住民税などの算出に用います。</p>
                  <h4>保存データから選択</h4>
                  <p>入力内容を計算後に、結果を保存することができるため、先に前年度のデータを計算し、保存している場合、保存データから選択可能です。</p>
                  <h4>今年の情報を仮で使用</h4>
                  <p>前年度と働き方及び給与、その他控除額などの差分が小さい場合、こちらで計算しても誤差は小さいと思われます。あくまでも概算を知りたい場合の利用を想定しています。</p>
                  <h4>手入力</h4>
                  <p>前年度の所得等の情報を入力することで、計算対象に用いることが可能です。</p>
                </div>
              ),
            });
          }} />
        }
      >
        <Field label="前年所得の入力方法" required fieldId="save-previousYearInputMode">
          <select
            className="select"
            value={input.save.previousYearInputMode ?? 'none'}
            onChange={(e) => {
              const mode = e.target.value as 'none' | 'fromSave' | 'useCurrent' | 'manual';
              if (mode === 'useCurrent') {
                const currentTotal = output?.derived.totalIncomeGeneral ?? 0;
                setInput((prev) => ({
                  ...prev,
                  save: { 
                    ...prev.save, 
                    previousYearInputMode: mode,
                    selectedSaveId: null,
                    previousYearTotalIncome: currentTotal,
                  },
                }));
              } else if (mode === 'manual') {
                setInput((prev) => ({
                  ...prev,
                  save: { 
                    ...prev.save, 
                    previousYearInputMode: mode,
                    selectedSaveId: null,
                    previousYearTotalIncome: null,
                    previousYearManual: prev.save.previousYearManual ?? {
                      totalIncome: 0,
                      incomeBreakdown: {
                        salary: 0,
                        business: 0,
                        realEstate: 0,
                        dividend: 0,
                        transfer: 0,
                        temporary: 0,
                        miscellaneous: 0,
                      },
                      deductions: {
                        basic: 0,
                        spouse: 0,
                        dependent: 0,
                        disabled: 0,
                        widow: 0,
                        workingStudent: 0,
                        socialInsurance: 0,
                        lifeInsurance: 0,
                        earthquake: 0,
                        medical: 0,
                        donation: 0,
                      },
                      taxCredits: {
                        housingLoan: 0,
                        dividend: 0,
                        foreignTax: 0,
                      },
                      household: {
                        nhiMembers: 0,
                        members4064: 0,
                        preschool: 0,
                        householdIncome: 0,
                      },
                    },
                  },
                }));
              } else {
                setInput((prev) => ({
                  ...prev,
                  save: { 
                    ...prev.save, 
                    previousYearInputMode: mode,
                    selectedSaveId: null,
                    previousYearTotalIncome: null,
                  },
                }));
              }
            }}
          >
            <option value="none">未選択</option>
            <option value="fromSave">保存データから選択</option>
            <option value="useCurrent">今年の情報を仮で使用</option>
            <option value="manual">手入力</option>
          </select>
        </Field>
        
        {input.save.previousYearInputMode === 'fromSave' && (
          <Field label="保存データを選択">
            <select
              value={input.save.selectedSaveId ?? ''}
              onChange={(e) => {
                const id = e.target.value;
                const found = saves.find((s) => s.id === id);
                setInput((prev) => ({
                  ...prev,
                  save: { 
                    ...prev.save, 
                    selectedSaveId: id || null, 
                    previousYearTotalIncome: found?.previousYearTotalIncome ?? null 
                  },
                }));
              }}
            >
              <option value="">未選択</option>
              {saves.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({formatYen(s.previousYearTotalIncome)})
                </option>
              ))}
            </select>
          </Field>
        )}

        {input.save.previousYearInputMode === 'manual' && input.save.previousYearManual && (
          <details className="accordion accordion-margin-top">
            <summary>前年の所得等情報（詳細入力）</summary>
            <div className="accordion-content">
              <Section title="前年の総所得金額等（所得の合計）">
                <div className="grid-2cols">
                  <Field label="給与所得">
                    <InputNumber 
                      value={input.save.previousYearManual.incomeBreakdown.salary} 
                      onChange={(v) => updateInput((p) => ({
                        ...p,
                        save: {
                          ...p.save,
                          previousYearManual: p.save.previousYearManual ? {
                            ...p.save.previousYearManual,
                            incomeBreakdown: { ...p.save.previousYearManual.incomeBreakdown, salary: v }
                          } : undefined,
                        },
                      }))} 
                    />
                  </Field>
                  <Field label="事業所得">
                    <InputNumber 
                      value={input.save.previousYearManual.incomeBreakdown.business} 
                      onChange={(v) => updateInput((p) => ({
                        ...p,
                        save: {
                          ...p.save,
                          previousYearManual: p.save.previousYearManual ? {
                            ...p.save.previousYearManual,
                            incomeBreakdown: { ...p.save.previousYearManual.incomeBreakdown, business: v }
                          } : undefined,
                        },
                      }))} 
                    />
                  </Field>
                  <Field label="不動産所得">
                    <InputNumber 
                      value={input.save.previousYearManual.incomeBreakdown.realEstate} 
                      onChange={(v) => updateInput((p) => ({
                        ...p,
                        save: {
                          ...p.save,
                          previousYearManual: p.save.previousYearManual ? {
                            ...p.save.previousYearManual,
                            incomeBreakdown: { ...p.save.previousYearManual.incomeBreakdown, realEstate: v }
                          } : undefined,
                        },
                      }))} 
                    />
                  </Field>
                  <Field label="配当所得">
                    <InputNumber 
                      value={input.save.previousYearManual.incomeBreakdown.dividend} 
                      onChange={(v) => updateInput((p) => ({
                        ...p,
                        save: {
                          ...p.save,
                          previousYearManual: p.save.previousYearManual ? {
                            ...p.save.previousYearManual,
                            incomeBreakdown: { ...p.save.previousYearManual.incomeBreakdown, dividend: v }
                          } : undefined,
                        },
                      }))} 
                    />
                  </Field>
                  <Field label="譲渡所得">
                    <InputNumber 
                      value={input.save.previousYearManual.incomeBreakdown.transfer} 
                      onChange={(v) => updateInput((p) => ({
                        ...p,
                        save: {
                          ...p.save,
                          previousYearManual: p.save.previousYearManual ? {
                            ...p.save.previousYearManual,
                            incomeBreakdown: { ...p.save.previousYearManual.incomeBreakdown, transfer: v }
                          } : undefined,
                        },
                      }))} 
                    />
                  </Field>
                  <Field label="一時所得">
                    <InputNumber 
                      value={input.save.previousYearManual.incomeBreakdown.temporary} 
                      onChange={(v) => updateInput((p) => ({
                        ...p,
                        save: {
                          ...p.save,
                          previousYearManual: p.save.previousYearManual ? {
                            ...p.save.previousYearManual,
                            incomeBreakdown: { ...p.save.previousYearManual.incomeBreakdown, temporary: v }
                          } : undefined,
                        },
                      }))} 
                    />
                  </Field>
                  <Field label="雑所得">
                    <InputNumber 
                      value={input.save.previousYearManual.incomeBreakdown.miscellaneous} 
                      onChange={(v) => updateInput((p) => ({
                        ...p,
                        save: {
                          ...p.save,
                          previousYearManual: p.save.previousYearManual ? {
                            ...p.save.previousYearManual,
                            incomeBreakdown: { ...p.save.previousYearManual.incomeBreakdown, miscellaneous: v }
                          } : undefined,
                        },
                      }))} 
                    />
                  </Field>
                  <Field label="合計">
                    <InputNumber 
                      value={input.save.previousYearManual.totalIncome} 
                      onChange={(v) => updateInput((p) => ({
                        ...p,
                        save: {
                          ...p.save,
                          previousYearTotalIncome: v,
                          previousYearManual: p.save.previousYearManual ? {
                            ...p.save.previousYearManual,
                            totalIncome: v
                          } : undefined,
                        },
                      }))} 
                    />
                  </Field>
                </div>
              </Section>

              <Section title="前年の所得控除（住民税用）">
                <div className="grid-2cols">
                  <Field label="基礎控除">
                    <InputNumber 
                      value={input.save.previousYearManual.deductions.basic} 
                      onChange={(v) => updateInput((p) => ({
                        ...p,
                        save: {
                          ...p.save,
                          previousYearManual: p.save.previousYearManual ? {
                            ...p.save.previousYearManual,
                            deductions: { ...p.save.previousYearManual.deductions, basic: v }
                          } : undefined,
                        },
                      }))} 
                    />
                  </Field>
                  <Field label="配偶者控除">
                    <InputNumber 
                      value={input.save.previousYearManual.deductions.spouse} 
                      onChange={(v) => updateInput((p) => ({
                        ...p,
                        save: {
                          ...p.save,
                          previousYearManual: p.save.previousYearManual ? {
                            ...p.save.previousYearManual,
                            deductions: { ...p.save.previousYearManual.deductions, spouse: v }
                          } : undefined,
                        },
                      }))} 
                    />
                  </Field>
                  <Field label="扶養控除">
                    <InputNumber 
                      value={input.save.previousYearManual.deductions.dependent} 
                      onChange={(v) => updateInput((p) => ({
                        ...p,
                        save: {
                          ...p.save,
                          previousYearManual: p.save.previousYearManual ? {
                            ...p.save.previousYearManual,
                            deductions: { ...p.save.previousYearManual.deductions, dependent: v }
                          } : undefined,
                        },
                      }))} 
                    />
                  </Field>
                  <Field label="障害者控除">
                    <InputNumber 
                      value={input.save.previousYearManual.deductions.disabled} 
                      onChange={(v) => updateInput((p) => ({
                        ...p,
                        save: {
                          ...p.save,
                          previousYearManual: p.save.previousYearManual ? {
                            ...p.save.previousYearManual,
                            deductions: { ...p.save.previousYearManual.deductions, disabled: v }
                          } : undefined,
                        },
                      }))} 
                    />
                  </Field>
                  <Field label="寡婦/ひとり親控除">
                    <InputNumber 
                      value={input.save.previousYearManual.deductions.widow} 
                      onChange={(v) => updateInput((p) => ({
                        ...p,
                        save: {
                          ...p.save,
                          previousYearManual: p.save.previousYearManual ? {
                            ...p.save.previousYearManual,
                            deductions: { ...p.save.previousYearManual.deductions, widow: v }
                          } : undefined,
                        },
                      }))} 
                    />
                  </Field>
                  <Field label="勤労学生控除">
                    <InputNumber 
                      value={input.save.previousYearManual.deductions.workingStudent} 
                      onChange={(v) => updateInput((p) => ({
                        ...p,
                        save: {
                          ...p.save,
                          previousYearManual: p.save.previousYearManual ? {
                            ...p.save.previousYearManual,
                            deductions: { ...p.save.previousYearManual.deductions, workingStudent: v }
                          } : undefined,
                        },
                      }))} 
                    />
                  </Field>
                  <Field label="社会保険料控除">
                    <InputNumber 
                      value={input.save.previousYearManual.deductions.socialInsurance} 
                      onChange={(v) => updateInput((p) => ({
                        ...p,
                        save: {
                          ...p.save,
                          previousYearManual: p.save.previousYearManual ? {
                            ...p.save.previousYearManual,
                            deductions: { ...p.save.previousYearManual.deductions, socialInsurance: v }
                          } : undefined,
                        },
                      }))} 
                    />
                  </Field>
                  <Field label="生命保険料控除">
                    <InputNumber 
                      value={input.save.previousYearManual.deductions.lifeInsurance} 
                      onChange={(v) => updateInput((p) => ({
                        ...p,
                        save: {
                          ...p.save,
                          previousYearManual: p.save.previousYearManual ? {
                            ...p.save.previousYearManual,
                            deductions: { ...p.save.previousYearManual.deductions, lifeInsurance: v }
                          } : undefined,
                        },
                      }))} 
                    />
                  </Field>
                  <Field label="地震保険料控除">
                    <InputNumber 
                      value={input.save.previousYearManual.deductions.earthquake} 
                      onChange={(v) => updateInput((p) => ({
                        ...p,
                        save: {
                          ...p.save,
                          previousYearManual: p.save.previousYearManual ? {
                            ...p.save.previousYearManual,
                            deductions: { ...p.save.previousYearManual.deductions, earthquake: v }
                          } : undefined,
                        },
                      }))} 
                    />
                  </Field>
                  <Field label="医療費控除">
                    <InputNumber 
                      value={input.save.previousYearManual.deductions.medical} 
                      onChange={(v) => updateInput((p) => ({
                        ...p,
                        save: {
                          ...p.save,
                          previousYearManual: p.save.previousYearManual ? {
                            ...p.save.previousYearManual,
                            deductions: { ...p.save.previousYearManual.deductions, medical: v }
                          } : undefined,
                        },
                      }))} 
                    />
                  </Field>
                  <Field label="寄附金控除（ふるさと納税含む）">
                    <InputNumber 
                      value={input.save.previousYearManual.deductions.donation} 
                      onChange={(v) => updateInput((p) => ({
                        ...p,
                        save: {
                          ...p.save,
                          previousYearManual: p.save.previousYearManual ? {
                            ...p.save.previousYearManual,
                            deductions: { ...p.save.previousYearManual.deductions, donation: v }
                          } : undefined,
                        },
                      }))} 
                    />
                  </Field>
                </div>
              </Section>

              <Section title="前年の税額控除・減免要素（該当があれば）">
                <div className="grid-2cols">
                  <Field label="住宅ローン控除（住民税側）">
                    <InputNumber 
                      value={input.save.previousYearManual.taxCredits.housingLoan} 
                      onChange={(v) => updateInput((p) => ({
                        ...p,
                        save: {
                          ...p.save,
                          previousYearManual: p.save.previousYearManual ? {
                            ...p.save.previousYearManual,
                            taxCredits: { ...p.save.previousYearManual.taxCredits, housingLoan: v }
                          } : undefined,
                        },
                      }))} 
                    />
                  </Field>
                  <Field label="配当控除">
                    <InputNumber 
                      value={input.save.previousYearManual.taxCredits.dividend} 
                      onChange={(v) => updateInput((p) => ({
                        ...p,
                        save: {
                          ...p.save,
                          previousYearManual: p.save.previousYearManual ? {
                            ...p.save.previousYearManual,
                            taxCredits: { ...p.save.previousYearManual.taxCredits, dividend: v }
                          } : undefined,
                        },
                      }))} 
                    />
                  </Field>
                  <Field label="外国税額控除">
                    <InputNumber 
                      value={input.save.previousYearManual.taxCredits.foreignTax} 
                      onChange={(v) => updateInput((p) => ({
                        ...p,
                        save: {
                          ...p.save,
                          previousYearManual: p.save.previousYearManual ? {
                            ...p.save.previousYearManual,
                            taxCredits: { ...p.save.previousYearManual.taxCredits, foreignTax: v }
                          } : undefined,
                        },
                      }))} 
                    />
                  </Field>
                </div>
              </Section>

              <Section title="世帯情報（所得以外で必要）">
                <div className="grid-2cols">
                  <Field label="国保加入者数">
                    <InputNumber 
                      value={input.save.previousYearManual.household.nhiMembers} 
                      onChange={(v) => updateInput((p) => ({
                        ...p,
                        save: {
                          ...p.save,
                          previousYearManual: p.save.previousYearManual ? {
                            ...p.save.previousYearManual,
                            household: { ...p.save.previousYearManual.household, nhiMembers: v }
                          } : undefined,
                        },
                      }))} 
                    />
                  </Field>
                  <Field label="40〜64歳人数">
                    <InputNumber 
                      value={input.save.previousYearManual.household.members4064} 
                      onChange={(v) => updateInput((p) => ({
                        ...p,
                        save: {
                          ...p.save,
                          previousYearManual: p.save.previousYearManual ? {
                            ...p.save.previousYearManual,
                            household: { ...p.save.previousYearManual.household, members4064: v }
                          } : undefined,
                        },
                      }))} 
                    />
                  </Field>
                  <Field label="未就学児人数">
                    <InputNumber 
                      value={input.save.previousYearManual.household.preschool} 
                      onChange={(v) => updateInput((p) => ({
                        ...p,
                        save: {
                          ...p.save,
                          previousYearManual: p.save.previousYearManual ? {
                            ...p.save.previousYearManual,
                            household: { ...p.save.previousYearManual.household, preschool: v }
                          } : undefined,
                        },
                      }))} 
                    />
                  </Field>
                  <Field label="世帯所得（軽減判定用）">
                    <InputNumber 
                      value={input.save.previousYearManual.household.householdIncome} 
                      onChange={(v) => updateInput((p) => ({
                        ...p,
                        save: {
                          ...p.save,
                          previousYearManual: p.save.previousYearManual ? {
                            ...p.save.previousYearManual,
                            household: { ...p.save.previousYearManual.household, householdIncome: v }
                          } : undefined,
                        },
                      }))} 
                    />
                  </Field>
                </div>
              </Section>
            </div>
          </details>
        )}
      </Section>
    </div>
  );

  const IncomePanel = (
    <div>
      <Section title="家族情報">
        <div className="grid-3cols">
          <Field label="納税者年齢" required fieldId="family-taxpayerAge">
            <InputNumber 
              value={input.family.taxpayerAge} 
              onChange={(v) => updateInput((p) => ({ ...p, family: { ...p.family, taxpayerAge: v } }))} 
              placeholder="例: 42"
              required
            />
          </Field>
          <Field label="配偶者人数" fieldId="family-spouseCount">
            <InputNumber 
              value={input.family.spouseCount} 
              onChange={(v) => updateInput((p) => ({ ...p, family: { ...p.family, spouseCount: v } }))} 
              placeholder="例: 0"
              required
            />
          </Field>
          <Field label="扶養人数" fieldId="family-dependentCount">
            <InputNumber 
              value={input.family.dependentCount} 
              onChange={(v) => updateInput((p) => ({ ...p, family: { ...p.family, dependentCount: v } }))} 
              placeholder="例: 1"
              required
            />
          </Field>
        </div>
        {input.family.dependentCount > 0 && (
          <details className="accordion accordion-margin-top">
            <summary className="accordion-summary">扶養者の内訳（扶養人数: {input.family.dependentCount}名）</summary>
            <div className="accordion-content accordion-content-margin">
              <div className="grid-2cols">
                <Field label="40〜64歳人数" required fieldId="family-dependents4064Count">
                  <InputNumber 
                    value={input.family.dependents4064Count} 
                    onChange={(v) => updateInput((p) => ({ ...p, family: { ...p.family, dependents4064Count: v } }))} 
                    placeholder="例: 0"
                    required
                    min={0}
                    max={input.family.dependentCount}
                  />
                </Field>
                <Field label="未就学児人数" required fieldId="family-preschoolCount">
                  <InputNumber 
                    value={input.family.preschoolCount} 
                    onChange={(v) => updateInput((p) => ({ ...p, family: { ...p.family, preschoolCount: v } }))} 
                    placeholder="例: 0"
                    required
                    min={0}
                    max={input.family.dependentCount}
                  />
                </Field>
              </div>
            </div>
          </details>
        )}
      </Section>

      <Section title="給与（ON/OFF可）">
        <label>
          <input type="checkbox" checked={input.salary.enabled} onChange={(e) => updateInput((p) => ({ ...p, salary: { ...p.salary, enabled: e.target.checked } }))} /> 給与収入を使う
        </label>
        <div className={input.salary.enabled ? '' : 'disabled-section'}>
          {input.salary.sources.map((s, idx) => (
            <div key={s.id} className="salary-source-item">
              <button
                onClick={() => {
                  const newSources = input.salary.sources.filter((it) => it.id !== s.id);
                  const newMainSourceId = input.salary.mainSourceId === s.id ? (newSources.length > 0 ? newSources[0].id : null) : input.salary.mainSourceId;
                  updateInput((p) => ({
                    ...p,
                    salary: { ...p.salary, sources: newSources, mainSourceId: newMainSourceId },
                  }));
                }}
                className="btn-small btn-small-danger salary-source-delete-btn"
                disabled={!input.salary.enabled || input.salary.sources.length <= 1}
                title="この支払先を削除"
              >
                削除
              </button>
              <Field label={`支払先${idx + 1} 名称`} required={input.salary.enabled} fieldId={`salary-sources-${idx}-name`}>
                <input
                  type="text"
                  className="input"
                  value={s.name}
                  onChange={(e) =>
                    updateInput((p) => ({
                      ...p,
                      salary: { ...p.salary, sources: p.salary.sources.map((it) => (it.id === s.id ? { ...it, name: e.target.value } : it)) },
                    }))
                  }
                  disabled={!input.salary.enabled}
                  placeholder="例: 株式会社○○"
                  required={input.salary.enabled}
                />
              </Field>
              <Field label="年間支給額" required={input.salary.enabled} fieldId={`salary-sources-${idx}-annual`}>
                <InputNumber
                  value={s.annual}
                  onChange={(v) =>
                    updateInput((p) => ({
                      ...p,
                      salary: { ...p.salary, sources: p.salary.sources.map((it) => (it.id === s.id ? { ...it, annual: v } : it)) },
                    }))
                  }
                  disabled={!input.salary.enabled}
                  placeholder="例: 4000000"
                  required={input.salary.enabled}
                />
              </Field>
            </div>
          ))}
          {input.salary.enabled && input.salary.sources.length > 0 && (
            <Field label="主たる給与" required={input.salary.enabled} fieldId="salary-mainSourceId" className="field-margin-top">
              <select
                className="select"
                value={input.salary.mainSourceId ?? ''}
                onChange={(e) => updateInput((p) => ({ ...p, salary: { ...p.salary, mainSourceId: e.target.value || null } }))}
                disabled={!input.salary.enabled}
                required={input.salary.enabled}
              >
                <option value="">選択してください</option>
                {input.salary.sources.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}（{formatYen(s.annual)}）
                  </option>
                ))}
              </select>
            </Field>
          )}
          <button onClick={addSalarySource} className="btn-secondary btn-margin-top" disabled={!input.salary.enabled}>
            支払先を追加
          </button>
        </div>
      </Section>

      <Section title="事業（ON/OFF可）">
        <label>
          <input
            type="checkbox"
            checked={input.business.enabled}
            onChange={(e) =>
              updateInput((p) => {
                const enabled = e.target.checked;
                return {
                  ...p,
                  business: {
                    ...p.business,
                    enabled,
                    // 事業OFFのときは青色関連も非活性（状態もOFFへ寄せる）
                    blueReturn: enabled ? p.business.blueReturn : { ...p.business.blueReturn, enabled: false, mode: 'book' },
                  },
                };
              })
            }
          />{' '}
          事業所得を使う
        </label>
        <div className={`grid-2cols-gap12 ${input.business.enabled ? '' : 'disabled-section'}`}>
          <Field label="売上" required={input.business.enabled} fieldId="business-sales">
            <InputNumber 
              value={input.business.sales} 
              onChange={(v) => updateInput((p) => ({ ...p, business: { ...p.business, sales: v } }))} 
              disabled={!input.business.enabled}
              placeholder="例: 5000000"
              required={input.business.enabled}
            />
          </Field>
          <Field label="経費">
            <InputNumber value={input.business.expenses} onChange={(v) => updateInput((p) => ({ ...p, business: { ...p.business, expenses: v } }))} disabled={!input.business.enabled} />
          </Field>
        </div>
        <label>
          <input
            type="checkbox"
            checked={input.business.blueReturn.enabled}
            onChange={(e) => updateInput((p) => ({ ...p, business: { ...p.business, blueReturn: { ...p.business.blueReturn, enabled: e.target.checked } } }))}
            disabled={!input.business.enabled}
          />
          青色申告を行う
        </label>
        {input.business.blueReturn.enabled && (
          <>
            <Field label="電子帳簿">
              <label>
                <input
                  type="checkbox"
                  checked={input.business.blueReturn.mode === 'electronic'}
                  onChange={(e) => updateInput((p) => ({ ...p, business: { ...p.business, blueReturn: { ...p.business.blueReturn, mode: e.target.checked ? 'electronic' : 'book' } } }))}
                  disabled={!input.business.enabled || !input.business.blueReturn.enabled}
                />
                電子帳簿方式を採用する（チェックなしの場合は帳簿方式、控除額55万円）
              </label>
            </Field>
          </>
        )}
      </Section>

      <Section 
        title="株式"
        infoButton={
          <InfoButton onClick={() => {
            setInfoModal({
              isOpen: true,
              title: '株式について',
              content: (
                <div>
                  <h4>総合課税</h4>
                  <p>給与収入、事業収入、株式収益をまとめて合算後、税金を計算する方式</p>
                  <ul>
                    <li>累進課税のため、所得が多い人ほど税率が高くなるが、所得が低い人は申告分離課税よりも低い税金で済む</li>
                    <li>配当金は配当控除を使用できる場合がある。（所得税率が5%～10%の場合、こちらが有利）</li>
                  </ul>
                  <h4>申告分離課税</h4>
                  <p>株式利益を他の収入と切り離して、税金を計算する方式</p>
                  <ul>
                    <li>税率は一律20.315%のため、株式以外の収益の多寡に依存しない</li>
                    <li>売買益は基本的に、申告分離課税方式で計算する。（未上場株式の売買益など一部例外あり）</li>
                  </ul>
                </div>
              ),
            });
          }} />
        }
      >
        <Field label="配当金">
          <InputNumber value={input.stocks.dividend.amount} onChange={(v) => updateInput((p) => ({ ...p, stocks: { ...p.stocks, dividend: { ...p.stocks.dividend, amount: v } } }))} />
          <select value={input.stocks.dividend.taxMode} onChange={(e) => updateInput((p) => ({ ...p, stocks: { ...p.stocks, dividend: { ...p.stocks.dividend, taxMode: e.target.value as any } } }))}>
            <option value="general">総合課税</option>
            <option value="separate">申告分離課税</option>
          </select>
        </Field>
        <Field label="売買益">
          <InputNumber value={input.stocks.capitalGain.amount} onChange={(v) => updateInput((p) => ({ ...p, stocks: { ...p.stocks, capitalGain: { ...p.stocks.capitalGain, amount: v } } }))} />
          <select value={input.stocks.capitalGain.taxMode} onChange={(e) => updateInput((p) => ({ ...p, stocks: { ...p.stocks, capitalGain: { ...p.stocks.capitalGain, taxMode: e.target.value as any } } }))}>
            <option value="general">総合課税</option>
            <option value="separate">申告分離課税</option>
          </select>
        </Field>
      </Section>
    </div>
  );

  const DeductionsPanel = (
    <div>
      <Section title="掛金系">
        <Field label="iDeCo">
          <InputNumber value={input.deductions.ideco} onChange={(v) => updateInput((p) => ({ ...p, deductions: { ...p.deductions, ideco: v } }))} />
        </Field>
        <Field label="小規模企業共済">
          <InputNumber value={input.deductions.smallBizMutualAid} onChange={(v) => updateInput((p) => ({ ...p, deductions: { ...p.deductions, smallBizMutualAid: v } }))} />
        </Field>
        <Field label="経営セーフティ共済">
          <InputNumber value={input.deductions.safetyMutualAid} onChange={(v) => updateInput((p) => ({ ...p, deductions: { ...p.deductions, safetyMutualAid: v } }))} />
        </Field>
      </Section>

      <Section title="生命保険料控除">
        <Field label="一般">
          <InputNumber value={input.deductions.lifeInsurance.general} onChange={(v) => updateInput((p) => ({ ...p, deductions: { ...p.deductions, lifeInsurance: { ...p.deductions.lifeInsurance, general: v } } }))} />
        </Field>
        <Field label="介護医療">
          <InputNumber value={input.deductions.lifeInsurance.nursingMedical} onChange={(v) => updateInput((p) => ({ ...p, deductions: { ...p.deductions, lifeInsurance: { ...p.deductions.lifeInsurance, nursingMedical: v } } }))} />
        </Field>
        <Field label="個人年金">
          <InputNumber value={input.deductions.lifeInsurance.pension} onChange={(v) => updateInput((p) => ({ ...p, deductions: { ...p.deductions, lifeInsurance: { ...p.deductions.lifeInsurance, pension: v } } }))} />
        </Field>
      </Section>

      <Section title="地震保険料控除">
        <Field label="地震保険料">
          <InputNumber value={input.deductions.earthquake} onChange={(v) => updateInput((p) => ({ ...p, deductions: { ...p.deductions, earthquake: v } }))} />
        </Field>
      </Section>

      <Section title="医療費控除">
        <div className="info-message">必要な場合のみ金額を入力してください（未入力=0円）</div>
        <div className="grid-2cols">
          <Field label="治療費等">
            <InputNumber value={input.deductions.medical.treatment} onChange={(v) => updateInput((p) => ({ ...p, deductions: { ...p.deductions, medical: { ...p.deductions.medical, enabled: true, treatment: v } } }))} />
          </Field>
          <Field label="通院交通費">
            <InputNumber value={input.deductions.medical.transport} onChange={(v) => updateInput((p) => ({ ...p, deductions: { ...p.deductions, medical: { ...p.deductions.medical, enabled: true, transport: v } } }))} />
          </Field>
          <Field label="その他">
            <InputNumber value={input.deductions.medical.other} onChange={(v) => updateInput((p) => ({ ...p, deductions: { ...p.deductions, medical: { ...p.deductions.medical, enabled: true, other: v } } }))} />
          </Field>
          <Field label="民間保険からの補填（民間保険加入分で支払いが行われたもの）">
            <InputNumber value={input.deductions.medical.reimbursed} onChange={(v) => updateInput((p) => ({ ...p, deductions: { ...p.deductions, medical: { ...p.deductions.medical, enabled: true, reimbursed: v } } }))} />
          </Field>
        </div>
      </Section>
    </div>
  );

  const InsurancePanel = (
    <div>
      <Section 
        title="保険モード"
        infoButton={
          <InfoButton onClick={() => {
            setInfoModal({
              isOpen: true,
              title: '保険モードについて',
              content: (
                <div>
                  <h4>社保のみ</h4>
                  <p>給与所得者として1年間務めた場合、こちらの選択で問題ないです</p>
                  <h4>国保+国年のみ</h4>
                  <p>自営業者や未就業者はこちらの選択をしてください</p>
                  <h4>複合</h4>
                  <p>一年を通して、社保加入と国保+国年加入した場合は、こちらを選択してください。</p>
                  <p>同一年内に退職後期間を空けて就職した場合などを想定</p>
                </div>
              ),
            });
          }} />
        }
      >
        <select 
          value={input.insurance.mode} 
          onChange={(e) => {
            const mode = e.target.value as 'employeeOnly' | 'nationalOnly' | 'mixed';
            updateInput((p) => {
              if (mode === 'nationalOnly' && !p.insurance.national) {
                return {
                  ...p,
                  insurance: {
                    ...p.insurance,
                    mode,
                    national: {
                      nhi: { mode: 'estimate' as const },
                      np: { payMonths: 12, exemptMonths: 0 },
                    },
                    employee: null,
                    mixed: null,
                  },
                };
              } else if (mode === 'employeeOnly' && !p.insurance.employee) {
                return {
                  ...p,
                  insurance: {
                    ...p.insurance,
                    mode,
                    employee: { inputMode: 'estimate' as const },
                    national: null,
                    mixed: null,
                  },
                };
              } else if (mode === 'mixed' && !p.insurance.mixed) {
                return {
                  ...p,
                  insurance: {
                    ...p.insurance,
                    mode,
                    mixed: { blocks: [] },
                    employee: null,
                    national: null,
                  },
                };
              } else {
                return { ...p, insurance: { ...p.insurance, mode } };
              }
            });
          }}
        >
          <option value="employeeOnly">社保のみ</option>
          <option value="nationalOnly">国保+国年のみ</option>
          <option value="mixed">複合</option>
        </select>
      </Section>

      {(input.insurance.mode === 'nationalOnly' || input.insurance.mode === 'mixed') && (
        <Section title="加入者数（本人を含む）">
          <div className="grid-3cols">
            <Field label="加入者数（本人含む）" required fieldId="insurance-nhiHousehold-membersIncludingTaxpayer">
              <InputNumber 
                value={input.insurance.nhiHousehold.membersIncludingTaxpayer} 
                onChange={(v) => updateInput((p) => ({ ...p, insurance: { ...p.insurance, nhiHousehold: { ...p.insurance.nhiHousehold, membersIncludingTaxpayer: v } } }))} 
                min={1}
                placeholder="例: 3"
                required
              />
            </Field>
            <Field label="40〜64歳人数">
              <InputNumber 
                value={input.insurance.nhiHousehold.members4064} 
                onChange={(v) => updateInput((p) => ({ ...p, insurance: { ...p.insurance, nhiHousehold: { ...p.insurance.nhiHousehold, members4064: v } } }))} 
                min={0}
                placeholder="例: 1"
              />
            </Field>
            <Field label="未就学児人数">
              <InputNumber 
                value={input.insurance.nhiHousehold.preschool} 
                onChange={(v) => updateInput((p) => ({ ...p, insurance: { ...p.insurance, nhiHousehold: { ...p.insurance.nhiHousehold, preschool: v } } }))} 
                min={0}
                placeholder="例: 0"
              />
            </Field>
          </div>
        </Section>
      )}

      {input.insurance.mode === 'nationalOnly' && input.insurance.national && (
        <>
          <Section title="国保（単独）">
            <Field label="入力方法">
              <select
                value={input.insurance.national.nhi.mode}
                onChange={(e) => updateInput((p) => ({ ...p, insurance: { ...p.insurance, national: { ...p.insurance.national!, nhi: { ...p.insurance.national!.nhi, mode: e.target.value as any } } } }))}
              >
                <option value="manual">手入力</option>
                <option value="estimate">推計</option>
              </select>
            </Field>
            {input.insurance.national.nhi.mode === 'manual' && (
              <Field label="国保（年額）">
                <InputNumber value={input.insurance.national.nhi.amount ?? 0} onChange={(v) => updateInput((p) => ({ ...p, insurance: { ...p.insurance, national: { ...p.insurance.national!, nhi: { ...p.insurance.national!.nhi, amount: v } } } }))} />
              </Field>
            )}
          </Section>
          <Section title="国民年金（月数合計=12）">
            <div className="grid-3cols">
              <Field label="加入月数">
                <InputNumber value={input.insurance.national.np.payMonths} onChange={(v) => updateInput((p) => ({ ...p, insurance: { ...p.insurance, national: { ...p.insurance.national!, np: { ...p.insurance.national!.np, payMonths: v } } } }))} />
              </Field>
              <Field label="免除月数">
                <InputNumber value={input.insurance.national.np.exemptMonths} onChange={(v) => updateInput((p) => ({ ...p, insurance: { ...p.insurance, national: { ...p.insurance.national!, np: { ...p.insurance.national!.np, exemptMonths: v } } } }))} />
              </Field>
              <Field label="月額（上書き可）">
                <InputNumber value={input.insurance.national.np.monthlyOverride ?? 0} onChange={(v) => updateInput((p) => ({ ...p, insurance: { ...p.insurance, national: { ...p.insurance.national!, np: { ...p.insurance.national!.np, monthlyOverride: v } } } }))} />
              </Field>
            </div>
          </Section>
        </>
      )}

      {input.insurance.mode === 'employeeOnly' && (
        <Section title="社保（単独）">
          <Field label="入力方法">
            <select
              value={input.insurance.employee?.inputMode ?? 'estimate'}
              onChange={(e) =>
                updateInput((p) => ({
                  ...p,
                  insurance: { ...p.insurance, employee: { ...(p.insurance.employee ?? { inputMode: 'estimate' as const }), inputMode: e.target.value as any } },
                }))
              }
            >
              <option value="manual">手入力</option>
              <option value="estimate">推計</option>
            </select>
          </Field>
          {input.insurance.employee?.inputMode === 'manual' ? (
            <Field label="社保（年額）">
              <InputNumber value={input.insurance.employee?.amount ?? 0} onChange={(v) => updateInput((p) => ({ ...p, insurance: { ...p.insurance, employee: { ...(p.insurance.employee ?? { inputMode: 'manual' }), amount: v } } }))} />
            </Field>
          ) : (
            <>
              <div className="municipality-info">
                主たる給与: 収入欄の「主たる給与」で選択された支払先を使用します
              </div>
            </>
          )}
        </Section>
      )}

      {input.insurance.mode === 'mixed' && (
        <Section title="複合ブロック（合計月数=12）">
          {(input.insurance.mixed?.blocks ?? []).map((b, idx) => (
            <div key={b.id} className="insurance-block">
              <button
                onClick={() => {
                  const newBlocks = (input.insurance.mixed?.blocks ?? []).filter((it) => it.id !== b.id);
                  updateInput((p) => ({
                    ...p,
                    insurance: {
                      ...p.insurance,
                      mixed: { blocks: newBlocks },
                    },
                  }));
                }}
                className="btn-small btn-small-danger insurance-block-delete-btn"
                disabled={(input.insurance.mixed?.blocks ?? []).length <= 1}
                title={`${b.type === 'employee' ? '社保' : '国保+国年'}ブロックを削除`}
              >
                削除
              </button>
              <div className="insurance-block-title">ブロック{idx + 1}</div>
              <Field label="種別">
                <select
                  value={b.type}
                  onChange={(e) =>
                    updateInput((p) => ({
                      ...p,
                      insurance: {
                        ...p.insurance,
                        mixed: {
                          blocks: (p.insurance.mixed?.blocks ?? []).map((it) =>
                            it.id === b.id
                              ? e.target.value === 'employee'
                                ? { id: b.id, type: 'employee', months: b.months, breakdown: [{ id: crypto.randomUUID(), mode: 'estimate', months: b.months, baseSalarySourceId: p.salary.mainSourceId ?? undefined }] }
                                : { id: b.id, type: 'national', months: b.months, nhiBreakdown: [{ id: crypto.randomUUID(), mode: 'estimate', months: b.months }], npPayMonths: b.months, npExemptMonths: 0, npMonthlyOverride: null }
                              : it
                          ),
                        },
                      },
                    }))
                  }
                >
                  <option value="employee">社保</option>
                  <option value="national">国保+国年</option>
                </select>
              </Field>
              <Field label="月数">
                <InputNumber
                  value={b.months}
                  onChange={(v) =>
                    updateInput((p) => ({
                      ...p,
                      insurance: { ...p.insurance, mixed: { blocks: (p.insurance.mixed?.blocks ?? []).map((it) => (it.id === b.id ? { ...it, months: v } : it)) } },
                    }))
                  }
                />
              </Field>
              {b.type === 'employee' &&
                b.breakdown.map((sub, si) => (
                  <div key={sub.id} className="insurance-sub-block">
                    <Field label="サブ月数">
                      <InputNumber
                        value={sub.months}
                        onChange={(v) =>
                          updateInput((p) => ({
                            ...p,
                            insurance: {
                              ...p.insurance,
                              mixed: {
                                blocks: (p.insurance.mixed?.blocks ?? []).map((it) =>
                                  it.id === b.id && it.type === 'employee'
                                    ? {
                                        ...it,
                                        breakdown: it.breakdown.map((sb: typeof it.breakdown[0]) => (sb.id === sub.id ? { ...sb, months: v } : sb)),
                                      }
                                    : it
                                ),
                              },
                            },
                          }))
                        }
                      />
                    </Field>
                    <Field label="入力方法">
                      <select
                        value={sub.mode}
                        onChange={(e) =>
                          updateInput((p) => ({
                            ...p,
                            insurance: {
                              ...p.insurance,
                              mixed: {
                                blocks: (p.insurance.mixed?.blocks ?? []).map((it) =>
                                  it.id === b.id && it.type === 'employee'
                                    ? {
                                        ...it,
                                        breakdown: it.breakdown.map((sb: typeof it.breakdown[0]) =>
                                          sb.id === sub.id ? { ...sb, mode: e.target.value as 'manual' | 'estimate' } : sb
                                        ),
                                      }
                                    : it
                                ),
                              },
                            },
                          }))
                        }
                      >
                        <option value="estimate">推計</option>
                        <option value="manual">手入力</option>
                      </select>
                    </Field>
                    {sub.mode === 'manual' ? (
                      <Field label="金額（期間合計）">
                        <InputNumber
                          value={sub.amount ?? 0}
                          onChange={(v) =>
                            updateInput((p) => ({
                              ...p,
                              insurance: {
                                ...p.insurance,
                                mixed: {
                                  blocks: (p.insurance.mixed?.blocks ?? []).map((it) =>
                                    it.id === b.id && it.type === 'employee'
                                      ? { ...it, breakdown: it.breakdown.map((sb: typeof it.breakdown[0]) => (sb.id === sub.id ? { ...sb, amount: v } : sb)) }
                                      : it
                                  ),
                                },
                              },
                            }))
                          }
                        />
                      </Field>
                    ) : (
                      <>
                        <Field label="基準給与（支払先）">
                          <select
                            value={sub.baseSalarySourceId ?? ''}
                            onChange={(e) =>
                              updateInput((p) => ({
                                ...p,
                                insurance: {
                                  ...p.insurance,
                                  mixed: {
                                    blocks: (p.insurance.mixed?.blocks ?? []).map((it) =>
                                      it.id === b.id && it.type === 'employee'
                                        ? {
                                            ...it,
                                            breakdown: it.breakdown.map((sb: typeof it.breakdown[0]) => (sb.id === sub.id ? { ...sb, baseSalarySourceId: e.target.value || undefined } : sb)),
                                          }
                                        : it
                                    ),
                                  },
                                },
                              }))
                            }
                          >
                            <option value="">未選択</option>
                            {input.salary.sources.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.name}
                              </option>
                            ))}
                          </select>
                        </Field>
                      </>
                    )}
                  </div>
                ))}

              {b.type === 'national' && (
                <>
                  {b.nhiBreakdown.map((sub) => (
                    <div key={sub.id} className="insurance-sub-block">
                      <div className="insurance-sub-block-title">国保サブ</div>
                      <Field label="月数">
                        <InputNumber
                          value={sub.months}
                          onChange={(v) =>
                            updateInput((p) => ({
                              ...p,
                              insurance: {
                                ...p.insurance,
                                mixed: {
                                  blocks: (p.insurance.mixed?.blocks ?? []).map((it) =>
                                    it.id === b.id && it.type === 'national'
                                      ? { ...it, nhiBreakdown: it.nhiBreakdown.map((sb: typeof it.nhiBreakdown[0]) => (sb.id === sub.id ? { ...sb, months: v } : sb)) }
                                      : it
                                  ),
                                },
                              },
                            }))
                          }
                        />
                      </Field>
                      <Field label="入力方法">
                        <select
                          value={sub.mode}
                          onChange={(e) =>
                            updateInput((p) => ({
                              ...p,
                              insurance: {
                                ...p.insurance,
                                mixed: {
                                  blocks: (p.insurance.mixed?.blocks ?? []).map((it) =>
                                    it.id === b.id && it.type === 'national'
                                      ? { ...it, nhiBreakdown: it.nhiBreakdown.map((sb: typeof it.nhiBreakdown[0]) => (sb.id === sub.id ? { ...sb, mode: e.target.value as 'manual' | 'estimate' } : sb)) }
                                      : it
                                  ),
                                },
                              },
                            }))
                          }
                        >
                          <option value="estimate">推計</option>
                          <option value="manual">手入力</option>
                        </select>
                      </Field>
                      {sub.mode === 'manual' && (
                        <Field label="金額（期間合計）">
                          <InputNumber
                            value={sub.amount ?? 0}
                            onChange={(v) =>
                              updateInput((p) => ({
                                ...p,
                                insurance: {
                                  ...p.insurance,
                                  mixed: {
                                    blocks: (p.insurance.mixed?.blocks ?? []).map((it) =>
                                      it.id === b.id && it.type === 'national'
                                        ? { ...it, nhiBreakdown: it.nhiBreakdown.map((sb: typeof it.nhiBreakdown[0]) => (sb.id === sub.id ? { ...sb, amount: v } : sb)) }
                                        : it
                                    ),
                                  },
                                },
                              }))
                            }
                          />
                        </Field>
                      )}
                    </div>
                  ))}

                  <div className="insurance-sub-block">
                    <div className="insurance-sub-block-title">国民年金</div>
                    <div className="grid-3cols">
                      <Field label="加入月数">
                        <InputNumber
                          value={b.npPayMonths}
                          onChange={(v) =>
                            updateInput((p) => ({
                              ...p,
                              insurance: {
                                ...p.insurance,
                                mixed: {
                                  blocks: (p.insurance.mixed?.blocks ?? []).map((it) =>
                                    it.id === b.id && it.type === 'national' ? { ...it, npPayMonths: v } : it
                                  ),
                                },
                              },
                            }))
                          }
                        />
                      </Field>
                      <Field label="免除月数">
                        <InputNumber
                          value={b.npExemptMonths}
                          onChange={(v) =>
                            updateInput((p) => ({
                              ...p,
                              insurance: {
                                ...p.insurance,
                                mixed: {
                                  blocks: (p.insurance.mixed?.blocks ?? []).map((it) =>
                                    it.id === b.id && it.type === 'national' ? { ...it, npExemptMonths: v } : it
                                  ),
                                },
                              },
                            }))
                          }
                        />
                      </Field>
                      <Field label="月額（上書き可）">
                        <InputNumber
                          value={b.npMonthlyOverride ?? 0}
                          onChange={(v) =>
                            updateInput((p) => ({
                              ...p,
                              insurance: {
                                ...p.insurance,
                                mixed: {
                                  blocks: (p.insurance.mixed?.blocks ?? []).map((it) =>
                                    it.id === b.id && it.type === 'national' ? { ...it, npMonthlyOverride: v } : it
                                  ),
                                },
                              },
                            }))
                          }
                        />
                      </Field>
                    </div>
                  </div>
                </>
              )}
            </div>
          ))}
          <div className="button-group-inline">
            <button onClick={() => addMixedBlock('employee')} className="btn-secondary">社保ブロック追加</button>
            <button onClick={() => addMixedBlock('national')} className="btn-secondary">国保+国年ブロック追加</button>
          </div>
        </Section>
      )}
    </div>
  );

  const OverridesPanel = (
    <div>
      <Section 
        title="前提係数の上書き"
        infoButton={
          <InfoButton onClick={() => {
            setInfoModal({
              isOpen: true,
              title: '前提係数の上書きについて',
              content: (
                <div>
                  <p>各係数を上書きすることが可能です。</p>
                  <ul>
                    <li>シミュレーション用のため、基本的にデフォルト値のままで問題ないです。</li>
                    <li>税制制度に詳しい人向けの機能です。</li>
                  </ul>
                </div>
              ),
            });
          }} />
        }
      >
        <Field label="所得税率（限界税率）上書き">
          <InputNumber
            value={input.overrides.incomeTaxRateOverride ?? 0}
            onChange={(v) => updateInput((p) => ({ ...p, overrides: { ...p.overrides, incomeTaxRateOverride: v } }))}
          />
        </Field>
        <Field label="住民税所得割率 上書き">
          <InputNumber
            value={input.overrides.residentIncomeRateOverride ?? 0}
            onChange={(v) => updateInput((p) => ({ ...p, overrides: { ...p.overrides, residentIncomeRateOverride: v } }))}
          />
        </Field>
        <Field label="株式分離税率 上書き">
          <InputNumber
            value={input.overrides.separateTaxRateOverride ?? 0}
            onChange={(v) => updateInput((p) => ({ ...p, overrides: { ...p.overrides, separateTaxRateOverride: v } }))}
          />
        </Field>
      </Section>
    </div>
  );

  const ComparisonPanel = (
    <div>
      <Section 
        title="仲介サイト比較入力"
        infoButton={
          <InfoButton onClick={() => {
            setInfoModal({
              isOpen: true,
              title: '仲介サイト比較入力について',
              content: (
                <div>
                  <p>ふるなびや楽天ふるさと納税などのシュミレーター結果を入力すると、結果欄で算出結果と比較サイトと安いほうの金額を表示することができます</p>
                </div>
              ),
            });
          }} />
        }
      >
        {input.comparisonSites.map((s) => (
          <div key={s.id} className="comparison-site-item">
            <Field label="名称">
              <input
                type="text"
                className="input"
                value={s.name}
                onChange={(e) =>
                  updateInput((p) => ({
                    ...p,
                    comparisonSites: p.comparisonSites.map((it) => (it.id === s.id ? { ...it, name: e.target.value } : it)),
                  }))
                }
                placeholder="例: サイトA"
              />
            </Field>
            <Field label="上限額">
              <InputNumber
                value={s.amount}
                onChange={(v) =>
                  updateInput((p) => ({
                    ...p,
                    comparisonSites: p.comparisonSites.map((it) => (it.id === s.id ? { ...it, amount: v } : it)),
                  }))
                }
              />
            </Field>
          </div>
        ))}
        <button onClick={addComparison} className="btn-secondary">比較行を追加</button>
      </Section>
    </div>
  );

  const ResultPanel = (
    <div>
      {!output ? (
        <div className="error-message">{errorMsg || '計算できませんでした。入力を確認してください。'}</div>
      ) : (
        <>
          <Section title="計算結果サマリー">
            <div className="summary">
              <div className="summary-item">
                <span className="summary-label">所得税（合計）</span>
                <span className="summary-value">{formatYen(output.summary.incomeTaxGeneral)}</span>
              </div>
              <div className="summary-item">
                <span className="summary-label">住民税（合計）</span>
                <span className="summary-value">{formatYen(output.summary.residentTaxTotal)}</span>
              </div>
              <div className="summary-item">
                <span className="summary-label">社会保険料控除</span>
                <span className="summary-value">{formatYen(output.summary.socialInsuranceDeduction)}</span>
              </div>
              <div className="summary-item">
                <span className="summary-label">ふるさと寄付上限（計算結果）</span>
                <span className="summary-value">{formatYen(output.summary.furusatoDonationLimit)}</span>
              </div>
              <div className="summary-item">
                <span className="summary-label">ふるさと寄付上限（比較後）</span>
                <span className="summary-value">{formatYen(output.summary.adoptedLimit)}</span>
              </div>
            </div>
          </Section>

          <Section title="計算過程">
            <div className="calc-process-controls">
              <button 
                onClick={() => {
                  const sections = document.querySelectorAll('.calc-process-section');
                  sections.forEach((s) => {
                    const details = s as HTMLDetailsElement;
                    details.open = true;
                  });
                }}
                className="btn-small"
              >
                すべて開く
              </button>
              <button 
                onClick={() => {
                  const sections = document.querySelectorAll('.calc-process-section');
                  sections.forEach((s) => {
                    const details = s as HTMLDetailsElement;
                    details.open = false;
                  });
                }}
                className="btn-small"
              >
                すべて閉じる
              </button>
            </div>
            {Array.from(
              output.calcLines.reduce<Map<string, CalcLine[]>>((map, line) => {
                const arr = map.get(line.section) ?? [];
                arr.push(line);
                map.set(line.section, arr);
                return map;
              }, new Map()),
            ).map(([section, rows]) => {
              const sectionNames: Record<string, string> = {
                'income.salary': '給与所得',
                'income.business': '事業所得',
                'income.stocks': '株式等',
                'income.stock.general': '株式収入',
                'income.general': '総所得',
                'insurance.si': '社会保険料',
                'insurance.nhi': '国民健康保険料',
                'insurance.np': '国民年金',
                'deduction': '各種控除',
                'taxable': '課税所得',
                'tax.income': '所得税',
                'tax.resident': '住民税',
                'tax.separate': '分離課税',
                'furusato': 'ふるさと納税',
                'furusato.limit': 'ふるさと納税限度額',
                'furusato.breakdown': 'ふるさと納税限度額内訳',
                'diff': '国保法定軽減想定差分',
              };
              return (
                <details key={section} className="accordion calc-process-section" style={{ marginBottom: 8 }}>
                  <summary>{sectionNames[section] || section}</summary>
                  <div className="accordion-content">{rows.map((r) => <CalcLineCard key={r.id} line={r} />)}</div>
                </details>
              );
            })}
          </Section>
        </>
      )}
    </div>
  );

  return (
    <>
    <div className="app-wrapper">
      <header className="app-header">
        <div className="header-content">
          <div className="header-update-info">
            <span>最終更新日: 2025-12-19</span>
            <span>対応年度: {Math.max(...supportedYears)}年度まで</span>
          </div>
          <h1 className="title">納税金額シミュレーター</h1>
          <p className="description">
            本ツールは概算・比較用途です。最終的な税額・控除額は確定申告/自治体の決定に依存します。ふるさと納税は本ツールと仲介サイトの“低い方”を採用してください。
          </p>
          <div className="button-group">
            <div className="button-group-main">
              <button onClick={handleCalculate} className="btn-primary">
                入力内容で計算する
              </button>
              <button onClick={handleSave} className="btn-secondary" disabled={!output}>
                結果を保存
              </button>
              <button 
                className="btn-mobile-menu"
                onClick={() => setShowMobileMenu(!showMobileMenu)}
                aria-label="メニュー"
              >
                <span className="hamburger-icon">☰</span>
              </button>
            </div>
            <div className={`mobile-menu ${showMobileMenu ? 'open' : ''}`}>
              <button onClick={handleExpandAll} className="btn-log" title="すべてのセクションを開く">
                すべて開く
              </button>
              <button onClick={handleCollapseAll} className="btn-log" title="すべてのセクションを閉じる">
                すべて閉じる
              </button>
              <button 
                onClick={() => logger.downloadErrorLog()} 
                className="btn-log"
                disabled={logger.getErrorLogCount() === 0}
                title={`エラーログ: ${logger.getErrorLogCount()}件`}
              >
                エラーログDL
              </button>
              <button 
                onClick={() => logger.downloadExecutionLog()} 
                className="btn-log"
                disabled={logger.getExecutionLogCount() === 0}
                title={`実行ログ: ${logger.getExecutionLogCount()}件`}
              >
                実行ログDL
              </button>
              <button onClick={() => setShowHelpModal(true)} className="btn-help" title="使い方を表示">
                使い方
              </button>
            </div>
            <div className="desktop-menu">
              <button onClick={handleExpandAll} className="btn-log" title="すべてのセクションを開く">
                すべて開く
              </button>
              <button onClick={handleCollapseAll} className="btn-log" title="すべてのセクションを閉じる">
                すべて閉じる
              </button>
              <button 
                onClick={() => logger.downloadErrorLog()} 
                className="btn-log"
                disabled={logger.getErrorLogCount() === 0}
                title={`エラーログ: ${logger.getErrorLogCount()}件`}
              >
                エラーログDL
              </button>
              <button 
                onClick={() => logger.downloadExecutionLog()} 
                className="btn-log"
                disabled={logger.getExecutionLogCount() === 0}
                title={`実行ログ: ${logger.getExecutionLogCount()}件`}
              >
                実行ログDL
              </button>
              <button onClick={() => setShowHelpModal(true)} className="btn-help" title="使い方を表示">
                使い方
              </button>
            </div>
          </div>
        </div>
        {(validation.errors.length > 0 || validation.warnings.length > 0) && (
          <div className="header-content" style={{ padding: '12px 16px', borderTop: '1px solid #e5e7eb' }}>
            {validation.errors.length > 0 && (
              <div className="validation-errors" style={{ marginBottom: validation.warnings.length > 0 ? 8 : 0 }}>
                {validation.errors.map((e) => (
                  <div key={e.field}>・{e.message}</div>
                ))}
              </div>
            )}
            {validation.warnings.length > 0 && (
              <div className="validation-warnings">
                {validation.warnings.map((w) => (
                  <div key={w.field}>▲ {w.message}</div>
                ))}
              </div>
            )}
          </div>
        )}
      </header>
      <main className="app-main">
        <div className="container">

      <details open={openSection.year} onToggle={(e) => handleDetailsToggle('year', e)} className="accordion" data-section="year">
        <summary>年度・保存</summary>
        <div className="accordion-content">{YearPanel}</div>
      </details>
      <details open={openSection.income} onToggle={(e) => handleDetailsToggle('income', e)} className="accordion">
        <summary>収入</summary>
        <div className="accordion-content">{IncomePanel}</div>
      </details>
      <details open={openSection.deductions} onToggle={(e) => handleDetailsToggle('deductions', e)} className="accordion">
        <summary>控除</summary>
        <div className="accordion-content">{DeductionsPanel}</div>
      </details>
      <details open={openSection.insurance} onToggle={(e) => handleDetailsToggle('insurance', e)} className="accordion">
        <summary>保険</summary>
        <div className="accordion-content">{InsurancePanel}</div>
      </details>
      <details open={openSection.overrides} onToggle={(e) => handleDetailsToggle('overrides', e)} className="accordion">
        <summary>係数</summary>
        <div className="accordion-content">{OverridesPanel}</div>
      </details>
      <details open={openSection.comparison} onToggle={(e) => handleDetailsToggle('comparison', e)} className="accordion">
        <summary>仲介サイト比較入力</summary>
        <div className="accordion-content">{ComparisonPanel}</div>
      </details>
      <details open={openSection.result} onToggle={(e) => handleDetailsToggle('result', e)} className="accordion" data-section="result">
        <summary>結果</summary>
        <div className="accordion-content">{ResultPanel}</div>
      </details>
        </div>
      </main>
      <footer className="app-footer">
        <p>Copyright © 2025 Naoya Aramaki All rights reserved.</p>
      </footer>

      {/* 使い方モーダル */}
      {showHelpModal && (
        <div className="modal-overlay" onClick={() => setShowHelpModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>使い方</h2>
              <button className="modal-close" onClick={() => setShowHelpModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="help-pages">
                {helpPage === 1 && (
                  <div className="help-page">
                    <h3>ページ1: 基本操作</h3>
                    <p>このツールは、納税金額をシミュレーションするためのものです。</p>
                    <ul>
                      <li>各セクションのアコーディオンメニューから必要な情報を入力してください</li>
                      <li>「入力内容で計算する」ボタンを押すと、計算結果が表示されます</li>
                      <li>計算結果は「結果を保存」ボタンで保存できます</li>
                      <li>保存したデータは「年度・保存」セクションから読み込めます</li>
                    </ul>
                  </div>
                )}
                {helpPage === 2 && (
                  <div className="help-page">
                    <h3>ページ2: 入力項目について</h3>
                    <ul>
                      <li><strong>給与収入</strong>: 複数の給与支払先がある場合は、それぞれ追加して入力してください</li>
                      <li><strong>事業所得</strong>: 売上と経費を入力してください。青色申告の場合は、青色申告特別控除も選択できます</li>
                      <li><strong>保険</strong>: 社会保険のみ、国保+国年のみ、または複合モードを選択できます</li>
                      <li><strong>控除</strong>: 各種控除を入力してください。</li>
                    </ul>
                  </div>
                )}
                {helpPage === 3 && (
                  <div className="help-page">
                    <h3>ページ3: 計算結果について</h3>
                    <ul>
                      <li>計算結果は「結果」セクションに表示されます</li>
                      <li>「計算過程」では、各計算ステップの詳細を確認できます</li>
                      <li>ふるさと納税の上限額は、本ツールと仲介サイトの「低い方」を採用してください</li>
                      <li>計算結果はあくまで概算です。最終的な税額は確定申告や自治体の決定に依存します</li>
                    </ul>
                  </div>
                )}
              </div>
              <div className="modal-pagination">
                <button 
                  className="btn-small" 
                  onClick={() => setHelpPage(Math.max(1, helpPage - 1))}
                  disabled={helpPage === 1}
                >
                  前へ
                </button>
                <span>ページ {helpPage} / 3</span>
                <button 
                  className="btn-small" 
                  onClick={() => setHelpPage(Math.min(3, helpPage + 1))}
                  disabled={helpPage === 3}
                >
                  次へ
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
    <InfoModal
      isOpen={infoModal.isOpen}
      onClose={() => setInfoModal({ isOpen: false, title: '', content: null })}
      title={infoModal.title}
    >
      {infoModal.content}
    </InfoModal>
    </>
  );
};

export default App;

