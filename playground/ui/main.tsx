import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import MonacoEditor from "@monaco-editor/react";

const DEFAULT_SELVDG_CODE = `import { selvedge } from "selvedge";

const weatherApi = selvedge.program\`
  /**
   * Get current weather for a city using Node.js built-in modules.
   * @param city - Name of the city to get weather for
   * @returns Weather data including temperature and conditions
   */
\`.returns<{ temp: number; conditions: string; humidity: number }()
  .using("claude")
  .options({ forceRegenerate: true })
  .persist("weather-api");
`;

function App() {
  const [tab, setTab] = useState<"selvedge" | "generated">("selvedge");
  const [selvedgeCode, setSelvedgeCode] = useState(DEFAULT_SELVDG_CODE);
  const [generatedCode, setGeneratedCode] = useState("// Generated code will appear here");
  const [replInput, setReplInput] = useState("");
  const [replLog, setReplLog] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  async function handleGenerate() {
    setLoading(true);
    try {
      const resp = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: selvedgeCode }),
      });
      const data = await resp.json();
      setGeneratedCode(data.generated || "// No generated code");
      setTab("generated");
    } catch (e) {
      setGeneratedCode("// Error generating code");
    } finally {
      setLoading(false);
    }
  }

  async function handleReplSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!replInput.trim()) return;
    setReplLog((log) => [...log, "> " + replInput]);
    try {
      const resp = await fetch("/api/repl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: replInput }),
      });
      const data = await resp.json();
      setReplLog((log) => [...log, String(data.result)]);
    } catch (e) {
      setReplLog((log) => [...log, "[Error evaluating command]"]);
    }
    setReplInput("");
  }

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      {/* Top: Editor & Tabs */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", borderBottom: "1px solid #eee" }}>
        {/* Tabs */}
        <div style={{ display: "flex", alignItems: "center", background: "#f5f5f5", borderBottom: "1px solid #ddd" }}>
          <button
            style={{ border: "none", background: tab === "selvedge" ? "#fff" : "#f5f5f5", padding: "10px 20px", cursor: "pointer", fontWeight: tab === "selvedge" ? "bold" : "normal" }}
            onClick={() => setTab("selvedge")}
          >Selvedge Code</button>
          <button
            style={{ border: "none", background: tab === "generated" ? "#fff" : "#f5f5f5", padding: "10px 20px", cursor: "pointer", fontWeight: tab === "generated" ? "bold" : "normal" }}
            onClick={() => setTab("generated")}
          >Generated Code</button>
          <div style={{ flex: 1 }} />
          <button
            onClick={handleGenerate}
            style={{ marginRight: 16, padding: "7px 18px", background: "#0066cc", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontWeight: 500 }}
            disabled={loading}
          >{loading ? "Generating..." : "Generate"}</button>
        </div>
        {/* Editor */}
        <div style={{ flex: 1, minHeight: 0 }}>
          {tab === "selvedge" ? (
            <MonacoEditor
              height="100%"
              defaultLanguage="typescript"
              value={selvedgeCode}
              onChange={v => setSelvedgeCode(v || "")}
              theme="vs-dark"
              options={{ fontSize: 16, minimap: { enabled: false } }}
              beforeMount={monaco => {
                const selvedgeTypes = `
                  // Selvedge API types for playground
                  type ProgramTemplate<TArgs extends any[] = any[], TResult = any> = ((...args: TArgs) => Promise<TResult>) & {
                    returns: <T>() => ProgramTemplate<TArgs, T>;
                    using: (model: string) => ProgramTemplate<TArgs, TResult>;
                    options: (opts: any) => ProgramTemplate<TArgs, TResult>;
                    persist: (name: string) => ProgramTemplate<TArgs, TResult>;
                  };
                  interface SelvedgeAPI {
                    program: {
                      <TArgs extends any[] = any[], TResult = any>(
                        strings: TemplateStringsArray,
                        ...expr: any[]
                      ): ProgramTemplate<TArgs, TResult>;
                    };
                    flow: <T = any>(steps: Array<(input: any) => any>) => (input: any) => Promise<T>;
                    models: (modelConfig: Record<string, any>) => void;
                    openai: (model: string, opts?: any) => any;
                    anthropic: (model: string, opts?: any) => any;
                  }
                  export const selvedge: SelvedgeAPI;
                `;
                monaco.languages.typescript.typescriptDefaults.addExtraLib(
                  selvedgeTypes,
                  'file:///node_modules/@types/selvedge/index.d.ts'
                );
                monaco.languages.typescript.typescriptDefaults.addExtraLib(
                  selvedgeTypes,
                  'file:///src/index.d.ts'
                );
              }}
            />
          ) : (
            <MonacoEditor
              height="100%"
              defaultLanguage="typescript"
              value={generatedCode}
              options={{ readOnly: true, fontSize: 16, minimap: { enabled: false } }}
              theme="vs-dark"
              beforeMount={monaco => {
                const selvedgeTypes = `
                  // Selvedge API types for playground
                  type ProgramTemplate<TArgs extends any[] = any[], TResult = any> = ((...args: TArgs) => Promise<TResult>) & {
                    returns: <T>() => ProgramTemplate<TArgs, T>;
                    using: (model: string) => ProgramTemplate<TArgs, TResult>;
                    options: (opts: any) => ProgramTemplate<TArgs, TResult>;
                    persist: (name: string) => ProgramTemplate<TArgs, TResult>;
                  };
                  interface SelvedgeAPI {
                    program: {
                      <TArgs extends any[] = any[], TResult = any>(
                        strings: TemplateStringsArray,
                        ...expr: any[]
                      ): ProgramTemplate<TArgs, TResult>;
                    };
                    flow: <T = any>(steps: Array<(input: any) => any>) => (input: any) => Promise<T>;
                    models: (modelConfig: Record<string, any>) => void;
                    openai: (model: string, opts?: any) => any;
                    anthropic: (model: string, opts?: any) => any;
                  }
                  export const selvedge: SelvedgeAPI;
                `;
                monaco.languages.typescript.typescriptDefaults.addExtraLib(
                  selvedgeTypes,
                  'file:///node_modules/@types/selvedge/index.d.ts'
                );
                monaco.languages.typescript.typescriptDefaults.addExtraLib(
                  selvedgeTypes,
                  'file:///src/index.d.ts'
                );
              }}
            />
          )}
        </div>
      </div>
      {/* Bottom: REPL */}
      <div style={{ flexBasis: 220, background: "#181818", color: "#fff", display: "flex", flexDirection: "column" }}>
        <div style={{ flex: 1, overflowY: "auto", padding: 12, fontFamily: "monospace", fontSize: 15 }}>
          {replLog.map((line, i) => (
            <div key={i}>{line}</div>
          ))}
        </div>
        <div style={{ display: "flex", borderTop: "1px solid #333", alignItems: "center", padding: 0 }}>
          <div style={{ flex: 1 }}>
            <MonacoEditor
              height="40px"
              defaultLanguage="typescript"
              value={replInput}
              onChange={v => setReplInput(v || "")}
              options={{
                fontSize: 15,
                minimap: { enabled: false },
                lineNumbers: "off",
                scrollbar: { vertical: "hidden", horizontal: "hidden" },
                overviewRulerLanes: 0,
                overviewRulerBorder: false,
                hideCursorInOverviewRuler: true,
                lineDecorationsWidth: 0,
                lineNumbersMinChars: 0,
                folding: false,
                wordWrap: "on",
                renderLineHighlight: "none",
                renderFinalNewline: false,
                renderValidationDecorations: "off",
                quickSuggestions: false,
                suggestOnTriggerCharacters: false,
                tabSize: 2,
                padding: { top: 8, bottom: 8 },
              }}
              theme="vs-dark"
              beforeMount={monaco => {
                const selvedgeTypes = `
                  // Selvedge API types for playground
                  type ProgramTemplate<TArgs extends any[] = any[], TResult = any> = ((...args: TArgs) => Promise<TResult>) & {
                    returns: <T>() => ProgramTemplate<TArgs, T>;
                    using: (model: string) => ProgramTemplate<TArgs, TResult>;
                    options: (opts: any) => ProgramTemplate<TArgs, TResult>;
                    persist: (name: string) => ProgramTemplate<TArgs, TResult>;
                  };
                  interface SelvedgeAPI {
                    program: {
                      <TArgs extends any[] = any[], TResult = any>(
                        strings: TemplateStringsArray,
                        ...expr: any[]
                      ): ProgramTemplate<TArgs, TResult>;
                    };
                    flow: <T = any>(steps: Array<(input: any) => any>) => (input: any) => Promise<T>;
                    models: (modelConfig: Record<string, any>) => void;
                    openai: (model: string, opts?: any) => any;
                    anthropic: (model: string, opts?: any) => any;
                  }
                  export const selvedge: SelvedgeAPI;
                `;
                monaco.languages.typescript.typescriptDefaults.addExtraLib(
                  selvedgeTypes,
                  'file:///node_modules/@types/selvedge/index.d.ts'
                );
                monaco.languages.typescript.typescriptDefaults.addExtraLib(
                  selvedgeTypes,
                  'file:///src/index.d.ts'
                );
              }}
              onMount={(editor) => {
                editor.onKeyDown((e) => {
                  if (e.keyCode === 3 && (e.shiftKey || e.metaKey)) { // Enter + Shift/Cmd
                    e.preventDefault();
                    handleReplSubmit({ preventDefault: () => {} } as any);
                  }
                });
              }}
            />
          </div>
          <button onClick={handleReplSubmit as any} style={{ background: "#0066cc", color: "#fff", border: "none", padding: "0 22px", fontWeight: 500, fontSize: 15, cursor: "pointer", height: 40 }}>Run</button>
        </div>
      </div>
    </div>
  );
}

const root = createRoot(document.getElementById("root")!);
root.render(<App />);
