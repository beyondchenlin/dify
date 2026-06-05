# Custom Brand Assets

本文档记录当前自部署版本如何把 Dify 默认品牌图标替换为自有图片，并给其他电脑复现同一套替换结果。

## 当前替换源

本次使用的源图是一个 192x192 PNG 头像，带透明通道。源图不需要放在仓库固定位置；已生成的最终资源会提交到 Git，其他电脑正常拉取代码即可直接使用。

如果以后需要重新生成，建议准备一张方形 PNG/SVG，至少 192x192，优先使用 512x512 或更高分辨率，透明背景效果最好。

## 一键生成

在仓库根目录执行：

```powershell
cd web
pnpm brand:assets "D:\path\to\your\source-image.png"
```

也可以直接运行 Node 脚本：

```powershell
cd web
node .\scripts\generate-brand-assets.js "D:\path\to\your\source-image.png"
```

脚本依赖 `sharp`，它已经是 `web/package.json` 的依赖。新电脑首次使用前，先按项目前端流程安装依赖。

如果 `pnpm` 提示 Node 版本不符合项目要求，先切换到项目要求的 Node 版本；当前仓库要求 `^22.22.1`。依赖已经安装好的情况下，也可以使用上面的 `node .\scripts\generate-brand-assets.js ...` 直接运行脚本。

## 覆盖范围

脚本会覆盖以下 Dify 默认品牌资源：

| 用途                 | 文件                                               |
| -------------------- | -------------------------------------------------- |
| 控制台顶部默认 logo  | `web/public/logo/logo.svg`                         |
| 深色模式默认 logo    | `web/public/logo/logo-monochrome-white.svg`        |
| 登录/站点 logo 资源  | `web/public/logo/logo.png`                         |
| 站点 logo            | `web/public/logo/logo-site.png`                    |
| 深色站点 logo        | `web/public/logo/logo-site-dark.png`               |
| 嵌入式聊天 header    | `web/public/logo/logo-embedded-chat-header.png`    |
| 嵌入式聊天 header 2x | `web/public/logo/logo-embedded-chat-header@2x.png` |
| 嵌入式聊天 header 3x | `web/public/logo/logo-embedded-chat-header@3x.png` |
| 嵌入式聊天头像       | `web/public/logo/logo-embedded-chat-avatar.png`    |
| 浏览器 favicon       | `web/public/favicon.ico`                           |
| Apple touch icon     | `web/public/apple-touch-icon.png`                  |
| PWA icon             | `web/public/icon-72x72.png`                        |
| PWA icon             | `web/public/icon-96x96.png`                        |
| PWA icon             | `web/public/icon-128x128.png`                      |
| PWA icon             | `web/public/icon-144x144.png`                      |
| PWA icon             | `web/public/icon-152x152.png`                      |
| PWA icon             | `web/public/icon-192x192.png`                      |
| PWA icon             | `web/public/icon-256x256.png`                      |
| PWA icon             | `web/public/icon-384x384.png`                      |
| PWA icon             | `web/public/icon-512x512.png`                      |

相关引用位置：

- 控制台左上角默认 logo：`web/app/components/base/logo/dify-logo.tsx`
- 控制台 header 优先显示企业 `workspace_logo`，没有配置时回退到默认 logo：`web/app/components/header/index.tsx`
- 浏览器 favicon 和 PWA manifest：`web/app/layout.tsx`、`web/public/manifest.json`、`web/public/browserconfig.xml`
- 嵌入式聊天默认 logo：`web/app/components/base/logo/logo-embedded-chat-header.tsx`、`web/app/components/base/logo/logo-embedded-chat-avatar.tsx`

## 为什么生成 SVG 包装

Dify 默认顶部 logo 使用 SVG 文件。当前源图是 PNG，所以脚本会生成一个内嵌 PNG 的 SVG 包装：

- 保持原有代码引用路径不变
- 避免修改 React 组件
- 保留透明背景
- 让浅色和深色模式都能显示同一张头像

## 其他电脑部署流程

如果只是部署当前定制版本：

1. 拉取包含本次提交的代码。
1. 重新构建或重启前端服务。
1. 浏览器执行硬刷新，避免旧静态资源缓存。

如果部署机器使用 Docker：

```powershell
cd docker
docker compose build web
docker compose up -d web
```

如果是本地前端开发服务：

```powershell
cd web
pnpm install
pnpm dev
```

## 验证

启动前端后检查这些地址是否返回新图片：

```powershell
Invoke-WebRequest -Uri http://localhost:17777/logo/logo.svg -Method Head
Invoke-WebRequest -Uri http://localhost:17777/icon-192x192.png -Method Head
Invoke-WebRequest -Uri http://localhost:17777/favicon.ico -Method Head
Invoke-WebRequest -Uri http://localhost:17777/logo/logo-embedded-chat-header.png -Method Head
```

页面上重点看：

- 控制台左上角 logo
- 浏览器标签页 favicon
- 登录页或站点 logo
- 分享应用/WebApp 页面底部品牌区域
- 嵌入式聊天 header 和默认头像

如果页面仍显示旧图，优先尝试 `Ctrl + F5` 硬刷新；生产环境还要确认前端容器或静态资源缓存已经更新。

## 注意事项

- `web/public/manifest.json` 里的应用名称仍是 `Dify`。本次只替换图片，没有改应用标题或文案。
- 企业品牌配置 `systemFeatures.branding.workspace_logo` 的优先级高于默认 logo。如果后端返回了企业 logo，控制台会优先显示后端配置。
- 如果升级 Dify 后这些 public 资源被覆盖，重新运行 `pnpm brand:assets <source-image>` 即可恢复。
