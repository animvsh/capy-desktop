import React, { useState, ReactNode } from 'react';
import { Sidebar, NavItem } from '../Sidebar/Sidebar';
import {
  PanelLeftClose,
  PanelLeft,
  Columns2,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { Button } from '../ui/Button';

export type ViewMode = 'chat-only' | 'split' | 'control-only';

interface LayoutProps {
  children?: ReactNode;
  chatPane?: ReactNode;
  controlPane?: ReactNode;
  activeNav: NavItem;
  onNavigate: (item: NavItem) => void;
  viewMode?: ViewMode;
  onViewModeChange?: (mode: ViewMode) => void;
}

export function Layout({
  children,
  chatPane,
  controlPane,
  activeNav,
  onNavigate,
  viewMode = 'split',
  onViewModeChange,
}: LayoutProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const handleViewModeChange = (mode: ViewMode) => {
    onViewModeChange?.(mode);
  };

  return (
    <div className="flex h-screen w-screen bg-zinc-950 text-white overflow-hidden">
      {/* Sidebar */}
      <Sidebar
        activeItem={activeNav}
        onNavigate={onNavigate}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-14 flex items-center justify-between px-4 border-b border-zinc-800/50 bg-zinc-900/50 backdrop-blur-sm">
          {/* Left: Title */}
          <div className="flex items-center gap-3">
            <h1 className="text-sm font-medium text-zinc-300 capitalize">
              {activeNav}
            </h1>
          </div>

          {/* Center: View Mode Toggle */}
          {(chatPane || controlPane) && (
            <div className="flex items-center gap-1 p-1 bg-zinc-800/50 rounded-lg">
              <button
                onClick={() => handleViewModeChange('chat-only')}
                className={`
                  p-1.5 rounded-md transition-all duration-200
                  ${viewMode === 'chat-only'
                    ? 'bg-zinc-700 text-white'
                    : 'text-zinc-500 hover:text-white hover:bg-zinc-700/50'
                  }
                `}
                title="Chat only"
              >
                <PanelLeftClose className="w-4 h-4" />
              </button>
              <button
                onClick={() => handleViewModeChange('split')}
                className={`
                  p-1.5 rounded-md transition-all duration-200
                  ${viewMode === 'split'
                    ? 'bg-zinc-700 text-white'
                    : 'text-zinc-500 hover:text-white hover:bg-zinc-700/50'
                  }
                `}
                title="Split view"
              >
                <Columns2 className="w-4 h-4" />
              </button>
              <button
                onClick={() => handleViewModeChange('control-only')}
                className={`
                  p-1.5 rounded-md transition-all duration-200
                  ${viewMode === 'control-only'
                    ? 'bg-zinc-700 text-white'
                    : 'text-zinc-500 hover:text-white hover:bg-zinc-700/50'
                  }
                `}
                title="Control only"
              >
                <PanelLeft className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Right: Controls */}
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon-sm">
              <Minimize2 className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon-sm">
              <Maximize2 className="w-4 h-4" />
            </Button>
          </div>
        </header>

        {/* Content Area */}
        <main className="flex-1 flex overflow-hidden">
          {children ? (
            children
          ) : (
            <>
              {/* Chat Pane */}
              {viewMode !== 'control-only' && chatPane && (
                <div
                  className={`
                    flex flex-col border-r border-zinc-800/50
                    transition-all duration-300 ease-in-out
                    ${viewMode === 'chat-only' ? 'flex-1' : 'w-1/2 min-w-[400px]'}
                  `}
                >
                  {chatPane}
                </div>
              )}

              {/* Control Pane */}
              {viewMode !== 'chat-only' && controlPane && (
                <div
                  className={`
                    flex flex-col
                    transition-all duration-300 ease-in-out
                    ${viewMode === 'control-only' ? 'flex-1' : 'flex-1'}
                  `}
                >
                  {controlPane}
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}

export default Layout;
