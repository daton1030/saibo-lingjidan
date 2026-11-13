# 赛博领鸡蛋

把各平台能免费领的大模型额度收成一张看板。本仓库是第一份可运行的后台原型：开源看板、Chrome Manifest V3 扩展骨架、平台适配器接口，以及第一个真实适配器——**魔搭（ModelScope）官方魔粒余额读取**。

访问令牌只保存在你自己电脑的 `chrome.storage.local` 里，不会上传，也不会进入看板网页。本项目没有中心账号服务器。

> 开源协议尚未确定（MIT 或 Apache-2.0 仍待确认），因此仓库暂时不放 LICENSE 文件。名称和 Logo 计划另行保留商标。

## 5 步试用

1. 进入本仓库根目录，启动静态服务（看板要从 `http://localhost` 打开，扩展才能和它通信）：

   ```bash
   python3 -m http.server 8080
   ```

2. 用 Chrome 打开 `chrome://extensions`，打开右上角「开发者模式」，点击「加载已解压的扩展程序」，选中本仓库里的 `extension/` 目录。

3. 在扩展的选项页保存魔搭访问令牌：到官方页面 [modelscope.cn/my/myaccesstoken](https://modelscope.cn/my/myaccesstoken) 创建或复制你自己的令牌，粘贴后点「保存到本机」。令牌不会回显，也不会上传。可点「测试读取余额」确认官方接口可用。

4. 打开 [http://localhost:8080/web/](http://localhost:8080/web/)。顶栏应显示「扩展已连接」。点开「魔搭社区」卡片，再点「读取余额」。

5. 如果暂时没有访问令牌，不要编造余额。可打开 [http://localhost:8080/web/?fixture=modelscope&open=modelscope&guide=0](http://localhost:8080/web/?fixture=modelscope&open=modelscope&guide=0) 查看官方 OpenAPI 文档里的示例响应（998.5 魔粒），页面会标明这是夹具，不会向魔搭发送请求。

6. 自动领取只在本机看板可用。打开 [http://localhost:8080/web/](http://localhost:8080/web/)，确认顶栏是「扩展已连接」，然后可以：

   - 点「授权自动领取」。这只同意扩展在本机执行已核验的官方动作，不会上传令牌。
   - 点「立即执行一次」，或「开启每日自动领取」。定时按北京时间自然日检查，浏览器要开着；当日已经执行过会跳过。
   - 左侧「最近一次结果」会写明结果。取消授权会关掉定时，但不会删掉已保存的令牌。

   扩展选项页里有同样的四个按钮。当前没有已核验的官网页领取按钮，所以执行结果是「暂不支持」，不会写成领取成功。若已保存魔搭令牌，同一次执行只刷新官方余额。

可选：在仓库根目录执行 `npm test`，不需要真实令牌。改过 `adapters/` 或 `scheduler/` 后，再执行 `npm run sync-extension`，让扩展里的副本跟上。

## 两种运行模式

**公开网页**（默认，含测试站、GitHub Pages，以及未加 `?demo=1` 的本机页面）

- 提供每日羊毛、官方活动、已核实的领取入口和平台介绍。
- 不会模拟「领取成功」，也不会改动积分数字。未接入真实领取的卡片会引导你打开已核实的官方入口。
- 收益区把真实账户、官方价估算和演示数据分开，不会把它们加总成一个看似真实的人民币数字。没有已核实的可领取金额时，「今天还能领」显示「—」；没有已核实领取记录时，「本月已领到」显示「暂无」，不会用演示基数凑数。
- 官方余额查询、个人领取记录和授权，需要在本机 `http://localhost` 打开看板并安装扩展。配套扩展目前只匹配 `localhost` / `127.0.0.1`，公开网站无法连接扩展。令牌只留本机。
- 公开页和 Surge 测试站不能自动领取，也不会申请官网页权限。那里仍然只跳转已核实的官方入口。

**演示模式**（地址栏加上 `?demo=1`，可与 `?fixture=modelscope` 并存）

- 页面会持续显示「演示模式：领取成功为模拟，不会向任何平台发送请求」。
- 可在浏览器里体验模拟领取交互，所有成功或失败提示都会写明「模拟」。
- 演示汇总可以保留，但会标明「演示」，不得当作真实收益。

测试站日常请用 [https://saibo-lingjidan.surge.sh/?guide=0](https://saibo-lingjidan.surge.sh/?guide=0)（不要默认带 `fresh=1`，否则会跳过已保存的本机状态）。需要看模拟领取时用 `?demo=1&guide=0`。需要清空本机状态时再加 `fresh=1`。

## 什么是真实的，什么仍是演示

**真实（本切片已接通）**

- 魔搭余额：使用你自己的访问令牌，请求官方 OpenAPI `GET https://modelscope.cn/openapi/v1/magicubes/balance`（Bearer Token）。规范见 [OpenAPI JSON](https://modelscope.cn/.well-known/openapi.json) 中的 `Magicube` / `getBalance`。须在本机 localhost 打开看板并安装扩展。
- 魔搭「签到」：官方没有签到接口，每日魔粒在登录官网时自动到账。卡片固定为「无每日签到」，**不会假装领取成功**。
- 令牌存储与扩展 ↔ 看板通信（`postMessage`，令牌不离开扩展；扩展不匹配公开网站）。
- 本机执行器：授权、取消授权、立即执行一次、按北京时间自然日开关定时，并把最近一次结果放回看板。魔搭余额可以跟着这轮刷新。领取队列目前是空的，见下面的核验记录。

**仍是演示 / 尚未实现**

- 卡册里除魔搭以外的平台：余额与账户状态仍是前端演示数据。公开模式不会模拟一键签到成功；加上 `?demo=1` 后可在浏览器里模拟领取，并会标明「模拟」。
- 「薅羊毛」板块的条目来自已核验的官方页面摘要，不是实时爬取；金额与截止时间以官方页为准。
- 「在用户已登录的官方页面上点击官方按钮」：执行器已经接上，但 2026-11-13 核验后没有任何平台同时具备官网页按钮和可核对的成功文案，所以白名单是空的，不会真的去点。桌面客户端里的签到（Qoder、Trae、通义灵码旧活动）不能用浏览器扩展代点。
- 没有官方「积分 → Token」和「每百万 Token 人民币单价」的平台（包括魔搭）显示「暂无官方价，不估值」，不会编造价格，也不会把魔粒换算成人民币填进汇总。魔搭官方按**调用次数**扣减魔粒，见 [魔粒体系说明](https://modelscope.cn/posts/435591)。
- 每日定时会跑执行器，但不会执行未核验的领取，也不会把模拟签到带回公开页。细节见 [docs/claim-verification.md](docs/claim-verification.md)。
- 多设备同步、付费版服务尚未开始。

## 魔搭官方依据

| 事项 | 说明 | 来源 |
| --- | --- | --- |
| 查询余额 | `GET /openapi/v1/magicubes/balance`，`Authorization: Bearer <访问令牌>`，返回 `total_balance`、`available_balance`、`frozen_amount` | https://modelscope.cn/.well-known/openapi.json （规范版本 1.1.0+master.20261103T083422Z） |
| 没有签到接口 | 注册并登录后每日 200 魔粒自动到账；绑定阿里云再加 50。本项目不调用任何非公开登录接口来「代领」 | https://modelscope.cn/posts/435591 |
| Token / 人民币估值 | 官方按次扣减（轻量 0.5、主流 1、旗舰 2 魔粒/次），没有按 Token 或人民币的官方单价，故不估值 | 同上 |
| 访问令牌 | 用户在官方控制台自行创建 | https://modelscope.cn/my/myaccesstoken |
| 查看魔粒 | 官方页面 | https://modelscope.cn/magicube/usage |

未读取到的余额显示「尚未读取」，不会写成 0。

## 项目结构

```
adapters/           共享适配器：checkin() / getBalance() / productInfo
rates/rates.json    公开换算表（不把汇率写死在逻辑里）
extension/          Chrome Manifest V3 扩展（选项页保存令牌）
scheduler/          本机执行器：串行、跳过已领、单点失败不中断；接扩展闹钟
docs/               2026-11-13 的官方领取核验记录
web/                看板（由原先的前台 Demo 演进而来）
deals/              公开「薅羊毛」活动表与校验加载器
tests/              汇率换算、魔搭响应解析与活动表校验的单元测试（使用官方形状的夹具）
```

扩展里的 `extension/vendor/` 是 `adapters/`、`rates/` 与 `deals/` 的副本。修改源文件后请运行 `npm run sync-extension`。

原先的前台 Demo 路径 `/workspace/saibo-lingjidan-demo` 已指向 `web/`，避免旧链接失效。


## 薅羊毛

看板在「我的卡册」下方增加「薅羊毛」板块，展示官方活动、折扣、注册优惠、邀请奖励和免费额度。数据来自公开的 `deals/deals.json`（schemaVersion 2）。领取频次、核验状态、档期状态是三个独立字段：

- `claimFrequency`（入库，必填）：每日、每周、每月、一次性、长期免费、限时活动、无需领取自动发放。
- `verificationStatus`（可入库）：待核验 / 已失效应尊重人工标注。入库为已核验时，加载器按 7 个 Asia/Shanghai 日历日（自 `verifiedAt` 起算，常量 `VERIFICATION_STALE_DAYS`）计算，满 7 天后变为「需重新核验」。已结束不等于自动已失效。
- `availabilityStatus`（由加载器计算，不入库）：未开始、进行中、即将结束、已结束、截止时间未知。无截止日期不再默认「进行中」。长期免费且已核验时，展示文案为「长期有效」，枚举值仍是「截止时间未知」。为兼容旧调用，`deal.status` 等于 `availabilityStatus`。

另有必填的 `claimAction`：自动到账、去官方领取、暂不支持。首页优先展示已核验的「即将结束」和「每日可领」；新用户一次性福利单独分组，不会计入「今天还能领」。超过核验周期或待核验、已失效的条目，不会排在这些已确认项前面。

活动信息可能随时变化，领取前请以官方页面为准。本项目不提供返利、邀请或联盟链接，也不会提示多开或非官方领取方法。

URL 参数：`?deal=<id>` 或 `?open=deal:<id>` 可直接打开某条活动。日常测试请用 `?guide=0`，不要默认带 `fresh=1`。`?fresh=1` 会持久清除本机保存的卡片状态和羊毛标记。

### 如何贡献一条羊毛（PR 到 deals.json）

欢迎通过 Pull Request 向 `deals/deals.json` 补充仍在进行的官方优惠。请遵守：

1. 只提交你亲自打开并核验过的**官方页面**（帮助文档、定价页、官方博客或控制台公告）。把该页填入 `sourceUrl`，把官方领取/开通入口填入 `officialEntryUrl`（`claimAction` 为「暂不支持」时可留空），并把核验当天的日期写入 `verifiedAt`（`YYYY-MM-DD`）。
2. 不得编造金额、日期或价格。官方没写清楚的字段请省略，或在摘要/条件里写「以官方页为准」。
3. `type` 只能是：`活动`、`折扣`、`注册优惠`、`邀请奖励`、`免费额度`。`region` 只能是：`国内` 或 `国际`。必须同时填写 `claimFrequency`、`verificationStatus` 和 `claimAction`，取值见上一节。不要把档期写进 `verificationStatus`，也不要手写 `availabilityStatus`。
4. 不要提交返利链接、邀请码、联盟参数，或任何非官方、逆向、多账号的「技巧」。
5. 提交前在仓库根目录运行 `npm test`。无效条目会被加载器丢弃。

看板里的「我知道一个羊毛」会指向本节。

## 原则

- 不搬运、不调用 XD Pool / Jet Hub / CreditDaddy 等项目的非公开客户端接口，不采集 Cookie，不解密凭据，不多账号轮换。
- 不为魔搭编造未文档化的接口。
- 不在仓库、日志或网页里写入真实令牌。本地环境文件已列入 `.gitignore`。
