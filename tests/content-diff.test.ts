import { describe, expect, it, vi } from 'vitest';
import { applyPatch, type StructuredPatch } from 'diff';
import { contentDiff, DIFF_PREVIEW_LIMITS, type ContentDiff } from '../src/lib/content-diff';
import { emptyContent } from '../src/lib/defaults';

const diff = (before: string, after: string) =>
  contentDiff({ ...emptyContent, body: before }, { ...emptyContent, body: after }).body;
const rows = (body: ContentDiff['body']) => body.hunks.flatMap((hunk) => hunk.lines);
const changedRows = (body: ContentDiff['body']) =>
  rows(body).filter((line) => ['add', 'remove'].includes(line.kind));

// 以標準 patch 套用結果反向核對適配後的行號、順序及 EOF 註記
function applyResult(before: string, body: ContentDiff['body']) {
  const patch: StructuredPatch = {
    oldFileName: 'previous.md',
    newFileName: 'current.md',
    oldHeader: '',
    newHeader: '',
    hunks: body.hunks.map((hunk) => ({
      ...hunk,
      oldStart: hunk.oldLines ? hunk.oldStart : hunk.oldStart + 1,
      newStart: hunk.newLines ? hunk.newStart : hunk.newStart + 1,
      lines: hunk.lines.map(
        (line) => `${{ add: '+', remove: '-', context: ' ', note: '\\ ' }[line.kind]}${line.text}`,
      ),
    })),
  };
  return applyPatch(before, patch, { autoConvertLineEndings: false });
}

describe('正文 Git 統一差異', () => {
  it('設定欄位的系統空值與作者輸入同名字串可分辨，避免翻譯原文', () => {
    const result = contentDiff(
      { ...emptyContent, excerpt: '', tags: [] },
      { ...emptyContent, excerpt: '(empty)', tags: ['(empty)'] },
    );
    expect(result.metadata).toEqual([
      {
        label: 'Summary',
        before: '(empty)',
        after: '(empty)',
        beforeEmpty: true,
        afterEmpty: false,
      },
      { label: 'Tags', before: '(empty)', after: '(empty)', beforeEmpty: true, afterEmpty: false },
    ]);
  });
  it('分散兩處變更形成獨立區塊，各自只保留前後三行且計數不包含中間內容', () => {
    const before = Array.from({ length: 30 }, (_, index) => `原文第 ${index + 1} 行`);
    const after = [...before];
    after[4] = '第一處更新';
    after[24] = '第二處更新';
    const result = diff(before.join('\n') + '\n', after.join('\n') + '\n');
    expect(result).toMatchObject({
      changed: true,
      status: 'complete',
      removedCount: 2,
      addedCount: 2,
      totalHunks: 2,
      oldLineCount: 30,
      newLineCount: 30,
      truncated: false,
    });
    expect(
      result.hunks.map(({ oldStart, oldLines, newStart, newLines }) => ({
        oldStart,
        oldLines,
        newStart,
        newLines,
      })),
    ).toEqual([
      { oldStart: 2, oldLines: 7, newStart: 2, newLines: 7 },
      { oldStart: 22, oldLines: 7, newStart: 22, newLines: 7 },
    ]);
    expect(changedRows(result)).toEqual([
      { kind: 'remove', text: before[4], oldNumber: 5, newNumber: null },
      { kind: 'add', text: after[4], oldNumber: null, newNumber: 5 },
      { kind: 'remove', text: before[24], oldNumber: 25, newNumber: null },
      { kind: 'add', text: after[24], oldNumber: null, newNumber: 25 },
    ]);
    expect(rows(result).some((line) => line.text === '原文第 15 行')).toBe(false);
    expect(applyResult(before.join('\n') + '\n', result)).toBe(after.join('\n') + '\n');
  });

  it.each([
    ['首端插入', '甲\n乙\n', '新\n甲\n乙\n', 0, 1],
    ['尾端插入', '甲\n乙\n', '甲\n乙\n新\n', 0, 1],
    ['首端刪除', '新\n甲\n乙\n', '甲\n乙\n', 1, 0],
    ['尾端刪除', '甲\n乙\n新\n', '甲\n乙\n', 1, 0],
    ['空文新增', '', '新\n', 0, 1],
    ['全文清除', '原\n', '', 1, 0],
    ['插入空白行', '甲\n乙\n', '甲\n\n乙\n', 0, 1],
    ['行尾空白', '甲\n乙\n', '甲 \n乙\n', 1, 1],
    ['縮排變更', '甲\n\t乙\n', '甲\n 乙\n', 1, 1],
    ['重複行中新增', '重複\n重複\n重複\n', '重複\n新\n重複\n重複\n', 0, 1],
    ['重複行中刪除', '重複\n新\n重複\n重複\n', '重複\n重複\n重複\n', 1, 0],
  ])('%s 保留精確行號與內容', (_label, before, after, removed, added) => {
    const result = diff(before as string, after as string);
    expect(result).toMatchObject({ status: 'complete', removedCount: removed, addedCount: added });
    expect(applyResult(before as string, result)).toBe(after);
    const previous = (before as string).split('\n');
    const current = (after as string).split('\n');
    for (const line of rows(result)) {
      if (line.oldNumber !== null) expect(line.text).toBe(previous[line.oldNumber - 1]);
      if (line.newNumber !== null) expect(line.text).toBe(current[line.newNumber - 1]);
    }
  });

  it('首次發布與清空正文使用 Git 的零長度範圍，不製造第零行內容', () => {
    const added = contentDiff(null, { ...emptyContent, body: '新文\n' }).body;
    expect(added.hunks[0]).toMatchObject({ oldStart: 0, oldLines: 0, newStart: 1, newLines: 1 });
    expect(added.hunks[0].lines).toEqual([
      { kind: 'add', text: '新文', oldNumber: null, newNumber: 1 },
    ]);
    expect(diff('舊文\n', '').hunks[0]).toMatchObject({
      oldStart: 1,
      oldLines: 1,
      newStart: 0,
      newLines: 0,
    });
  });

  it.each([
    ['文字', '文字\n'],
    ['文字\n', '文字'],
    ['', '文字'],
    ['文字', ''],
    ['甲\n舊\n尾', '甲\n新\n尾'],
    ['', '\n'],
    ['\n', ''],
  ])('保留 EOF 換行差異：%j → %j', (before, after) => {
    const result = diff(before, after);
    expect(result.status).toBe('complete');
    expect(result.changed).toBe(true);
    expect(applyResult(before, result)).toBe(after);
    if (before.endsWith('\n') !== after.endsWith('\n') && before && after) {
      expect(rows(result).filter((line) => line.kind === 'note')).toEqual([
        { kind: 'note', text: 'No newline at end of file', oldNumber: null, newNumber: null },
      ]);
    }
    expect(result.oldLineCount).toBe(
      before ? before.split('\n').length - Number(before.endsWith('\n')) : 0,
    );
    expect(result.newLineCount).toBe(
      after ? after.split('\n').length - Number(after.endsWith('\n')) : 0,
    );
  });

  it('CRLF 與 LF 不視為相同，保留可供介面標示的 CR 字元', () => {
    const result = diff('第一行\r\n第二行\r\n', '第一行\n第二行\n');
    expect(result).toMatchObject({ changed: true, removedCount: 2, addedCount: 2 });
    expect(result.removed).toEqual(['第一行\r', '第二行\r']);
    expect(result.added).toEqual(['第一行', '第二行']);
    expect(applyResult('第一行\r\n第二行\r\n', result)).toBe('第一行\n第二行\n');
  });

  it('中文、HTML 與類似 patch 標記保留為原文字串，不編譯或改寫', () => {
    const before = '## 工單流程\n<script>舊內容</script>\n+既有加號\n';
    const after = '## 工單流程\n<img src=x onerror="window.bad=true">\n-新的減號\n';
    const result = diff(before, after);
    expect(result.added).toEqual(['<img src=x onerror="window.bad=true">', '-新的減號']);
    expect(result.removed).toEqual(['<script>舊內容</script>', '+既有加號']);
    expect(applyResult(before, result)).toBe(after);
  });

  it('新增造成後續區塊行號位移時，兩側行號各自累計', () => {
    const before = Array.from({ length: 25 }, (_, index) => `第${index + 1}行`);
    const after = [...before];
    after.splice(2, 0, '插入一', '插入二');
    after[22] = '原第21行更新';
    const result = diff(before.join('\n') + '\n', after.join('\n') + '\n');
    expect(result.hunks).toHaveLength(2);
    expect(result.hunks[1]).toMatchObject({ oldStart: 18, newStart: 20 });
    expect(changedRows(result).slice(-2)).toEqual([
      { kind: 'remove', text: '第21行', oldNumber: 21, newNumber: null },
      { kind: 'add', text: '原第21行更新', oldNumber: null, newNumber: 23 },
    ]);
    expect(applyResult(before.join('\n') + '\n', result)).toBe(after.join('\n') + '\n');
  });

  it('預覽裁切仍保留完整計數、區塊範圍及可見列的原始行號', () => {
    const after =
      Array.from({ length: 600 }, (_, index) => `新增第${index + 1}行`).join('\n') + '\n';
    const result = diff('', after);
    expect(result).toMatchObject({
      status: 'complete',
      addedCount: 600,
      removedCount: 0,
      oldLineCount: 0,
      newLineCount: 600,
      totalHunks: 1,
      truncated: true,
    });
    expect(result.hunks[0]).toMatchObject({ oldStart: 0, oldLines: 0, newStart: 1, newLines: 600 });
    expect(rows(result)).toHaveLength(DIFF_PREVIEW_LIMITS.lines);
    expect(rows(result).at(-1)).toMatchObject({ kind: 'add', text: '新增第400行', newNumber: 400 });
  });

  it('長行只裁切預覽文字，保留 CR 標記且不切斷表情符號', () => {
    const result = diff('', `${'字'.repeat(999)}😀${'字'.repeat(100)}\r\n`);
    expect(result).toMatchObject({
      status: 'complete',
      addedCount: 1,
      removedCount: 0,
      truncated: true,
    });
    expect(result.added).toEqual([`${'字'.repeat(999)}…\r`]);
    expect(result.hunks[0].lines[0].newNumber).toBe(1);
  });

  it('500k 字元單行變更與大篇幅少量修改能完成精確比較', () => {
    const single = diff('甲'.repeat(500000), '乙'.repeat(500000));
    expect(single).toMatchObject({
      status: 'complete',
      removedCount: 1,
      addedCount: 1,
      truncated: true,
    });
    const before = Array.from(
      { length: 10000 },
      (_, index) => `${index.toString().padStart(5, '0')}${'甲'.repeat(44)}\n`,
    ).join('');
    expect(before.length).toBe(500000);
    const after = `${before.slice(0, 200000)}乙${before.slice(200001)}`;
    expect(diff(before, after)).toMatchObject({
      status: 'complete',
      removedCount: 1,
      addedCount: 1,
      totalHunks: 1,
      truncated: false,
    });
  });

  it('相同內容不產生差異，即使超過計算行數上限仍立即回報未變更', () => {
    for (const body of ['', '\n', '相同\n', '甲\n'.repeat(250000)]) {
      expect(diff(body, body)).toMatchObject({
        changed: false,
        status: 'complete',
        removedCount: 0,
        addedCount: 0,
        hunks: [],
        totalHunks: 0,
        truncated: false,
      });
    }
  });

  it('超過文字或行數限制時清楚標記無法計算，不傳回虛構計數', () => {
    for (const [before, after] of [
      ['', '甲'.repeat(500001)],
      ['甲\n'.repeat(250000), '乙'],
    ]) {
      expect(diff(before, after)).toMatchObject({
        changed: true,
        status: 'too-large',
        removedCount: null,
        addedCount: null,
        totalHunks: null,
        hunks: [],
        removed: [],
        added: [],
        truncated: false,
      });
    }
  });

  it('編輯距離過大時明確停止，不把全部文章偽裝為精確替換', () => {
    const before = Array.from({ length: 5000 }, (_, index) => `原始${index}\n`).join('');
    const after = Array.from({ length: 5000 }, (_, index) => `改寫${index}\n`).join('');
    const result = diff(before, after);
    expect(result).toMatchObject({
      changed: true,
      status: 'too-complex',
      removedCount: null,
      addedCount: null,
      hunks: [],
      totalHunks: null,
      truncated: false,
    });
  });

  it('計算逾時時回報無法比較，仍保留中繼資料差異', () => {
    const clock = vi.spyOn(Date, 'now');
    let time = 0;
    clock.mockImplementation(() => (time += 1000));
    try {
      const result = contentDiff(
        { ...emptyContent, body: '舊甲\n舊乙\n' },
        {
          ...emptyContent,
          title: '新標題',
          body: '新甲\n新乙\n',
        },
      );
      expect(result.fields).toEqual(['Title']);
      expect(result.body).toMatchObject({
        changed: true,
        status: 'too-complex',
        removedCount: null,
        addedCount: null,
        hunks: [],
      });
    } finally {
      clock.mockRestore();
    }
  });
});
