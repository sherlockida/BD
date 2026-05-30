import { useState } from 'react';
import { ConversationList } from './components/ConversationList';
import { ChatWindow } from './components/ChatWindow';
import { ArtifactPanel } from './components/ArtifactPanel';
import { AgentMarket } from './components/AgentMarket';
import { SkillsDrawer } from './components/SkillsDrawer';
import { NewChatModal } from './components/NewChatModal';

export default function App() {
  const [showNewChat, setShowNewChat] = useState(false);

  return (
    <div className="h-screen w-screen flex bg-feishu-bg text-feishu-text overflow-hidden font-sans">
      <ConversationList onNewChat={() => setShowNewChat(true)} />
      <ChatWindow />
      <ArtifactPanel />
      <AgentMarket />
      <SkillsDrawer />
      {showNewChat && <NewChatModal onClose={() => setShowNewChat(false)} />}
    </div>
  );
}
