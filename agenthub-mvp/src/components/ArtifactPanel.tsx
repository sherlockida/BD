import { useEffect, useMemo, useState, useCallback } from 'react';
import Editor, { DiffEditor } from '@monaco-editor/react';
import { useAppStore } from '../store/appStore';
import type { Artifact, ArtifactVersion, ID } from '../types';
import { diffLines } from '../utils/diff';
import { DiffBody } from './DiffViewer';
import {
  X, Code2, Globe, FileText, History, Rocket, RotateCcw, Eye, GitBranch,
  Layers, ChevronRight, Copy,
} from './icons';

type PanelTab = 'preview' | 'code' | 'diff' | 'history';

export function ArtifactPanel() {
  const open = useAppStore(s => s.artifactPanelOpen);
  const setOpen = useAppStore(s => s.setArtifactPanelOpen);
  const activeArtifactId = useAppStore(s => s.activeArtifactId);
  const activeConvId = useAppStore(s => s.activeConversationId);
  // 选择稳定引用，再在组件内 useMemo 派生 — 避免选择器返回新数组导致 useSyncExternalStore 触发无限重渲染
  const allArtifacts = useAppStore(s => s.artifacts);
  const openArt = useAppStore(s => s.openArtifact);
  const rollback = useAppStore(s => s.rollbackArtifact);
  const deploy = useAppStore(s => s.deployArtifact);
  const sendUser = useAppStore(s => s.sendUserMessage);
  const conv = useAppStore(s => s.activeConversationId
    ? s.conversations.find(c => c.id === s.activeConversationId)
    : null);

  const artifacts = useMemo(
    () => allArtifacts.filter(a => a.conversationId === activeConvId),
    [allArtifacts, activeConvId],
  );

  const artifact = useMemo(
    () => artifacts.find(a => a.id === activeArtifactId) ?? artifacts[artifacts.length - 1],
    [activeArtifactId, artifacts],
  );

  const [tab, setTab] = useState<PanelTab>('preview');
  const [selectedVersionId, setSelectedVersionId] = useState<ID | null>(null);

  useEffect(() => {
    if (artifact) setSelectedVersionId(artifact.latestVersionId);
  }, [artifact?.id]);

  if (!open) return null;

  if (artifacts.length === 0) {
    return (
      <Side title="产物面板" onClose={() => setOpen(false)}>
        <div className="text-center text-sm text-feishu-subtext py-16">本对话还没有产物</div>
      </Side>
    );
  }
  if (!artifact) return null;

  const version = artifact.versions.find(v => v.id === selectedVersionId) ?? artifact.versions[artifact.versions.length - 1];
  const prevVersion =
    artifact.versions.findIndex(v => v.id === version.id) > 0
      ? artifact.versions[artifact.versions.findIndex(v => v.id === version.id) - 1]
      : null;

  return (
    <Side
      title={
        <div className="flex items-center gap-2">
          <ArtTypeIcon t={artifact.type} />
          <span className="truncate">{artifact.name}</span>
          <span className="text-xs text-feishu-subtext">v{version.version}</span>
        </div>
      }
      onClose={() => setOpen(false)}
    >
      {/* tabs */}
      <div className="flex items-center border-b border-feishu-border bg-feishu-bg/60 px-2">
        {(['preview', 'code', 'diff', 'history'] as PanelTab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-2 text-xs font-medium transition ${
              tab === t ? 'text-feishu-accent border-b-2 border-feishu-accent' : 'text-feishu-subtext hover:text-feishu-text'
            }`}
          >
            {t === 'preview' ? '预览' : t === 'code' ? '代码' : t === 'diff' ? 'Diff' : '历史'}
          </button>
        ))}
        <div className="flex-1" />
        {artifacts.length > 1 && (
          <select
            className="text-xs bg-feishu-bg border border-feishu-border rounded px-1.5 py-1 mr-2"
            value={artifact.id}
            onChange={(e) => openArt(e.target.value)}
          >
            {artifacts.map(a => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        )}
        <button
          onClick={() => activeConvId && deploy(artifact.id, activeConvId)}
          className="text-xs px-2.5 py-1 rounded-md bg-feishu-accent text-white hover:opacity-90 flex items-center gap-1 transition mr-2"
        >
          <Rocket size={12} /> 部署
        </button>
      </div>

      <div className="flex-1 overflow-hidden flex">
        {/* main */}
        <div className="flex-1 overflow-y-auto bg-feishu-bg/30">
          {tab === 'preview' && <PreviewBody artifact={artifact} version={version} />}
          {tab === 'code' && <CodeBody version={version} />}
          {tab === 'diff' && (
            prevVersion ? (
              <div className="h-full flex flex-col">
                <div className="px-4 py-2 bg-[#252530] text-zinc-400 text-xs flex items-center gap-2 border-b border-zinc-700 shrink-0">
                  <GitBranch size={12} />
                  <span>v{prevVersion.version} → v{version.version}</span>
                </div>
                <div className="flex-1">
                  <DiffEditor
                    height="100%"
                    language="javascript"
                    original={prevVersion.content}
                    modified={version.content}
                    theme="vs-dark"
                    options={{
                      readOnly: true,
                      minimap: { enabled: false },
                      fontSize: 13,
                      lineNumbers: 'on',
                      scrollBeyondLastLine: false,
                      wordWrap: 'on',
                      automaticLayout: true,
                      renderSideBySide: true,
                    }}
                  />
                </div>
              </div>
            ) : (
              <div className="text-center text-sm text-feishu-subtext py-10">没有更早的版本可对比</div>
            )
          )}
          {tab === 'history' && (
            <HistoryBody
              artifact={artifact}
              onPick={(v) => { setSelectedVersionId(v.id); setTab('preview'); }}
              onRollback={(v) => rollback(artifact.id, v.id)}
            />
          )}
        </div>

        {/* right rail: 选区操作 */}
        {(tab === 'preview' || tab === 'code') && conv && (
          <SelectionRail
            artifact={artifact}
            version={version}
            onSend={(text) => sendUser(conv.id, text, [], undefined, [artifact.id])}
            members={conv.memberAgentIds}
          />
        )}
      </div>
    </Side>
  );
}

function Side({ title, children, onClose }: { title: React.ReactNode; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="w-[520px] h-full bg-feishu-panel border-l border-feishu-border shrink-0 flex flex-col">
      <div className="h-14 px-5 border-b border-feishu-border flex items-center justify-between shrink-0">
        <div className="font-semibold text-feishu-text text-sm min-w-0">{title}</div>
        <button onClick={onClose} className="text-feishu-subtext hover:text-feishu-text"><X size={16} /></button>
      </div>
      {children}
    </div>
  );
}

function ArtTypeIcon({ t }: { t: Artifact['type'] }) {
  const Map = { code: Code2, webpage: Globe, doc: FileText, ppt: FileText } as const;
  const Ic = Map[t];
  return <Ic size={14} className="text-feishu-accent" />;
}

function PreviewBody({ artifact, version }: { artifact: Artifact; version: ArtifactVersion }) {
  if (artifact.type === 'webpage') {
    // CSP-protected sandbox: allow scripts (for interactive previews) but block network, popups, top-navigation
    return (
      <iframe
        title="preview"
        className="w-full h-full bg-white border-0"
        sandbox="allow-scripts"
        srcDoc={injectCsp(version.content)}
      />
    );
  }
  if (artifact.type === 'doc') {
    return (
      <div className="p-6 max-w-2xl mx-auto bg-white min-h-full">
        <pre className="whitespace-pre-wrap text-sm leading-relaxed text-feishu-text font-sans">
          {version.content}
        </pre>
      </div>
    );
  }
  // code
  return <CodeBody version={version} />;
}

function CodeBody({ version }: { version: ArtifactVersion }) {
  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(version.content);
  }, [version.content]);

  // Determine language from artifact metadata
  const language = useMemo(() => {
    const ext = version.content.match(/<\/?(\w+)/)?.[1]?.toLowerCase();
    if (ext === 'html' || version.content.includes('<!DOCTYPE')) return 'html';
    if (ext === 'css' || version.content.includes('@import') || version.content.includes('{')) return 'css';
    return 'javascript';
  }, [version.content]);

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-2 bg-[#252530] text-zinc-400 text-xs flex items-center gap-2 border-b border-zinc-700 shrink-0">
        <Code2 size={12} />
        <span>v{version.version} · {version.commitMessage}</span>
        <div className="flex-1" />
        <button
          onClick={handleCopy}
          className="hover:text-white transition" title="复制全部代码"
        ><Copy size={12} /></button>
      </div>
      <div className="flex-1">
        <Editor
          height="100%"
          language={language}
          value={version.content}
          theme="vs-dark"
          options={{
            readOnly: true,
            minimap: { enabled: false },
            fontSize: 13,
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            automaticLayout: true,
            padding: { top: 12, bottom: 12 },
          }}
        />
      </div>
    </div>
  );
}

function HistoryBody({
  artifact, onPick, onRollback,
}: { artifact: Artifact; onPick: (v: ArtifactVersion) => void; onRollback: (v: ArtifactVersion) => void }) {
  return (
    <div className="p-4 space-y-2">
      {[...artifact.versions].reverse().map((v, i) => (
        <div key={v.id} className="border border-feishu-border rounded-lg p-3 bg-feishu-panel">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono bg-feishu-bg px-1.5 py-0.5 rounded">v{v.version}</span>
              {i === 0 && <span className="text-[10px] px-1 bg-emerald-100 text-emerald-700 rounded">latest</span>}
              <span className="text-xs text-feishu-subtext">{formatTs(v.createdAt)}</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => onPick(v)}
                className="text-[11px] px-2 py-0.5 rounded text-feishu-accent hover:bg-feishu-accent/10"
              ><Eye size={11} className="inline mr-1" />查看</button>
              {i !== 0 && (
                <button
                  onClick={() => onRollback(v)}
                  className="text-[11px] px-2 py-0.5 rounded text-amber-600 hover:bg-amber-50"
                ><RotateCcw size={11} className="inline mr-1" />回滚</button>
              )}
            </div>
          </div>
          <div className="text-xs text-feishu-text">{v.commitMessage}</div>
          <div className="text-[11px] text-feishu-subtext mt-1">by {v.authorAgentId}</div>
        </div>
      ))}
    </div>
  );
}

/** Inject CSP meta tag into HTML content for iframe sandbox safety */
function injectCsp(html: string): string {
  const csp = `<meta http-equiv="Content-Security-Policy" content="default-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'none'; frame-src 'none';">`;
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head[^>]*>/i, `$&${csp}`);
  }
  if (/<html[^>]*>/i.test(html)) {
    return html.replace(/<html[^>]*>/i, `$&<head>${csp}</head>`);
  }
  return `<!DOCTYPE html><html><head>${csp}</head><body>${html}</body></html>`;
}

function formatTs(ts: number) {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

function SelectionRail({
  artifact, version, onSend, members,
}: {
  artifact: Artifact;
  version: ArtifactVersion;
  onSend: (text: string) => void;
  members: ID[];
}) {
  const agents = useAppStore(s => s.agents);
  const [selected, setSelected] = useState('');
  const [target, setTarget] = useState<ID>(() => members.find(id => id !== 'agent_orchestrator') ?? members[0]);
  const [instruction, setInstruction] = useState('');

  useEffect(() => {
    const onSel = () => {
      const sel = window.getSelection?.()?.toString().trim() ?? '';
      if (sel) setSelected(sel);
    };
    document.addEventListener('mouseup', onSel);
    return () => document.removeEventListener('mouseup', onSel);
  }, []);

  return (
    <div className="w-56 border-l border-feishu-border bg-feishu-panel flex flex-col">
      <div className="px-3 py-2.5 border-b border-feishu-border text-xs font-medium text-feishu-text flex items-center gap-1.5">
        <Layers size={12} /> 选区操作
      </div>
      <div className="p-3 space-y-2 text-xs flex-1">
        <div>
          <div className="text-feishu-subtext mb-1">已选片段</div>
          <div className="bg-feishu-bg p-2 rounded text-feishu-text whitespace-pre-wrap line-clamp-4 min-h-[60px]">
            {selected || <span className="text-feishu-subtext italic">在左侧框选一段文字...</span>}
          </div>
        </div>
        <div>
          <div className="text-feishu-subtext mb-1">交给</div>
          <select
            value={target}
            onChange={e => setTarget(e.target.value)}
            className="w-full px-2 py-1.5 bg-feishu-bg border border-feishu-border rounded focus:outline-none focus:border-feishu-accent"
          >
            {members.map(id => {
              const a = agents.find(x => x.id === id);
              if (!a) return null;
              return <option key={id} value={id}>{a.avatarEmoji} {a.name}</option>;
            })}
          </select>
        </div>
        <div>
          <div className="text-feishu-subtext mb-1">指令</div>
          <textarea
            rows={3}
            value={instruction}
            onChange={e => setInstruction(e.target.value)}
            placeholder="例：把这里改成抹茶绿"
            className="w-full px-2 py-1.5 bg-feishu-bg border border-feishu-border rounded focus:outline-none focus:border-feishu-accent resize-none"
          />
        </div>
        <button
          onClick={() => {
            if (!instruction) return;
            const a = agents.find(x => x.id === target);
            const text = `@${a?.name ?? '某 Agent'} 针对 \`${artifact.name}\` v${version.version} 的这段内容：\n\n> ${selected.slice(0, 200)}\n\n${instruction}`;
            onSend(text);
            setInstruction('');
          }}
          disabled={!instruction}
          className="w-full py-1.5 bg-feishu-accent text-white rounded text-xs disabled:opacity-40 hover:opacity-90 flex items-center justify-center gap-1"
        >
          <ChevronRight size={12} /> 发送到聊天
        </button>
      </div>
    </div>
  );
}
