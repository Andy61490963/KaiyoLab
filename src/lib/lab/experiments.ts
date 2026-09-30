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
    slug: 'market-replay',
    number: '01',
    title: { zh: '市場微結構', en: 'Market microstructure' },
    description: {
      zh: '每一筆成交都有原因，送出訂單、抽走流動性，再沿著事件紀錄回到成交前一刻',
      en: 'Every trade has a cause. Place an order, remove liquidity, then rewind the event stream.',
    },
    category: { zh: '撮合引擎 / 市場回放', en: 'Matching engine / Replay' },
    tags: ['Price–time priority', 'Event replay', 'Market indicators'],
    notes: [
      {
        title: { zh: '真正的訂單簿', en: 'An actual order book' },
        body: {
          zh: '限價、市價與取消訂單共用價格優先、時間優先的撮合核心，成交量由剩餘數量扣除，圖表讀取成交結果',
          en: 'Limit, market and cancel events share a price–time matching core. Trades consume remaining quantities; the chart reads those trades.',
        },
      },
      {
        title: { zh: '單一事件時間', en: 'One event clock' },
        body: {
          zh: '訂單簿、成交帶與指標由同一回放位置推導，暫停、跳轉與加速不另開計時器',
          en: 'The book, tape and indicators derive from one replay cursor. Pause, seek and speed changes do not create competing clocks.',
        },
      },
      {
        title: { zh: '有界的畫面更新', en: 'Bounded rendering' },
        body: {
          zh: '模擬與繪圖分開，壓力模式限制每次處理量，離開頁面清理動畫與監聽器，隱藏分頁停止播放',
          en: 'Simulation and rendering are separate. Stress work is bounded, hidden tabs pause, and animation callbacks and listeners are cleaned up on exit.',
        },
      },
    ],
  },
  {
    slug: 'risk-simulator',
    number: '02',
    title: { zh: '風險的形狀', en: 'The shape of risk' },
    description: {
      zh: '一萬種可能的一年，調整資產與相關性，觀察尾部損失如何改變',
      en: 'Ten thousand possible years. Change weights and correlations to see how the loss tail moves.',
    },
    category: { zh: '量化模型 / 平行計算', en: 'Quantitative model / Worker' },
    tags: ['10,000 paths', 'Cholesky', 'VaR / CVaR'],
    notes: [
      {
        title: { zh: '相關的價格路徑', en: 'Correlated price paths' },
        body: {
          zh: '以 Cholesky 分解產生相關常態變數，使用幾何布朗運動的精確對數步進，模擬一年買入持有的終值與回撤',
          en: 'Cholesky-correlated normal draws drive exact log steps of geometric Brownian motion, tracking one-year buy-and-hold terminal wealth and drawdown.',
        },
      },
      {
        title: { zh: '主執行緒保持空閒', en: 'Keep the interface responsive' },
        body: {
          zh: 'Worker 分批處理並回報進度，每次計算有獨立識別碼，過期訊息不能覆蓋新結果，離頁立即終止 Worker',
          en: 'A worker computes in batches and reports progress. Run identifiers reject stale results; leaving the page terminates the worker.',
        },
      },
      {
        title: { zh: '清楚標示近似', en: 'Explicit approximations' },
        body: {
          zh: '有效前緣使用非負權重網格的離散近似，模型採固定假設參數，模擬資料不代表預測或投資建議',
          en: 'The frontier is a discrete long-only allocation approximation. Parameters are illustrative assumptions; simulated results are not forecasts or investment advice.',
        },
      },
    ],
  },
  {
    slug: 'liquidity-story',
    number: '03',
    title: { zh: '流動性消失的 60 秒', en: 'Sixty seconds without liquidity' },
    description: {
      zh: '沿著時間軸走進一次市場衝擊，從撤單、價差擴大，到熔斷與恢復',
      en: 'Move through a market shock, from cancellations and a widening spread to a trading halt and recovery.',
    },
    category: { zh: '資料敘事 / 滾動攝影機', en: 'Data story / Scroll camera' },
    tags: ['Scroll timeline', 'Damped camera', 'Deterministic state'],
    notes: [
      {
        title: { zh: '時間就是場景', en: 'Time is the scene' },
        body: {
          zh: '價格、深度、價差與章節皆由 0–60 秒的單一連續函數推導，倒轉捲動可精確回到相同狀態',
          en: 'Price, depth, spread and chapters derive from one continuous 0–60 second model. Reverse scrolling returns to the same state.',
        },
      },
      {
        title: { zh: '帶阻尼的視差', en: 'Damped parallax' },
        body: {
          zh: '攝影機以解析阻尼追隨指標，畫面依深度分層，速度影響鏡頭而不改寫資料時間',
          en: 'An analytically damped camera follows the pointer across depth layers. Velocity affects framing without changing data time.',
        },
      },
      {
        title: { zh: '可停止的敘事', en: 'A story you can stop' },
        body: {
          zh: '滑桿與章節按鈕提供鍵盤替代操作，減少動態模式移除攝影機與平滑位移，分頁隱藏或場景離開可視區就停止動畫',
          en: 'A range control and chapter buttons offer keyboard navigation. Reduced motion removes camera and smoothing; hidden or offscreen scenes stop animating.',
        },
      },
    ],
  },
  {
    slug: 'kinetic-carousel',
    number: '04',
    title: { zh: '慣性檔案庫', en: 'An archive in motion' },
    description: {
      zh: '抓住、加速、放手，在無限軌道上感受速度、景深與吸附的關係',
      en: 'Grab, accelerate and release. Explore velocity, depth and spring settling on an infinite track.',
    },
    category: { zh: '互動力學 / 無限輪播', en: 'Interaction physics / Infinite track' },
    tags: ['Momentum drag', 'Analytic spring', 'Periodic coordinates'],
    notes: [
      {
        title: { zh: '沒有接縫的座標', en: 'Coordinates without a seam' },
        body: {
          zh: '位置保留無界連續座標，畫面以週期最短距離映射，最後一張與第一張共用同一套物理規則',
          en: 'Position stays unbounded while rendering maps periodic shortest distances. The last-to-first transition obeys the same physics as every other step.',
        },
      },
      {
        title: { zh: '速度決定落點', en: 'Velocity chooses the landing' },
        body: {
          zh: '指標取樣估計釋放速度，慣性投射後以阻尼彈簧落在最近節點，拖曳可隨時打斷尚未完成的動畫',
          en: 'Pointer samples estimate release velocity. A projected inertial target settles through a damped spring; a new drag interrupts immediately.',
        },
      },
      {
        title: { zh: '固定幾何，有限 DOM', en: 'Fixed geometry, bounded DOM' },
        body: {
          zh: '原創程序圖保留固定長寬比，以 transform 與 opacity 呈現位移與景深，速度模糊在手機降低幅度，觸控保留垂直捲動，鍵盤也能完成所有導覽',
          en: 'Original procedural images reserve their aspect ratio. Transforms drive motion, vertical touch scrolling remains available, and every item is keyboard reachable.',
        },
      },
    ],
  },
  {
    slug: 'flow-field',
    number: '05',
    title: { zh: '看不見的流場', en: 'An invisible field' },
    description: {
      zh: '粒子沿同一個向量場移動，手指是一股擾動，而不是隨機數的開關',
      en: 'Particles follow a shared vector field. Your pointer introduces a force, not another random number.',
    },
    category: { zh: '生成系統 / 粒子積分', en: 'Generative system / Integration' },
    tags: ['Curl field', 'Fixed timestep', 'Canvas 2D'],
    notes: [
      {
        title: { zh: '由勢函數產生流動', en: 'Flow from a potential' },
        body: {
          zh: '多尺度勢函數的解析偏導形成無散度流場，粒子以慣性追隨向量，指標可施加吸引或排斥',
          en: 'Analytic derivatives of a multiscale potential form a divergence-free field. Particles follow with inertia; the pointer adds attraction or repulsion.',
        },
      },
      {
        title: { zh: '固定物理步長', en: 'A fixed physics step' },
        body: {
          zh: '物理積分使用固定時間步長與有界累積器，30、60 或 120 FPS 都不會改變模擬速度',
          en: 'A fixed simulation step and bounded accumulator separate physics from display refresh, preserving speed at 30, 60 or 120 FPS.',
        },
      },
      {
        title: { zh: '大量粒子，單一畫布', en: 'Many particles, one canvas' },
        body: {
          zh: '重用粒子緩衝區，手機降低粒子數，像素比上限為 2，離開可視區暫停，卸載時清理 Canvas 與觀察器',
          en: 'Particle buffers are reused, mobile uses fewer particles and DPR is capped at two. Offscreen work pauses; canvas and observers are cleaned up on unmount.',
        },
      },
    ],
  },
];
