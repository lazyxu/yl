# yl：MySQL / Express 100k SQL E2E 性能专项（2026-10-21）

## 结论

**正式业务 SQL 与索引有必要优化，已用隔离 MySQL 8.4 重测并保留效果显著的改动。** 原基线（31 类、小数据）不能外推 10 万。新测试使用每张核心表 100,000 行：花卉、日记、照片元数据、拼豆历史共 400,000 行；42+ 类 SQL/API 读写全部通过。在热点数据集上，列表首屏由 59.98 ms 降至 24.29 ms、品种过滤 120.25 ms 降至 11.59 ms、单日日记 59.05 ms 降至 9.09 ms、热点照片详情 181.98 ms 降至 51.24 ms（独立前后 CI 的 p95）。改动保持业务行为与 SQL 次数不变。

**额外发现并修复 Sequelize `sync({ alter: true })` 重复增加唯一索引的现象。** 在装载 400k 核心记录之后，两次连续重同步耗时 **2.45 / 3.06 秒**，索引总数均为 **20**，行数一致。此前的模型属性 `unique: true` 会产生 `garden_species.name_2`、`garden_photos.storage_name_2` 等重复索引；现改为稳定命名的 UNIQUE index。修复阻止后续增生，并非自动清理旧实例已经积累的重复索引。

## 测试证据与环境

- MySQL **8.4.11**，Linux GitHub Actions Runner，Node 22，Express loopback HTTP，真实 Sequelize/MySQL 8.4；每次随机创建隔离数据库，退出时自动删除，**未连接生产数据库**。
- 原版：[#39568900725](https://github.com/lazyxu/yl/actions/runs/39568900725)。主要索引与聚合优化：[#39569830320](https://github.com/lazyxu/yl/actions/runs/39569830320)。热点删除与回归：[#39571442822](https://github.com/lazyxu/yl/actions/runs/39571442822)。最终 **43 类 API/ORM 测量、全热点、重复启动、4/4 MySQL 集成回归**：[#39574002388](https://github.com/lazyxu/yl/actions/runs/39574002388)。
- 偏斜数据：同株 60,000 条日记/照片、同日 50,000 条；全热点：同株与同日都 100,000 条；每类查询先预热再采样（大部分 9 次，部分写入 5 次、删除 11 次）。
- 每项记录 API p50/p95、Sequelize logging 的 SQL 数、SQL 单语句耗时、响应体字节。p95 在 9 次采样时几乎等于最慢样本，受共享 Runner 抢占、MySQL buffer pool 冷热程度影响；跨轮只作为趋势和多次复核证据，不作为生产 SLA。并行查询的 SQL 单语句耗时**相加**不能与 HTTP wall time 直接对比。
- 旧版历史库存首次重建与热请求分开计时；批量删除是单次重负载观察，不能称为 p95。
- 照片数据集主要是 **metadata**；另实际使用 Sharp 生成小 PNG 通过 multipart 上传、GET thumb/original，未制造 100k 个真实文件。

## 43 类业务 SQL/API p95 全表

| 业务操作 | 原始 100k p95(ms) | 索引/聚合优化后 p95(ms) | 最终偏斜热点 p95(ms) | 单株/单日全热点 p95(ms) | SQL 次数 | 响应字节 |
|---|---:|---:|---:|---:|---:|---:|
| `garden.plants.page1` | 59.98 | 24.29 | 12.32 | 12.76 | 3 | 11122 |
| `garden.plants.active` | 69.43 | 19.54 | 17.00 | 21.52 | 3 | 11097 |
| `garden.plants.archived` | 52.59 | 4.89 | 4.56 | 4.95 | 3 | 11185 |
| `garden.plants.legacy500` | 63.69 | 14.99 | 15.00 | 107.53 | 2 | 152788 |
| `garden.plants.deepCursor50k` | 56.45 | 9.58 | 9.83 | 9.64 | 3 | 11121 |
| `garden.plants.tailCursor99965` | 223.99 | 63.05 | 67.72 | 100.02 | 3 | 10375 |
| `garden.plants.cursor2` | 60.96 | 10.42 | 9.04 | 9.15 | 3 | 11121 |
| `garden.plants.search` | 72.91 | 37.24 | 36.81 | 42.27 | 4 | 11713 |
| `garden.plants.species` | 120.25 | 11.59 | 11.67 | 11.74 | 3 | 11122 |
| `garden.plants.detail` | 181.98 | 51.24 | 51.70 | 82.95 | 2 | 323 |
| `garden.entries.first40` | 4.60 | 2.89 | 4.15 | 3.52 | 1 | 13189 |
| `garden.entries.offset400` | 5.00 | 4.12 | 4.48 | 4.16 | 1 | 13387 |
| `garden.entries.offset50000` | 49.66 | 36.43 | 35.02 | 34.86 | 1 | 13707 |
| `garden.entries.offset58000` | 57.46 | 41.66 | 40.89 | 40.84 | 1 | 13707 |
| `garden.calendar.summary` | 16.63 | 19.80 | 16.13 | 16.00 | 1 | 920 |
| `garden.calendar.day40` | 59.05 | 9.09 | 6.59 | 11.26 | 2 | 6814 |
| `garden.calendar.next40` | 62.74 | 15.68 | 9.24 | 15.58 | 2 | 6814 |
| `garden.calendar.deepCursor25k` | 59.26 | 9.16 | 7.06 | 10.75 | 2 | 6814 |
| `garden.calendar.legacy200` | 62.35 | 8.84 | 9.07 | 8.40 | 1 | 33601 |
| `pindou.inventory.warm` | 2.84 | 2.09 | 2.70 | 2.21 | 1 | 592 |
| `pindou.reminders.latest200` | 51.85 | 44.70 | 5.95 | 5.57 | 1 | 46493 |
| `shifts.rules.get` | 2.83 | 2.40 | 3.22 | 2.37 | 3 | 463 |
| `shifts.overrides.get` | 2.54 | 1.72 | 2.55 | 1.92 | 3 | 28 |
| `pindou.reminders.post` | 4.97 | 3.88 | 228.34 | 4.17 | 4 | 219 |
| `pindou.reminders.update` | 3.94 | 3.68 | 3.19 | 4.52 | 4 | 237 |
| `pindou.reminders.delete` | 19.33 | 19.43 | 4.41 | 3.30 | 5 | 16 |
| `shifts.rules.large.get` | 29.19 | 24.94 | 21.79 | 16.96 | 3 | 333223 |
| `shifts.overrides.update` | 5.94 | 4.99 | 5.86 | 83.76 | 7 | 103 |
| `garden.species.get` | 1.60 | 1.09 | 1.26 | 1.18 | 1 | 108 |
| `garden.species.post` | 4.38 | 3.03 | 3.47 | 3.55 | 4 | 115 |
| `garden.species.patch` | 3.55 | 2.58 | 2.80 | 2.93 | 2 | 113 |
| `garden.species.delete` | 3.00 | 1.98 | 31.66 | 2.27 | 2 | 11 |
| `garden.plants.post` | 5.70 | 5.54 | 5.36 | 4.65 | 4 | 328 |
| `garden.plants.patch` | 187.76 | 72.39 | 54.18 | 85.49 | 5 | 331 |
| `garden.plants.delete` | 4.51 | 2.96 | 2.90 | 5.39 | 3 | 11 |
| `garden.calendar.byPlant` | 60.78 | 14.98 | 13.25 | 20.15 | 1 | 894 |
| `garden.entries.patch` | 4.56 | 13.62 | 3.23 | 3.07 | 2 | 11 |
| `garden.entries.delete` | 3.69 | 3.15 | 4.84 | 3.74 | 2 | 11 |
| `garden.photos.metadata` | 0.74 | 0.45 | 0.43 | 0.48 | 1 | 0 |
| `shifts.rules.large.put` | 49.94 | 26.83 | 34.78 | 180.63 | 7 | 333223 |
| `garden.entries.post.photo` | — | — | 10.12 | 10.04 | 5 | 13 |
| `garden.photos.thumb.http` | — | — | 2.09 | 2.09 | 1 | 269 |
| `garden.photos.original.http` | — | — | 1.46 | 2.88 | 1 | 103 |

新增真实图片测试（最终偏斜 / 全热点 p95）：`garden.entries.post.photo`、`garden.photos.thumb.http`、`garden.photos.original.http`。小图片实验不代表 20 MiB/HEIC/真实磁盘吞吐。

## MySQL EXPLAIN 与 SQL 合理性

| 路径 | 原查询计划问题 | 新查询计划 / 处理 |
|---|---|---|
| 花园列表按日期排序 | 约 100k 行 `ALL; Using filesort` | `(created_at,id)`、`(status,created_at,id)`、`(species_id,created_at,id)` 等复合索引；顺序索引扫描 |
| 单日日记分页 | 命中 `local_date`，仍需 filesort | `(local_date,observed_ts,id)` 顺序索引，单日 50k 首屏从约 59ms 降至约 9ms |
| 某株成长日历 GROUP BY | 临时表 + filesort | `(plant_id,local_date)`，按植物/日期索引聚合 |
| 拼豆最新 200 条历史 | 100k 全表扫描、filesort | `occurred_at` B-tree 索引，完整 SELECT EXPLAIN 使用 index 回溯至 200 条；冷热缓存波动较明显 |
| 花园照片数与最新照片 | `ROW_NUMBER()/COUNT() OVER` 对热点照片大规模物化与排序 | 分组计数 + 最新有图日期 + 同日最大 `photo_id`；保留同时间戳/多照片/无照片正确性 |
| 花园文字包含搜索 `%keyword%` | 仍为全表扫 | 原有子串搜索语义无法直接通过普通 B-tree 消除此扫描；100k 约 40–45ms，**不贸然改成不同语义的全文搜索** |
| 单株日记深 `OFFSET 50k/58k` | 索引读取仍线性跳过 | 约 36–54ms，100k 尚可；更多数据时考虑 seek/cursor 与客户端适配，不能简单移除旧 offset 接口 |

已验证花园普通列表始终约 3 SQL、关键词列表 4 SQL、单日日记约 2 SQL，拼豆库存热请求为 1 SQL。未发现随页面结果条数线性增加的 N+1。

## 极端热点、迁移与破坏性写入

- 全热点 100k 时照片详情 p95 曾测 **115.67ms**、末页 **130.17ms**；即使去掉窗口函数，精确照片计数仍需对某株大量照片执行聚合。这类极端热数据与普通用户分布必须分别判断，不宣称所有规模都在 100ms 以内。
- 100k 拼豆历史仅在首次初始化分批 500 行读取，约 **0.31–0.49s / 209 条 SQL**；后续 GET 库存仅 **1 SQL**。
- 全热点删除植物及其日记/照片元数据：HTTP **4.19s / 3.11s**（不同 Runner），SQL 累计 **1.87s / 1.49s**，其余为应用对象/文件清理等。测试文件不存在，不能以缺失文件清理耗时推断真实磁盘文件删除速度。一次性删除品种关联 100k 花卉为 **1.15s / 0.90s**。
- SQL 写入尖峰须复核中位数与慢 SQL 内容：最终某轮拼豆 POST p50 **3.49ms**、p95 **228.34ms**，慢点是 COMMIT 226ms；另一轮 p95 **3.84ms**。同条件未持续复现，不能据此增加索引或改写事务。
- 带 `100 × 366` 班次规则的 JSON 读写（约 333KB）在表中独立测量，不能与普通简短设置数据混淆。
- 保留严格索引唯一性：`garden_species.name` 与 `garden_photos.storage_name` 改为模型 `indexes` 中的显式命名 UNIQUE，连续两次 `sync({alter:true})` 不再增生额外索引。已有环境遗留重复索引仍需在维护窗口经单独审核后处理，不能直接全自动删除。
- 真实 MySQL CRUD/分页/并发与小规模备份恢复集成测试 **4/4 通过**；另已完成 **100k 数据的完整 `mysqldump`、归档校验与恢复**（见专项记录）。仍未完成真实 iPhone Safari 100k 页面、生产 NAS/存储设备 IO 或 100k 个实际媒体文件的验收。

## 100k 真实 MySQL 全量备份 / 校验 / 恢复 E2E

新增 `SQL_PERF_BACKUP_RESTORE=1` 使用项目既有 `scripts/data-backup.mjs`，在随机隔离 MySQL 8.4.11、已装载 100k/表数据后执行完整备份→verify→人为修改 SQL 与测试文件→带恢复前安全备份的 restore→逐表校验。这是**备份/恢复端到端耗时**，包含 `mysqldump`、压缩、SHA256 校验、再次安全备份和 MySQL 导入，**不得与单次 SQL p95 比较**。

同一隔离工作流进行了**两次独立 CI 尝试**： [GitHub Actions #39576016798](https://github.com/lazyxu/yl/actions/runs/39576016798)，两轮均成功，每轮包含 43 类 SQL/API 请求和完整备份/校验/恢复流程。

| 环节 | 第一轮 | 第二轮 |
|---|---:|---:|
| 备份（内部包含归档校验） | **3,062.28 ms** | **2,873.53 ms** |
| 单独 `verify` | **660.69 ms** | **559.45 ms** |
| 恢复（包括事前安全备份） | **11,115.19 ms** | **12,061.38 ms** |
| 生成的压缩归档 | **4,553,523 字节** | **4,553,078 字节** |

备份前实际表记录（性能测试已经执行若干业务 POST）：

| 表 | 恢复记录数量 | 主键范围 |
|---|---:|---|
| `garden_plants` | 100,006 | 1–100006 |
| `garden_entries` | 100,000 | 1–100000 |
| `garden_photos` | 100,000 | 1–100000 |
| `pindou_reminders` | 100,006 | 1–100006 |

备份后故意删除一条拼豆历史、添加仅存在于备份之后的表、覆盖已备份的测试文件；restore 后四表数量/主键边界恢复一致，新增表消失，测试文件内容恢复。原有小数据全量备份集成覆盖权限、校验损坏等异常路径，此次关注真实 100k 恢复耗时与数据正确性。

**结论**：隔离 CI + 合成 metadata 的 100k SQL 完整备份约 3 秒、全量恢复约 11 秒，在该环境和体量下没有异常；不能外推到真实 100k 张原图/缩略图的文件备份、远端网络、NAS 磁盘 IO 或生产恢复窗口。

## 保留与运行方式

保留已用前后 E2E 验证有显著收益的索引、聚合及 UNIQUE 稳定命名；不更改业务返回契约、不加入额外缓存与历史数据迁移。压测数据始终随机隔离、自动删除。

手工执行（务必连接一次性 MySQL，不得连接生产库）：

```bash
BACKUP_TEST_MYSQL=1 BACKUP_TEST_HOST=127.0.0.1 BACKUP_TEST_PASSWORD=ci-only-password node test/sql-performance-100k.e2e.cjs
SQL_PERF_SCENARIO=all-hot SQL_PERF_DESTRUCTIVE=1 BACKUP_TEST_MYSQL=1 BACKUP_TEST_HOST=127.0.0.1 BACKUP_TEST_PASSWORD=ci-only-password node test/sql-performance-100k.e2e.cjs
SQL_PERF_SCHEMA_RESTART=1 BACKUP_TEST_MYSQL=1 BACKUP_TEST_HOST=127.0.0.1 BACKUP_TEST_PASSWORD=ci-only-password node test/sql-performance-100k.e2e.cjs
SQL_PERF_BACKUP_RESTORE=1 BACKUP_TEST_MYSQL=1 BACKUP_TEST_HOST=127.0.0.1 BACKUP_TEST_PASSWORD=ci-only-password node test/sql-performance-100k.e2e.cjs
```

长期验证使用 GitLab 手动 `sql-performance-100k-e2e`，不增加普通 MR/每日 CI 负荷。源码/CI 级功能和安全测试继续执行；不可接触的真实生产环境验收**按用户决定跳过（未验收）**，不作为代码/PR 合并门槛。
