import { bodyClearConfirmationMessage } from './draft-body-safety';

export const draftBodyMessages: Record<string, string> = {
  [bodyClearConfirmationMessage]: '正文已清空，自動儲存已暫停，請按「儲存草稿」並確認後再儲存空白正文',
  'Save an empty draft body? The previous body will be kept in version history. The public version will not change.':
    '確定儲存空白正文嗎？清空前的正文會保留在版本紀錄，公開版本不會變更',
  'Saved draft body is empty': '已儲存的草稿正文為空',
  'The published version still has a body. Restore only that body while keeping your current title, slug, tags and other draft settings. This does not publish changes.':
    '公開版本仍有正文，可只還原正文，保留目前的標題、網址代稱、標籤與其他草稿設定，不會發布更新',
  'Restore published body': '從公開版本還原正文',
  'Published body restored to the draft. Draft settings and the public version have not changed.':
    '公開正文已還原至草稿，草稿設定與公開版本維持不變',
  'Keep saved body': '保留已儲存正文',
  'The draft already has a body. Reload before restoring.':
    '草稿已經有正文，請重新載入確認，不會覆蓋目前內容',
  'There is no published body to restore. Use version history.':
    '沒有可還原的公開正文，請查看版本紀錄',
  'The server did not return a valid draft body. Editing has been stopped to protect your content.':
    '伺服器未回傳有效的草稿正文，已停止編輯以保護內容',
};
