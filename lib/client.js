// dsh-api-cost-meter —— 客户端半（浏览器插件）
// 在对话框下方（conversation.composer.dock 插槽）渲染“今日 API 消费”状态条。
// 通过 fetch 轮询主机的 /api-cost/snapshot（官方余额差量）。
window.__ModuleLoader__.load({
  id: "dsh-api-cost-meter",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    let react = require("react");
    let jsxRuntime = require("react/jsx-runtime");
    const { jsx, jsxs } = jsxRuntime;

    const inject = ["slots"];

    const css =
      ".acm_dock{box-sizing:border-box;width:calc(100% - var(--dsh-composer-side-clearance,0px)*2 - var(--dsh-composer-dock-inset,0px)*4);margin:0 auto}" +
      ".acm_bar{isolation:isolate;box-sizing:border-box;width:100%;max-width:calc(var(--dsh-composer-card-max-width,748px) - var(--dsh-composer-dock-inset,0px)*4);--dsw-elevation-stroke-color:var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-md);height:32px;box-shadow:var(--dsw-elevation-panel);border:0;align-items:center;gap:8px;margin:0 auto;padding:0 10px;display:flex;position:relative}" +
      ".acm_bar:before{z-index:-1;border-radius:inherit;background:var(--dsw-specific-menu);backdrop-filter:var(--dsw-menu-backdrop-filter);content:\"\";pointer-events:none;position:absolute;inset:0}" +
      ".acm_label{color:var(--dsw-alias-label-secondary);flex:none;font-size:12px;line-height:20px}" +
      ".acm_amount{color:var(--dsw-alias-label-primary);flex:none;font-size:13px;font-weight:600;line-height:20px}" +
      ".acm_sub{color:var(--dsw-alias-label-tertiary);flex:none;font-size:11px;line-height:20px}" +
      ".acm_balance{min-width:0;color:var(--dsw-alias-label-tertiary);text-overflow:ellipsis;white-space:nowrap;flex:1;font-size:11px;line-height:20px;overflow:hidden}" +
      ".acm_hint{min-width:0;color:var(--dsw-alias-label-tertiary);text-overflow:ellipsis;white-space:nowrap;flex:1;font-size:12px;line-height:20px;overflow:hidden}" +
      ".acm_error{min-width:0;color:var(--dsw-alias-state-error-primary);text-overflow:ellipsis;white-space:nowrap;flex:1;font-size:12px;line-height:20px;overflow:hidden}";

    const CSS_TAG = "dsh-api-cost-meter";
    if (typeof document !== "undefined" && document.querySelector('style[data-plugin-css="' + CSS_TAG + '"]') === null) {
      const tag = document.createElement("style");
      tag.dataset.plugin = "dsh-api-cost-meter";
      tag.dataset.pluginCss = CSS_TAG;
      tag.textContent = css;
      document.head.appendChild(tag);
    }

    function fmt(n) {
      return Number(n || 0).toFixed(2);
    }

    function symbol(currency) {
      return currency === "USD" ? "$" : "¥";
    }

    function ApiCostDock() {
      const [data, setData] = react.useState(null);
      const [error, setError] = react.useState(null);

      react.useEffect(() => {
        let alive = true;
        async function tick() {
          try {
            const res = await fetch("/api-cost/snapshot", { cache: "no-store" });
            if (!res.ok) throw new Error("HTTP " + res.status);
            const body = await res.json();
            if (!alive) return;
            if (body && body.ok) {
              setData(body.value);
              setError(null);
            } else {
              setError((body && body.error) || "读取失败");
            }
          } catch (e) {
            if (alive) setError(e && e.message ? e.message : String(e));
          }
        }
        tick();
        const id = setInterval(tick, 3000);
        return () => {
          alive = false;
          clearInterval(id);
        };
      }, []);

      if (error) {
        return jsx("div", { className: "acm_dock", "data-api-cost": true, children:
          jsxs("div", { className: "acm_bar", children: [
            jsx("span", { className: "acm_label", children: "今日 API 消费" }),
            jsx("span", { className: "acm_error", children: String(error) }),
          ]}),
        });
      }

      if (!data) {
        return jsx("div", { className: "acm_dock", "data-api-cost": true, children:
          jsx("div", { className: "acm_bar", children:
            jsx("span", { className: "acm_label", children: "今日 API 消费：加载中…" }),
          }),
        });
      }

      if (data.status === "signed-out") {
        return jsx("div", { className: "acm_dock", "data-api-cost": true, children:
          jsxs("div", { className: "acm_bar", children: [
            jsx("span", { className: "acm_label", children: "今日 API 消费" }),
            jsx("span", { className: "acm_hint", children: "未登录账号 —— 请在「设置 → 账号」里登录一次，之后无需重复登录" }),
          ]}),
        });
      }

      if (data.status === "unavailable") {
        return jsx("div", { className: "acm_dock", "data-api-cost": true, children:
          jsxs("div", { className: "acm_bar", children: [
            jsx("span", { className: "acm_label", children: "今日 API 消费" }),
            jsx("span", { className: "acm_hint", children: "余额服务不可用" }),
          ]}),
        });
      }

      const cur = symbol(data.currency);
      return jsx("div", { className: "acm_dock", "data-api-cost": true, children:
        jsxs("div", { className: "acm_bar", children: [
          jsx("span", { className: "acm_label", children: "今日 API 消费" }),
          jsx("span", { className: "acm_amount", children: cur + fmt(data.todaySpend) }),
          data.balance != null && jsx("span", { className: "acm_balance", children: "余额 " + cur + fmt(data.balance) }),
          data.bonusBalance != null && jsx("span", { className: "acm_balance", children: "赠送 " + cur + fmt(data.bonusBalance) }),
        ]}),
      });
    }

    function apply(ctx) {
      ctx.slots.inject("conversation.composer.dock", () =>
        ctx.slots.register(
          {
            name: "conversation.composer.dock",
            id: "api-cost",
            order: 30,
            label: () => "今日 API 消费",
          },
          ApiCostDock,
        ),
      );
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  },
});
