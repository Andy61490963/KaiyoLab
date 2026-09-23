from pathlib import Path
root = Path('.')

def edit(path, replacements, add_ui=True):
    p = root / path
    text = p.read_text()
    if add_ui:
        imp = './UiText.astro' if path.startswith('src/components/public/') else ('../components/public/UiText.astro' if path.count('/') == 2 else '../../components/public/UiText.astro')
        if path.startswith('src/layouts/'):
            imp = '../components/public/UiText.astro'
        text = text.replace('---\n', f"---\nimport UiText from '{imp}';\n", 1)
    for old, new in replacements:
        if old not in text:
            raise RuntimeError(f'Missing exact replacement in {path}: {old[:90]}')
        text = text.replace(old, new)
    p.write_text(text)

def ui(en, zh):
    return f'<UiText en="{en}" zh="{zh}" />'

edit('src/pages/index.astro', [
 ('<header class="home-introduction">','<header class="home-introduction">\n      <div class="home-intro-layout">\n        <div class="home-intro-copy">'),
 ('<div class="home-intro-markdown prose" set:html={homeIntro.html} />','<div class="home-intro-markdown prose" data-authored-content translate="no" set:html={homeIntro.html} />'),
 ('More about me <span',ui('More about me','更多關於我')+' <span'),
 ('      {settings.heroImage &&', '''        </div>
        <figure class="home-companion" aria-hidden="true">
          <img src="/images/ragdoll-companion.webp" alt="" width="320" height="320" decoding="async" />
        </figure>
      </div>
      {settings.heroImage &&'''),
 ('>Latest Articles<','>'+ui('Latest Articles','最新文章')+'<'),
 ('>All articles <','>'+ui('All articles','所有文章')+' <'),
 ('>No published articles yet. New writing will appear here.<','>'+ui('No published articles yet. New writing will appear here.','尚無已發布文章，新的筆記會出現在這裡。')+'<'),
 ('>Featured Articles<','>'+ui('Featured Articles','精選文章')+'<'),
 ("{selectedProjects.total ? 'Selected Projects' : 'Projects'}", "{selectedProjects.total ? <UiText en=\"Selected Projects\" zh=\"精選專案\" /> : <UiText en=\"Projects\" zh=\"專案\" />}"),
 ('>All projects <','>'+ui('All projects','所有專案')+' <'),
 ('>No published projects yet. Projects will appear here when they are ready to share.<','>'+ui('No published projects yet. Projects will appear here when they are ready to share.','尚無已發布專案，準備好分享時會出現在這裡。')+'<'),
 ('>Browse by Topic<','>'+ui('Browse by Topic','依主題瀏覽')+'<'),
 ('>Subscribe to new articles via RSS<','>'+ui('Subscribe to new articles via RSS','透過 RSS 訂閱新文章')+'<'),
])

p = root / 'src/layouts/PublicLayout.astro'
s = p.read_text()
start = s.index('      <div class="public-sidebar-bottom">')
end = s.index('    </header>',start)
s = s[:start]+'''      <div class="public-sidebar-bottom">
        <div class="public-socials">
          <a href="https://github.com/Andy61490963" target="_blank" rel="noopener noreferrer">
            GitHub <Icon name="diagonal" size={14} />
            <span class="sr-only"><UiText en="(opens in a new tab)" zh="（於新分頁開啟）" /></span>
          </a>
        </div>
      </div>
'''+s[end:]
p.write_text(s)
edit('src/layouts/PublicLayout.astro', [
 ("import '../styles/public.css';", "import '../styles/public.css';\nimport '../styles/public-enhancements.css';\nimport LanguageToggle from '../components/public/LanguageToggle.astro';"),
 ("{ href: '/', label: 'Home', icon: 'home' }", "{ href: '/', label: 'Home', zh: '首頁', icon: 'home' }"),
 ("{ href: '/articles', label: 'Articles', icon: 'file' }", "{ href: '/articles', label: 'Articles', zh: '文章', icon: 'file' }"),
 ("{ href: '/projects', label: 'Projects', icon: 'code' }", "{ href: '/projects', label: 'Projects', zh: '專案', icon: 'code' }"),
 ("{ href: '/about', label: 'About Me', icon: 'user' }", "{ href: '/about', label: 'About Me', zh: '關於我', icon: 'user' }"),
 ('{item.label}', '<UiText en={item.label} zh={item.zh} />'),
 ('        let saved;', '''        let language = 'en';
        try { if (localStorage.getItem('kaiyo-ui-language') === 'zh-TW') language = 'zh-TW'; } catch {}
        document.documentElement.dataset.uiLanguage = language;
        document.documentElement.lang = language;
        let saved;'''),
 ('>Skip to main content<','>'+ui('Skip to main content','跳至主要內容')+'<'),
 ('<div class="public-actions">', '<div class="public-actions">\n          <LanguageToggle placement="header" />'),
 ('aria-label="Search articles"', 'aria-label="Search articles" data-ui-label="search"'),
 ('aria-label="Mobile navigation"','aria-label="Mobile navigation" data-ui-label="mobileNavigation"'),
 ('aria-label="Main navigation"','aria-label="Main navigation" data-ui-label="mainNavigation"'),
 ("        I'm <a",'        '+ui('I’m','我是')+' <a'),
 ('<div class="public-frame">', '<div class="public-frame">\n      <LanguageToggle placement="corner" />'),
 ('>RSS feed<','>'+ui('RSS feed','RSS 訂閱')+'<'),
 ('>About Me<','>'+ui('About Me','關於我')+'<'),
 ('>Admin<','>'+ui('Admin','管理後台')+'<'),
 ('> (opens in a new tab)<','> '+ui('(opens in a new tab)','（於新分頁開啟）')+'<'),
 ('>Notes, projects, and things learned along the way.<','>'+ui('Notes, projects, and things learned along the way.','筆記、專案，以及一路學到的事。')+'<'),
 ('    <span class="sr-only" id="copy-status"', '    <span class="sr-only" id="language-help" data-ui-message="languageHint">Interface only. Articles and profile content stay in their original language.</span>\n    <span class="sr-only" id="language-status" role="status" aria-live="polite"></span>\n    <span class="sr-only" id="copy-status"'),
 ('    <script>\n', "    <script>\n      import { currentUiLabel } from '../scripts/public-language';\n"),
 ("themeButton?.setAttribute('aria-label', theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');", "themeButton?.setAttribute('data-ui-label', theme === 'dark' ? 'lightTheme' : 'darkTheme');\n        themeButton?.setAttribute('aria-label', currentUiLabel(theme === 'dark' ? 'lightTheme' : 'darkTheme'));"),
 ("menuButton?.setAttribute('aria-label', menu?.open ? 'Close menu' : 'Open menu');", "menuButton?.setAttribute('data-ui-label', menu?.open ? 'closeMenu' : 'openMenu');\n        menuButton?.setAttribute('aria-label', currentUiLabel(menu?.open ? 'closeMenu' : 'openMenu'));"),
 ("button.textContent = 'Copy';", "button.dataset.uiMessage = 'copy';\n        button.textContent = currentUiLabel('copy');"),
 ("button.setAttribute('aria-label', 'Copy code');", "button.dataset.uiLabel = 'copyCode';\n        button.setAttribute('aria-label', currentUiLabel('copyCode'));"),
 ("button.textContent = 'Copied';", "button.dataset.uiMessage = 'copied';\n            button.textContent = currentUiLabel('copied');"),
 ("if (status) status.textContent = 'Code copied to clipboard.';", "if (status) status.textContent = currentUiLabel('copiedStatus');"),
 ("button.textContent = 'Copy failed';", "button.dataset.uiMessage = 'copyFailed';\n            button.textContent = currentUiLabel('copyFailed');"),
 ("if (status) status.textContent = 'Unable to copy. Select the code and copy it manually.';", "if (status) status.textContent = currentUiLabel('copyFailedStatus');"),
])
edit('src/components/public/EntryCard.astro', [
 ('<span>{readTime} min read</span>','<UiText en={`${readTime} min read`} zh={`閱讀約 ${readTime} 分鐘`} />'),
 ('>Featured<','>'+ui('Featured','精選')+'<'),
 ('aria-label="Article tags"','aria-label="Article tags" data-ui-label="articleTags"'),
])
edit('src/components/public/ProjectCard.astro', [
 ('      Details\n', '      '+ui('Details','詳細內容')+'\n'),
 ('        Demo<span','        '+ui('Demo','展示')+'<span'),
 ('        Source<span','        '+ui('Source','原始碼')+'<span'),
 ('aria-label="Technologies used"','aria-label="Technologies used" data-ui-label="technologies"'),
 ('aria-label={`${entry.title}: details`}', 'title={entry.title}'),
 ('aria-label={`${entry.title}: live demo (opens in a new tab)`}', 'title={entry.title}'),
 ('aria-label={`${entry.title}: source code (opens in a new tab)`}', 'title={entry.title}'),
 ('</span>\n      </a>', '</span><span class="sr-only"><UiText en="(opens in a new tab)" zh="（於新分頁開啟）" /></span>\n      </a>'),
])
edit('src/components/public/Pagination.astro', [
 ('aria-label="Content pagination"','aria-label="Content pagination" data-ui-label="pagination"'),
 ('aria-label="Previous page"','aria-label="Previous page" data-ui-label="previousPage"'),
 ('aria-label="Next page"','aria-label="Next page" data-ui-label="nextPage"'),
], False)
edit('src/pages/about.astro', [
 ('>About Me</h1>','>'+ui('About Me','關於我')+'</h1>'),
 ('class="about-markdown prose"','class="about-markdown prose" data-authored-content translate="no"'),
])
edit('src/pages/articles/index.astro', [
 ('<h1>Articles</h1>','<h1>'+ui('Articles','文章')+'</h1>'),
 ('<p>Development notes, practical guides, and things worth documenting.</p>','<p>'+ui('Development notes, practical guides, and things worth documenting.','開發筆記、實作指南，以及值得記錄的事。')+'</p>'),
 ('>Categories<','>'+ui('Categories','分類')+'<'),
 ('>Tags<','>'+ui('Tags','標籤')+'<'),
 ('>All categories<','>'+ui('All categories','所有分類')+'<'),
 ('>Clear tag<','>'+ui('Clear tag','清除標籤')+'<'),
 ('>Search articles<','>'+ui('Search articles','搜尋文章')+'<'),
 ('placeholder="Search titles or content…"', 'placeholder="Search titles or content…" data-ui-placeholder="searchPlaceholder"'),
 ('>Search <','>'+ui('Search','搜尋')+' <'),
 ('>Clear filters <','>'+ui('Clear filters','清除篩選')+' <'),
 ('>Newest first<','>'+ui('Newest first','最新優先')+'<'),
 ('aria-label="Article categories"','aria-label="Article categories" data-ui-label="categories"'),
 ('<span>{result.total} {result.total === 1 ? \'article\' : \'articles\'}{q && ` matching “${q}”`}{category && ` in ${category}`}{tag && ` tagged #${tag}`}</span>', '<span><UiText en={`${result.total} ${result.total === 1 ? "article" : "articles"}${q ? ` matching “${q}”` : ""}${category ? ` in ${category}` : ""}${tag ? ` tagged #${tag}` : ""}`} zh={`共 ${result.total} 篇文章${q ? `，關鍵字「${q}」` : ""}${category ? `，分類：${category}` : ""}${tag ? `，標籤：#${tag}` : ""}`} /></span>'),
 ("<EmptyState title={q || tag || category ? 'No matching articles' : 'No published articles yet'} description={q || tag || category ? 'Try another keyword or clear the category and tag filters.' : 'Published articles will appear here.'} />", "<EmptyState title={q || tag || category ? 'No matching articles' : 'No published articles yet'} titleZh={q || tag || category ? '沒有符合條件的文章' : '尚無已發布文章'} description={q || tag || category ? 'Try another keyword or clear the category and tag filters.' : 'Published articles will appear here.'} descriptionZh={q || tag || category ? '請嘗試其他關鍵字，或清除分類與標籤篩選。' : '已發布的文章會出現在這裡。'} />"),
])
edit('src/components/public/EmptyState.astro', [
 ('  description?: string;', '  description?: string;\n  titleZh?: string;\n  descriptionZh?: string;'),
 ("  icon = 'file',", "  icon = 'file',\n  titleZh = title,\n  descriptionZh = description,"),
 ('<h3>{title}</h3>','<h3><UiText en={title} zh={titleZh} /></h3>'),
 ('<p>{description}</p>','<p><UiText en={description} zh={descriptionZh} /></p>'),
])
edit('src/pages/projects/index.astro', [
 ('        Projects\n','        '+ui('Projects','專案')+'\n'),
 ('>Selected projects and open-source work, with details and related links.<','>'+ui('Selected projects and open-source work, with details and related links.','個人專案與開源作品，以及相關介紹和連結。')+'<'),
 ('aria-label="Project list"','aria-label="Project list" data-ui-label="projectList"'),
 ('title="No published projects yet"', 'title="No published projects yet" titleZh="尚無已發布專案"'),
 ('description="Published projects and links will appear here."','description="Published projects and links will appear here." descriptionZh="已發布的專案與連結會出現在這裡。"'),
])
edit('src/pages/articles/[slug].astro', [
 ('/> Back to articles','/> '+ui('Back to articles','返回文章列表')),
 ('<span>{rendered.readingMinutes} min read</span>','<UiText en={`${rendered.readingMinutes} min read`} zh={`閱讀約 ${rendered.readingMinutes} 分鐘`} />'),
 ('>Table of contents<','>'+ui('Table of contents','目錄')+'<'),
 ('class="prose" set:html={rendered.html}', 'class="prose" data-authored-content translate="no" set:html={rendered.html}'),
 ('            Subscribe to new articles <','            '+ui('Subscribe to new articles','訂閱新文章')+' <'),
 ('>A short read without section headings.<','>'+ui('A short read without section headings.','這篇短文沒有章節標題。')+'<'),
 ('            Back to top ↑','            '+ui('Back to top','回到頂端')+' ↑'),
 ('>KEEP EXPLORING<','>'+ui('KEEP EXPLORING','繼續探索')+'<'),
 ('>ON THIS PAGE<','>'+ui('ON THIS PAGE','本頁內容')+'<'),
 ('            You might also like<span','            '+ui('You might also like','延伸閱讀')+'<span'),
 ('          All articles <','          '+ui('All articles','所有文章')+' <'),
 ('aria-label="Mobile article table of contents"','aria-label="Mobile article table of contents" data-ui-label="mobileToc"'),
 ('aria-label="Article table of contents"','aria-label="Article table of contents" data-ui-label="articleToc"'),
])
edit('src/pages/projects/[slug].astro', [
 ('/> Back to projects','/> '+ui('Back to projects','返回專案列表')),
 ('>A PROJECT BY {settings.authorName || settings.siteName}<','><UiText en="A PROJECT BY" zh="專案作者" /> {settings.authorName || settings.siteName}<'),
 ('            Open demo <','            '+ui('Open demo','開啟展示')+' <'),
 ('/> Source code <','/> '+ui('Source code','原始碼')+' <'),
 ('>Project details<','>'+ui('Project details','專案資訊')+'<'),
 ('>Published<','>'+ui('Published','發布日期')+'<'),
 ('>Last updated<','>'+ui('Last updated','最後更新')+'<'),
 ('>Category<','>'+ui('Category','分類')+'<'),
 ('aria-label="Project table of contents"','aria-label="Project table of contents" data-ui-label="projectToc"'),
 ('class="prose" set:html={rendered.html}', 'class="prose" data-authored-content translate="no" set:html={rendered.html}'),
])
edit('src/components/public/ErrorView.astro', [
 ('<h1 id="error-title">{title}</h1>', '<h1 id="error-title"><UiText en={title} zh={code === "404" ? "找不到頁面" : "暫時無法使用"} /></h1>'),
 ('<p>{description}</p>', '<p><UiText en={description} zh={code === "404" ? "請檢查網址，或回到首頁瀏覽文章與專案。" : "請稍後重新整理頁面；若問題持續發生，請聯絡站長。"} /></p>'),
 ('      Back to home <', '      '+ui('Back to home','回到首頁')+' <'),
 ('      Browse articles <', '      '+ui('Browse articles','瀏覽文章')+' <'),
])
