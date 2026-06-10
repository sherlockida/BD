import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import Editor, { DiffEditor } from '@monaco-editor/react';
import { useAppStore } from '../store/appStore';
import type { Artifact, ArtifactVersion, ID, SelectionContext } from '../types';
import {
  X, Code2, Globe, FileText, Rocket, RotateCcw, Eye, GitBranch,
  Layers, ChevronRight, Copy, RefreshCw, ExternalLink, Trash2,
} from './icons';

type PanelTab = 'preview' | 'code' | 'diff' | 'history';

const PANEL_MIN_WIDTH = 320;
const PANEL_MAX_WIDTH = 1200;
const PANEL_DEFAULT_WIDTH = 520;
const PANEL_WIDTH_STORAGE_KEY = 'agenthub.artifactPanel.width';

export function ArtifactPanel() {
  const open = useAppStore(s => s.artifactPanelOpen);
  const setOpen = useAppStore(s => s.setArtifactPanelOpen);
  const activeArtifactId = useAppStore(s => s.activeArtifactId);
  const activeConvId = useAppStore(s => s.activeConversationId);
  const allArtifacts = useAppStore(s => s.artifacts);
  const openArt = useAppStore(s => s.openArtifact);
  const rollback = useAppStore(s => s.rollbackArtifact);
  const deleteArtifact = useAppStore(s => s.deleteArtifact);
  const deleteArtifactVersion = useAppStore(s => s.deleteArtifactVersion);
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
  const [userPinned, setUserPinned] = useState(false);
  // Monaco selection — lifted up so SelectionRail can consume it
  const [selectedCode, setSelectedCode] = useState('');

  // (1) Switching artifact resets pin + jumps to latest
  useEffect(() => {
    if (artifact) {
      setSelectedVersionId(artifact.latestVersionId);
      setUserPinned(false);
      setSelectedCode('');
    }
  }, [artifact?.id]);

  // (2) New version on same artifact — auto-advance unless user manually pinned
  useEffect(() => {
    if (artifact && !userPinned) {
      setSelectedVersionId(artifact.latestVersionId);
    }
  }, [artifact?.latestVersionId, userPinned]);

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
          {userPinned && version.id !== artifact.latestVersionId && (
            <button
              type="button"
              onClick={() => {
                setSelectedVersionId(artifact.latestVersionId);
                setUserPinned(false);
              }}
              className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 hover:bg-amber-200"
              title="跳到最新版本"
            >
              查看最新 v{artifact.versions.length} ↑
            </button>
          )}
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
        <div className="flex-1 overflow-y-auto bg-feishu-bg/30 min-w-0">
          {tab === 'preview' && <PreviewBody artifact={artifact} version={version} />}
          {tab === 'code' && <CodeBody version={version} onSelectionChange={setSelectedCode} />}
          {tab === 'diff' && (
            prevVersion ? (
              <div className="h-full flex flex-col">
                <div className="px-4 py-2 bg-[#252530] text-zinc-400 text-xs flex items-center gap-2 border-b border-zinc-700 shrink-0">
                  <GitBranch size={12} />
                  <span>v{prevVersion.version} → v{version.version}</span>
                </div>
                <div className="flex-1">
                  <DiffEditor
                    key={`${prevVersion.id}-${version.id}`}
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
              onPick={(v) => {
                setSelectedVersionId(v.id);
                setUserPinned(v.id !== artifact.latestVersionId);
                setTab('preview');
              }}
              onRollback={(v) => rollback(artifact.id, v.id)}
              onDeleteVersion={(versionId) => {
                if (confirm(`确定删除 v${artifact.versions.find(v=>v.id===versionId)?.version} 吗？此操作不可撤销。`)) {
                  deleteArtifactVersion(artifact.id, versionId);
                }
              }}
              onDeleteArtifact={() => {
                if (confirm(`确定删除产物"${artifact.name}"及其所有版本吗？此操作不可撤销。`)) {
                  setOpen(false);
                  deleteArtifact(artifact.id);
                }
              }}
            />
          )}
        </div>

        {/* right rail: 选区操作 */}
        {(tab === 'preview' || tab === 'code') && conv && (
          <SelectionRail
            artifact={artifact}
            version={version}
            selected={selectedCode}
            onClearSelection={() => setSelectedCode('')}
            onSend={(opts) => sendUser(conv.id, opts.text, opts.mentions ?? [], undefined, opts.attachedArtifactIds, opts.selectionContext)}
            members={conv.memberAgentIds}
          />
        )}
      </div>
    </Side>
  );
}

function Side({ title, children, onClose }: { title: React.ReactNode; children: React.ReactNode; onClose: () => void }) {
  // Resizable width state with localStorage persistence
  const [width, setWidth] = useState<number>(() => {
    if (typeof window === 'undefined') return PANEL_DEFAULT_WIDTH;
    const saved = window.localStorage?.getItem(PANEL_WIDTH_STORAGE_KEY);
    const parsed = saved ? parseInt(saved, 10) : NaN;
    return Number.isFinite(parsed) && parsed >= PANEL_MIN_WIDTH && parsed <= PANEL_MAX_WIDTH
      ? parsed
      : PANEL_DEFAULT_WIDTH;
  });
  const [resizing, setResizing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Drag handlers — mousedown on the left edge starts a global mousemove/mouseup listener
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setResizing(true);
    const startX = e.clientX;
    const startWidth = containerRef.current?.getBoundingClientRect().width ?? width;

    const handleMove = (ev: MouseEvent) => {
      // Dragging the LEFT edge: moving mouse left makes panel wider, right makes it narrower
      const delta = startX - ev.clientX;
      const next = Math.min(PANEL_MAX_WIDTH, Math.max(PANEL_MIN_WIDTH, startWidth + delta));
      setWidth(next);
    };
    const handleUp = () => {
      setResizing(false);
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
      // Persist final width
      try {
        window.localStorage?.setItem(PANEL_WIDTH_STORAGE_KEY, String(
          containerRef.current?.getBoundingClientRect().width ?? PANEL_DEFAULT_WIDTH,
        ));
      } catch { /* ignore quota errors */ }
    };
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
  }, [width]);

  return (
    <div
      ref={containerRef}
      style={{ width: `${width}px` }}
      className="h-full bg-feishu-panel border-l border-feishu-border shrink-0 flex flex-col relative"
    >
      {/* Drag handle — 4px strip on the left edge */}
      <div
        onMouseDown={handleResizeStart}
        title="拖动调整宽度"
        className={`absolute left-0 top-0 bottom-0 w-1 cursor-col-resize z-20 group ${
          resizing ? 'bg-feishu-accent/40' : 'hover:bg-feishu-accent/30'
        } transition-colors`}
      >
        <div className={`absolute inset-y-0 left-0 w-px ${resizing ? 'bg-feishu-accent' : 'bg-transparent group-hover:bg-feishu-accent/60'} transition-colors`} />
      </div>
      <div className="h-14 px-5 border-b border-feishu-border flex items-center justify-between shrink-0">
        <div className="font-semibold text-feishu-text text-sm min-w-0">{title}</div>
        <button onClick={onClose} className="text-feishu-subtext hover:text-feishu-text"><X size={16} /></button>
      </div>
      {/* While resizing, lock pointer events on inner content to prevent iframe stealing the mousemove */}
      <div className={`flex-1 flex flex-col overflow-hidden ${resizing ? 'pointer-events-none select-none' : ''}`}>
        {children}
      </div>
    </div>
  );
}

function ArtTypeIcon({ t }: { t: Artifact['type'] }) {
  const Map = { code: Code2, webpage: Globe, doc: FileText, ppt: FileText } as const;
  const Ic = Map[t];
  return <Ic size={14} className="text-feishu-accent" />;
}

/** Detect if content looks like a full HTML page, regardless of artifact type */
function looksLikeWebpage(content: string): boolean {
  return /<!DOCTYPE\s+html/i.test(content) ||
    /<html[\s>]/i.test(content) ||
    (/<(head|body|meta|link|style|script|div|span|h[1-6]|p|a|img|table|form|input|button|select|nav|header|footer|section|article)[\s>]/i.test(content) &&
     content.length > 200);
}

function PreviewBody({ artifact, version }: { artifact: Artifact; version: ArtifactVersion }) {
  const [iframeKey, setIframeKey] = useState(0);
  const [showCodeFallback, setShowCodeFallback] = useState(false);

  // Content-based heuristic: if content looks like HTML, treat as webpage
  const effectiveType: Artifact['type'] =
    (artifact.type !== 'webpage' && artifact.type !== 'doc' && looksLikeWebpage(version.content))
      ? 'webpage'
      : artifact.type;

  const handleRefresh = useCallback(() => {
    setIframeKey(k => k + 1);
  }, []);

  const handleOpenNewTab = useCallback(() => {
    const blob = new Blob([version.content], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  }, [version.content]);

  if (effectiveType === 'webpage') {
    return (
      <div className="h-full flex flex-col">
        {/* Preview toolbar */}
        <div className="flex items-center gap-1 px-3 py-1.5 bg-feishu-bg border-b border-feishu-border shrink-0">
          <Globe size={12} className="text-feishu-accent" />
          <span className="text-xs text-feishu-subtext mr-1">预览</span>
          {artifact.type !== 'webpage' && (
            <span className="text-[10px] px-1 bg-amber-100 text-amber-700 rounded" title="内容自动检测为 HTML">
              自动识别
            </span>
          )}
          <div className="flex-1" />
          <button
            onClick={handleRefresh}
            className="text-xs px-2 py-0.5 rounded hover:bg-feishu-accent/10 text-feishu-subtext hover:text-feishu-text transition"
            title="刷新预览 (重新加载 iframe)"
          >
            <RefreshCw size={13} />
          </button>
          <button
            onClick={() => setShowCodeFallback(!showCodeFallback)}
            className={`text-xs px-2 py-0.5 rounded transition ${
              showCodeFallback
                ? 'text-feishu-accent bg-feishu-accent/10'
                : 'text-feishu-subtext hover:text-feishu-text hover:bg-feishu-accent/10'
            }`}
            title={showCodeFallback ? '渲染预览' : '查看源码'}
          >
            {showCodeFallback ? <Eye size={13} /> : <Code2 size={13} />}
          </button>
          <button
            onClick={handleOpenNewTab}
            className="text-xs px-2 py-0.5 rounded hover:bg-feishu-accent/10 text-feishu-subtext hover:text-feishu-text transition"
            title="在新标签页打开"
          >
            <ExternalLink size={13} />
          </button>
        </div>

        {/* Preview content */}
        <div className="flex-1">
          {showCodeFallback ? (
            <CodeBody version={version} />
          ) : (
            <iframe
              key={`${version.id}-${iframeKey}`}
              title="preview"
              className="w-full h-full bg-white border-0"
              sandbox="allow-scripts allow-same-origin"
              srcDoc={injectCsp(version.content)}
            />
          )}
        </div>
      </div>
    );
  }

  if (effectiveType === 'doc') {
    return (
      <div className="p-6 max-w-2xl mx-auto bg-white min-h-full">
        <pre className="whitespace-pre-wrap text-sm leading-relaxed text-feishu-text font-sans">
          {version.content}
        </pre>
      </div>
    );
  }

  // code or unknown — show editor
  return <CodeBody version={version} />;
}

function CodeBody({
  version,
  onSelectionChange,
}: {
  version: ArtifactVersion;
  onSelectionChange?: (text: string) => void;
}) {
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
          key={version.id}
          height="100%"
          language={language}
          value={version.content}
          theme="vs-dark"
          onMount={(editor) => {
            // Wire Monaco selection events to the rail's selection state
            if (!onSelectionChange) return;
            editor.onDidChangeCursorSelection((e) => {
              const model = editor.getModel();
              if (!model) return;
              const text = model.getValueInRange(e.selection);
              onSelectionChange(text);
            });
          }}
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
  artifact, onPick, onRollback, onDeleteVersion, onDeleteArtifact,
}: {
  artifact: Artifact;
  onPick: (v: ArtifactVersion) => void;
  onRollback: (v: ArtifactVersion) => void;
  onDeleteVersion: (versionId: ID) => void;
  onDeleteArtifact: () => void;
}) {
  // Persist status badge
  const statusBadge = artifact._persistStatus === 'saving'
    ? <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-700 ml-1" title="正在保存到数据库...">⏳ 保存中</span>
    : artifact._persistStatus === 'error'
    ? <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-600 ml-1" title="保存失败，刷新页面后可能丢失">⚠️ 未保存</span>
    : null;

  return (
    <div className="p-4 space-y-2">
      {/* Header with artifact-level actions */}
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-feishu-border">
        <div className="flex items-center gap-1">
          <span className="text-xs font-medium text-feishu-text">版本历史</span>
          <span className="text-xs text-feishu-subtext">({artifact.versions.length})</span>
          {statusBadge}
        </div>
        <button
          onClick={onDeleteArtifact}
          className="text-[11px] px-2 py-0.5 rounded text-red-500 hover:bg-red-50 transition flex items-center gap-0.5"
          title="删除整个产物"
        >
          <Trash2 size={11} /> 删除产物
        </button>
      </div>

      {[...artifact.versions].reverse().map((v, i) => {
        const isLatest = v.id === artifact.latestVersionId;
        const isOnlyVersion = artifact.versions.length <= 1;
        return (
        <div key={v.id} className={`border rounded-lg p-3 ${isLatest ? 'border-feishu-accent/30 bg-feishu-accent/5' : 'border-feishu-border bg-feishu-panel'}`}>
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono bg-feishu-bg px-1.5 py-0.5 rounded">v{v.version}</span>
              {i === 0 && <span className="text-[10px] px-1 bg-emerald-100 text-emerald-700 rounded">latest</span>}
              <span className="text-xs text-feishu-subtext">{formatTs(v.createdAt)}</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => onPick(v)}
                className="text-[11px] px-2 py-0.5 rounded text-feishu-accent hover:bg-feishu-accent/10 transition"
              ><Eye size={11} className="inline mr-0.5" />查看</button>
              {!isLatest && (
                <button
                  onClick={() => onRollback(v)}
                  className="text-[11px] px-2 py-0.5 rounded text-amber-600 hover:bg-amber-50 transition"
                ><RotateCcw size={11} className="inline mr-0.5" />回滚</button>
              )}
              {!isOnlyVersion && (
                <button
                  onClick={() => onDeleteVersion(v.id)}
                  className="text-[11px] px-2 py-0.5 rounded text-red-400 hover:text-red-600 hover:bg-red-50 transition"
                  title={isLatest ? '删除最新版本将自动回退到次新版本' : '删除此版本'}
                ><Trash2 size={11} className="inline mr-0.5" />删除</button>
              )}
            </div>
          </div>
          <div className="text-xs text-feishu-text">{v.commitMessage}</div>
          <div className="text-[11px] text-feishu-subtext mt-1">by {v.authorAgentId}</div>
        </div>
      )})}
    </div>
  );
}

/** AgentHub preview runtime — injected into every iframe sandbox.
 *  Provides mock utilities so generated pages feel interactive even without a real backend. */
const AGENTHUB_RUNTIME = `
<script>
(function() {
  // ── Shared toast helper ──
  function _ahShowToast(text, bgColor, icon) {
    var existing = document.querySelector('.__ah_toast');
    if (existing) { existing.remove(); }
    var toast = document.createElement('div');
    toast.className = '__ah_toast';
    toast.style.cssText = 'position:fixed;top:20px;right:20px;max-width:380px;background:' + bgColor + ';color:#fff;padding:12px 20px;border-radius:8px;font-size:14px;z-index:99999;box-shadow:0 4px 24px rgba(0,0,0,0.18);animation:__ah_slideIn 0.35s ease,__ah_fade 2.4s ease 2s forwards;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;line-height:1.5;word-break:break-word;';
    toast.innerHTML = '<span style="display:inline-flex;align-items:center;gap:8px"><span style="font-size:16px;flex-shrink:0">' + icon + '</span><span>' + text + '<\\/span><\\/span>';
    document.body.appendChild(toast);
    setTimeout(function() { if (toast.parentNode) toast.remove(); }, 4500);
  }

  // ── AgentHub.util global API ──
  window.AgentHub = window.AgentHub || {};
  window.AgentHub.util = {
    // ── Multi-type toasts ──
    toast: {
      success: function(text) { _ahShowToast(text || '操作成功', '#10b981', '\\u2705'); },
      error:   function(text) { _ahShowToast(text || '操作失败', '#ef4444', '\\u274c'); },
      warning: function(text) { _ahShowToast(text || '请注意',   '#f59e0b', '\\u26a0\\ufe0f'); },
      info:    function(text) { _ahShowToast(text || '提示',     '#3b82f6', '\\u2139\\ufe0f'); }
    },

    // ── Legacy (backward compat) ──
    notImplemented: function() {
      this.toast.info('此功能暂时还没有实现哦~');
    },
    showMessage: function(text) {
      this.toast.info(text);
    },

    // ── Mock API — returns a Promise that resolves after delayMs ──
    mockApi: function(delayMs, mockResponse) {
      var d = typeof delayMs === 'number' ? delayMs : 800;
      var resp = mockResponse !== undefined ? mockResponse : { ok: true };
      return new Promise(function(resolve) {
        setTimeout(function() { resolve(resp); }, d);
      });
    },

    // ── Simple iframe-safe key-value store (lost on reload) ──
    store: {
      _data: {},
      get: function(key) { return this._data[key]; },
      set: function(key, val) { this._data[key] = val; return val; },
      remove: function(key) { delete this._data[key]; },
      clear: function() { this._data = {}; },
      keys: function() { return Object.keys(this._data); }
    }
  };

  // ── AgentHub.anim — preset animation helpers ──
  window.AgentHub.anim = {
    _animate: function(el, keyframeName, durationMs, removeAfter) {
      if (!el) return;
      var dur = (durationMs || 500) + 'ms';
      el.style.animation = keyframeName + ' ' + dur + ' ease';
      if (removeAfter) {
        setTimeout(function() { el.style.animation = ''; }, durationMs || 500);
      }
    },
    fadeIn:  function(el, dur) { this._animate(el, '__ah_fadeIn',  dur || 400, true); },
    slideUp: function(el, dur) { this._animate(el, '__ah_slideUp', dur || 400, true); },
    pulse:   function(el, dur) { this._animate(el, '__ah_pulse',   dur || 600, true); },
    shake:   function(el, dur) { this._animate(el, '__ah_shake',   dur || 500, true); },
    spin:    function(el, dur) { this._animate(el, '__ah_spin',    dur || 800, true); }
  };

  // ── Error boundary — prevent white screen ──
  var _origOnerror = window.onerror;
  window.onerror = function(msg, url, line, col, err) {
    console.warn('[AgentHub Preview] Script error:', msg);
    var banner = document.getElementById('__ah_error_banner');
    if (!banner && document.body) {
      banner = document.createElement('div');
      banner.id = '__ah_error_banner';
      banner.style.cssText = 'position:fixed;bottom:0;left:0;right:0;background:#fff3cd;color:#856404;padding:8px 16px;font-size:12px;z-index:99998;border-top:2px solid #ffc107;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;text-align:center;';
      banner.textContent = '\\u26a0\\ufe0f 页面脚本错误 — 可点击预览工具栏刷新按钮重新加载';
      document.body.appendChild(banner);
    }
    if (typeof _origOnerror === 'function') { return _origOnerror.apply(this, arguments); }
    return true;
  };

  // ── Smart click interceptor: only intercept genuinely unhandled elements ──
  document.addEventListener('click', function(e) {
    var el = e.target.closest('button, [role="button"], .btn, a[href="#"], a[href="javascript:void(0)"]');
    if (!el) return;

    var tag = el.tagName.toLowerCase();
    var hasInlineHandler = el.onclick || el.getAttribute('onclick');

    // Respect elements with inline handlers — Agent's own code handles them
    if (hasInlineHandler) return;

    // Check for addEventListener-bound handlers via the element's dataset flag
    // (Agents can set data-ah-handled="true" to explicitly skip interception)
    if (el.dataset && el.dataset.ahHandled === 'true') return;

    var isSubmit = (tag === 'button' && (el.type === 'submit' || el.type === 'reset'));
    var isRealLink = (tag === 'a' && el.getAttribute('href') && el.getAttribute('href') !== '#' && el.getAttribute('href') !== 'javascript:void(0)');
    var hasDataPlaceholder = el.hasAttribute('data-ah-placeholder');

    if (isRealLink || isSubmit) return; // let real links and form submits work normally

    // Only intercept if the element has no inline handler AND is either
    // explicitly marked as placeholder OR appears to have no bound logic
    if (hasDataPlaceholder) {
      e.preventDefault();
      e.stopPropagation();
      window.AgentHub.util.toast.info('此功能暂时还没有实现哦~');
    }
  }, true);

  // ── Animations & keyframes ──
  var _ahStyle = document.createElement('style');
  _ahStyle.textContent = [
    '@keyframes __ah_fade{0%,80%{opacity:1}100%{opacity:0}}',
    '@keyframes __ah_slideIn{0%{opacity:0;transform:translateY(-12px)}100%{opacity:1;transform:translateY(0)}}',
    '@keyframes __ah_fadeIn{0%{opacity:0}100%{opacity:1}}',
    '@keyframes __ah_slideUp{0%{opacity:0;transform:translateY(16px)}100%{opacity:1;transform:translateY(0)}}',
    '@keyframes __ah_pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.08)}}',
    '@keyframes __ah_shake{0%,100%{transform:translateX(0)}20%{transform:translateX(-6px)}40%{transform:translateX(6px)}60%{transform:translateX(-4px)}80%{transform:translateX(4px)}}',
    '@keyframes __ah_spin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}'
  ].join(' ');
  if (document.head) { document.head.appendChild(_ahStyle); }
})();
</script>`;

/** Inject AgentHub runtime into HTML content for iframe sandbox (CSP disabled for dev flexibility) */
function injectCsp(html: string): string {
  const runtime = AGENTHUB_RUNTIME;

  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head[^>]*>/i, `$&\n${runtime}`);
  }
  if (/<html[^>]*>/i.test(html)) {
    return html.replace(/<html[^>]*>/i, `$&<head>${runtime}</head>`);
  }
  return `<!DOCTYPE html><html><head>${runtime}</head><body>${html}</body></html>`;
}

function formatTs(ts: number) {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

function SelectionRail({
  artifact, version, selected, onClearSelection, onSend, members,
}: {
  artifact: Artifact;
  version: ArtifactVersion;
  selected: string;
  onClearSelection: () => void;
  onSend: (opts: {text: string; mentions?: ID[]; attachedArtifactIds: ID[]; selectionContext?: SelectionContext}) => void;
  members: ID[];
}) {
  const agents = useAppStore(s => s.agents);
  const [target, setTarget] = useState<ID>(() => members.find(id => id !== 'agent_orchestrator') ?? members[0]);
  const [instruction, setInstruction] = useState('');

  const hasSelection = selected.trim().length > 0;
  const trimmedSelection = selected.trim();

  return (
    <div className="w-56 border-l border-feishu-border bg-feishu-panel flex flex-col shrink-0">
      <div className="px-3 py-2.5 border-b border-feishu-border text-xs font-medium text-feishu-text flex items-center gap-1.5">
        <Layers size={12} /> 选区操作
      </div>
      <div className="p-3 space-y-2 text-xs flex-1 overflow-y-auto">
        <div>
          <div className="text-feishu-subtext mb-1 flex items-center justify-between">
            <span>已选片段{hasSelection && ` (${trimmedSelection.length} 字符)`}</span>
            {hasSelection && (
              <button
                type="button"
                onClick={onClearSelection}
                className="text-feishu-subtext hover:text-feishu-text"
                title="清除选区"
              >
                <X size={10} />
              </button>
            )}
          </div>
          <div className="bg-feishu-bg p-2 rounded text-feishu-text whitespace-pre-wrap line-clamp-6 min-h-[60px] max-h-32 overflow-auto font-mono text-[11px]">
            {hasSelection ? trimmedSelection : <span className="text-feishu-subtext italic font-sans">在左侧 Code Tab 中用鼠标框选一段代码...</span>}
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
            placeholder={hasSelection ? '例：把这里改成抹茶绿' : '先在左边选段代码，再写你想怎么改'}
            className="w-full px-2 py-1.5 bg-feishu-bg border border-feishu-border rounded focus:outline-none focus:border-feishu-accent resize-none"
          />
        </div>
        <button
          onClick={() => {
            if (!instruction) return;
            const a = agents.find(x => x.id === target);
            const text = `@${a?.name ?? '某 Agent'} 修改产物 \`${artifact.name}\`\n指令：${instruction}`;
            onSend({
              text,
              mentions: [target],
              attachedArtifactIds: [artifact.id],
              ...(hasSelection ? {
                selectionContext: {
                  artifactId: artifact.id,
                  versionId: version.id,
                  selectedText: trimmedSelection,
                },
              } : {}),
            });
            setInstruction('');
            onClearSelection();
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
