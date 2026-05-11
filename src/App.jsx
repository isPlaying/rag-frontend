import { useMemo, useState } from "react";

const API_BASE_URL = import.meta.env.VITE_RAG_API_BASE_URL || "http://127.0.0.1:9000";

export default function App() {
  const [query, setQuery] = useState("");
  const [topK, setTopK] = useState(3);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [answer, setAnswer] = useState("");
  const [sources, setSources] = useState([]);

  const canSubmit = useMemo(() => query.trim().length > 0 && !loading, [query, loading]);

  function handleComposerKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!canSubmit) return;

      e.currentTarget.form?.requestSubmit();
    }
  }

  async function handleSearch(e) {
    e.preventDefault();
    if (!canSubmit) return;
    const currentQuestion = query.trim();

    setLoading(true);
    setError("");
    setAnswer("");
    setSources([]);
    setQuery("");

    try {
      const res = await fetch(`${API_BASE_URL}/api/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: currentQuestion,
          topK
        })
      });

      if (!res.ok || !res.body) {
        throw new Error(`请求失败: ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";
      let fullText = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() || "";

        for (const event of events) {
          if (!event.startsWith("data: ")) continue;
          const payload = event.slice(6).trim();

          if (payload === "[DONE]") {
            continue;
          }

          const data = JSON.parse(payload);

          if (data.type === "token") {
            fullText += data.content || "";
            setAnswer(fullText);
          } else if (data.type === "sources") {
            setSources(Array.isArray(data.sources) ? data.sources : []);
          } else if (data.type === "error") {
            setError(data.message || "流式接口返回错误");
          }
        }
      }
    } catch (err) {
      setError(err.message || "请求异常，请稍后重试");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="app-shell">
      <header className="hero">
        <div className="brand-dot" />
        <h1>RAG Assistant</h1>
        <p>连接你的知识库，让问答更准确</p>
      </header>

      <section className="chat-card">
        <div className="msg msg-user">
          <span className="role">你</span>
          <p>{query || "在下方输入问题，开始一次检索增强问答"}</p>
        </div>

        <div className="msg msg-ai">
          <span className="role">助手</span>
          {error ? <p className="error-text">{error}</p> : null}
          {!error ? <p>{answer || (loading ? "正在思考中..." : "我会结合检索到的片段来回答你。")}</p> : null}
        </div>

        {sources.length ? (
          <div className="sources">
            <div className="sources-title">参考片段</div>
            <ul>
              {sources.map((chunk, idx) => (
                <li key={idx}>
                  <strong>{chunk.source || `chunk-${idx + 1}`}</strong>
                  <p>{chunk.text || chunk.content || ""}</p>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <form className="composer" onSubmit={handleSearch}>
        <textarea
          placeholder="输入你的问题，例如：请总结项目中的登录流程"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleComposerKeyDown}
          rows={2}
        />
        <div className="composer-bar">
          <label className="topk">
            topK
            <input
              type="number"
              value={topK}
              min={1}
              max={10}
              onChange={(e) => setTopK(Number(e.target.value) || 3)}
            />
          </label>
          <button type="submit" disabled={!canSubmit}>
            {loading ? "生成中..." : "发送"}
          </button>
        </div>
      </form>
    </main>
  );
}
