# 墨简 Mojian Reader

一款隐私优先的浏览器本地电子书阅读器。当前 MVP 支持导入并阅读 EPUB、TXT 与 Markdown，书籍内容和进度保存在浏览器的 IndexedDB 中，不上传到服务器。

## 当前能力

- 本地文件选择与拖拽批量导入
- EPUB、TXT、Markdown 阅读
- UTF-8、GBK / GB18030 等常见 TXT 编码探测
- 本地持久化书架与阅读进度
- 书名 / 作者 / 备注搜索与格式筛选
- 自建书架分组、一本书加入多个分组，以及分组重命名和安全删除
- 书名、作者、备注、封面和单书阅读背景编辑
- 书架完整备份与恢复（书籍、阅读记录、偏好和自建分组）
- 书架章节数、字数与阅读进度展示
- 文本章节自动识别、目录跳转
- 目录与全文搜索、可回退 / 前进的阅读位置历史
- 书签、文字标注、阅读记录导出与带出处复制
- 自动滚动、句子级阅读高亮、阅读标尺与系统语音朗读
- 阅读时长、章节进度和剩余阅读时间估算
- 字号、字体、行距、页宽、连续 / 双页外观控制
- 白纸、米纸、夜间三种阅读主题
- 键盘焦点、语义标签和减少动态效果偏好支持

PDF、MOBI、CBZ 与跨设备同步尚未实现，界面没有将它们标为已支持能力。

## 启动

```bash
npm install
npm run dev
```

默认开发地址为 `http://127.0.0.1:5173/`。

## 验证

```bash
npm test
npm run test:coverage
npm run lint
npm run build
npm run e2e
```

## 设计参考

首版信息架构参考了以下开源阅读器，但重新收敛为本地 Web MVP：

- [Koodo Reader](https://github.com/koodo-reader/koodo-reader)：本地书库、多格式导入、丰富排版控制
- [Readest](https://github.com/readest/readest)：沉浸阅读、书架管理、连续 / 分页阅读
- [Foliate](https://github.com/johnfactotum/foliate)：阅读进度、带出处复制与轻量阅读工具
- [Thorium Reader](https://github.com/edrlab/thorium-reader)：目录、位置历史、键盘导航与无障碍优先
- [KOReader](https://github.com/koreader/koreader)：前后阅读位置跳转与深度阅读工作流
- [epub.js](https://github.com/futurepress/epub.js) / [React Reader](https://github.com/gerhardsletten/react-reader)：浏览器端 EPUB 渲染

整体视觉采用“安静的桌面阅读工作台”：深墨侧栏、纸张色内容区、单一陶土红强调色，书架以封面作为主要交互对象，阅读器采用目录 / 正文 / 设置三栏布局。
