# dsh-api-cost-meter

在 DeepSeek Harness 对话框下方实时显示**今日 API 消费金额**。

## 方案：官方余额差量

“今日消费 = 当日累计余额减少量”。插件通过 DeepSeek 官方账号接口读取实时余额，与当天首个观测到的余额对比，得出真实扣费金额（不依赖单价表）。

## 登录说明（只需一次）

- 首次在「设置 → 账号」里登录一次 DeepSeek 账号。
- DSH 会把登录凭证**本地持久化保存**，之后每次打开 DeepSeek Harness 都**自动读取凭证查余额，无需重复登录**。
- 仅当凭证过期被服务器拒绝、或你手动退出登录时，才需要重新登录。

## 功能

- 在对话框下方（`conversation.composer.dock` 插槽）显示：`今日 API 消费 ¥x.xx · 余额 ¥y.yy`。
- 后台每 30 秒拉取一次官方余额，客户端每 3 秒刷新显示（读缓存，不额外打官方接口）。
- 跨天自动归零；数据持久化到 `~/.dsh/storages/api-cost-meter/balance.json`。
- 充值容错：余额上涨记为“充值”而非“负消费”。
- 未登录时显示提示，指引去设置里登录。

## 安装

三种方式任选其一，安装后在插件列表启用 `dsh-api-cost-meter`，刷新页面即可在对话框下方看到消费条。

**① 本地目录**（解压 zip 后）：

```bash
dsh plugin install <本目录绝对路径>
```

**② GitHub**：

```bash
dsh plugin install git+https://github.com/<用户名>/<仓库名>.git
```

**③ npm**：

```bash
dsh plugin install <npm 包名>
```

## 说明

- 余额差量反映的是**官方真实扣费**；若两次拉取之间恰好同时发生“充值”与“扣费”，单次采样可能低估（极罕见，可通过减小轮询间隔缓解）。
- 余额可能因官方结算存在秒级到分钟级延迟，属正常现象。

## 文件结构

```
dsh-api-cost-meter/
├── package.json        # dsh.bundle（补丁）+ dsh.client（客户端入口）+ main（主机入口）
├── cordis.patch.yml    # bundle 补丁：插入本插件加载行
├── LICENSE             # MIT 许可
├── .gitignore
├── lib/
│   ├── index.js        # 主机半：余额差量计算 + HTTP 路由
│   └── client.js       # 客户端半：消费条 UI
└── README.md
```
