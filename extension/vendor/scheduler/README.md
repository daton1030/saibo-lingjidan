# 调度

执行器在 `shell.js`，官网页点击的门禁在 `official-page.js`。

- 时区：Asia/Shanghai 自然日
- 串行执行。当日已领则跳过。某一项失败不中断其余项
- 只有 `checkinSupported === true` 且 `executable === true` 的平台进入领取队列
- 魔搭 `checkinSupported` 为 false，不进队列。开启每日定时或立即执行时，若本机已保存访问令牌，会单独刷新官方余额
- 未授权返回「需重新登录」。没有官方动作返回「暂不支持」。这两种都不会标成领取成功
- 扩展用 `chrome.alarms`（约每 30 分钟）在浏览器打开时检查是否跨过北京时间自然日。浏览器完全退出时不会后台领取
- 授权时打开该平台自己的官网登录页。用户回来点「我已在官网完成登录」后，看板才显示已授权。官网若提供扫码，用官网页面上的扫码，本项目不做统一扫码页
- 官网页权限只来自 `PAGE_ORIGIN_ALLOWLIST`，并必须写进 manifest 的 `optional_host_permissions`。只有真的要在官网上点击已核验按钮时，才在用户点击授权后申请。当前白名单为空，打开登录页不申请站点权限
- 点击只发生在用户已经打开的官方页面上，不读取 Cookie，不代填密码

核验记录见 `docs/claim-verification.md`。
