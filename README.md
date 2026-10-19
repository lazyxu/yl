# yl

## 花园日记：第三个一级模块

2026-10 起，yl 在现有日历和拼豆之外，增加「花园」模块。**首页仍为日历**，底部切换「日历 / 拼豆 / 花园」，保留现有日历状态、拼豆库存/历史/补豆/消耗操作。

花园主要功能：按株与品种管理花卉、种植日期与位置、拍照上传 1–8 张、记录时间和备注、可选记录者昵称、成长时间线、照片网格、成长前后对比、成长日历、花卉归档、完整 ZIP 导出。Web 与手机浏览器复用同一个 React 前端和 Node API。

- **技术选型不变**：React + JavaScript + MUI；Express + Sequelize + MySQL；SSH 发布、PM2/Nginx 和原 GitLab CI。
- **手机 PWA**：在支持的浏览器中通过 HTTPS 打开后可以安装到主屏幕；本阶段不承诺离线记录，Service Worker 不缓存 API 或照片。普通 HTTP 局域网地址通常无法安装为 PWA（localhost 例外）。
- **不做家庭登录**：本阶段不包含登录、成员注册和权限管理。所有可访问当前 yl 的用户也能操作花园，包括修改/删除照片，公网使用者须自行通过现有服务器访问控制限制访问。
- **数据持久化**：新表为 `garden_species`、`garden_plants`、`garden_entries`、`garden_photos`。媒体保存在 `server/uploads/garden/{originals,thumbs,previews}`；yue/yl 现有 `uploads` 备份/恢复递归覆盖这些文件。
- **上传约束**：JPEG、PNG、WEBP、HEIC；单张 20 MiB，最多 8 张，总计 90 MiB。前端提交带时区、精确到秒的 ISO 时间以兼容旧版服务器；后端仍兼容毫秒和时区偏移；花园首页提供下载完整 ZIP 原图与清单的入口。原图始终保留；Sharp 支持的格式生成 JPEG 缩略图和高分辨率预览。服务器环境缺少 HEIC 编码器时保留原图，在支持 HEIC 的客户端直接查看，其他客户端的 HEIC 预览可能不可用。
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

## 拼豆上传与本地时间安全约定

拼豆图片上传现在要求实际 JPEG/PNG/WEBP/HEIC 图片（HEIC 取决于 Sharp 解码支持）；服务器检查文件内容、解码并重新编码，剥离不可信元数据，以随机文件名保存。历史图片 URL 在内容与文件扩展名确实匹配时保持可访问，HTML/SVG 等主动内容不能通过图片接口执行。已选图片上传失败时本次补豆/消耗不保存，原草稿保留以便重试。

拼豆历史 `datetime-local` 使用访问设备当地时间，提交保存 ISO UTC 时间。没有填写批量数量时，已有正整数色号数量也允许直接保存。
