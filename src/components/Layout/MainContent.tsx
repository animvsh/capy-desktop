import { Suspense, lazy, useState, useEffect, memo } from 'react';
import { useApp, PanelType } from '@/contexts/AppContext';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import capyLogo from '@/assets/capy-logo.png';
import { TutorialProvider, useTutorial } from '@/components/tutorial/TutorialProvider';
import { CreditsDisplay } from '@/components/credits/CreditsDisplay';

// Lazy load panel components - but keep them mounted once loaded
const HomePanel = lazy(() => import('@/components/panels/HomePanel'));
const LinkedInPanel = lazy(() => import('@/components/panels/LinkedInPanel'));
const ContactsPanel = lazy(() => import('@/components/panels/ContactsPanel'));
const MeetingsPanel = lazy(() => import('@/components/panels/MeetingsPanel'));
const CampaignsPanel = lazy(() => import('@/components/panels/CampaignsPanel'));
const SettingsPanel = lazy(() => import('@/components/panels/SettingsPanel'));
const AdminPanel = lazy(() => import('@/components/panels/AdminPanel'));

/**
 * Tab configuration
 */
interface TabConfig {
  id: PanelType;
  label: string;
  icon: string;
  adminOnly?: boolean;
}

const TABS: TabConfig[] = [
  { id: 'home', label: 'Home', icon: 'fa-home' },
  { id: 'linkedin', label: 'LinkedIn', icon: 'fa-linkedin' },
  { id: 'contacts', label: 'Contacts', icon: 'fa-users' },
  { id: 'meetings', label: 'Meetings', icon: 'fa-calendar' },
  { id: 'campaigns', label: 'Campaigns', icon: 'fa-rocket' },
  { id: 'settings', label: 'Settings', icon: 'fa-gear' },
  { id: 'admin', label: 'Admin', icon: 'fa-shield-halved', adminOnly: true },
];

/**
 * Panel wrapper that keeps component mounted but hidden for fast switching
 */
const PanelWrapper = memo(function PanelWrapper({
  isActive,
  children,
  hasBeenVisited
}: {
  isActive: boolean;
  children: React.ReactNode;
  hasBeenVisited: boolean;
}) {
  // Don't render at all if never visited (lazy load on first visit)
  if (!hasBeenVisited) return null;

  return (
    <div
      className={cn(
        'absolute inset-0',
        isActive ? 'visible opacity-100 z-10' : 'invisible opacity-0 z-0'
      )}
      style={{ pointerEvents: isActive ? 'auto' : 'none' }}
    >
      {children}
    </div>
  );
});

/**
 * MainContent - Tabbed content area with top navigation
 * Uses CSS visibility for instant panel switching
 */
export function MainContent() {
  const { activePanel, setActivePanel, chatSidebarOpen, setChatSidebarOpen, chatSidebarCollapsed } = useApp();

  return (
    <TutorialProvider onPanelChange={(panel) => setActivePanel(panel as PanelType)}>
      <MainContentInner
        activePanel={activePanel}
        setActivePanel={setActivePanel}
        chatSidebarOpen={chatSidebarOpen}
        setChatSidebarOpen={setChatSidebarOpen}
        chatSidebarCollapsed={chatSidebarCollapsed}
      />
    </TutorialProvider>
  );
}

interface MainContentInnerProps {
  activePanel: PanelType;
  setActivePanel: (panel: PanelType) => void;
  chatSidebarOpen: boolean;
  setChatSidebarOpen: (open: boolean) => void;
  chatSidebarCollapsed: boolean;
}

function MainContentInner({
  activePanel,
  setActivePanel,
  chatSidebarOpen,
  setChatSidebarOpen,
  chatSidebarCollapsed,
}: MainContentInnerProps) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { startTutorial, hasCompletedTutorial } = useTutorial();

  // Track which panels have been visited (for lazy initial load)
  const [visitedPanels, setVisitedPanels] = useState<Set<PanelType>>(new Set(['home']));

  // Mark panel as visited when it becomes active
  useEffect(() => {
    if (!visitedPanels.has(activePanel)) {
      setVisitedPanels(prev => new Set([...prev, activePanel]));
    }
  }, [activePanel, visitedPanels]);

  // Get user info for avatar
  const userEmail = user?.email || '';
  const userInitial = userEmail.charAt(0).toUpperCase();

  // Check if user is admin (for admin tab visibility)
  const isAdmin = true;

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  // Filter tabs based on admin status
  const visibleTabs = TABS.filter(tab => !tab.adminOnly || isAdmin);

  return (
    <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
      {/* Header with tabs */}
      <header className="sticky top-0 z-20 bg-card/95 backdrop-blur-sm border-b border-border/50 shrink-0">
        {/* Top bar */}
        <div className="flex items-center justify-between h-12 px-4">
          {/* Mobile menu button + Logo */}
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setChatSidebarOpen(!chatSidebarOpen)}
              className="h-8 w-8 rounded-md hover:bg-muted md:hidden"
            >
              <i className="fa-solid fa-bars text-muted-foreground text-sm" />
            </Button>

            {/* Show Capy logo when sidebar is collapsed on desktop */}
            {chatSidebarCollapsed && (
              <div className="hidden md:flex items-center gap-2">
                <div className="flex h-6 w-6 items-center justify-center">
                  <img src={capyLogo} alt="Capy" className="h-6 w-6" />
                </div>
                <span className="font-semibold text-sm text-foreground">Capy</span>
              </div>
            )}
          </div>

          {/* Credits Display & Profile Dropdown */}
          <div className="flex items-center gap-2">
            <CreditsDisplay variant="compact" showBuyButton={true} />
            
            <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="flex items-center gap-2 h-8 px-2 hover:bg-muted rounded-md"
              >
                <Avatar className="h-6 w-6">
                  <AvatarFallback className="bg-primary/80 text-primary-foreground text-xs font-medium">
                    {userInitial}
                  </AvatarFallback>
                </Avatar>
                <span className="hidden sm:inline text-xs text-muted-foreground truncate max-w-[120px]">
                  {userEmail}
                </span>
                <i className="fa-solid fa-chevron-down text-[10px] text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel className="font-normal text-xs">
                {userEmail}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={startTutorial}
                className="cursor-pointer text-xs"
              >
                <i className="fa-solid fa-graduation-cap mr-2 h-3 w-3" />
                {hasCompletedTutorial ? 'Replay Tutorial' : 'Start Tutorial'}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setActivePanel('settings')}
                className="cursor-pointer text-xs"
                data-tutorial="settings-tab"
              >
                <i className="fa-solid fa-gear mr-2 h-3 w-3" />
                Settings
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={handleSignOut}
                className="cursor-pointer text-xs text-destructive focus:text-destructive"
              >
                <i className="fa-solid fa-right-from-bracket mr-2 h-3 w-3" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          </div>
        </div>

        {/* Tab navigation */}
        <div className="flex items-center gap-0.5 px-4 pb-1.5 overflow-x-auto scrollbar-hide" data-tutorial="nav-tabs">
          {visibleTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActivePanel(tab.id)}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium whitespace-nowrap',
                'transition-colors duration-100',
                activePanel === tab.id
                  ? 'bg-primary/90 text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              )}
            >
              <i className={cn(
                'text-[10px]',
                tab.id === 'linkedin' ? 'fa-brands' : 'fa-solid',
                tab.icon
              )} />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}
        </div>
      </header>

      {/* Panel content - uses absolute positioning for instant switching */}
      <div className="flex-1 relative overflow-hidden">
        <Suspense fallback={<PanelLoader />}>
          <PanelWrapper isActive={activePanel === 'home'} hasBeenVisited={visitedPanels.has('home')}>
            <div className="h-full overflow-auto"><HomePanel /></div>
          </PanelWrapper>
          <PanelWrapper isActive={activePanel === 'linkedin'} hasBeenVisited={visitedPanels.has('linkedin')}>
            <div className="h-full overflow-auto"><LinkedInPanel /></div>
          </PanelWrapper>
          <PanelWrapper isActive={activePanel === 'contacts'} hasBeenVisited={visitedPanels.has('contacts')}>
            <div className="h-full overflow-auto"><ContactsPanel /></div>
          </PanelWrapper>
          <PanelWrapper isActive={activePanel === 'meetings'} hasBeenVisited={visitedPanels.has('meetings')}>
            <div className="h-full overflow-auto"><MeetingsPanel /></div>
          </PanelWrapper>
          <PanelWrapper isActive={activePanel === 'campaigns'} hasBeenVisited={visitedPanels.has('campaigns')}>
            <div className="h-full overflow-auto"><CampaignsPanel /></div>
          </PanelWrapper>
          <PanelWrapper isActive={activePanel === 'settings'} hasBeenVisited={visitedPanels.has('settings')}>
            <div className="h-full overflow-auto"><SettingsPanel /></div>
          </PanelWrapper>
          <PanelWrapper isActive={activePanel === 'admin'} hasBeenVisited={visitedPanels.has('admin')}>
            <div className="h-full overflow-auto"><AdminPanel /></div>
          </PanelWrapper>
        </Suspense>
      </div>
    </main>
  );
}

/**
 * PanelLoader - Loading state for lazy-loaded panels
 */
function PanelLoader() {
  return (
    <div className="flex flex-col items-center justify-center h-64">
      <div className="w-12 h-12 flex items-center justify-center animate-pulse mb-3">
        <img src={capyLogo} alt="Loading" className="h-12 w-12" />
      </div>
      <p className="text-sm text-muted-foreground">Loading...</p>
    </div>
  );
}

export default MainContent;
