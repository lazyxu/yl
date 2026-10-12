# 悦 & 亮

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

日历中的“排班设置”可新增、修改、删除规则，修改生效日期，并增删循环中的每天班次（白班、夜班、休息）。每条规则从生效日期开始循环，直到下一条规则生效；保存后日历立即更新。取消会放弃本次修改。

设置保存到 MySQL 的 `app_settings` 表（键 `shift-rules`），供当前应用共享，刷新页面或重启后端后保留。首次启动会初始化现有四条规则，已有设置不会被覆盖。至少保留一条规则，每条规则至少有一天，同一生效日期不能重复。其他页面同时修改时会提示冲突，可重新加载后再编辑。

发布前的完整数据库备份包含排班设置，恢复数据库也会恢复这些设置。

## 手机导航与草稿

主要针对 iPhone 的 iOS 浏览器使用。底部“日历 / 拼豆”显示当前模块，历史、补豆、消耗均归属拼豆；切回拼豆时恢复上次所在的子页面，顶部返回箭头可回到库存。

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
