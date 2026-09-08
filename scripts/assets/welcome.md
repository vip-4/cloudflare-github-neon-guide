# R2 边缘资源池

R2 承接附件/静态资源，Pages Function 通过 `env.R2_STORE` 在边缘直读并返回 immutable 缓存。

示例端点：`/api/file?key=docs/welcome.md`

注意：本机与部分 ISP 对 `*.cloudflarestorage.com`（S3 API 直连）可达性不一，CI 内统一用 wrangler CLI（走 `api.cloudflare.com`）执行 R2 运维。仓库内 `scripts/r2-init.mjs` 保留 S3 API 版本，供网络可达环境做本地批量上传。