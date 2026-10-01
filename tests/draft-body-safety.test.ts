import { describe, expect, it } from 'vitest';
import { emptyContent } from '../src/lib/defaults';
import { needsBodyClearConfirmation, recoverPublishedBody } from '../src/lib/draft-body-safety';

 describe('draft body safety', () => {
  it.each(['', ' ', '\n\r\t', '\u3000'])('requires confirmation before clearing to %j', (body) => {
    expect(needsBodyClearConfirmation('# Existing body', body)).toBe(true);
  });
  it.each([
    ['', ''],
    ['\n', ' '],
    ['', '# New draft'],
    ['old', 'new'],
    ['old', '  new  '],
  ])('does not block normal draft changes (%j -> %j)', (previous, next) => {
    expect(needsBodyClearConfirmation(previous, next)).toBe(false);
  });
  it('recovers only the exact published body and preserves newer draft fields', () => {
    const draft = {
      ...emptyContent,
      title: 'Current draft title',
      slug: 'guid',
      tags: ['冪等', 'Backend'],
      body: '',
      excerpt: 'New summary',
      category: 'Backend',
      series: 'New series',
      seriesOrder: 2,
      coverPosition: { x: 30, y: 70 },
    };
    const published = {
      ...emptyContent,
      title: 'Old title',
      slug: 'untitled-example',
      tags: [],
      body: '# GUID\r\n\n```mermaid\nA-->B\n```\n',
    };
    const before = structuredClone({ draft, published });
    const result = recoverPublishedBody(draft, published);
    expect(result).toEqual({ ...draft, body: published.body });
    expect(result).not.toBe(draft);
    expect({ draft, published }).toEqual(before);
  });
  it('does not replace a non-empty draft', () => {
    expect(
      recoverPublishedBody({ ...emptyContent, body: 'New work' }, { ...emptyContent, body: 'Old' }),
    ).toBeNull();
  });
  it.each([null, { ...emptyContent, body: '' }, { ...emptyContent, body: ' \n' }])(
    'does not fabricate a recovery without a published body',
    (published) => {
      expect(recoverPublishedBody({ ...emptyContent }, published)).toBeNull();
    },
  );
  it('can recover a whitespace-only draft', () => {
    expect(
      recoverPublishedBody({ ...emptyContent, body: '\n ' }, { ...emptyContent, body: 'Saved' })?.body,
    ).toBe('Saved');
  });
});
