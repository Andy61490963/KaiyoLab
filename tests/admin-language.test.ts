import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  adminText,
  normalizeAdminLanguage,
  ADMIN_LANGUAGE_KEY,
  mediaUsageLabel,
} from '../src/lib/admin-language';
import { UI_LANGUAGE_KEY } from '../src/lib/ui-language';

describe('後台語言', () => {
  it('匯入資料的識別碼、日期、額外欄位及根層驗證使用繁中訊息', () => {
    const result = z
      .strictObject({
        id: z.uuid(),
        exportedAt: z.iso.datetime(),
        version: z.literal(1),
        width: z.number().positive(),
      })
      .safeParse({ id: 'wrong', exportedAt: 'wrong', version: 2, width: 0, unknown: true });
    expect(result.success).toBe(false);
    const message = result
      .error!.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    const translated = adminText(message);
    expect(translated).toContain('有效的 UUID');
    expect(translated).toContain('ISO 日期時間');
    expect(translated).toContain('必須大於 0');
    expect(translated).toContain('包含不支援的欄位');
    expect(translated).not.toMatch(/Invalid|Unrecognized|Too small/);
    expect(adminText('sourceOrigin: 來源網域必須是 HTTP 或 HTTPS origin', 'en')).toBe(
      'sourceOrigin: The source origin must be an HTTP or HTTPS origin.',
    );
  });
  it('媒體位置只翻譯伺服器後綴，保留作者標題', () => {
    expect(mediaUsageLabel('Overview (published) (draft / trash)', 'zh-TW')).toBe(
      'Overview (published)（草稿／垃圾桶）',
    );
    expect(mediaUsageLabel('Overview (version history)', 'en')).toBe('Overview (version history)');
    expect(mediaUsageLabel('Site settings / About me', 'zh-TW')).toBe('網站設定／關於我');
  });
  it('首次使用及無效偏好預設繁中，與前台分開儲存', () => {
    expect(normalizeAdminLanguage(null)).toBe('zh-TW');
    expect(normalizeAdminLanguage('fr')).toBe('zh-TW');
    expect(normalizeAdminLanguage('en')).toBe('en');
    expect(ADMIN_LANGUAGE_KEY).not.toBe(UI_LANGUAGE_KEY);
    expect(adminText('Admin')).toBe('管理後台');
    expect(adminText('Admin', 'en')).toBe('Admin');
  });

  it('不把使用者提供的插值或未知內容當作翻譯鍵', () => {
    const value = 'Overview <img> {count} 使用者文字';
    expect(adminText('Unknown {value}', 'zh-TW', { value })).toBe(`Unknown ${value}`);
    expect(adminText('使用者撰寫的段落', 'en')).toBe('使用者撰寫的段落');
  });

  it('已知 API 錯誤可隨語言切換，保留驗證欄位及限制', () => {
    expect(adminText('The email or password is incorrect.')).toBe('電子郵件或密碼不正確');
    expect(adminText('The email or password is incorrect.', 'en')).toBe(
      'The email or password is incorrect.',
    );
    expect(adminText('title: Too small: expected string to have >=1 characters')).toBe(
      '標題：至少需要 1 個字元',
    );
    expect(adminText('設定版本已變更，請先重新載入最新設定', 'en')).toBe(
      'The settings version changed. Reload the latest settings first.',
    );
    expect(adminText('找不到章節錨點：/articles/測試#section-名稱', 'en')).toContain(
      '/articles/測試#section-名稱',
    );
  });
});
