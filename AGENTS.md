# 项目使用场景与 UI 约定

## 主要访问设备

- 用户主要通过 iPhone 上的 iOS 浏览器访问本项目。UI 设计、布局取舍和交互验证以 iOS Safari 的手机体验为优先，同时保持其他浏览器和桌面端可用。
- 优先考虑单手操作、清晰的当前页面标识、可读文字和足够大的触控区域；主要操作尽量提供至少 44 × 44 CSS 像素的点击区域。
- 固定导航、弹窗和底部操作区需要考虑 `env(safe-area-inset-*)`，避免被刘海、Home 指示条或浏览器工具栏遮挡。
- 全屏高度与滚动布局需要考虑 iOS 浏览器地址栏展开、收起和软键盘出现时的视口变化；评估 `dvh` / `svh` 并保留兼容回退，避免只依赖固定 `100vh`。
- 输入表单需检查键盘遮挡、输入自动缩放、焦点和滚动恢复。页面切换需检查日历月份与选中日期、拼豆筛选与滚动位置、未提交表单内容是否意外丢失。
- 不依赖悬停才能使用关键功能。新增手势需避免与 Safari 边缘返回、页面滚动以及日历已有的左右切换月份手势冲突。
- **界面信息去重**：一级导航或页面标题已表达的信息，不再在内容区堆叠重复标题；日期格或规则卡片已有完整班次文字与配色，不再额外放置颜色图例；已有全局返回入口的子页不再绘制第二个返回按钮。删除纯装饰性口号、恒真状态文案和永久显示的操作教学前，先确认不影响导航、可访问名称与业务语义。错误/离线状态、同步时间、安全警告、删除确认和未提交草稿提醒必须保留。

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

- PWA 支持安装、静态界面离线启动及受控的只读数据快照；绝不将花园 JSON API、原图、登录信息或写请求存入 Service Worker 缓存。花园已访问元数据及有限 /thumb 缩略图默认允许保存在本设备 IndexedDB / 专用 Cache Storage（用户可通过简洁开关关闭并清理）；离线写入仍禁止。发布构建需验证 Manifest、192/512px 图标、版本化 SW 和缓存清单。

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


## 花园 iOS PWA UI 重构约定

- iPhone 主屏幕 PWA 与 Safari 浏览器为一等客户端，保留 React/MUI、Express/MySQL 与日历/拼豆/花园三个一级入口。不以重做 UI 为由修改数据库、访问权限或删除既有能力。
- 花园列表与详情分别记录滚动状态；从成长日历进入花卉详情后返回，必须保持原月份、选中日期与列表位置。禁止以空列表替代快速网络切换中的等待状态；短请求使用延迟占位避免闪烁。
- 花园卡片封面占位比例固定，名称和次要信息优先级统一；搜索关键词防抖、错误可重试；全部花卉含 archived 历史记录，按品种显示的是已加载数量，不允许冒充完整种数。
- 编辑器在窄屏采用全屏 Sheet 风格，并尊重 safe-area、键盘和不自动聚焦；未提交修改在取消/返回时提示放弃，上传和保存过程阻止重复操作，照片选择不静默截断。
- 花园详情的编辑/删除在次级菜单，删除花卉与删除日记均需明确二次确认。禁止恢复原先的浏览器 window.confirm 作为 UI 入口；保留真正的 DELETE API、图片上传、Viewer 和原图下载。
- 成长时间线依旧最早到最新，照片以稳定比例渲染；Viewer 的手势需让位 Safari 左右边缘系统返回、纵向滚动和缩放，保持键盘辅助导航和缩放/分享的能力。
- 主题默认跟随系统明暗，统一安全区和控件触控目标（常规至少 44px）；支持 prefers-reduced-motion、VoiceOver 描述、低网速与失败状态；不要展示一闪而过的中间「正在加载」。
- 不得删除 PWA 的 no-store API/照片策略或把系统备份替换成独立 ZIP 导出；改动必须新增 Jest、隔离 MySQL 和真实 Chromium/WebKit E2E 证据，未做真机 Safari 不得声称已实机通过。

## 日历 iOS PWA 重设计（不可回退约定）

- 一级「日历」和「花园 → 成长日历」不是同一模块；日历 UI 优先针对 iPhone Safari/独立 PWA 设计，保留日历/拼豆/花园主导航与本地排班计算。
- **每一天必须可见完整「白班」「夜班」「休息」「备班」班次文字**。颜色语义仍为红/蓝/绿/紫，但自本次 UI 更新起使用 **深色背景 + 纯白文字**，四色均须达到 WCAG AA 小字 4.5:1 对比度；日历格、选中详情、排班规则循环、单日编辑预览及原生 select 值共用 src/shifts.js。不得改成只有圆点、色条或文字被截断的视觉。小屏允许微调水平内边距，班次文字不能消失。
- 月历持续显示 42 个日期按钮（六周）以稳定布局，320/375/390/430px 触控目标严格达到 44×44 CSS px；今天和选中日期单独标记，非本月日期明确降低视觉层级。
- 保留原月历 requestAnimationFrame/translate3d 滑动，不允许在 touchmove 时改变 React 月历状态；长按排班、纵向滚动、Safari 屏幕边缘返回及触摸取消必须维持原有行为。
- 禁止未说明修改 shift-rules、shift-day-overrides、默认排班、白/夜/休轮换或换班/备班业务语义。UI 编辑只在确认后写入，失败/冲突保留草稿、旧版本不会覆盖新版本。
- 单日编辑和规则编辑手机使用安全区全屏布局，取消已有更改须用户明确放弃；日历切换到其他一级模块时保留查看月、选中日期和未提交草稿。
- 排班规则按生效日新到旧排列，突出当前生效规则；循环天排序保留长按拖动和 Alt+方向键，也提供不依赖手势的上移/下移按钮。
- 仅日历和花园使用系统亮/暗模式；拼豆保持既有独立视觉。不得使用全局 h2/.header 等样式污染其它模块。
- 实施必须验证 320px、375px、390px、430px、横屏、桌面，基本键盘导航、截图无溢出、PWA 安全区和 prefers-reduced-motion；真实 iPhone Safari 和 SSH staging 没完成时不得标注实机/生产完成。

- 一级「日历」底部 Tab 已标明模块名称，顶部不再重复显示「我的日历」；以可直接选年月的月份标题作为主要信息，保留快速返回今天和排班设置入口。
- 日历 ARIA 采用有名称的日期按钮组，并通过每个日期按钮的完整中文日期、星期、班次、今天/选中状态供 VoiceOver 阅读；禁止发布无完整 row/gridcell 关系的假 ARIA grid。


## Calendar + Garden PWA audit closure (PR #20)

- Calendar and Garden share exactly one horizontal safe-area application: the .app-page wrapper has no extra horizontal padding for these two modules. Sheet/Modal portals still receive their own safe-area insets independently.
- Calendar continues to render 42 dates with the complete original 白班/夜班/休息/备班 text labels and shared palette. Never replace labels with only color. An unconfirmed shift settings snapshot must be identified visibly as a preview.
- Both Calendar and GardenCalendar use Sunday-first 42-cell months; today and selection have independent visible states. Input-driven month selection must keep the selected day in the target month.
- All modal editors preserve unsaved drafts. BrowserRouter alone cannot safely block SPA Back/Forward on React Router 6.14; production entry uses createBrowserRouter and a pinned React Router 6.14.1 data-router blocker (router.getBlocker/deleteBlocker + UNSAFE context), because the npm runtime does not export unstable_useBlocker; MemoryRouter tests retain the existing custom navigation guard. When saving, do not permit navigation until the request completes.
- Garden search must not scrollTop=0 on every keystroke; only settled search query changes may reset the list position. Returning from detail must restore previously saved scroll positions; closing a detail replaces its history entry to prevent reopening via Safari Back.
- Large ungrouped flower lists render only a viewport-sized DOM window and photos use content-visibility or paged loading where appropriate. Any further optimization must not change photo order or silently omit cards.
- Garden photo Viewer needs accessible previous/next controls even on narrow phones, pinch zoom and drag-to-pan, clear loading/retry feedback, and original-file Web Share when supported. A fallback URL is private to an authenticated session; never imply it is a public shared link.
- On photo upload, 100% means request-body bytes completed; after this show server processing until success. Photo previews preserve stable Object URLs and display a readable fallback for unsupported HEIC images.
- Preserve backend CRUD and system backup; no garden ZIP export, archive buttons, independent photo tab or growth comparison tab. Protect genuine delete actions with explicit confirmation.
- Test updates must cover Safari-style history POP in real Chromium/WebKit through actual createBrowserRouter, as well as 320/375/390/430px, landscape, dark/light, iOS-style keyboard, upload errors, original-photo sharing and large lists. Playwright desktop WebKit does not certify real iPhone Safari; real-device and SSH staging remain separate gates.

## PWA first-paint and accessible typography acceptance

- The pre-React theme initializer matches Calendar/Garden system dark appearance before the application mounts; Pindou stays light. The external script is local and deliberately contains no network calls, telemetry or inline CSP exceptions.
- Dates, weekdays and non-shift Garden controls respect larger root text sizing with flexible layouts. **Preserve the daily 白班/夜班/休息/备班 label 10px font size and default padding**; the updated contrast-safe dark-red/blue/green/purple background with white text is the new canonical palette and must not silently regress.
- Manifest background/theme values are static fallbacks for initial load and cannot represent every module's active system appearance. Real iPhone standalone status bar and Dynamic Island remain separate physical checks.

## PWA P0/P1/P2 本地化与安全更新（PR #22）

- **P0 组件离线本地化**：Vite 构建完成后执行 `scripts/build-pwa-shell.mjs`，生成 `dist/pwa-precache.json` 和带内容哈希的 `dist/sw.js`；缓存 HTML、构建后的 JS/CSS 和必要图标，不缓存 API/原图/上传、WASM/OCR 模型。每项预缓存资源最大 6 MiB，整体最大 18 MiB，超限应使构建失败。当前使用自己维护的 Workbox 风格清单注入，而非引入/冒用 Workbox npm 包。
- 服务端 `/index.html`、`/sw.js` 和 Manifest 必须校验或禁用 HTTP 缓存；Vite 带哈希 assets 可以 `immutable` 长期缓存；`/api/*` 默认 `private, no-store`，花园 UUID 缩略图/预览的现有 private 缓存/ETag 策略例外，原图继续无缓存。
- Service Worker 安装过程中预缓存任一项目失败必须删除不完整的缓存版本并维持旧工作线程；完成新版本预下载后，必须由用户在安全时机主动激活，禁止安装阶段强制 `skipWaiting` 刷新正在编辑或上传的页面。保留至少一代旧哈希 JS 兼容原页面的动态导入。
- **P1 日历离线快照**：IndexedDB `yl-offline-readonly/snapshots/calendar` 只在当前联网轮次分别取得已确认的 `shift-rules` 和 `shift-day-overrides` 版本后写入；用户断网或版本未核验时可查看上次快照，但必须显示同步时间和非实时提示。任何离线/未确认状态禁止排班编辑、删除或上传，重新联网及从后台恢复时节流重检服务器版本。
- **P2 花园离线浏览（新默认）**：首次安装默认开启，不再显示冗长的「离线浏览设置」容量、隐私警告、存储统计等说明；仅保留折叠式「离线缓存」简短开关及清理操作。仅保存已浏览的前 200 株摘要、最多 30 个详情、每株前 100 条成长记录及最多 60 张、12 MiB 的 /thumb 缩略图；不存原图，只读且不得离线编辑/删除。用户主动关闭或清除后，将明确的 `no` 偏好持久化，后续重启不能自行重新开启；撤销时删除花园 IndexedDB 元数据及专用 Cache Storage，不得删除日历确认快照。避免关闭期间异步保存回写；浏览器普通 HTTP 图片缓存仍独立管理。
- 所有用户数据仍以 Express/MySQL 为真实来源；没有离线排班编辑队列、花园上传队列或静默批量预下载。换设备/清理 Safari 数据后可以丢失离线快照，绝不能作为唯一数据源。
- CI 应覆盖离线冷启动/恢复联网、排班版本与禁用编辑、花园默认开启/手动关闭持久化/清除、缩略图容量约束、缓存头、等待更新与旧 JS 回退。Chrome 用真正的 Playwright 网络离线模拟；Playwright WebKit 在 `setOffline(true)` + SW 页面导航有已知模拟缺陷时可改用**停止隔离源站**的故障测试，须如实标注两种测试范围，不得将此标注为 iPhone 真机验收。


## iOS PWA 离线渲染专项验收

- 离线、服务器不可达、API 响应失败必须区分于“真正空数据”：首次未取得库存时不得凭默认色号伪造 0 颗库存；历史获取失败不得显示「暂无历史记录」；成长日历离线只读只能标识“本机已缓存 N 条/未缓存”，不能断言远端当天无记录。
- 日历只有经过当前服务器确认的双版本快照才允许显示为已确认状态；无已确认快照时 42 格计算值只是内置示例，断网或重连失败仍要展示明确警告并禁用编辑。状态/告警不能在短加载延迟后消失。
- 花园服务器不可达，即使 navigator.onLine 仍为 true，也须禁用新增入口；花园离线保存默认开启但必须可明确关闭并删除本机缓存，不可把 JSON API、原图、上传加入 SW 或花园媒体缓存。拼豆补豆/消耗先检查服务可达后才允许提交；断网草稿仍能保留在当前页面，不得静默入队。已载入的拼豆库存和历史必须标为旧数据并禁止离线写入。
- 离线错误提示优先放在当前模块内容顶部、主要控件/筛选前。已显示整页离线警告时避免堆叠重复错误；无实际网络的「重试」不应占据大型警告。警告和按钮需在 320/375/390/430px 与 812×375 横屏可换行，禁止文本被裁切、页面横向溢出或挡住底部导航。保存快照时间和只读提示不能被去重规则删除。
- 每次相关 UI 改动运行隔离 MySQL + 真 Chromium（context.setOffline(true)）和 WebKit（真实隔离源站停服）PWA 离线 E2E；覆盖日历及选年月弹窗、库存、历史、补豆/消耗表单、花园列表/成长日历/日期记录/详情、无快照冷启动、清理授权、缩略图兜底；检查 DOM 几何、长文换行、告警位置、不可写状态及未处理前端异常并保留失败截图。Linux WebKit 在 SW 控制页多次断源顶层导航可能崩溃时，可在已测试一次缓存重启后继续用同一页面的 SPA 导航覆盖组件，必须清楚注明模拟器限制，不得冒充 iPhone Safari 实机验收。
- 花园全屏照片 Viewer **离线仅使用当前启用离线缓存时保存的 /thumb 缩略图**，不得新增原图或 preview 到 IndexedDB/Cache Storage。缩略图回退需明示「低分辨率、高清/原图需联网」；无缓存时必须有真实的离线缺失提示，不得误报不支持图片格式，隐藏离线无效的分享/下载原图操作。切换照片或关闭查看器必须撤销旧 Object URL，晚到的缓存结果不得覆盖下一张照片。
- 花园已授权快照为空与「远端没有日记」不等价；离线只读的时间线不可出现邀请新建记录的文案。打开未缓存详情时要区分服务器不可达与花卉真正被删除，错误在详情内容内、返回入口可用；照片文件名及失败提示在 320px / 横屏应正常换行。
- GitLab 的 pwa-offline-e2e 专项保留可手动启动且在稳定版 tag 运行；此项只使用一次性数据库与本地测试源站。未做真实 iPhone Safari/SSH staging 时如实标注未验收，不把生产环境访问、凭据或抓包作为代码/CI/PR 门槛。

## 晨光花园 PWA 图标与 Windows 打包约束

- 用户选定「方案 1 · 晨光花园」，图标保持奶油色满幅背景、红色月历、粉色花朵与绿色叶片；日历/花园的业务 UI 配色和每日班次文字不随图标修改。
- `public/app-icon.svg` 和 `scripts/generate-pwa-icons.mjs` 是同一设计方向的可再生源文件，192/512 PNG 通过 `npm run build` 的 `prebuild` 在 public 自动生成，Vite 将它们复制到 dist。
- `scripts/build-pwa-shell.mjs` 必须在 dist/icon-192.png 或 dist/icon-512.png 不存在时自动补齐；禁止直接对缺失 PNG 调用 statSync 导致 Windows ENOENT。
- 不依赖外部图片 URL、额外 npm/native 绘图库、字体文件或手工 git 忽略文件；保持 `node scripts/generate-pwa-icons.mjs [output_dir]` 能在 Node 22 的 Windows/Linux/macOS 运行。
- `node --test test/pwa.test.cjs` 必须包括删除 dist 两个图标后单独调用 PWA cache builder 并核对重生成 PNG 与预缓存清单；PR CI 同时在 Windows 与 Linux 执行 Vite build + PWA test。

## 拼豆 iOS PWA UI 验收（白字班次统一，PR 待合并）

- 拼豆保留独立浅色主题，不影响日历/花园的亮暗模式；本模块 CSS 必须由 `.pindou-page` 或对应 view 范围限定，禁止全局污染其它两个一级模块。
- 库存主操作保留「历史 / 补豆 / 消耗」，在 320/375/390/430px 和横屏下都必须满足 44px 触控高度，不出现横向隐藏或挤压；筛选、分组、颜色数值、排序行为保持不变。
- 历史记录的照片、时间、长备注和编辑/删除操作应按宽度换行；时间、备注、色号与数量编辑框在 iPhone 使用自适应 Grid，原生输入至少 16px，删除必须经可访问的应用内确认弹窗，不使用阻塞 window.confirm。
- 补豆/消耗使用明确的图片选择入口和应用内图片预览，图片预览不使用 window.open，上传失败在表单中就地显示并保留草稿；后台提交期间禁止重复提交与离开，离线或服务端不可达仍须禁止写入。
- 使用真实 Chromium/WebKit + 一次性 MySQL 验证上述界面、对话框位置、备注和文件名长文本、safe area、横向溢出、禁用态与现有库存/历史事务功能；未做 iPhone Safari 真机/生产部署不可冒称已验收。
