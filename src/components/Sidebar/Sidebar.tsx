import React, { useState } from 'react';
import {
  MessageSquare,
  Play,
  Megaphone,
  Globe,
  Users,
  Inbox,
  FileText,
  ScrollText,
  Settings,
  ChevronLeft,
  ChevronRight,
  Sparkles,
} from 'lucide-react';

export type NavItem =
  | 'chat'
  | 'runs'
  | 'campaigns'
  | 'browser'
  | 'leads'
  | 'inbox'
  | 'templates'
  | 'logs'
  | 'settings';

interface SidebarProps {
  activeItem: NavItem;
  onNavigate: (item: NavItem) => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

interface NavItemConfig {
  id: NavItem;
  label: string;
  icon: React.ReactNode;
  badge?: string | number;
}

const navItems: NavItemConfig[] = [
  { id: 'chat', label: 'Chat', icon: <MessageSquare className="w-5 h-5" /> },
  { id: 'runs', label: 'Runs', icon: <Play className="w-5 h-5" />, badge: '2' },
  { id: 'campaigns', label: 'Campaigns', icon: <Megaphone className="w-5 h-5" /> },
  { id: 'browser', label: 'Browser', icon: <Globe className="w-5 h-5" /> },
  { id: 'leads', label: 'Leads', icon: <Users className="w-5 h-5" /> },
  { id: 'inbox', label: 'Inbox', icon: <Inbox className="w-5 h-5" />, badge: '5' },
  { id: 'templates', label: 'Templates', icon: <FileText className="w-5 h-5" /> },
  { id: 'logs', label: 'Logs', icon: <ScrollText className="w-5 h-5" /> },
  { id: 'settings', label: 'Settings', icon: <Settings className="w-5 h-5" /> },
];

export function Sidebar({
  activeItem,
  onNavigate,
  collapsed = false,
  onToggleCollapse,
}: SidebarProps) {
  return (
    <aside
      className={`
        relative flex flex-col h-full bg-zinc-950 border-r border-zinc-800/50
        transition-all duration-300 ease-in-out
        ${collapsed ? 'w-16' : 'w-56'}
      `}
    >
      {/* Logo / Header */}
      <div className="flex items-center h-14 px-4 border-b border-zinc-800/50">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 shadow-lg shadow-indigo-500/25">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          {!collapsed && (
            <span className="text-base font-semibold text-white tracking-tight">
              Capy
            </span>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-3 px-2 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = activeItem === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`
                relative w-full flex items-center gap-3 px-3 py-2.5 rounded-lg
                transition-all duration-200 group
                ${isActive
                  ? 'bg-indigo-500/15 text-white'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'
                }
              `}
            >
              {/* Active indicator */}
              {isActive && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-indigo-500 rounded-r-full" />
              )}
              
              {/* Icon */}
              <span className={`
                flex-shrink-0 transition-colors duration-200
                ${isActive ? 'text-indigo-400' : 'text-zinc-500 group-hover:text-zinc-300'}
              `}>
                {item.icon}
              </span>
              
              {/* Label */}
              {!collapsed && (
                <span className="flex-1 text-sm font-medium text-left truncate">
                  {item.label}
                </span>
              )}
              
              {/* Badge */}
              {!collapsed && item.badge && (
                <span className={`
                  px-1.5 py-0.5 text-xs font-medium rounded-full
                  ${isActive
                    ? 'bg-indigo-500/30 text-indigo-300'
                    : 'bg-zinc-800 text-zinc-400'
                  }
                `}>
                  {item.badge}
                </span>
              )}
              
              {/* Collapsed badge */}
              {collapsed && item.badge && (
                <span className="absolute top-1 right-1 w-2 h-2 bg-indigo-500 rounded-full" />
              )}
            </button>
          );
        })}
      </nav>

      {/* Collapse Toggle */}
      {onToggleCollapse && (
        <div className="p-2 border-t border-zinc-800/50">
          <button
            onClick={onToggleCollapse}
            className="
              w-full flex items-center justify-center p-2 rounded-lg
              text-zinc-500 hover:text-white hover:bg-zinc-800/50
              transition-colors duration-200
            "
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? (
              <ChevronRight className="w-5 h-5" />
            ) : (
              <ChevronLeft className="w-5 h-5" />
            )}
          </button>
        </div>
      )}
    </aside>
  );
}

export default Sidebar;
