export type LabCopy = { zh: string; en: string };
export type LabExperiment = {
  slug: string;
  number: string;
  title: LabCopy;
  description: LabCopy;
  category: LabCopy;
  tags: string[];
  notes: { title: LabCopy; body: LabCopy }[];
};

export const experiments: LabExperiment[] = [
  {
    slug: 'motion-studio',
    number: '01',
    title: {
      zh: '動畫曲線編輯器',
      en: 'Motion studio',
    },
    description: {
      zh: '拖曳控制點，對照位移、縮放與透明度，調出想要的速度後直接複製 CSS',
      en: 'Shape an easing curve, compare translation, scale and opacity, then copy CSS you can use.',
    },
    category: {
      zh: '動態設計 / CSS 曲線',
      en: 'Motion design / CSS easing',
    },
    tags: ['Cubic Bézier', 'Pointer capture', 'CSS export'],
    notes: [
      {
        title: {
          zh: '先反解時間，再計算輸出',
          en: 'Solve time before output',
        },
        body: {
          zh: 'CSS 的時間進度對應 Bézier 的 x 座標，先用 Newton 法配合區間二分反解參數，再計算 y，預覽與匯出的 timing-function 使用同一組控制點',
          en: 'CSS time maps to the Bézier x coordinate. Newton iteration with a bounded bisection fallback solves the parameter before evaluating y, using the same controls as the exported timing function.',
        },
      },
      {
        title: {
          zh: '精準操作與邊界回饋',
          en: 'Precise controls and validation',
        },
        body: {
          zh: '控制點支援拖曳、方向鍵與 Shift 微調，Esc 還原拖曳，x 限制在 0–1，y 可提前或超越，輸入無效時保留上次有效設定',
          en: 'Drag handles, nudge with arrow keys or Shift, and cancel a drag with Escape. X stays within 0–1 while y allows anticipation and overshoot. Invalid input preserves the last valid settings.',
        },
      },
      {
        title: {
          zh: '把曲線帶回專案',
          en: 'Take the curve into your project',
        },
        body: {
          zh: '匯出包含長度、曲線、位移關鍵影格與減少動態處理的 CSS，預覽離屏或分頁隱藏即暫停，也能用時間軸逐格核對',
          en: 'Export duration, easing, translation keyframes and reduced-motion handling as CSS. Playback pauses offscreen or in hidden tabs; the timeline remains available for frame inspection.',
        },
      },
    ],
  },
  {
    slug: 'grid-studio',
    number: '02',
    title: {
      zh: 'Grid 版面編排器',
      en: 'Grid studio',
    },
    description: {
      zh: '直接拖動區塊，調整跨欄、間距與對齊，在三種容器寬度檢查後匯出 HTML 與 CSS',
      en: 'Drag blocks, adjust spans, gaps and alignment, test three container widths, then export HTML and CSS.',
    },
    category: {
      zh: '響應式版面 / CSS Grid',
      en: 'Responsive layout / CSS Grid',
    },
    tags: ['CSS Grid', 'Container queries', 'HTML + CSS'],
    notes: [
      {
        title: {
          zh: '格線就是資料模型',
          en: 'Grid lines as the model',
        },
        body: {
          zh: '每個區塊保存起始欄列與跨度，拖曳依實際格線間距換算位置，鍵盤也能移動，縮小欄列時限制區塊邊界並指出重疊',
          en: 'Each block stores its starting column, row and spans. Dragging maps to measured grid spacing, keyboard controls move blocks, and changing the grid constrains bounds while reporting overlaps.',
        },
      },
      {
        title: {
          zh: '在真實寬度預覽',
          en: 'Preview real container widths',
        },
        body: {
          zh: '390、768 與 1200 px 預覽依可用空間縮放，容器寬度不超過 520 px 時改成單欄，匯出的 container query 採相同規則',
          en: '390, 768 and 1200 px previews scale to fit the workspace. Containers up to 520 px stack into one column, matching the container query in the exported CSS.',
        },
      },
      {
        title: {
          zh: '可獨立使用的版面',
          en: 'A layout that stands alone',
        },
        body: {
          zh: '可複製 CSS、HTML 或完整獨立頁面，包含區塊的 grid-column、grid-row 與響應式規則，不需要安裝這個工具或 React',
          en: 'Copy CSS, HTML or a standalone page with grid-column, grid-row and responsive rules. The generated layout requires neither this tool nor React.',
        },
      },
    ],
  },
  {
    slug: 'svg-studio',
    number: '03',
    title: {
      zh: 'SVG 形狀工作台',
      en: 'SVG shape studio',
    },
    description: {
      zh: '調整節點與平滑程度修出形狀，在 A、B 之間查看變形，將眼前這一格下載成 SVG',
      en: 'Edit nodes and smoothing, inspect the morph between A and B, and download the current frame as SVG.',
    },
    category: {
      zh: '向量造型 / 路徑變形',
      en: 'Vector geometry / Path morphing',
    },
    tags: ['Bézier paths', 'Seeded geometry', 'SVG export'],
    notes: [
      {
        title: {
          zh: '種子產生可重現的輪廓',
          en: 'Repeatable seeded contours',
        },
        body: {
          zh: '種子、節點數與不規則程度決定起始形狀，平滑參數控制相鄰節點推導的 Bézier 控制柄，拖曳或方向鍵可直接修改節點',
          en: 'Seed, node count and irregularity determine the initial contour. Smoothing controls Bézier handles derived from neighboring nodes; drag or arrow keys edit nodes directly.',
        },
      },
      {
        title: {
          zh: '一致的路徑才能變形',
          en: 'Matching paths can morph',
        },
        body: {
          zh: 'A、B 兩形狀使用相同節點數與三次曲線段，對應端點及控制柄插值產生每一格，編輯端點時固定在 A 或 B，避免誤改中間狀態',
          en: 'A and B share a node count and cubic segment structure. Interpolating corresponding anchors and handles creates each frame. Editing stays at endpoint A or B to avoid changing an in-between state.',
        },
      },
      {
        title: {
          zh: '下載畫面中的那一格',
          en: 'Export the frame you see',
        },
        body: {
          zh: '匯出是含 viewBox、path 與當前填色、描邊的靜態 SVG，不包含工具控制點或執行腳本，可直接作為網頁素材使用',
          en: 'Export a static SVG with its viewBox, path, fill and stroke. It contains no editor handles or executable scripts and can be used directly as a web asset.',
        },
      },
    ],
  },
  {
    slug: 'kinetic-carousel',
    number: '04',
    title: {
      zh: '3D 輪播調校器',
      en: '3D carousel tuner',
    },
    description: {
      zh: '拖動無限輪播，調整透視、間距、傾斜與景深，帶走這組視覺參數及渲染程式',
      en: 'Drag an infinite carousel, tune perspective, spacing, tilt and depth, then take the visual settings and renderer into your project.',
    },
    category: {
      zh: '3D 變換 / 慣性互動',
      en: '3D transforms / Inertial interaction',
    },
    tags: ['Perspective', 'Analytic spring', 'Renderer export'],
    notes: [
      {
        title: {
          zh: '連續座標消除接縫',
          en: 'Continuous coordinates without seams',
        },
        body: {
          zh: '位置保留無界連續座標，畫面以週期最短距離映射，最後一張接回第一張時，仍使用相同的速度與彈簧規則',
          en: 'Position stays unbounded while rendering maps periodic shortest distances. The last-to-first transition keeps the same velocity and spring rules.',
        },
      },
      {
        title: {
          zh: '把景深拆成可調參數',
          en: 'Depth as adjustable parameters',
        },
        body: {
          zh: '透視距離、卡片間距、傾斜、Z 軸深度、縮放與速度模糊分開調整，拖曳、觸控和鍵盤共用同一套狀態',
          en: 'Tune perspective distance, spacing, tilt, Z depth, scale and velocity blur independently. Drag, touch and keyboard navigation share one state.',
        },
      },
      {
        title: {
          zh: '匯出視覺渲染邏輯',
          en: 'Export the visual renderer',
        },
        body: {
          zh: '匯出目前參數與計算 transform、opacity、filter 的 JavaScript 渲染程式，專案可將自己的位置與速度狀態接入，匯出內容不含完整拖曳引擎',
          en: 'Export the current parameters and JavaScript renderer for transform, opacity and filter. Connect your own position and velocity state; the snippet does not include a complete drag engine.',
        },
      },
    ],
  },
  {
    slug: 'flow-field',
    number: '05',
    title: {
      zh: '粒子背景產生器',
      en: 'Particle background generator',
    },
    description: {
      zh: '調整粒子數、配色與種子，讓指標改變流向，下載背景圖片或保存這組設定',
      en: 'Tune particle count, palette and seed, steer the flow with your pointer, then download a background image or save the settings.',
    },
    category: {
      zh: '生成背景 / Canvas 2D',
      en: 'Generative backgrounds / Canvas 2D',
    },
    tags: ['Curl field', 'Fixed timestep', 'PNG + JSON'],
    notes: [
      {
        title: {
          zh: '有結構的粒子運動',
          en: 'Structured particle motion',
        },
        body: {
          zh: '多尺度勢函數的解析偏導形成基礎無散度流場，粒子以慣性追隨向量，指標可額外施加吸引或排斥，種子保留可重現的初始條件',
          en: 'Analytic derivatives of a multiscale potential form the divergence-free base field. Particles follow with inertia, pointer forces add attraction or repulsion, and a seed reproduces initial conditions.',
        },
      },
      {
        title: {
          zh: '畫面與時間分開處理',
          en: 'Separate rendering from time',
        },
        body: {
          zh: '模擬採固定時間步長與有界累積器，重用粒子緩衝區，Canvas 像素比上限為 2，離屏與隱藏分頁停止運算，減少動態模式支援單步查看',
          en: 'Fixed simulation steps and a bounded accumulator reuse particle buffers. Canvas DPR is capped at two, offscreen and hidden tabs stop work, and reduced motion supports manual stepping.',
        },
      },
      {
        title: {
          zh: '圖片與設定分別保存',
          en: 'Save the image and settings',
        },
        body: {
          zh: 'PNG 保存當前 Canvas 畫面，JSON 保存種子、粒子數與外觀參數，設定檔不包含獨立動畫程式或每一顆粒子的即時位置',
          en: 'PNG saves the current canvas image. JSON saves the seed, particle count and visual parameters; it contains neither a standalone animation nor every particle position.',
        },
      },
    ],
  },
];
