# yl — MySQL SQL E2E 性能审计（2026-10-21）

## 结论

**本次没有发现可稳定复现的慢 SQL、N+1 或重复扫描历史账本；无需修改业务 SQL 或索引。**
31 类接口/ORM 操作在相互独立、不并行运行浏览器或备份任务的两次 MySQL 8.4 CI 基准中，最慢 p95 分别为 **19.03 ms / 19.44 ms**。该环境数据量不代表生产负载、网络 RTT，也不构成硬 SLA。

源代码：`test/sql-performance.e2e.cjs`；长期 CI：GitLab `sql-performance-e2e`（手动 / tag）。
复测证据：[单独两轮 GitHub Actions](https://github.com/lazyxu/yl/actions/runs/39567488285)；此前 Node SQL/备份与浏览器完整 E2E：[GitHub Actions #39565271252](https://github.com/lazyxu/yl/actions/runs/39565271252)。

## 受控方法和数据量

- Node.js 22 + Linux GitHub Runner + **独立 MySQL 8.4 服务容器**，Express loopback HTTP；每次自动创建随机临时数据库，并在 `finally` 中删除。
- 720 株花卉、1,500 条成长记录、1,100 条照片元数据、1,250 条拼豆历史；其中同一天 580 条成长记录，单株 530 条；排班最大 100 条规则，每条 366 天，读取/写入约 333 KB JSON。
- SQL 统计用 Sequelize 的 `benchmark`、`logging`；记录 SQL 次数、执行时间、端到端 HTTP 响应 p50/p95 与响应字节数。采样先预热，随后重复运行；DELETE 的 fixture 提前建立，**不把 POST 时间混进 DELETE**。仅 `garden.photos.metadata` 为 ORM 直接调用，其余均为实际 Express 路由。
- 数据准备（含表创建与批量插入）：**328 ms / 282 ms**；1250 条历史首次物化库存：**40.81 ms / 38.24 ms，11 条 SQL**。常规库存读取只有 **1 条 SQL**。
- 所有接口 p95 为测试机本地网络/数据库条件。共享 CI 对单次最慢样本很敏感，因此保留两次独立重复测试，不以一次尖峰证明业务瓶颈。

## 各类 SQL 操作 p95（毫秒）

| 操作 | 第一轮 p95 | 第二轮 p95 | SQL 次数 | 响应字节（约） |
|---|---:|---:|---:|---:|
| `garden.plants.page1` | 11.23 | 9.69 | 3 | 10,971 |
| `garden.plants.cursor2` | 4.06 | 4.09 | 3 | 10,971 |
| `garden.plants.search` | 3.95 | 4.74 | 4 | 11,619 |
| `garden.plants.species` | 2.65 | 3.03 | 3 | 10,971 |
| `garden.plants.detail` | 2.79 | 2.69 | 2 | 319 |
| `garden.entries.first40` | 3.38 | 3.35 | 1 | 13,189 |
| `garden.entries.offset400` | 4.12 | 3.62 | 1 | 13,387 |
| `garden.calendar.summary` | 1.25 | 1.28 | 1 | 866 |
| `garden.calendar.day40` | 3.78 | 4.15 | 2 | 5,984 |
| `garden.calendar.next40` | 3.63 | 3.68 | 2 | 6,393 |
| `pindou.inventory.warm` | 1.04 | 1.07 | 1 | 552 |
| `pindou.reminders.latest200` | 5.13 | 5.23 | 1 | 46,493 |
| `shifts.rules.get` | 1.74 | 1.67 | 3 | 463 |
| `shifts.overrides.get` | 1.93 | 1.51 | 3 | 28 |
| `pindou.reminders.post` | 3.10 | 3.18 | 4 | 217 |
| `pindou.reminders.update` | 2.58 | 2.79 | 4 | 235 |
| `pindou.reminders.delete` | 3.08 | 2.72 | 5 | 16 |
| `shifts.rules.large.get` | 10.41 | 9.90 | 3 | 333,223 |
| `shifts.overrides.update` | 3.97 | 3.85 | 7 | 103 |
| `garden.species.get` | 1.00 | 1.25 | 1 | 108 |
| `garden.species.post` | 4.02 | 4.63 | 4 | 115 |
| `garden.species.patch` | 2.51 | 2.50 | 2 | 113 |
| `garden.species.delete` | 1.74 | 1.83 | 2 | 11 |
| `garden.plants.post` | 3.63 | 3.53 | 4 | 325 |
| `garden.plants.patch` | 6.54 | 5.96 | 5 | 327 |
| `garden.plants.delete` | 2.61 | 2.68 | 3 | 11 |
| `garden.calendar.byPlant` | 3.26 | 2.64 | 1 | 34 |
| `garden.entries.patch` | 2.40 | 2.59 | 2 | 11 |
| `garden.entries.delete` | 2.29 | 2.38 | 2 | 11 |
| `garden.photos.metadata` | 0.43 | 0.46 | 1 | 0 |
| `shifts.rules.large.put` | 19.03 | 19.44 | 7 | 333,223 |

## 真实 SQL 集成与浏览器 E2E

同一代码基线的完整 CI（#39565271252）将耗时严格区分：
- Node/MySQL 集成测试：**7 通过、1 跳过**（CI 无 HEVC 编码器），整个组约 **4.55 秒**，其中花园 CRUD+分页 **1.443 秒**、拼豆事务/初始化 **0.927 秒**、排班持久化/重启 **1.523 秒**、备份恢复 **4.474 秒**（Node test 文件并发执行，因此单项耗时不应简单相加）。
- MySQL 备份恢复包含多个 mysql/mysqldump 子进程、文件写入、进程检查，不是 SQL SELECT 延时；目前 4.47 秒合理。
- 真 Chromium/WebKit 在线 E2E：7 个分辨率与主题场景约 **93 秒**；断网 PWA：2 个浏览器场景约 **26 秒**。其中浏览器启动、UI 渲染、照片缩略图、Service Worker、网络故障模拟占用时间，不能作为 SQL 性能结果。
- 定量 N+1 保护：花园普通分页固定 **3 次 SQL**，关键词搜索 **4 次**，日历分页 **2 次**，库存读取 **1 次**；SQL 次数未随页内记录数线性增长。

## 异常值复查、保留优化标准

共享 runner 上一次将 `POST + DELETE` 混合计时，曾记录 p95 **221.41 ms / 9 次 SQL**；方法更正并隔离 runner 后，**纯 DELETE p95 为 3.08 ms / 2.72 ms，固定 5 次 SQL**。这是基准方法/资源竞争造成的误判，不是可复现的慢删除事务。

**本次不做任何业务 SQL 或索引优化。** 后续首先要对同条件数据集测基线；若 p95 明显增加（排查参考值 >100 ms 或同规模 >2× 基线）、查询数随记录规模线性增长、或者新负载如 10 万历史出现退化，再收集 EXPLAIN / lock wait、做最小改动并复测。仅在收益显著且事务、分页与重启回归均通过时保留。

## 验收边界

以上是 CI 隔离数据库基准，**非生产 MySQL、NAS、真实 iPhone Safari**；没有读取、访问或变更真实生产库。真实生产环境安全/性能验收未执行，不阻塞本次代码与 CI 工作。
