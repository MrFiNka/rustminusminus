export function renderHtmlDocument({ appHtml, assetVersion }: { appHtml: string; assetVersion: string }): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="icon" type="image/x-icon" href="/public/favicon.ico">
    <title>RustMinusMinus</title>
    <link rel="stylesheet" href="/public/css/tailwind.css?v=${assetVersion}">
</head>
<body>
    <div id="root">${appHtml}</div>
    <script type="module" src="/public/js/index.js?v=${assetVersion}"></script>
</body>
</html>`;
}
