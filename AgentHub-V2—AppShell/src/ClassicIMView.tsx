import { useEffect, useState } from 'react';
import { ConversationList } from '../../../agenthub-mvp/src/components/ConversationList';
import { ChatWindow } from '../../../agenthub-mvp/src/components/ChatWindow';
import { ArtifactPanel } from '../../../agenthub-mvp/src/components/ArtifactPanel';
import { AgentMarket } from '../../../agenthub-mvp/src/components/AgentMarket';
import { SkillsDrawer } from '../../../agenthub-mvp/src/components/SkillsDrawer';
import { NewChatModal } from '../../../agenthub-mvp/src/components/NewChatModal';
import { NewAgentModal } from '../../../agenthub-mvp/src/components/NewAgentModal';
import { useAppStore } from '../../../agenthub-mvp/src/store/appStore';
import { useAgentHubWS } from '../../../agenthub-mvp/src/hooks/useAgentHubWS';

export function ClassicIMView() {
  const [showNewChat, setShowNewChat] = useState(false);
  const hydrate = useAppStore(s => s.hydrateFromBackend);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useAgentHubWS();

  return (
    <div className="h-full w-full flex bg-[#f5f6f7] text-gray-800 overflow-hidden font-sans">
      <ConversationList onNewChat={() => setShowNewChat(true)} />
      <ChatWindow />
      <ArtifactPanel />
      <AgentMarket />
      <SkillsDrawer />
      {showNewChat && <NewChatModal onClose={() => setShowNewChat(false)} />}
      <NewAgentModal />
    </div>
  );
}
