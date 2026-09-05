import React, { useState } from 'react';
import { ProjectProvider } from './context/ProjectContext';
import { Header } from './components/layout/Header';
import { Home } from './pages/Home';
import { Dashboard } from './pages/Dashboard';
import { Editor } from './pages/Editor';
import { Chat } from './pages/Chat';
import { Architecture } from './pages/Architecture';
import { Modules } from './pages/Modules';
import { History } from './pages/History';
import { SettingsPage } from './pages/Settings';
import { CodeChangeNotificationModal } from './components/ui/CodeChangeNotificationModal';

import { 
  IconHome, 
  IconDashboard, 
  IconCode, 
  IconMessage, 
  IconLayers, 
  IconBox, 
  IconHistory,
  IconSettings,
  IconMenu,
  IconX
} from './components/ui/Icons';
import './App.css';

export const App = () => {
  const [currentPage, setCurrentPage] = useState('home');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const navigate = (page: string) => {
    setCurrentPage(page);
    setSidebarOpen(false);
  };

  React.useEffect(() => {
    const handler = (e: any) => {
      if (e.detail) navigate(e.detail);
    };
    window.addEventListener('nav-page', handler);
    return () => window.removeEventListener('nav-page', handler);
  }, []);

  const pages: Record<string, React.ReactNode> = {
    home: <Home onNavigate={navigate} />,
    dashboard: <Dashboard />,
    editor: <Editor />,
    chat: <Chat />,
    architecture: <Architecture />,
    modules: <Modules />,
    history: <History />,
    settings: <SettingsPage />
  };

  const navItems = [
    { id: 'home', label: 'Home', icon: <IconHome /> },
    { id: 'dashboard', label: 'Dashboard', icon: <IconDashboard /> },
    { id: 'editor', label: 'Editor', icon: <IconCode /> },
    { id: 'chat', label: 'Chat', icon: <IconMessage /> },
    { id: 'architecture', label: 'Architecture', icon: <IconLayers /> },
    { id: 'modules', label: 'Modules', icon: <IconBox /> },
    { id: 'history', label: 'History', icon: <IconHistory /> },
    { id: 'settings', label: 'Settings', icon: <IconSettings /> }
  ];


  return (
    <ProjectProvider>
      <div className="flex h-screen bg-gray-950 text-gray-100 overflow-hidden font-sans">
        
        {/* Mobile Sidebar Toggle */}
        <div className="md:hidden absolute top-4 left-4 z-50">
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2 bg-gray-900 rounded-md text-gray-400 hover:text-white border border-gray-800 focus:outline-none">
            {sidebarOpen ? <IconX /> : <IconMenu />}
          </button>
        </div>

        {/* Sidebar */}
        <div className={`
          fixed inset-y-0 left-0 z-40 w-64 bg-gray-900 border-r border-gray-800 transform transition-transform duration-300 ease-in-out flex flex-col
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0 md:relative md:w-16 lg:w-64'}
        `}>
          <div className="h-14 flex items-center justify-center border-b border-gray-800">
            <span className="font-bold text-xl tracking-tight hidden lg:block md:hidden">Codex</span>
            <span className="font-bold text-xl tracking-tight block lg:hidden md:block">Cx</span>
          </div>
          
          <nav className="flex-1 overflow-y-auto py-4">
            <ul className="space-y-1 px-2">
              {navItems.map(item => (
                <li key={item.id}>
                  <button
                    onClick={() => navigate(item.id)}
                    className={`
                      w-full flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors group
                      ${currentPage === item.id ? 'bg-blue-600/20 text-blue-400' : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'}
                    `}
                    title={item.label}
                  >
                    <span className="flex-shrink-0 group-hover:scale-110 transition-transform">{item.icon}</span>
                    <span className="font-medium hidden lg:block md:hidden">{item.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        {/* Main Content */}
        <main className="flex-1 relative flex flex-col h-full overflow-hidden bg-gray-950">
          {/* Global Header */}
          <Header />

          {/* Overlay for mobile sidebar */}
          {sidebarOpen && (
            <div 
              className="md:hidden fixed inset-0 bg-black/50 z-30 backdrop-blur-sm"
              onClick={() => setSidebarOpen(false)}
            />
          )}
          
          <div className="flex-1 overflow-y-auto relative z-10 p-0 md:p-0">
            {Object.entries(pages).map(([id, pageComponent]) => (
              <div
                key={id}
                className={`h-full w-full ${currentPage === id ? 'flex flex-col' : 'hidden'}`}
              >
                {pageComponent}
              </div>
            ))}
          </div>
        </main>
      </div>
      {/* Global Code Change / Diff Notification Popup */}
      <CodeChangeNotificationModal />
    </ProjectProvider>
  );
};

export default App;
