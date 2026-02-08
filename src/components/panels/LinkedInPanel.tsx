/**
 * LinkedInPanel - LinkedIn Automation Interface
 * 
 * Features:
 * - Live browser view of LinkedIn
 * - Connection request automation
 * - Message automation
 * - Login status management
 * - Step-by-step visibility
 */

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useBrowserAutomation } from '@/hooks/useBrowserAutomation';
import { LiveView } from '@/components/browser/LiveView';
import { cn } from '@/lib/utils';

export function LinkedInPanel() {
  const {
    isInitialized,
    isLoading,
    error,
    activeProfileId,
    currentRun,
    isLoggedIn,
    initialize,
    selectProfile,
    checkLinkedInLogin,
    openLoginPage,
    linkedInConnect,
    linkedInMessage,
  } = useBrowserAutomation();

  const [targetUrl, setTargetUrl] = useState('');
  const [message, setMessage] = useState('');
  const [connectionNote, setConnectionNote] = useState('');
  const [isCheckingLogin, setIsCheckingLogin] = useState(false);

  // Check if running in Electron
  const isElectron = typeof window !== 'undefined' && !!window.playwright;

  // Initialize browser when component mounts
  useEffect(() => {
    if (isElectron && !isInitialized) {
      initialize();
    }
  }, [isElectron, isInitialized, initialize]);

  // Select LinkedIn profile on init
  useEffect(() => {
    if (isInitialized && !activeProfileId) {
      selectProfile('linkedin').catch(console.error);
    }
  }, [isInitialized, activeProfileId, selectProfile]);

  // Check login status
  const handleCheckLogin = useCallback(async () => {
    setIsCheckingLogin(true);
    try {
      await checkLinkedInLogin();
    } finally {
      setIsCheckingLogin(false);
    }
  }, [checkLinkedInLogin]);

  // Open LinkedIn login page
  const handleOpenLogin = useCallback(async () => {
    await openLoginPage('linkedin');
    // After user logs in, they should click "Check Again"
  }, [openLoginPage]);

  // Send connection request
  const handleConnect = useCallback(async () => {
    if (!targetUrl) return;
    try {
      await linkedInConnect(targetUrl, connectionNote || undefined);
    } catch (e) {
      console.error('Connection failed:', e);
    }
  }, [targetUrl, connectionNote, linkedInConnect]);

  // Send message
  const handleMessage = useCallback(async () => {
    if (!targetUrl || !message) return;
    try {
      await linkedInMessage(targetUrl, message);
    } catch (e) {
      console.error('Message failed:', e);
    }
  }, [targetUrl, message, linkedInMessage]);

  // Show web version message if not in Electron
  if (!isElectron) {
    return (
      <div className="p-4 md:p-6">
        <div className="space-y-6">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-xl sm:text-2xl font-extrabold text-foreground">LinkedIn Outreach</h1>
                <Badge className="bg-blue-500 text-white border-0">Desktop Required</Badge>
              </div>
              <p className="text-sm text-muted-foreground mt-1">Browser automation requires the desktop app</p>
            </div>
          </div>

          <Card className="border-dashed">
            <CardContent className="pt-6 text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-xl bg-[#0A66C2]/10 mb-4">
                <i className="fa-brands fa-linkedin text-3xl text-[#0A66C2]" />
              </div>
              <h2 className="text-xl font-bold mb-2">Desktop App Required</h2>
              <p className="text-muted-foreground mb-4 max-w-md mx-auto">
                LinkedIn automation requires the Capy desktop app for secure browser control.
                Download the app to access automated outreach features.
              </p>
              <Button className="bg-[#0A66C2] hover:bg-[#004182]">
                <i className="fa-solid fa-download mr-2" />
                Download Desktop App
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 h-full overflow-auto">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl sm:text-2xl font-extrabold text-foreground">LinkedIn Outreach</h1>
              {isLoggedIn ? (
                <Badge className="bg-emerald-500 text-white border-0">
                  <i className="fa-solid fa-check mr-1" /> Connected
                </Badge>
              ) : (
                <Badge variant="outline" className="border-amber-500 text-amber-500">
                  <i className="fa-solid fa-exclamation-triangle mr-1" /> Login Required
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Automate LinkedIn connections and messages with live browser view
            </p>
          </div>

          {/* Status indicators */}
          <div className="flex items-center gap-2">
            {isLoading && (
              <Badge variant="secondary">
                <i className="fa-solid fa-spinner fa-spin mr-1" /> Working...
              </Badge>
            )}
            {currentRun && (
              <Badge className="bg-blue-500">
                <i className="fa-solid fa-play mr-1" /> {currentRun.type.replace('_', ' ')}
              </Badge>
            )}
          </div>
        </div>

        {/* Error display */}
        {error && (
          <div className="bg-destructive/10 border border-destructive/30 rounded-lg px-4 py-3 text-destructive">
            <i className="fa-solid fa-exclamation-circle mr-2" />
            {error}
          </div>
        )}

        {/* Login required state */}
        {!isLoggedIn && isInitialized && (
          <Card className="border-amber-500/30 bg-amber-500/5">
            <CardContent className="pt-6">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-amber-500/10 text-amber-500">
                  <i className="fa-solid fa-user-lock text-xl" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold mb-1">Login to LinkedIn</h3>
                  <p className="text-sm text-muted-foreground mb-3">
                    You need to log in to your LinkedIn account to use automation features.
                    The browser will open LinkedIn's login page - log in manually, then click "Check Again".
                  </p>
                  <div className="flex gap-2">
                    <Button onClick={handleOpenLogin} disabled={isCheckingLogin}>
                      <i className="fa-brands fa-linkedin mr-2" />
                      Open LinkedIn Login
                    </Button>
                    <Button variant="outline" onClick={handleCheckLogin} disabled={isCheckingLogin}>
                      {isCheckingLogin ? (
                        <><i className="fa-solid fa-spinner fa-spin mr-2" /> Checking...</>
                      ) : (
                        <><i className="fa-solid fa-refresh mr-2" /> Check Again</>
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Main content - split view */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: Controls */}
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Automation Actions</CardTitle>
                <CardDescription>Send connection requests or messages</CardDescription>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="connect" className="w-full">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="connect">
                      <i className="fa-solid fa-user-plus mr-2" /> Connect
                    </TabsTrigger>
                    <TabsTrigger value="message">
                      <i className="fa-solid fa-envelope mr-2" /> Message
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="connect" className="space-y-4 mt-4">
                    <div>
                      <label className="text-sm font-medium mb-2 block">LinkedIn Profile URL</label>
                      <Input
                        placeholder="https://www.linkedin.com/in/username"
                        value={targetUrl}
                        onChange={(e) => setTargetUrl(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-2 block">Connection Note (optional)</label>
                      <Textarea
                        placeholder="Hi! I'd love to connect..."
                        value={connectionNote}
                        onChange={(e) => setConnectionNote(e.target.value)}
                        rows={3}
                        maxLength={300}
                      />
                      <p className="text-xs text-muted-foreground mt-1">{connectionNote.length}/300</p>
                    </div>
                    <Button
                      className="w-full bg-[#0A66C2] hover:bg-[#004182]"
                      onClick={handleConnect}
                      disabled={!targetUrl || !isLoggedIn || isLoading || !!currentRun}
                    >
                      <i className="fa-solid fa-user-plus mr-2" />
                      Send Connection Request
                    </Button>
                  </TabsContent>

                  <TabsContent value="message" className="space-y-4 mt-4">
                    <div>
                      <label className="text-sm font-medium mb-2 block">LinkedIn Profile URL</label>
                      <Input
                        placeholder="https://www.linkedin.com/in/username"
                        value={targetUrl}
                        onChange={(e) => setTargetUrl(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-2 block">Message</label>
                      <Textarea
                        placeholder="Your message..."
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        rows={4}
                      />
                    </div>
                    <Button
                      className="w-full bg-[#0A66C2] hover:bg-[#004182]"
                      onClick={handleMessage}
                      disabled={!targetUrl || !message || !isLoggedIn || isLoading || !!currentRun}
                    >
                      <i className="fa-solid fa-paper-plane mr-2" />
                      Send Message
                    </Button>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>

            {/* Quick Tips */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">
                  <i className="fa-solid fa-lightbulb text-amber-500 mr-2" />
                  Tips for Success
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground space-y-2">
                <p>• <strong>Personalize</strong> your connection notes for better acceptance rates</p>
                <p>• <strong>Wait</strong> for approval before sending - review the preview</p>
                <p>• <strong>Don't spam</strong> - LinkedIn may restrict your account</p>
                <p>• <strong>Log in first</strong> using the browser view on the right</p>
              </CardContent>
            </Card>
          </div>

          {/* Right: Live View */}
          <div className="lg:sticky lg:top-4">
            <LiveView
              profileId={activeProfileId}
              isActive={isInitialized}
              className="min-h-[500px]"
            />
          </div>
        </div>

        {/* Run History (placeholder) */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Recent Activity</CardTitle>
            <CardDescription>Your recent LinkedIn automation runs</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8 text-muted-foreground">
              <i className="fa-solid fa-history text-2xl mb-2" />
              <p>No recent activity</p>
              <p className="text-sm">Completed automation runs will appear here</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default LinkedInPanel;
