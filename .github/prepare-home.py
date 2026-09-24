from pathlib import Path
import re
root=Path.cwd()
def write(name,text):
 p=root/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(text,encoding='utf-8')
def replace(name,old,new,count=None):
 p=root/name;s=p.read_text();n=s.count(old)
 if not n or (count is not None and n != count): raise RuntimeError(f'{name}: expected {count or "at least one"} matches, found {n}: {old[:90]!r}')
 p.write_text(s.replace(old,new),encoding='utf-8')
def add_ui(name,path):
 p=root/name;s=p.read_text();assert s.startswith('---\n');p.write_text(s.replace('---\n',f"---\nimport Ui from '{path}/UiText.astro';\n",1))

layout='src/layouts/PublicLayout.astro'
add_ui(layout,'../components/public')
replace(layout,"import '../styles/public.css';", "import '../styles/public.css';\nimport '../styles/home-refinements.css';\nimport LanguageToggle from '../components/public/LanguageToggle.astro';\nimport { uiLabel, uiText, type UiKey } from '../lib/ui-language';")
replace(layout,'  title?: string;','  title?: string;\n  titleKey?: UiKey;')
replace(layout,'const { settings, title, description', 'const { settings, title, titleKey, description')
replace(layout,"const siteUrl = settings.siteUrl", "const titleZh = titleKey ? `${uiText(titleKey, 'zh-TW')} · ${settings.siteName}` : undefined;\nconst siteUrl = settings.siteUrl")
replace(layout,"{ href: '/about', label: 'About Me', icon: 'user' },\n];", "{ href: '/about', label: 'About Me', icon: 'user' },\n] as const;")
replace(layout,'<title>{pageTitle}</title>', '<title data-ui-title-en={titleKey ? pageTitle : undefined} data-ui-title-zh={titleZh}>{pageTitle}</title>')
replace(layout,'        let saved;\n', "        let saved;\n        let language = 'en';\n        try { language = localStorage.getItem('kaiyo-ui-language') === 'zh-TW' ? 'zh-TW' : 'en'; } catch {}\n        document.documentElement.dataset.uiLanguage = language;\n        document.documentElement.lang = language;\n")
for text in ['Skip to main content','RSS feed','About Me','Admin','Notes, projects, and things learned along the way.',' (opens in a new tab)']:
 replace(layout,f'>{text}<',f'><Ui text="{text}" /><')
replace(layout,'aria-label={`${settings.siteName} home`}',"{...uiLabel('{name} home', { name: settings.siteName })}")
for text in ['Search articles','Toggle color theme','Open menu','Mobile navigation','Main navigation']:
 replace(layout,f'aria-label="{text}"',f"{{...uiLabel('{text}')}}")
replace(layout,'</button>\n          <details','</button>\n          <LanguageToggle />\n          <details',1)
replace(layout,'{item.label}', '<Ui text={item.label} />')
replace(layout,"        I'm <a", '        <Ui text="I\'m" /> <a')
replace(layout,'<span>{settings.bio', '<span data-original-content translate="no">{settings.bio')
s=(root/layout).read_text();a=s.index('      <div class="public-sidebar-bottom">');b=s.index('\n    </header>',a)
s=s[:a]+'''      <div class="public-sidebar-bottom">
        <div class="public-socials">
          <a href="https://github.com/Andy61490963" target="_blank" rel="noopener noreferrer">
            GitHub<Icon name="diagonal" size={14} /><span class="sr-only"><Ui text=" (opens in a new tab)" /></span>
          </a>
        </div>
      </div>'''+s[b:];(root/layout).write_text(s)
replace(layout,'    <span class="sr-only" id="copy-status"', '    <span class="sr-only" id="language-status" role="status" aria-live="polite"></span>\n    <span class="sr-only" id="copy-status"')
replace(layout,'    <script>\n', "    <script>\n      import { initializeUiLanguage, currentUiText } from '../scripts/public-language';\n      initializeUiLanguage();\n",1)
replace(layout,"theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'", "currentUiText(theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme')")
replace(layout,"menu?.open ? 'Close menu' : 'Open menu'", "currentUiText(menu?.open ? 'Close menu' : 'Open menu')")
replace(layout,'      updateMenu();\n      menu?.addEventListener', "      document.addEventListener('kaiyo:ui-language', () => {\n        applyTheme(root.dataset.theme || 'light');\n        updateMenu();\n        document.querySelectorAll<HTMLButtonElement>('.copy-code').forEach(button => {\n          button.setAttribute('aria-label', currentUiText('Copy code'));\n          button.textContent = currentUiText(button.dataset.copyState === 'copied' ? 'Copied' : button.dataset.copyState === 'failed' ? 'Copy failed' : 'Copy');\n        });\n      });\n      updateMenu();\n      menu?.addEventListener",1)
for text in ['Copy','Copied','Copy failed','Code copied to clipboard.','Unable to copy. Select the code and copy it manually.']:
 replace(layout,f"= '{text}';", f"= currentUiText('{text}');")
replace(layout,"button.setAttribute('aria-label', 'Copy code');", "button.setAttribute('aria-label', currentUiText('Copy code'));")
replace(layout,"button.textContent = currentUiText('Copied');", "button.dataset.copyState = 'copied';\n            button.textContent = currentUiText('Copied');")
replace(layout,"button.textContent = currentUiText('Copy failed');", "button.dataset.copyState = 'failed';\n            button.textContent = currentUiText('Copy failed');")
replace(layout,"reset = setTimeout(() => { button.textContent = currentUiText('Copy'); }, 2000);", "reset = setTimeout(() => { button.dataset.copyState = ''; button.textContent = currentUiText('Copy'); }, 2000);")

home='src/pages/index.astro'
add_ui(home,'../components/public')
replace(home,'    <header class="home-introduction">','    <header class="home-introduction">\n      <div class="home-intro-copy">')
replace(home,'    </header>', '''      </div>
      <figure class="home-mascot" aria-hidden="true">
        <img src="/images/ragdoll-accent.webp" alt="" width="320" height="320" decoding="async" />
      </figure>
    </header>''',1)
replace(home,'class="home-intro-markdown prose"','class="home-intro-markdown prose" data-original-content translate="no"')
replace(home,'>I\'m {settings.authorName || settings.siteName}<','><Ui text="I\'m" /> {settings.authorName || settings.siteName}<')
for text in ['More about me','Latest Articles','All articles','Featured Articles','All projects','Browse by Topic','Subscribe to new articles via RSS','No published articles yet. New writing will appear here.','No published projects yet. Projects will appear here when they are ready to share.']:
 replace(home,f'>{text}',f'><Ui text="{text}" />')
replace(home,"{selectedProjects.total ? 'Selected Projects' : 'Projects'}", "<Ui text={selectedProjects.total ? 'Selected Projects' : 'Projects'} />")

for name in ['src/pages/about.astro','src/pages/articles/[slug].astro','src/pages/projects/[slug].astro']:
 add_ui(name,'../components/public' if name.endswith('/about.astro') else '../../components/public')
 s=(root/name).read_text().replace('class="about-markdown prose"','class="about-markdown prose" data-original-content translate="no"').replace('class="prose" set:html','class="prose" data-original-content translate="no" set:html')
 (root/name).write_text(s)
replace('src/pages/about.astro','title="About Me"','title="About Me" titleKey="About Me"')
replace('src/pages/about.astro','>About Me<','><Ui text="About Me" /><')

articles='src/pages/articles/index.astro'
add_ui(articles,'../../components/public')
replace(articles,"import Icon from '../../components/public/Icon.astro';", "import Icon from '../../components/public/Icon.astro';\nimport { uiLabel, uiPlaceholder } from '../../lib/ui-language';")
replace(articles,'title="Articles"','title="Articles" titleKey="Articles"')
for text in ['Articles','Development notes, practical guides, and things worth documenting.','Categories','All categories','Tags','Clear tag','Search articles','Search','Clear filters','Newest first']:
 replace(articles,f'>{text}',f'><Ui text="{text}" />')
replace(articles,'aria-label="Article categories"',"{...uiLabel('Article categories')}")
replace(articles,'placeholder="Search titles or content…"',"{...uiPlaceholder('Search titles or content…')}")
replace(articles,"{result.total} {result.total === 1 ? 'article' : 'articles'}{q && ` matching “${q}”`}{category && ` in ${category}`}{tag && ` tagged #${tag}`}",'''<Ui text={result.total === 1 ? '{count} article' : '{count} articles'} values={{count: result.total}} />{q && <Ui text=" matching “{query}”" values={{ query: q }} />}{category && <Ui text=" in {category}" values={{category}} />}{tag && <Ui text=" tagged #{tag}" values={{tag}} />}''')

projects='src/pages/projects/index.astro'
add_ui(projects,'../../components/public')
replace(projects,'title="Projects"','title="Projects" titleKey="Projects"')
replace(projects,'        Projects','        <Ui text="Projects" />',1)
replace(projects,'>Selected projects and open-source work, with details and related links.<','><Ui text="Selected projects and open-source work, with details and related links." /><')
replace(projects,"import Icon from '../../components/public/Icon.astro';", "import Icon from '../../components/public/Icon.astro';\nimport { uiLabel } from '../../lib/ui-language';")
replace(projects,'aria-label="Project list"',"{...uiLabel('Project list')}")

for file in ['EmptyState','Pagination','EntryCard','ProjectCard','ErrorView']:
 name=f'src/components/public/{file}.astro'
 if file != 'Pagination': add_ui(name,'.')
 if file in ['EmptyState','ErrorView']: replace(name,"import Icon from './Icon.astro';", "import Icon from './Icon.astro';\nimport type { UiKey } from '../../lib/ui-language';")
 elif file=='Pagination': replace(name,"import Icon from './Icon.astro';", "import Icon from './Icon.astro';\nimport { uiLabel } from '../../lib/ui-language';")
 else: replace(name,'interface Props',"import { uiLabel } from '../../lib/ui-language';\ninterface Props",1)
 if file in ['EmptyState','ErrorView']:
  replace(name,'title?: string;', 'title?: UiKey;') if file=='EmptyState' else replace(name,'title: string;', 'title: UiKey;')
  replace(name,'description?: string;', 'description?: UiKey;') if file=='EmptyState' else replace(name,'description: string;', 'description: UiKey;')
  replace(name,'{title}</h','<Ui text={title} /></h');replace(name,'{description}</p','<Ui text={description} /></p')
 if file=='Pagination':
  for text in ['Content pagination','Previous page','Next page']: replace(name,f'aria-label="{text}"',f"{{...uiLabel('{text}')}}")
 if file=='EntryCard':
  replace(name,'{readTime} min read','<Ui text="{count} min read" values={{count: readTime}} />')
  replace(name,'>Featured<','><Ui text="Featured" /><')
  replace(name,'aria-label="Article tags"',"{...uiLabel('Article tags')}")
  replace(name,'<a href={href}>{entry.title}</a>','<a href={href} data-original-content translate="no">{entry.title}</a>')
  replace(name,'class="journal-entry-excerpt"','class="journal-entry-excerpt" data-original-content translate="no"')
 if file=='ProjectCard':
  replace(name,'aria-label="Technologies used"',"{...uiLabel('Technologies used')}")
  for old,new in [
   ('aria-label={`${entry.title}: details`}',"{...uiLabel('{title}: details', {title: entry.title})}"),
   ('aria-label={`${entry.title}: live demo (opens in a new tab)`}',"{...uiLabel('{title}: live demo (opens in a new tab)', {title: entry.title})}"),
   ('aria-label={`${entry.title}: source code (opens in a new tab)`}',"{...uiLabel('{title}: source code (opens in a new tab)', {title: entry.title})}"),
   ('      Details','      <Ui text="Details" />'),('        Demo','        <Ui text="Demo" />'),('        Source','        <Ui text="Source" />')]: replace(name,old,new)
  replace(name,'<a href={href}>{entry.title}</a>','<a href={href} data-original-content translate="no">{entry.title}</a>')
  replace(name,'class="project-description"','class="project-description" data-original-content translate="no"')
 if file=='ErrorView':
  replace(name,'Back to home <','<Ui text="Back to home" /> <');replace(name,'Browse articles <','<Ui text="Browse articles" /> <')

article='src/pages/articles/[slug].astro'
project='src/pages/projects/[slug].astro'
for name,texts in [(article,['Back to articles','Table of contents','Subscribe to new articles','ON THIS PAGE','A short read without section headings.','Back to top ↑','KEEP EXPLORING','You might also like','All articles']),(project,['Back to projects','Open demo','Source code','Project details','Published','Last updated','Category'])]:
 replace(name,"import Icon from '../../components/public/Icon.astro';", "import Icon from '../../components/public/Icon.astro';\nimport { uiLabel } from '../../lib/ui-language';")
 for text in texts:
  s=(root/name).read_text()
  s,n=re.subn(r'(?<=[>\n])([ \t]*)'+re.escape(text)+r'(?=[ <\n])',lambda m:m.group(1)+f'<Ui text="{text}" />',s)
  if not n: raise RuntimeError(f'{name}: text not found {text}')
  (root/name).write_text(s)
 for label in (['Mobile article table of contents','Article table of contents'] if name==article else ['Project table of contents']): replace(name,f'aria-label="{label}"',f"{{...uiLabel('{label}')}}")
 replace(name,'<h1>{entry.title}</h1>','<h1 data-original-content translate="no">{entry.title}</h1>')
replace(article,'{rendered.readingMinutes} min read','<Ui text="{count} min read" values={{count: rendered.readingMinutes}} />')
replace(project,'A PROJECT BY {settings.authorName','<Ui text="A PROJECT BY" /> {settings.authorName')
replace('src/pages/404.astro','title="Page not found" description=', 'title="Page not found" titleKey="Page not found" description=',1)
replace('src/pages/500.astro', '  title="Temporarily unavailable"\n  description=', '  title="Temporarily unavailable" titleKey="Temporarily unavailable"\n  description=',1)

write('docs/home-refinements.md', '''# Homepage refinements

The existing sidebar width, page container, typography, colors, timeline Markdown, and navigation routes are preserved. A 224px circular ragdoll portrait fills the desktop introduction's unused right-hand space; on narrow screens it becomes a small decoration below the introduction. The image is a locally hosted WebP crop of the AI-generated mockup supplied in the conversation, not a photograph of the owner's pet. No external image or translation service is used.

## Interface language

The EN / 中文 control is at the upper right on desktop and in the compact header on mobile. The thumb animates for 200ms; reduced-motion settings disable the transition. Its two buttons support keyboard activation, stable accessible names, and selected states. The preference is stored under `kaiyo-ui-language`, restored before first paint, and synchronized between tabs. Blocked storage still permits switching on the current page. Without JavaScript, the English interface and native navigation remain available; the inactive language control stays hidden.

Only explicitly marked interface copy and accessibility labels change. Authored home/About Markdown, article and project titles, excerpts, bodies, code, taxonomy names, and social-link labels stay in their original language. The admin interface is unchanged by this refinement. Dates remain in their existing presentation. There is no translation API and no new application dependency. The sidebar's lower section contains only the requested GitHub profile; RSS and admin routes are retained elsewhere.

## Initial articles

Migration 006 inserts five original engineering notes into the existing CMS tables. These are public articles, not placeholder links. They use their actual insertion time, not invented historical publication dates, and include official sources. The content avoids private repositories, clients, hostnames, credentials, and claims of undisclosed professional achievements.

The migration never updates settings or existing entries. Stable IDs, slug checks (including deleted/private entries), and `ON CONFLICT DO NOTHING` protect existing work. Re-running it does not republish drafts, restore trashed notes, overwrite edits, or change dates. A short table lock protects the conflict check during the one-time insertion. Later deploys skip the recorded migration; authors maintain or remove the notes through the usual CMS workflow.

No Docker ports, environment variables, credentials, or schema definitions change. Deployment still uses the existing startup migration and Zeabur/GitHub process.
''')
