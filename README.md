# 牌老汇·群友是㊗️

2–4 人在线游玩《璀璨宝石》宝可梦版。朋友用浏览器打开网址，输入房主私下分享的大厅密码，便可建房、凭房间号加入或打开邀请链接。

## GitHub Pages

将本包解压后的文件放在仓库根目录，确保首页文件为 `index.html`，同级有 `public/`。进入仓库的 **Settings → Pages**，在 **Source** 选择 **Deploy from a branch**，选 **main** 和 **/(root)**，点击 **Save**。

页面、卡牌和音效由 GitHub Pages 提供。大厅密码验证、房间状态和对局同步由首页 `club-backend` 指向的游戏服务器处理。服务器允许的网页来源由 `PAGES_ORIGIN` 设置。当前线上服务器已为账号 Baize-2333 的 Pages 域名配置访问。

## 独立服务器

使用 Node.js 24 执行 `node standalone/server.mjs`。完整方法见 [启动说明](standalone/启动说明.md)。部署自己的服务器时，通过环境变量 `CLUB_PASSWORD` 设置通行密码。服务器生成的 `data/` 目录留在主机上。

运行 `npm test` 可检查房间模式、解散、断线重连和跨站入口。
