import { connection } from 'next/server';
import { Topbar } from '@/components/chrome/Topbar';
import { ChatClient } from './ChatClient';

export default async function ChatPage() {
  await connection();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <Topbar
        breadcrumb={['AI Chat']}
        title="Security AI Chat"
        subtitle="Private conversations · offensive-security assistant"
        showSearch={false}
      />
      <ChatClient />
    </div>
  );
}
