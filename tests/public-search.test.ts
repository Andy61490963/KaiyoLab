import { describe, expect, it } from 'vitest';
import { searchTerms } from '../src/lib/public-search';

describe('公開關鍵字搜尋', () => {
  it('空白分詞且去除重複值', () => {
    expect(searchTerms(' MES  併發\nMES\tmes ')).toEqual(['MES', '併發']);
  });
  it('保留英文雙引號與中文引號的片語', () => {
    expect(searchTerms('MES "FOR UPDATE" “樂觀 併發” 「批號 追溯」')).toEqual([
      'MES',
      'FOR UPDATE',
      '樂觀 併發',
      '批號 追溯',
    ]);
    expect(searchTerms('""  "未結束 片語')).toEqual(['未結束 片語']);
  });
  it('不將 SQL、LIKE 萬用字元或單引號解釋成查詢語法', () => {
    expect(searchTerms("100%_ O'Reilly")).toEqual(['100%_', "O'Reilly"]);
    expect(searchTerms('x'.repeat(250))).toEqual(['x'.repeat(200)]);
    expect(searchTerms('   ')).toEqual([]);
  });
});
