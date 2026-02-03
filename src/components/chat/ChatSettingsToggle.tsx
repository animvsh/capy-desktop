/**
 * ChatSettingsToggle - Quick access toggles for chat behavior
 * 
 * Shows in the chat header:
 * - Mode toggle (Autopilot / Ask First / Read Only)
 * - Service selector (which API to prefer)
 * 
 * Settings persist to localStorage for instant access.
 */

import React from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { 
  useChatSettings, 
  CHAT_MODES, 
  SERVICES, 
  ChatMode, 
  PrimaryService 
} from '@/hooks/useChatSettings';

interface ChatSettingsToggleProps {
  compact?: boolean;
}

export function ChatSettingsToggle({ compact = false }: ChatSettingsToggleProps) {
  const {
    chatMode,
    primaryService,
    chatModeConfig,
    serviceConfig,
    setChatMode,
    setPrimaryService,
    isReadOnly,
    requiresConfirmation,
    isAutopilot,
  } = useChatSettings();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            'h-7 gap-1.5 rounded-full px-2.5 font-medium text-[11px]',
            chatModeConfig.color,
            chatMode === 'autopilot' && 'bg-emerald-500/10 hover:bg-emerald-500/15',
            chatMode === 'ask_before_send' && 'bg-amber-500/10 hover:bg-amber-500/15',
            chatMode === 'readonly' && 'bg-gray-500/10 hover:bg-gray-500/15'
          )}
        >
          <i className={cn('fa-solid text-[9px]', chatModeConfig.icon)} />
          {!compact && (
            <>
              <span className="hidden sm:inline">{chatModeConfig.label}</span>
              <i className="fa-solid fa-chevron-down text-[8px] opacity-60 ml-0.5" />
            </>
          )}
        </Button>
      </DropdownMenuTrigger>
      
      <DropdownMenuContent align="center" className="w-72">
        {/* Mode Section */}
        <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
          Chat Mode
        </DropdownMenuLabel>
        
        <DropdownMenuRadioGroup value={chatMode} onValueChange={(v) => setChatMode(v as ChatMode)}>
          {CHAT_MODES.map((mode) => (
            <DropdownMenuRadioItem
              key={mode.id}
              value={mode.id}
              className="flex items-start gap-3 p-3 cursor-pointer"
            >
              <div className={cn(
                'flex h-6 w-6 items-center justify-center rounded-lg shrink-0 mt-0.5 text-white',
                mode.bgColor
              )}>
                <i className={cn('fa-solid text-[10px]', mode.icon)} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm">{mode.label}</p>
                <p className="text-xs text-muted-foreground leading-snug mt-0.5">
                  {mode.description}
                </p>
              </div>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        
        <DropdownMenuSeparator />
        
        {/* Service Section */}
        <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
          Primary Service
        </DropdownMenuLabel>
        
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="flex items-center gap-2">
            <i className={cn('fa-solid text-sm', serviceConfig.icon, serviceConfig.color)} />
            <span className="flex-1">{serviceConfig.name}</span>
            <Badge variant="outline" className="text-[10px] h-5">
              {primaryService === 'auto' ? 'Auto' : primaryService.toUpperCase()}
            </Badge>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-56">
            <DropdownMenuRadioGroup value={primaryService} onValueChange={(v) => setPrimaryService(v as PrimaryService)}>
              {SERVICES.map((service) => (
                <DropdownMenuRadioItem
                  key={service.id}
                  value={service.id}
                  className="flex items-start gap-2 p-2 cursor-pointer"
                >
                  <i className={cn('fa-solid text-sm mt-0.5', service.icon, service.color)} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{service.name}</p>
                    <p className="text-xs text-muted-foreground">{service.description}</p>
                  </div>
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        
        <DropdownMenuSeparator />
        
        {/* Status Indicators */}
        <div className="px-2 py-2 space-y-2">
          {/* Read-only indicator */}
          {isReadOnly && (
            <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-gray-500/10">
              <i className="fa-solid fa-eye text-xs text-gray-500" />
              <span className="text-xs text-muted-foreground">
                Actions are disabled in read-only mode
              </span>
            </div>
          )}
          
          {/* Ask-first indicator */}
          {requiresConfirmation && (
            <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-amber-500/10">
              <i className="fa-solid fa-hand text-xs text-amber-500" />
              <span className="text-xs text-muted-foreground">
                You'll confirm before sending
              </span>
            </div>
          )}
          
          {/* Autopilot indicator */}
          {isAutopilot && (
            <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-emerald-500/10">
              <i className="fa-solid fa-rocket text-xs text-emerald-500" />
              <span className="text-xs text-muted-foreground">
                Capy will act autonomously
              </span>
            </div>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default ChatSettingsToggle;
