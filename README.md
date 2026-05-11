# React + Qwen RAG 前端示例

这是一个最小可用的 React 页面，用来调用你的 RAG 后端接口。

## 1. 安装并启动

```bash
pnpm install
pnpm dev
```

默认前端地址：`http://localhost:5173`

## 2. 配置后端地址

复制环境变量：

```bash
cp .env.example .env
```

如果你的后端不是 `http://localhost:3000`，修改：

```env
VITE_RAG_API_BASE_URL=http://你的后端地址
```

## 3. 前端请求协议

前端会发送：

- `POST /api/rag/query`
- Body:

```json
{
  "query": "用户问题",
  "topK": 3
}
```

期望后端返回：

```json
{
  "answer": "Qwen 生成的回答",
  "chunks": [{ "source": "doc-1", "text": "召回片段内容" }]
}
```
