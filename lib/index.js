// dsh-api-cost-meter —— 主机半（Cordis 插件）
// 方案：官方余额差量 —— “今日消费 = 当日累计余额减少量”。
// 通过 deepseekAccount 服务读取官方余额；正常余额与赠送余额分开显示，消费按两者总和累计。
import { homedir } from "node:os";
import { join } from "node:path";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const name = "api-cost-meter";

// 后台拉取官方余额的间隔（毫秒）。
const POLL_INTERVAL_MS = 30000;
// 真正调用官方余额接口的最小间隔（节流），避免快照 3 秒一刷打爆官方接口。
const BALANCE_THROTTLE_MS = 15000;

// 登录凭证（DSH 本地持久化），每次打开无需重复登录。
const DSH_VERSION = "0.2.0-rc.2";

function dayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function clientMetadata() {
  return {
    version: DSH_VERSION,
    locale: "zh-CN",
    timezoneOffsetSeconds: -new Date().getTimezoneOffset() * 60,
  };
}

/** 把一组钱包（[{currency, balance}]）按币种汇总。 */
function sumWallets(wallets) {
  const totals = {};
  for (const w of wallets || []) {
    const n = parseFloat(w.balance);
    if (Number.isFinite(n)) totals[w.currency] = (totals[w.currency] || 0) + n;
  }
  return totals;
}

class BalanceMeter {
  constructor(ctx) {
    this.ctx = ctx;
    this.state = this._load(); // { date, lastTotal, spent, normal, bonus }
    this.lastRefreshAt = 0;
  }

  _dataDir() {
    return join(homedir(), ".dsh", "storages", "api-cost-meter");
  }
  _dataFile() {
    return join(this._dataDir(), "balance.json");
  }

  _load() {
    try {
      const parsed = JSON.parse(readFileSync(this._dataFile(), "utf8"));
      if (parsed && parsed.date === dayKey() && parsed.lastTotal && parsed.spent) return parsed;
    } catch {
      /* 首次运行或文件损坏 */
    }
    return null;
  }

  _save() {
    try {
      mkdirSync(this._dataDir(), { recursive: true });
      writeFileSync(this._dataFile(), JSON.stringify(this.state), "utf8");
    } catch {
      /* 持久化失败不影响展示 */
    }
  }

  _service() {
    return this.ctx.get("deepseekAccount");
  }

  /** 读取账号登录状态：credential-stored = 已登录（凭证已保存）。 */
  async accountStatus() {
    const svc = this._service();
    if (!svc) return "unavailable";
    try {
      const st = await svc.getState();
      return st && st.status ? st.status : "unavailable";
    } catch {
      return "unavailable";
    }
  }

  /**
   * 读取官方余额，分为 normal（官网“余额”）与 bonus（赠送余额）。
   * normal_wallets → 正常余额（充值 + 赠送并入）；bonus_wallets → 单独赠送余额。
   */
  async readBalance() {
    const svc = this._service();
    if (!svc) return null;
    try {
      const result = await svc.getBalance(clientMetadata());
      if (!result || result.status !== "ready") return null;
      return {
        normal: sumWallets(result.value),
        bonus: sumWallets(result.bonusWallets),
      };
    } catch {
      return null;
    }
  }

  /** normal + bonus 的总和（用于计算消费，因为扣费可能先扣赠送）。 */
  _totalOf(now) {
    const currencies = new Set([...Object.keys(now.normal), ...Object.keys(now.bonus)]);
    const total = {};
    for (const c of currencies) total[c] = (now.normal[c] || 0) + (now.bonus[c] || 0);
    return total;
  }

  /** 用最新余额推进“今日消费”累计（充值容错：余额上涨不记为消费）。 */
  applyBalance(now) {
    const total = this._totalOf(now);
    const today = dayKey();
    if (!this.state || this.state.date !== today) {
      this.state = {
        date: today,
        lastTotal: { ...total },
        spent: {},
        normal: { ...now.normal },
        bonus: { ...now.bonus },
      };
      for (const c of Object.keys(total)) this.state.spent[c] = 0;
    } else {
      for (const c of Object.keys(total)) {
        const prev = this.state.lastTotal[c] || 0;
        const delta = prev - total[c];
        if (delta > 0) this.state.spent[c] = (this.state.spent[c] || 0) + delta;
        this.state.lastTotal[c] = total[c];
      }
      this.state.normal = { ...now.normal };
      this.state.bonus = { ...now.bonus };
    }
    this._save();
  }

  /** 节流地拉取并推进余额（两次官方接口调用之间至少间隔 BALANCE_THROTTLE_MS）。 */
  async poll() {
    const nowMs = Date.now();
    if (nowMs - this.lastRefreshAt < BALANCE_THROTTLE_MS) {
      return this.state !== null;
    }
    const now = await this.readBalance();
    if (now === null) return this.state !== null;
    this.applyBalance(now);
    this.lastRefreshAt = nowMs;
    return true;
  }

  snapshot() {
    const state = this.state;
    const spent = state ? state.spent : {};
    const currency = Object.prototype.hasOwnProperty.call(spent, "CNY") ? "CNY" : "USD";
    const todaySpend = spent[currency] || 0;
    const normal = state && state.normal ? state.normal[currency] : null;
    const bonus = state && state.bonus ? state.bonus[currency] : null;
    return {
      status: "ready",
      currency,
      todaySpend: round2(todaySpend),
      balance: normal === null || normal === undefined ? null : round2(normal),
      bonusBalance: bonus ? round2(bonus) : null,
      date: state ? state.date : dayKey(),
      perCurrency: spent,
      lastRefreshAt: this.lastRefreshAt,
    };
  }
}

function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(body);
}

function apply(ctx) {
  const meter = new BalanceMeter(ctx);

  // 后台轮询余额（服务可用时自动生效，退出时自动停止）。
  ctx.effect(() => {
    let stopped = false;
    (async () => {
      while (!stopped) {
        try {
          await meter.poll();
        } catch {
          /* 网络/账号波动忽略，下一轮重试 */
        }
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      }
    })();
    return () => {
      stopped = true;
    };
  }, "api-cost-meter: balance poller");

  // 注册 HTTP 路由（webServer 由 dsh-host-webserver 提供）。
  ctx.inject(["webServer"], (webCtx) => {
    webCtx.effect(
      () =>
        webCtx.webServer.register({
          kind: "exact",
          path: "/api-cost/snapshot",
          handler: async (req, res) => {
            if (req.method !== "GET" && req.method !== "HEAD") {
              return json(res, 405, { ok: false, error: "method not allowed" });
            }
            const status = await meter.accountStatus();
            if (status === "unavailable") {
              return json(res, 200, { ok: true, value: { status: "unavailable" } });
            }
            if (status === "signed-out") {
              return json(res, 200, { ok: true, value: { status: "signed-out" } });
            }
            await meter.poll();
            json(res, 200, { ok: true, value: meter.snapshot() });
          },
        }),
      "api-cost-meter: snapshot route",
    );
  });
}

export { apply, name };
