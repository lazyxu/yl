# yl

## 花园日记：第三个一级模块

2026-10 起，yl 在现有日历和拼豆之外，增加「花园」模块。**首页仍为日历**，底部切换「日历 / 拼豆 / 花园」，保留现有日历状态、拼豆库存/历史/补豆/消耗操作。

花园主要功能：按株与品种管理花卉、种植日期与位置、拍照上传 1–8 张、记录时间和备注、可选记录者昵称、成长时间线（含日记照片查看）、成长日历；花园统一显示历史归档及当前花卉。Web 与手机浏览器复用同一个 React 前端和 Node API。

- **技术选型不变**：React + JavaScript + MUI；Express + Sequelize + MySQL；SSH 发布、PM2/Nginx 和原 GitLab CI。
- **手机 PWA**：在支持的浏览器中通过 HTTPS 打开后可以安装到主屏幕；本阶段不承诺离线记录，Service Worker 不缓存 API 或照片。普通 HTTP 局域网地址通常无法安装为 PWA（localhost 例外）。
- **不做家庭登录**：本阶段不包含登录、成员注册和权限管理。所有可访问当前 yl 的用户也能操作花园，包括修改/删除照片，公网使用者须自行通过现有服务器访问控制限制访问。
- **数据持久化**：新表为 `garden_species`、`garden_plants`、`garden_entries`、`garden_photos`。媒体保存在 `server/uploads/garden/{originals,thumbs,previews}`；yue/yl 现有 `uploads` 备份/恢复递归覆盖这些文件。
- **上传约束**：JPEG、PNG、WEBP、HEIC；单张 20 MiB，最多 8 张，总计 90 MiB。前端提交带时区、精确到秒的 ISO 时间以兼容旧版服务器；后端仍兼容毫秒和时区偏移；花园不再提供独立 ZIP 导出，完整数据备份继续由系统级备份/恢复脚本负责。原图始终保留；Sharp 支持的格式生成 JPEG 缩略图和高分辨率预览。服务器环境缺少 HEIC 编码器时保留原图，在支持 HEIC 的客户端直接查看，其他客户端的 HEIC 预览可能不可用。
- **备份/恢复和发布**：继续使用 `bash release_deploy.sh`（发布前 MySQL + uploads 备份）、`backup_data.sh`、`restore_data.sh`、PM2。发布前必须先通过 MySQL 新表集成测试；新版本不允许清空原日历或拼豆数据。
- **本地验证**：`node --test test/garden-validation.test.cjs`；前端按原 `npm ci --legacy-peer-deps && npm run build`；MySQL 联调使用 `BACKUP_TEST_MYSQL=1 node --test test/garden.integration.cjs`（先安装 server 依赖并设置测试数据库环境）。


React/Vite 前端和 Express/MySQL 后端。GitLab `origin` 为主仓库，默认推送目标为 `origin`。

## 版本基准

- 线上基准标签：`deployed-20260530-131741`，对应提交 `bb21834`。
- GitHub `home/gitlab-master-backup` 保存该基准；旧 `home/master` 保留历史。
- 新发布目录的 `release.json` 记录完整 Git 提交号、分支、UTC 构建时间、是否存在未提交修改及其路径。

## 开发与 CI

```bash
npm ci --legacy-peer-deps
npm test -- --runInBand --testPathIgnorePatterns='test/(ocr|recognize.image).test.js'
node --test test/deployment.test.cjs
npm run build
```

GitLab CI 自动运行上述检查，并在独立 MySQL 8.4 服务上执行 `test/backup.integration.cjs` 和 `test/settings.integration.cjs`。这些测试实际验证数据库行和排班设置恢复、二进制上传文件、恢复预览、恢复前备份、可选配置恢复、损坏备份阻断，以及排班设置保存、后端重启保留、输入校验和并发修改冲突。真实样例图片 OCR 存在既有的 `C5/107` 识别失败，保留为手动 `ocr-integration` 作业，其原断言未删除。

## 排班设置

日历中的“排班设置”按时间线展示生效区间，已有规则按生效日期从新到旧排列，新增入口和新建表单位于最上方。每条规则从生效日期开始循环，直到下一条规则生效。日历、时间线和编辑表单共用班次颜色：白班为粉红、夜班为蓝色、休息为绿色。

新增和编辑使用独立弹窗，修改日期、班次及循环天数后，点击“确认”才写入数据库并刷新日历；“取消”放弃本次草稿。长按每天左侧的拖动柄即可拖拽排序，拖动到弹窗边缘会自动滚动；键盘可用 Alt＋方向键调整。新增日期必须有效且不重复；删除已有排班需确认，至少保留一条排班和一天班次。保存失败保留弹窗草稿；并发冲突时重新加载后再编辑。

设置保存到 MySQL 的 `app_settings` 表（键 `shift-rules`），供当前应用共享，刷新页面或重启后端后保留。首次启动会初始化现有四条规则，已有设置不会被覆盖。至少保留一条规则，每条规则至少有一天，同一生效日期不能重复。其他页面同时修改时会提示冲突，可重新加载后再编辑。

发布前的完整数据库备份包含排班设置，恢复数据库也会恢复这些设置。

长按日历中的某一天约半秒，或点击所选日期下的“调整当天排班”，可在弹窗中设为备班，或选择换后的白班、夜班、休息；换班对象和备注均可选。确认后仅覆盖当天，取消不写入；选择“正常排班（还原）”并确认可移除该日调整。备班使用紫色，换班沿用实际班次颜色并标记“换”，未填写对象时详情显示“已换班”。

单日调整独立保存到 MySQL `app_settings`（键 `shift-day-overrides`），不改变循环规则，也不自动修改其他人的排班。刷新和后端重启后保留，完整数据库备份及恢复包含这些调整。其他设备同时修改时会提示版本冲突，重新加载后再编辑。

## 手机导航与草稿

主要针对 iPhone 的 iOS 浏览器使用。日历和拼豆主页不重复显示顶部模块标题，由底部“日历 / 拼豆”显示当前模块；历史、补豆、消耗均归属拼豆，子页保留顶部返回库存入口。切回拼豆时恢复上次所在的子页面。

日历月份与选中日期、库存筛选与排序、各页面滚动位置在切换时保留。日历和库存首次访问时按需加载，重新进入会更新数据；隐藏页面不主动请求数据。补豆与消耗分别保留数量、备注、色号和所选图片，取消或保存成功后清理对应草稿，保存成功刷新库存。保存请求期间禁止重复提交，浏览器后退也不会解除保存状态。

草稿只在本次打开网页期间保留，刷新或关闭网页会清空；已提交记录和排班设置仍保存在 MySQL。导航适配安全区和动态视口，软键盘压缩视口时收起底部导航，为输入内容腾出空间。桌面窄屏预览不能替代真实 iOS Safari 的键盘和地址栏验证。

## 发布

在 Git Bash/Linux/macOS 中执行；本地需要 Node.js 22、Git、Bash、tar 和 SSH。默认目标是 `root@t-fluid.com:/yl0126`。目标需要 Node.js、MySQL 客户端（mysql/mysqldump）、tar、PM2 及现有的应用 `.env`。数据库账号需具备该库的备份权限（SELECT/SHOW VIEW/TRIGGER/EVENT/SHOW_ROUTINE），恢复还需该库的 CREATE/DROP 权限。

```bash
# 只构建并预览，不连接服务器
bash release_deploy.sh --dryrun

# 构建 -> 远端数据备份到本地并校验 -> 上传代码 -> 重启服务
bash release_deploy.sh
```

备份失败会中止发布。发布目录不包含开发机的 `.env` 或 `uploads`，生产配置和数据保留在远端。可用 `--host`、`--user`、`--port`、`--base` 指定目标，`--backup-dir` 指定本地备份根目录。必须从保存备份的开发机器发起发布；CI 仅做验证，不自动发布。

Windows Git Bash 下，备份/恢复/校验入口会保留远端 `--base` 的 Unix 路径，防止 `/yl0126` 被自动转换为开发机的 Git 安装路径；本地备份目录仍正常转换为 Windows 路径。不要通过关闭参数校验来绕过远端路径错误。

```bash
# 独立备份（Windows 也可直接执行 node scripts/data-backup.mjs backup）
bash backup_data.sh

# 查看线上版本记录
ssh root@t-fluid.com 'cat /yl0126/release.json'
```

备份保存在本地 `backups/backup-<host>-<UTC时间>-<随机后缀>/`，包含 `data.tar.gz` 和 SHA256 清单 `backup.json`。压缩包保存数据库结构/数据/触发器/过程/事件、uploads、.env，以及存在时的 release.json；内部文件逐一校验。MySQL 数据通过 InnoDB 一致性事务快照备份，上传文件随后复制。备份期间不要在外部修改数据库结构或删除上传文件。

`backups/` 不提交 Git。备份内包含凭据和用户数据，请保管本地备份目录。Linux/macOS 下备份目录权限为 700、归档和清单为 600；Windows 下访问权限由当前用户的 NTFS 目录权限决定。

## 恢复数据

将以下 `backups/<备份目录>` 替换为备份命令打印的实际目录。

```bash
# 校验归档和内部文件；不连接目标机器
bash verify_backup.sh 'backups/<备份目录>'

# 默认只校验并预览；不修改目标
bash restore_data.sh 'backups/<备份目录>'

# 先自动备份目标现状，再覆盖目标数据库和 uploads
bash restore_data.sh 'backups/<备份目录>' --apply

# 同时恢复归档中的 .env（仅在目标配置也需要回退时使用）
bash restore_data.sh 'backups/<备份目录>' --apply --restore-env
```

恢复默认使用目标当前 `.env` 中的连接信息，不会连接归档中指定的源数据库；归档 SQL 不含切库指令。`--apply` 会重建该目标数据库并完整替换 uploads，移除备份之后新增的表和文件。恢复前生成的本地备份可用于撤回这次恢复。

`--restore-env` 要求归档与目标的数据库 host/port/name 一致，并预先验证归档中的账号仍可连接；跨目标恢复时省略该选项，保留目标连接配置。目标字符集和排序规则在删除数据之前校验。

生产恢复先上传并校验源归档、按 ID 暂停属于目标目录的 PM2 `yl` 进程，再保存最终的本地安全备份，随后恢复数据并恢复原有运行状态。安全备份失败会恢复原有进程。同名进程属于其他目录时拒绝恢复。若数据恢复失败，已暂停的服务可能保持停止，使用命令打印的恢复前备份修复后再启动。不要让其他进程继续写入该数据库。离线目标可显式使用 `--no-pm2`，本地恢复也不会自动绕过 PM2。

可用 `--host`、`--user`、`--port`、`--base` 将备份恢复到另一台机器；该机器需要已配置的应用 `.env` 和后端依赖。恢复数据不会回滚应用代码，需要代码回滚时使用对应 Git 标签和发布包，重新走带备份的发布流程。

### 花园分页接口与查询成本

- GET /api/garden/plants?status=all&limit=36&cursor=... -> { items, total, has_more, next_cursor }；花园界面固定读取全部花卉（包括历史 archived 状态），保留原状态字段与旧接口参数以兼容既有数据，不迁移、不删除旧记录。
- GET /api/garden/calendar/day?date=YYYY-MM-DD&limit=40&cursor=... -> 同结构；前端必须显示总数，并在 has_more=true 时提供继续加载。
- GET /api/garden/entries?plant_id=ID&limit=40&order=asc&offset=... -> { items, has_more }；成长时间线按 observed_ts ASC、id ASC 正序逐页展示，新增记录在下方，加载更多追加后续日记。省略 order 时保留原 DESC 默认排序，供旧客户端使用。
- 不传 limit/cursor 的旧 API 暂保留数组响应，供旧版客户端过渡（历史接口仍有 500 株/200 条上限）。花园独立 ZIP 导出入口和 /api/garden/export 已删除；完整数据备份通过既有 MySQL + uploads 系统级备份/恢复脚本执行。
- 游标基于排序时间和记录 ID，避免深 offset 分页；查询应按用户请求停止、忽略过期响应。列表照片统计统一通过一次 SQL 聚合完成，而不是对每株花独立查询。
- MySQL 8.4 集成测试覆盖超过 500 株和单日 200 条记录，逐页验证无重复、无丢失，并核对 SQL 次数。运行前后性能 benchmark 时应使用相同数据量和环境，不能把 SQL 次数直接当作毫秒响应时间。


### 拼豆库存：汇总表和升级迁移

拼豆库存新增 MySQL 表 pindou_inventory（按色号储存汇总）和 pindou_inventory_meta（首次初始化标记）。原有 pindou_reminders 流水保持完整，首次升级启动会按主键每批最多 500 条遍历既有流水，在单事务内重建库存，完成后标记已初始化；以后的库存页只读取汇总表。新增补豆、消耗、编辑、删除记录均在同一个事务里同时修改流水和汇总，防止单边提交。

不要删除库存元数据表、手工清空汇总表，或在同一数据库上运行没有该库存逻辑的旧服务并同时写入：旧服务的写入不会自动维护新汇总。生产升级需要先按现有 SSH 脚本备份、停止旧写入进程，再运行新服务；回滚到旧代码前应评估库存表重建方式。运行 test/pindou-stock.integration.cjs（MySQL 8.4）可以验证已有历史回填、并发变更及失败事务回滚。


### 色号查找优化

MARD 调色盘建立一次按色号索引的 Map（src/palette.js），供库存、补豆/消耗、历史、色号选择共用，避免渲染每个颜色块时反复遍历 221 色数组；升序模式不再先做各组排序再做全局排序。现有库存、筛选与页面切换行为不变。


### 照片处理与私有缓存

花园照片处理限制并发解码任务最多 2 个，额外最多排队 8 个，拥塞时拒绝新任务并返回可重试提示。预览先从原图解码生成最大边 2048px 的 JPEG，再从有限尺寸预览生成最大边 560px 缩略图，避免对完整原图重复解码。原图仍禁用浏览器缓存；不可变 UUID 命名的 thumb/preview 返回 private 一天缓存、ETag，允许私有浏览器复用而不触发重复传输。仅本机私有浏览器缓存，不能向共享 CDN 缓存用户媒体。

### 日历滑动优化
手机日历触摸移动使用 requestAnimationFrame 与 CSS translate3d，而不是每个 touchmove 更新 React state。识别纵向滚动和边缘手势，防止误切月份；长按调整排班行为保持。Jest 包含多次 move 合并到一个动画帧、纵向滚动和取消操作的回归测试。实际 iOS Safari 仍需真机确认。

### 花园组件结构
入口 src/Garden.jsx 只保留原有路由和 CSS 兼容。src/garden/GardenScreen.jsx 负责页面切换和汇总；useGardenPlants.js 负责花卉查询、分页、取消和过期结果处理；PlantGrid / PlantEditor / EntryEditor / FlowerDetail / GardenCalendar / GrowthTimeline / PhotoViewer / Shared 负责各自的 UI 与交互。拆分不改变 MySQL 表、API 或 SSH 发布。Jest 保留日历/拼豆/花园三模块导航，并增加 Viewer 与时间线回调测试。

### 花园异常图片验证
花园图片上传校验真实签名，并对解码器无法读取的 HEIC 额外核对 ISO-BMFF ftyp/meta/mdat 容器结构，防止仅包含 HEIC 文件头的假图片落盘；有效 HEIC 在服务器解码器缺失时仍可保留原图。测试包括无文件、恶意或损坏内容、9 张超限、坏时区、上传第二张失败时清理第一张及并发删除。真实 HEVC/HEIC 编码测试仅在 CI 编码器可用时执行，真机 Safari 和服务器 HEIC 解码能力需进一步实测。

### Real browser E2E (Chromium and WebKit)
Run with a disposable MySQL 8.4 installation: npm ci --legacy-peer-deps; npm install --prefix server --omit=dev --package-lock=false; npm install --no-save --legacy-peer-deps --package-lock=false playwright@1.56.1; npx playwright install --with-deps chromium webkit; npm run build; E2E_MYSQL=1 BACKUP_TEST_HOST=127.0.0.1 BACKUP_TEST_PASSWORD=CI-only-password node test/browser-garden.e2e.mjs.
The harness starts the real Express application with a randomly named disposable MySQL database, visits mobile Chromium/WebKit and desktop Chromium, and drops the database afterward. GitLab browser-e2e is a manual release validation job. Linux WebKit cannot substitute for actual iPhone Safari tests.

### SSH 安全分阶段发布与失败恢复
release_deploy.sh 的主流程：先本地构建并验证远端 MySQL/.env/uploads 备份，然后将版本文件传输到现网基础目录下的 .yl-releases/release-* 独立目录；旧代码和 node_modules 始终不覆盖。scripts/activate-staged-release.sh 在新版本目录安装依赖和检查语法，确认 PM2 中旧 yl 的运行目录，再切换服务到新目录，并验证 /api/garden/species HTTP 200。出现依赖安装错误、PM2 启动失败或健康检查失败，自动恢复旧实例；Nginx 只在新服务健康后应用，并保留旧配置用于失败恢复。
运行 Node 故障注入测试：node --test test/deployment-rollback.test.cjs。测试使用临时本地目录及模拟 npm/pm2/curl，不连远程服务器。
重要：这种回滚只恢复代码/进程/网关配置，不会自动回滚已经改变的 MySQL 数据或表结构。正式升级前必须留存可验证备份，并在 SSH staging 完成故障、Nginx 和数据恢复演练。旧代码仍可从上一 PM2 cwd 启动，别在验证前清理旧 .yl-releases。
