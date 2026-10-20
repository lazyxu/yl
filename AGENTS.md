# 项目使用场景与 UI 约定

## 主要访问设备

- 用户主要通过 iPhone 上的 iOS 浏览器访问本项目。UI 设计、布局取舍和交互验证以 iOS Safari 的手机体验为优先，同时保持其他浏览器和桌面端可用。
- 优先考虑单手操作、清晰的当前页面标识、可读文字和足够大的触控区域；主要操作尽量提供至少 44 × 44 CSS 像素的点击区域。
- 固定导航、弹窗和底部操作区需要考虑 `env(safe-area-inset-*)`，避免被刘海、Home 指示条或浏览器工具栏遮挡。
- 全屏高度与滚动布局需要考虑 iOS 浏览器地址栏展开、收起和软键盘出现时的视口变化；评估 `dvh` / `svh` 并保留兼容回退，避免只依赖固定 `100vh`。
- 输入表单需检查键盘遮挡、输入自动缩放、焦点和滚动恢复。页面切换需检查日历月份与选中日期、拼豆筛选与滚动位置、未提交表单内容是否意外丢失。
- 不依赖悬停才能使用关键功能。新增手势需避免与 Safari 边缘返回、页面滚动以及日历已有的左右切换月份手势冲突。

## 验证与说明

- UI 修改优先检查手机窄屏竖屏、横屏、滚动、输入键盘、导航切换和浏览器前进/后退。
- 桌面浏览器的窄屏预览只能验证布局，不能替代真实 iOS Safari 对安全区、地址栏和软键盘行为的验证。没有实际 iOS 测试条件时，应明确说明验证范围。

## 花园模块约定

- 当前主仓库是 yl；以 React/JavaScript/MUI + Express/Sequelize/MySQL + SSH/PM2/Nginx + GitLab CI 为统一选型。
- 一级模块只有 日历 / 拼豆 / 花园；主页仍为日历，不改变拼豆的补豆、消耗、历史页面和已有状态恢复。
- 花园采用一株一档案、品种分组、照片 + 时间 + 可选备注；无家庭成员登录（暂不做），可选记录者昵称，不改造已有日历/拼豆认证。
- 花园首页统一查询 status=all，展示当前和历史 archived 花卉；UI 不提供归档/恢复或 active/archived 筛选。保留已有 status 字段、归档数据和兼容旧客户端的状态查询/编辑能力，不迁移、不清空历史记录。
- 移除花园 ZIP 导出按钮及 /api/garden/export 接口；系统备份/恢复（MySQL + uploads）必须保留。这里的「删除」仅指删除导出功能，严禁删掉「删除花卉」「删除日记」及其 API、照片查看或原图下载。
- 所有花园表名使用 garden_ 前缀，不修改现有排班/拼豆表；媒体文件只能保存在 server/uploads/garden 下，兼容既有 SSH 发布、数据库/上传目录备份与恢复。
- 花园上传限 JPEG、PNG、WEBP、HEIC；必须校验内容签名、尺寸、数量，限制 8 张、单张 20 MiB、单篇 90 MiB，原图保留并生成受支持的预览。
- iPhone Safari 首选，底栏安全区、键盘、照片拍摄、时区日期以及返回状态都要验证；未完成实机检查时明确标注。
- 功能开发使用 master 的独立分支和 MR/PR；最少运行 Jest、Node 参数测试、MySQL 集成测试与 Vite 构建；不要自动部署生产环境。

- PWA 只提供安装入口和独立窗口；不缓存花园 API、原图、登录信息，也不支持离线写入。发布构建必须检查 manifest 与 192/512px PNG 图标。

- **花园拍照回归保障**：实际 UI 用 `observedPayload()` 生成带 `Z` 时区标识、无毫秒的 ISO 8601 时间（兼容旧版与新版后端）；服务端还应兼容毫秒和显式时区偏移，并保持用户选择的本地日期。任何上传/编辑 API 改动必须用同一 payload helper 的真实请求完成 MySQL 集成测试，不能只写手工无毫秒时间字符串。

## 花园大数据分页 / SQL 性能规则

- 列表默认请求必须明确指定 limit；不得返回固定 500 株或者单日日历 200 条而无 total / has_more。
- 花卉列表聚合使用批量 SQL，不得在每株花循环中发出单独照片统计；新增性能优化至少用 SQL 次数和 >500 株、单日 >200 条的集成测试做回归。
- 旧版调用不传 limit/cursor 时继续返回数组，禁止无版本说明地变更形状；新 UI 应使用显式游标分页。
- 交互取消请求后忽略过期结果，上一目录/日期加载结果不得覆盖新选择，也不得在无请求结果时显示错误的空状态。


## 拼豆库存事务与历史迁移约定

- 数据真相是 pindou_reminders 历史流水；pindou_inventory 是物化汇总，pindou_inventory_meta 控制首次完整初始化。
- 既有用户升级后首次启动必须从所有历史记录（不是 GET 限制的前 200 条）按主键有界批次重建一次；状态与汇总必须单事务提交，不能重启后重复累加。
- 新增、编辑、删除记录与库存增量变更必须处于同一个 MySQL 事务；不能在 POST/PUT/DELETE 失败后留下单边记录。多并发同色号更新必须原子累加。
- 常规 GET /api/inventory 只能查询汇总表，不得遍历整张历史记录表。MySQL 集成测试需覆盖 500+ 历史、并发、编辑、删除、强制失败回滚和重启一致性。


- 色号表查找统一复用 src/palette.js 的稳定 Map/Set，不得在每个库存色块或选项渲染中重复扫描 MARD.find；保持所有 221 色号和扩展色号的现有兼容性，增加测试保护。


- 花园图片解码和缩略图必须限制并发/排队数量；缩略图应从有界尺寸预览派生，不要为了两种分辨率重复解码巨大原图。
- UUID 命名的缩略图和预览可使用 private Cache-Control 与稳定 ETag/条件请求；原图不应进行共享缓存；HEIC 无解码器时的 fallback 不得伪造 JPEG MIME。
- 新增图片处理改动必须验证错误清理、缩略图尺寸、ETag 304、原图无缓存，并做媒体 worker 过载测试。

## iPhone 日历滑动性能
- 日历手势 touchmove 不得通过 React setState 每帧重渲染完整月视图；用 ref + requestAnimationFrame 仅更新 transform，每帧合并更新并应用最后一次手势坐标。
- 保留 Safari 边缘返回、纵向滚动、长按单日换班、触摸取消和页面切换清理；拖动状态不得影响已打开的排班弹窗。
- Jest 回归验证密集 touchmove 仅调度一个 rAF，日期 DOM 不重建，结束后月份切换且纵向/边缘/取消不会误触发。
- 性能结论必须区分生产实测、调度次数和静态分析；无 Safari 真机不标注真机验收完成。

## 花园组件可维护性
- Garden.jsx 只作为样式与路由兼容入口；花园模块组件统一位于 src/garden/。
- 花卉卡片列表、档案编辑、成长时间线、照片 Viewer、日历都应保持独立模块；不得重新堆回单一页面组件。
- 统一由 useGardenPlants Hook 管理花卉/品种加载、分页、请求取消以及旧请求 generation 检查。组件不应直接重复对应 API 请求逻辑。
- 拆分纯重构必须验证原有导航、历史记录、照片切换、编辑/删除回调及前后端集成，确保功能等价后才能合入。
- 花卉详情只展示一条成长时间线，不再加入独立「照片」和「成长对比」标签；时间线内保留拍照上传、缩略图、Viewer 和原图下载。
- 成长时间线始终按 observed_ts ASC、id ASC（最早到最新）排序；所有分页请求使用相同方向和稳定 ID 次序，加载更多只能追加后续记录，编辑或切换花卉后不得混入过期分页结果。旧 /entries 调用省略 order 时维持 DESC 默认。

## 异常照片和恢复测试
- 上传失败测试必须覆盖无照片、损坏 JPEG、伪造/截断 HEIC、图片数量超限、日期无时区、先上传有效图后因另一张出错；确认数据库与 originals/thumbs/previews/tmp 均无多余文件。
- 并发删除同一日记的操作只能返回成功或不存在，不得破坏其他记录或出现 500。删除后数据库记录与图片访问均应消失。
- HEIC 在解码能力不足时，只可保存已通过 ISO-BMFF 基本盒结构验证的原始文件，且下载 MIME 仍为 image/heic。跑得通 HEVC 编码器的 CI 追加真实样本验证；跳过不能冒充真机通过。
- 本地图片预览 Object URL 必须在 layout effect 创建并在移除、关闭、卸载时撤销，禁止在 React render/useMemo 期间创建资源。
- SSH 发布必须有故障注入、回滚或可验证的手动恢复证据。真机 Safari/PWA 和真实 SSH staging 通过之前，生产验证仍保持未完成。

## Real-browser E2E smoke tests
- Before release, run E2E_MYSQL=1 node test/browser-garden.e2e.mjs against disposable MySQL after npm run build, installing real Chromium/WebKit browsers. The harness must create/drop only its randomly named test database and never use production.
- Browser checks must traverse the actual Express/Sequelize server, not mocked APIs: flower creation, file selection, note saving, original download, deleting entries, calendar/pindou navigation and mobile viewport checks.
- GitLab browser-e2e is a manual release gate; ordinary Jest/MySQL checks remain automatic. Collect failure screenshots under test-results.
- Linux desktop WebKit emulation does not certify actual iPhone Safari; iPhone/SSH staging checklist stays open.

## SSH 发布与代码回滚
- release_deploy.sh 必须先构建/校验备份，再把代码上传至隔离版本目录 .yl-releases/release-*；严禁从发布包直接 tar 覆盖现有 PM2 cwd 或复制 .env/uploads。
- 使用 scripts/activate-staged-release.sh：安装依赖与语法检查在新目录完成；记录旧 PM2 cwd；切换后真实 HTTP 健康检查；失败自动恢复原 PM2 cwd。Nginx 仅在新应用健康后更新且要能恢复旧配置。
- 发布失败注入至少覆盖前置目录检查、npm 失败、PM2 启动失败和 HTTP 健康检查失败，保证原有代码、.env/uploads 和进程状态不被破坏。
- 代码回滚不等于 MySQL 数据回滚。服务端使用 schema sync 的情况下，升级前需先备份并验证恢复能力；需要手动、单独评估数据库兼容后才允许生产发布。
- 发布及变更 Nginx 仍需 SSH staging 现场验收，不能以 mock pm2/curl 代替生产验收。
