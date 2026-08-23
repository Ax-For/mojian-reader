import type { ReaderBook } from '../types'
import { bookMetricsFromTextIndex } from '../utils/bookMetrics'
import { buildTextBookIndex } from '../utils/textBookIndex'

const SAMPLE_TEXT = `关于这份演示文本

这是一份用于体验墨简排版、目录与阅读设置的原创演示文字。导入你自己的 TXT、Markdown 或 EPUB 后，它会被真实书籍替换。

第一章 清晨的书桌

窗帘留了一线，天光顺着桌角慢慢移过来。杯中的水还温着，书页已经翻到了昨天夹好书签的位置。阅读最动人的地方，常常不是获得答案，而是重新注意到那些被匆忙生活略过的细节。

人坐下来，周围的声音便开始分出层次。远处的车声、楼下的脚步、纸张被手指带动的轻响，都不再催促什么。

第二章 一段安静的时间

好的阅读界面不应该抢走注意力。它只需要在需要的时候出现：记住进度，找到章节，调好字号，然后退回到文字背后。

夜色落下时，纸面的颜色也应当柔和下来。行距稍宽一点，段落之间留一点呼吸，长时间阅读便不再是一件需要忍耐的事。

第三章 把书带回本地

书籍留在自己的设备里，进度也保存在浏览器中。没有账号，没有上传，打开页面就可以继续读。`

const SAMPLE_METRICS = bookMetricsFromTextIndex(buildTextBookIndex(SAMPLE_TEXT))

export const sampleBooks: ReaderBook[] = [
  {
    id: 'sample-renjian',
    title: '人间草木',
    author: '排版演示',
    format: 'txt',
    source: 'sample',
    fileSize: 286_000,
    sizeLabel: '286 KB',
    progress: 64,
    lastOpened: 6,
    content: SAMPLE_TEXT,
    ...SAMPLE_METRICS,
    cover: { background: '#a54432', foreground: '#fff3df' }
  },
  {
    id: 'sample-moon',
    title: '月亮与六便士',
    author: 'W. S. 毛姆',
    format: 'epub',
    source: 'sample',
    fileSize: 1_920_000,
    sizeLabel: '1.9 MB',
    progress: 31,
    lastOpened: 5,
    content: SAMPLE_TEXT,
    ...SAMPLE_METRICS,
    cover: { background: '#c29a55', foreground: '#27251e' }
  },
  {
    id: 'sample-night',
    title: '长夜行',
    author: '墨简样书',
    format: 'txt',
    source: 'sample',
    fileSize: 812_000,
    sizeLabel: '812 KB',
    progress: 8,
    lastOpened: 4,
    content: SAMPLE_TEXT,
    ...SAMPLE_METRICS,
    cover: { background: '#344e4a', foreground: '#f0e8d5' }
  },
  {
    id: 'sample-notes',
    title: '关于阅读的札记',
    author: '墨简样书',
    format: 'md',
    source: 'sample',
    fileSize: 94_000,
    sizeLabel: '94 KB',
    progress: 0,
    lastOpened: 3,
    content: SAMPLE_TEXT,
    ...SAMPLE_METRICS,
    cover: { background: '#4a5769', foreground: '#f7efe2' }
  }
]
