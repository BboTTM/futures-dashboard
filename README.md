# 合约数据仪表板

Dashboard for batch querying user trading activity and comparing metrics by user UID, referrer, and upstream agent data.

## 本地预览

在项目目录运行：

```bash
python3 -m http.server 5177
```

然后打开：

```text
http://127.0.0.1:5177/
```

## 数据说明

真实导出的数据文件位于 `data/` 目录，但默认不提交到 GitHub，避免泄露用户 UID 和交易数据。

后续接入接口时，在 `app.js` 顶部配置 `API_ENDPOINT`，看板会通过接口查询并展示数据。
