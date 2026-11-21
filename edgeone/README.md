# EdgeOne Pages 部署

在腾讯云 EdgeOne Pages 控制台选择导入 Git 仓库，选择 `Baize-2333/pailaohui` 的 `main` 分支。框架预设选「其他」，根目录保留 `./`。仓库中的 `edgeone.json` 会设置构建命令和输出目录。

构建命令是 `node edgeone/build.mjs`，输出目录是 `dist`。Node.js 云函数在本项目域名下处理 `/api/access` 和 `/api/table`，使用现有联机服务器的密码验证和房间状态。项目无需另填密码或数据库密钥。

面向中国大陆长期访问时，部署区域选「中国大陆可用区」或「全球可用区（含中国大陆）」，再绑定已备案的正式域名。腾讯云提供的临时预览链接可用于部署检查。
