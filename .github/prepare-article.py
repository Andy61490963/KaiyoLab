from pathlib import Path
root=Path.cwd()
def rep(name,old,new):
 p=root/name;s=p.read_text(); assert s.count(old)==1,(name,old[:80],s.count(old));p.write_text(s.replace(old,new))
rep('src/components/public/Icon.astro',"  clock:","  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Zm13 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0',\n  clock:")
rep('src/lib/ui-language.ts',"export const chinese = {",'''export const chinese = {
  'views': '次瀏覽',
  '{count} views': '{count} 次瀏覽',
  'Views unavailable': '暫時無法取得瀏覽次數',
  'Views since this counter was introduced. Repeat visits in the same browser within 30 minutes are usually counted once; this is not a unique-person count.': '自此功能上線後累計；同一瀏覽器 30 分鐘內的重複瀏覽通常只計一次，並非不重複人數。',
'''.rstrip())
rep('src/lib/content.ts',"import { defaultSettings } from './defaults';", "import { defaultSettings } from './defaults';\nimport { publicSiteSettings } from './view-metrics';")
rep('src/lib/content.ts','    ...row?.value,','    ...publicSiteSettings(row?.value),')
rep('src/pages/api/admin/[...path].ts',"import { emptyContent } from '../../../lib/defaults';", "import { emptyContent } from '../../../lib/defaults';\nimport { settingsWithPreservedViews } from '../../../lib/article-views';")
rep('src/pages/api/admin/[...path].ts','.onConflictDoUpdate({ target: settings.id, set: { value } });', '.onConflictDoUpdate({ target: settings.id, set: { value: settingsWithPreservedViews(value) } });')
name='src/pages/articles/[slug].astro'
rep(name,"import Ui from '../../components/public/UiText.astro';", "import '../../styles/article-reading.css';\nimport ArticleViews from '../../components/public/ArticleViews.astro';\nimport Ui from '../../components/public/UiText.astro';")
rep(name,'class="page-shell article-page"','class="page-shell article-page article-reading"')
rep(name,'    <header class="article-heading">', '''    <header class:list={['article-hero', { 'has-cover': Boolean(entry.cover) }]}>
      <div class="article-heading">''')
rep(name,'      <h1 data-original-content translate="no">', '''        <ArticleViews entryId={entry.id} />
      </div>
      <h1 data-original-content translate="no">''')
p=root/name;s=p.read_text();s=s.replace('      </div>\n        <ArticleViews', '        <ArticleViews',1)
s=s.replace('class="article-lead"','class="article-lead" data-original-content translate="no"')
s=s.replace('    </header>\n    {entry.cover', '      </div>\n    {entry.cover',1)
s=s.replace('width="1280" height="720" />', 'width="1280" height="720" fetchpriority="high" decoding="async" />',1)
s=s.replace('    {rendered.toc.length > 0 && (','    </header>\n    {rendered.toc.length > 0 && (',1)
s=s.replace('class="reading-layout"','class:list={["reading-layout", { "without-toc": rendered.toc.length === 0 }]}')
s=s.replace('      <aside class="article-toc">','      {rendered.toc.length > 0 && <aside class="article-toc">')
s=s.replace('      </aside>', '      </aside>}')
s=s.replace('class:list={{ \'toc-sub\': item.depth > 2 }}', 'data-article-toc-link class:list={{ \'toc-sub\': item.depth > 2 }}')
s=s.replace('</PublicLayout>', '''<script>
  import { initializeArticleReading } from '../../scripts/article-reading';
  initializeArticleReading();
</script>
</PublicLayout>''')
p.write_text(s)
