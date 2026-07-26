import type { ValuationCategory } from '../../shared/types';

export interface ValuationIndex {
  code: string;
  name: string;
  category: ValuationCategory;
}

/**
 * A-share indices with a verified CSIndex historical PE series.
 * The Shenzhen Component, ChiNext and SZSE 100 remain outside this universe
 * until a reliable free historical valuation source is available.
 */
export const VALUATION_INDICES: ValuationIndex[] = [
  { code: '000016', name: '上证50', category: 'broad' },
  { code: '000300', name: '沪深300', category: 'broad' },
  { code: '000510', name: '中证A500', category: 'broad' },
  { code: '000852', name: '中证1000', category: 'broad' },
  { code: '000903', name: '中证A100', category: 'broad' },
  { code: '000905', name: '中证500', category: 'broad' },
  { code: '000688', name: '科创50', category: 'broad' },

  { code: '399812', name: '养老产业', category: 'industry' },
  { code: '399975', name: '证券公司', category: 'industry' },
  { code: '000932', name: '主要消费', category: 'industry' },
  { code: '000989', name: '全指可选', category: 'industry' },
  { code: '399989', name: '中证医疗', category: 'industry' },
  { code: '000991', name: '全指医药', category: 'industry' },
  { code: '399986', name: '中证银行', category: 'industry' },
  { code: '000993', name: '全指信息', category: 'industry' },

  { code: 'H30094', name: '消费红利', category: 'theme' },
  { code: '399971', name: '中证传媒', category: 'theme' },
  { code: '399967', name: '中证军工', category: 'theme' },
  { code: '000827', name: '中证环保', category: 'theme' },
  { code: '931187', name: '中证科技100', category: 'theme' },
  { code: '931087', name: '科技龙头', category: 'theme' },

  { code: '950090', name: '上证50AH优选', category: 'strategy' },
  { code: '930782', name: '500行业中性低波', category: 'strategy' },
  { code: '000922', name: '中证红利', category: 'strategy' },
  { code: '000919', name: '沪深300价值', category: 'strategy' },
];

export const VALUATION_INDEX_BY_CODE = new Map(
  VALUATION_INDICES.map((index) => [index.code, index]),
);

export const CSINDEX_VALUATION_INDICES = VALUATION_INDICES;
