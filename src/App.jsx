import { useEffect, useMemo, useRef, useState } from "react";

const API_BASE_URL =
  import.meta.env.VITE_RAG_API_BASE_URL || "http://127.0.0.1:9000";
const DEFAULT_TOP_K = Number(import.meta.env.VITE_TOP_K || "");

export default function App() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [isSlow, setIsSlow] = useState(false);
  const [messages, setMessages] = useState([]);
  const bottomRef = useRef(null);
  const abortRef = useRef(null);

  const canSubmit = useMemo(
    () => query.trim().length > 0 && !loading,
    [query, loading],
  );
  const hasConversation = messages.length > 0;
  const starterPrompts = [
    "Summarize the key points from this document in five bullets.",
    "What are the major risks and assumptions mentioned here?",
    "Highlight the most important insights from this document.",
  ];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, loading]);

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
    setIsSlow(false);
    setQuery("");
    const assistantIndex = messages.length + 1;
    setMessages((prev) => [
      ...prev,
      { role: "user", text: currentQuestion },
      { role: "assistant", text: "", error: "" },
    ]);
    let slowTimer = null;

    try {
      abortRef.current = new AbortController();
      slowTimer = setTimeout(() => setIsSlow(true), 1200);
      const payload = { question: currentQuestion };
      if (Number.isFinite(DEFAULT_TOP_K) && DEFAULT_TOP_K > 0) {
        payload.top_k = DEFAULT_TOP_K;
      }

      const res = await fetch(`${API_BASE_URL}/api/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: abortRef.current.signal,
      });

      if (!res.ok || !res.body) {
        throw new Error(`Request failed: ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";
      let fullText = "";
      const processEventBlock = (block) => {
        const normalized = block.replace(/\r\n/g, "\n");
        const dataLines = normalized
          .split("\n")
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.replace(/^data:\s?/, ""));
        if (!dataLines.length) return;

        const eventPayload = dataLines.join("\n").trim();
        if (!eventPayload || eventPayload === "[DONE]") return;

        let data = null;
        try {
          data = JSON.parse(eventPayload);
        } catch {
          data = eventPayload;
        }

        if (typeof data === "string") {
          fullText += data;
          setMessages((prev) =>
            prev.map((msg, idx) =>
              idx === assistantIndex ? { ...msg, text: fullText } : msg,
            ),
          );
          return;
        }

        const tokenText =
          data.content ??
          data.token ??
          data.delta ??
          data.text ??
          data.answer_delta ??
          data?.choices?.[0]?.delta?.content ??
          "";

        if (tokenText) {
          fullText += tokenText;
          setMessages((prev) =>
            prev.map((msg, idx) =>
              idx === assistantIndex ? { ...msg, text: fullText } : msg,
            ),
          );
        }

        if (data.type === "error" || data.error) {
          setMessages((prev) =>
            prev.map((msg, idx) =>
              idx === assistantIndex
                ? {
                    ...msg,
                    error: data.message || data.error || "Streaming response error",
                  }
                : msg,
            ),
          );
        }
      };

      while (true) {
        const { value, done } = await reader.read();
        const chunk = value ? decoder.decode(value, { stream: true }) : "";
        if (chunk) {
          buffer += chunk;
        }

        if (done) {
          if (buffer.trim()) {
            processEventBlock(buffer);
          }
          break;
        }

        const events = buffer.replace(/\r\n/g, "\n").split("\n\n");
        buffer = events.pop() || "";

        for (const event of events) {
          processEventBlock(event);
        }
      }
    } catch (err) {
      const isAbort = err?.name === "AbortError";
      setMessages((prev) =>
        prev.map((msg, idx) =>
          idx === assistantIndex
            ? {
                ...msg,
                error: isAbort
                  ? "Generation stopped."
                  : err.message || "Request error. Please try again.",
              }
            : msg,
        ),
      );
    } finally {
      if (slowTimer) clearTimeout(slowTimer);
      abortRef.current = null;
      setIsSlow(false);
      setLoading(false);
    }
  }

  function handleActionClick() {
    if (loading) {
      abortRef.current?.abort();
      return;
    }
    if (!query.trim()) return;
    document.getElementById("composer-form")?.requestSubmit();
  }

  function handlePromptClick(prompt) {
    if (loading) return;
    setQuery(prompt);
    requestAnimationFrame(() => {
      document.getElementById("composer-textarea")?.focus();
    });
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-pill">
          <span className="brand-dot" />
          <span className="brand-text">Document Assistant</span>
        </div>
      </header>

      {!hasConversation ? (
        <section className="welcome-stage">
          <div className="welcome-panel">
            <h1>Work with your documents like a conversation.</h1>
            <p className="welcome-sub">
              Get concise, source-grounded answers for contracts, reports, and internal knowledge.
            </p>
            <div className="prompt-grid">
              {starterPrompts.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  className="prompt-chip"
                  onClick={() => handlePromptClick(prompt)}
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        </section>
      ) : (
        <section className="chat-stage">
          {messages.map((msg, idx) => (
            <article
              key={idx}
              className={`message ${msg.role === "user" ? "user" : "assistant"}`}
            >
              <span className="role">{msg.role === "user" ? "You" : "Assistant"}</span>
              {msg.error ? <p className="error-text">{msg.error}</p> : null}
              {!msg.error ? (
                <p>{msg.text || (msg.role === "assistant" && loading ? "Thinking..." : "")}</p>
              ) : null}
            </article>
          ))}
          <div ref={bottomRef} />
        </section>
      )}

      <form className="composer" id="composer-form" onSubmit={handleSearch}>
        <div className="composer-surface">
          <textarea
            id="composer-textarea"
            placeholder="Ask about a file, summarize a report, or pull out key decisions..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleComposerKeyDown}
            rows={2}
          />
          <div className="composer-bar">
            <span className={`hint ${isSlow ? "hint-live" : ""}`}>
              {isSlow
                ? "Still working on it..."
                : "Enter to send, Shift+Enter for a new line"}
            </span>
            <div className="composer-actions">
              <button
                type="button"
                className={`icon-btn ${loading ? "stop" : "send"}`}
                aria-label={loading ? "Stop generation" : "Send message"}
                onClick={handleActionClick}
                disabled={!loading && !query.trim()}
              >
                {loading ? (
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <rect
                      x="7.5"
                      y="7.5"
                      width="9"
                      height="9"
                      rx="2.2"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                    />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      d="M12 18.5v-10"
                      fill="none"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="1.9"
                    />
                    <path
                      d="M8 11.2 12 7.2l4 4"
                      fill="none"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="1.9"
                    />
                  </svg>
                )}
              </button>
            </div>
          </div>
        </div>
      </form>
    </main>
  );
}
