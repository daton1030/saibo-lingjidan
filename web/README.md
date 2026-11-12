# 赛博领鸡蛋 · 看板

由原先的纯前端 Demo 演进而来，仍可单独打开。未加载扩展时，除魔搭卡片改为「尚未读取 / 无每日签到」外，其他卡片保持原有演示数据和交互。

在仓库根目录启动：

```bash
python3 -m http.server 8080
```

然后访问 http://localhost:8080/web/

URL 参数：

- `?fresh=1` 清空本地数据
- `?open=<cardId>` 直接打开某张卡片（例如 `modelscope`）
- `?guide=0|1` 关闭/开启新手引导
- `?fixture=modelscope` 用官方 OpenAPI 文档中的示例余额演示魔搭卡片，不发起真实请求。页面会标明「夹具演示」，余额不是你的真实账户。
- `?deal=<id>` 或 `?open=deal:<id>` 直接打开「薅羊毛」里的某条活动（例如 `siliconflow-ambassador`）

扩展的安装、令牌保存和真实余额读取，见仓库根目录 README。

「薅羊毛」数据从 `../deals/deals.json` 加载，筛选、截止状态和「已领 / 不感兴趣」标记都在浏览器本地完成。
