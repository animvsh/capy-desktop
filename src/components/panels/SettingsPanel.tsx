/**
 * SettingsPanel - Clean, spacious settings with clear hierarchy
 * Premium aesthetic with generous whitespace
 */

import { useState, useEffect, Suspense, lazy } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useComposio } from '@/hooks/useComposio';
import { useApp } from '@/contexts/AppContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { CreditsPurchase } from '@/components/billing/CreditsPurchase';

const ProductAnalyzer = lazy(() => import('@/components/brok/ProductAnalyzer').then(m => ({ default: m.ProductAnalyzer })));

const toneLabels = ['Reserved', 'Professional', 'Confident', 'Bold'];

export function SettingsPanel() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { setComposioConfigured } = useApp();
  const { status: composioStatus, isLoading: composioLoading, connect, disconnect, refreshConnection, testConnection } = useComposio();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [productProfile, setProductProfile] = useState<any>(null);
  const [showProductAnalyzer, setShowProductAnalyzer] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [connecting, setConnecting] = useState<string | null>(null);

  const [icp, setIcp] = useState({
    whatYouSell: '',
    whoIsItFor: '',
    problemSolved: '',
    idealCustomer: '',
    whoToAvoid: '',
    successDefinition: '',
    tone: 50,
  });

  const [settings, setSettings] = useState({
    dailySendLimit: 50,
    pauseOnWeekends: true,
    autoCooldown: true,
    calendarConnected: false,
    meetConnected: false,
    notificationMethod: 'email' as 'email' | 'sms' | 'both' | 'none',
    phoneNumber: '',
    testingMode: false,
    testingEmail: '',
  });

  useEffect(() => {
    if (user) {
      fetchData();
      checkConnectionStatus();
    }
  }, [user]);

  useEffect(() => {
    setComposioConfigured(composioStatus.emailConnected);
  }, [composioStatus.emailConnected, setComposioConfigured]);

  const fetchData = async () => {
    if (!user) return;
    setLoading(true);

    const [icpRes, settingsRes, productRes] = await Promise.all([
      supabase.from('icp_profiles').select('*').eq('user_id', user.id).maybeSingle(),
      supabase.from('user_settings').select('*').eq('user_id', user.id).maybeSingle(),
      supabase.from('product_profiles').select('*').eq('user_id', user.id).maybeSingle(),
    ]);

    if (icpRes.data) {
      setIcp({
        whatYouSell: icpRes.data.what_you_sell || '',
        whoIsItFor: icpRes.data.who_is_it_for || '',
        problemSolved: icpRes.data.problem_solved || '',
        idealCustomer: icpRes.data.ideal_customer || '',
        whoToAvoid: icpRes.data.who_to_avoid || '',
        successDefinition: icpRes.data.success_definition || '',
        tone: icpRes.data.tone || 50,
      });
    }

    if (settingsRes.data) {
      setSettings({
        dailySendLimit: settingsRes.data.daily_send_limit || 50,
        pauseOnWeekends: settingsRes.data.pause_on_weekends ?? true,
        autoCooldown: settingsRes.data.auto_cooldown ?? true,
        calendarConnected: settingsRes.data.calendar_connected ?? false,
        meetConnected: settingsRes.data.meet_connected ?? false,
        notificationMethod: settingsRes.data.notification_method || 'email',
        phoneNumber: settingsRes.data.phone_number || '',
        testingMode: settingsRes.data.testing_mode ?? false,
        testingEmail: settingsRes.data.testing_email || '',
      });
    }

    if (productRes.data) setProductProfile(productRes.data);
    setLoading(false);
  };

  const checkConnectionStatus = async () => {
    if (!user) return;
    try {
      const { data } = await supabase.functions.invoke('composio-connect', { body: { action: 'status' } });
      if (data) {
        setSettings(prev => ({
          ...prev,
          calendarConnected: data.calendar_connected === true,
          meetConnected: data.meet_connected === true,
        }));
      }
    } catch (error) {
      console.error('Error checking connection status:', error);
    }
  };

  const connectService = async (type: 'googlecalendar' | 'googlemeet') => {
    if (!user) return;
    const key = type === 'googlecalendar' ? 'calendar' : 'meet';
    setConnecting(key);

    try {
      const { data, error } = await supabase.functions.invoke('composio-connect', {
        body: { action: 'connect', type },
      });

      if (error) {
        toast({ title: 'Connection failed', variant: 'destructive' });
        return;
      }

      if (data?.already_connected) {
        setSettings(prev => ({ ...prev, [`${key}Connected`]: true }));
        toast({ title: `${type === 'googlecalendar' ? 'Calendar' : 'Meet'} already connected` });
        return;
      }

      if (data?.redirectUrl) window.location.href = data.redirectUrl;
    } catch {
      toast({ title: 'Connection failed', variant: 'destructive' });
    } finally {
      setConnecting(null);
    }
  };

  const disconnectService = async (type: 'googlecalendar' | 'googlemeet') => {
    if (!user) return;
    const key = type === 'googlecalendar' ? 'calendar' : 'meet';
    setConnecting(key);

    try {
      await supabase.functions.invoke('composio-connect', { body: { action: 'disconnect', type } });
      setSettings(prev => ({ ...prev, [`${key}Connected`]: false }));
      toast({ title: `${type === 'googlecalendar' ? 'Calendar' : 'Meet'} disconnected` });
    } catch {
      toast({ title: 'Disconnect failed', variant: 'destructive' });
    } finally {
      setConnecting(null);
    }
  };

  const forceReconnect = async (type: 'googlecalendar' | 'googlemeet') => {
    if (!user) return;
    const key = type === 'googlecalendar' ? 'calendar' : 'meet';
    setConnecting(key);

    try {
      const { data, error } = await supabase.functions.invoke('composio-connect', {
        body: { action: 'force_reconnect', type },
      });

      if (error) {
        toast({ title: 'Reconnection failed', description: error.message, variant: 'destructive' });
        return;
      }

      if (data?.redirectUrl) {
        toast({ title: 'Redirecting to Google...', description: 'Cleaning up old connections' });
        window.location.href = data.redirectUrl;
      }
    } catch (err) {
      toast({ title: 'Reconnection failed', variant: 'destructive' });
    } finally {
      setConnecting(null);
    }
  };

  const handleTestConnection = async () => {
    setTestingConnection(true);
    await testConnection();
    setTestingConnection(false);
  };

  const saveIcp = async () => {
    if (!user) return;
    setSaving(true);

    const { error } = await supabase.from('icp_profiles').upsert({
      user_id: user.id,
      what_you_sell: icp.whatYouSell,
      who_is_it_for: icp.whoIsItFor,
      problem_solved: icp.problemSolved,
      ideal_customer: icp.idealCustomer,
      who_to_avoid: icp.whoToAvoid,
      success_definition: icp.successDefinition,
      tone: icp.tone,
    }, { onConflict: 'user_id' });

    if (error) {
      console.error('Error saving ICP:', error);
    }
    toast({ title: error ? 'Error saving' : 'Saved!', variant: error ? 'destructive' : 'default' });
    setSaving(false);
  };

  const saveSettings = async () => {
    if (!user) return;
    setSaving(true);

    const { error } = await supabase.from('user_settings').upsert({
      user_id: user.id,
      daily_send_limit: settings.dailySendLimit,
      pause_on_weekends: settings.pauseOnWeekends,
      auto_cooldown: settings.autoCooldown,
      notification_method: settings.notificationMethod,
      phone_number: settings.phoneNumber || null,
      testing_mode: settings.testingMode,
      testing_email: settings.testingEmail || null,
    }, { onConflict: 'user_id' });

    if (error) {
      console.error('Error saving settings:', error);
    }
    toast({ title: error ? 'Error saving' : 'Saved!', variant: error ? 'destructive' : 'default' });
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-3xl mx-auto px-6 py-8 space-y-12">
        
        {/* Header */}
        <div>
          <h1 className="text-2xl font-semibold">Settings</h1>
          <p className="text-muted-foreground mt-1">Manage your account and preferences</p>
        </div>

        {/* ========== INTEGRATIONS ========== */}
        <section className="space-y-6">
          <div>
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Integrations</h2>
          </div>

          {/* Gmail */}
          <div className="p-5 rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className={cn(
                  "w-10 h-10 rounded-lg flex items-center justify-center",
                  composioStatus.emailConnected ? "bg-emerald-500/10 text-emerald-600" : "bg-muted text-muted-foreground"
                )}>
                  <i className="fa-solid fa-envelope" />
                </div>
                <div>
                  <p className="font-medium">Gmail</p>
                  <p className="text-sm text-muted-foreground">
                    {composioStatus.emailConnected 
                      ? composioStatus.connectedEmail || 'Connected' 
                      : 'Send outreach emails'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {composioStatus.emailConnected ? (
                  <>
                    <Button variant="ghost" size="sm" onClick={handleTestConnection} disabled={testingConnection} className="text-xs">
                      {testingConnection ? 'Testing...' : 'Test'}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={refreshConnection} disabled={composioLoading} className="text-xs">
                      Refresh
                    </Button>
                    <Button variant="ghost" size="sm" onClick={disconnect} disabled={composioLoading} className="text-xs text-destructive">
                      Disconnect
                    </Button>
                  </>
                ) : (
                  <Button onClick={connect} disabled={composioLoading} size="sm">
                    {composioLoading ? 'Connecting...' : 'Connect'}
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Calendar & Meet */}
          <div className="grid gap-4 sm:grid-cols-2">
            {/* Calendar */}
            <div className="p-4 rounded-xl border border-border bg-card">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "w-9 h-9 rounded-lg flex items-center justify-center",
                    settings.calendarConnected ? "bg-blue-500/10 text-blue-600" : "bg-muted text-muted-foreground"
                  )}>
                    <i className="fa-solid fa-calendar text-sm" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Google Calendar</p>
                    <p className="text-xs text-muted-foreground">
                      {settings.calendarConnected ? 'Connected' : 'Auto-create events'}
                    </p>
                  </div>
                </div>
                {settings.calendarConnected ? (
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => forceReconnect('googlecalendar')} disabled={connecting === 'calendar'} className="text-xs" title="Delete all old connections and reconnect fresh">
                      <i className="fa-solid fa-arrows-rotate mr-1" />
                      Reconnect
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => disconnectService('googlecalendar')} disabled={connecting === 'calendar'} className="text-xs text-destructive">
                      Disconnect
                    </Button>
                  </div>
                ) : (
                  <Button size="sm" onClick={() => connectService('googlecalendar')} disabled={connecting === 'calendar'} className="text-xs">
                    Connect
                  </Button>
                )}
              </div>
            </div>

            {/* Meet */}
            <div className="p-4 rounded-xl border border-border bg-card">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "w-9 h-9 rounded-lg flex items-center justify-center",
                    settings.meetConnected ? "bg-teal-500/10 text-teal-600" : "bg-muted text-muted-foreground"
                  )}>
                    <i className="fa-solid fa-video text-sm" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Google Meet</p>
                    <p className="text-xs text-muted-foreground">
                      {settings.meetConnected ? 'Connected' : 'Video conferencing'}
                    </p>
                  </div>
                </div>
                {settings.meetConnected ? (
                  <Button variant="ghost" size="sm" onClick={() => disconnectService('googlemeet')} disabled={connecting === 'meet'} className="text-xs">
                    Disconnect
                  </Button>
                ) : (
                  <Button size="sm" onClick={() => connectService('googlemeet')} disabled={connecting === 'meet'} className="text-xs">
                    Connect
                  </Button>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* ========== BILLING & CREDITS ========== */}
        <section className="space-y-6">
          <div>
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Billing & Credits</h2>
            <p className="text-sm text-muted-foreground mt-1">Manage your credits and purchase more</p>
          </div>

          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <CreditsPurchase />
          </div>
        </section>

        {/* ========== PRODUCT PROFILE ========== */}
        <section className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Product Profile</h2>
              <p className="text-sm text-muted-foreground mt-1">What Capy knows about your product</p>
            </div>
            {productProfile && !showProductAnalyzer && (
              <Button variant="outline" size="sm" onClick={() => setShowProductAnalyzer(true)}>
                Re-analyze
              </Button>
            )}
          </div>

          <div className="p-5 rounded-xl border border-border bg-card">
            {showProductAnalyzer ? (
              <div>
                <Suspense fallback={<div className="py-8 text-center"><i className="fa-solid fa-spinner fa-spin text-muted-foreground" /></div>}>
                  <ProductAnalyzer showHeader={false} onComplete={() => { setShowProductAnalyzer(false); fetchData(); }} />
                </Suspense>
                <Button variant="ghost" size="sm" onClick={() => setShowProductAnalyzer(false)} className="mt-4">Cancel</Button>
              </div>
            ) : productProfile ? (
              <div className="space-y-4">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">One-liner</p>
                  <p className="font-medium">{productProfile.one_liner}</p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Target customer</p>
                    <p className="text-sm">{productProfile.target_customer}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Problem solved</p>
                    <p className="text-sm">{productProfile.core_problem}</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-6">
                <p className="text-muted-foreground mb-3">No product profile yet</p>
                <Button onClick={() => setShowProductAnalyzer(true)} size="sm">Analyze Website</Button>
              </div>
            )}
          </div>
        </section>

        {/* ========== IDEAL CUSTOMER PROFILE ========== */}
        <section className="space-y-6">
          <div>
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Ideal Customer Profile</h2>
            <p className="text-sm text-muted-foreground mt-1">Define who Capy should reach out to</p>
          </div>

          <div className="space-y-5">
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <Label className="text-xs text-muted-foreground">What do you sell?</Label>
                <Textarea
                  placeholder="AI-powered customer support software..."
                  className="mt-1.5 min-h-[100px]"
                  value={icp.whatYouSell}
                  onChange={(e) => setIcp({ ...icp, whatYouSell: e.target.value })}
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">What problem does it solve?</Label>
                <Textarea
                  placeholder="They spend too much time on support tickets..."
                  className="mt-1.5 min-h-[100px]"
                  value={icp.problemSolved}
                  onChange={(e) => setIcp({ ...icp, problemSolved: e.target.value })}
                />
              </div>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <Label className="text-xs text-muted-foreground">Who is this for?</Label>
                <Input
                  placeholder="Founders of B2B SaaS companies..."
                  className="mt-1.5"
                  value={icp.whoIsItFor}
                  onChange={(e) => setIcp({ ...icp, whoIsItFor: e.target.value })}
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">What does a great customer look like?</Label>
                <Input
                  placeholder="Fast-growing, values automation..."
                  className="mt-1.5"
                  value={icp.idealCustomer}
                  onChange={(e) => setIcp({ ...icp, idealCustomer: e.target.value })}
                />
              </div>
            </div>

            <div>
              <Label className="text-xs text-muted-foreground">Tone of voice</Label>
              <div className="mt-3 px-1">
                <Slider
                  value={[icp.tone]}
                  onValueChange={([value]) => setIcp({ ...icp, tone: value })}
                  max={100}
                  step={1}
                />
                <div className="flex justify-between mt-2 text-[10px] text-muted-foreground">
                  {toneLabels.map(label => <span key={label}>{label}</span>)}
                </div>
              </div>
            </div>

            <Button onClick={saveIcp} disabled={saving} size="sm">
              {saving ? 'Saving...' : 'Save ICP'}
            </Button>
          </div>
        </section>

        {/* ========== SAFETY & LIMITS ========== */}
        <section className="space-y-6">
          <div>
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Safety & Limits</h2>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 rounded-xl border border-border bg-card">
              <div>
                <p className="text-sm font-medium">Daily send limit</p>
                <p className="text-xs text-muted-foreground">Maximum emails per day</p>
              </div>
              <Input
                type="number"
                value={settings.dailySendLimit}
                onChange={(e) => setSettings({ ...settings, dailySendLimit: parseInt(e.target.value) || 50 })}
                className="w-20 text-center"
              />
            </div>

            <div className="flex items-center justify-between p-4 rounded-xl border border-border bg-card">
              <div>
                <p className="text-sm font-medium">Pause on weekends</p>
                <p className="text-xs text-muted-foreground">No emails on Sat/Sun</p>
              </div>
              <Switch
                checked={settings.pauseOnWeekends}
                onCheckedChange={(checked) => setSettings({ ...settings, pauseOnWeekends: checked })}
              />
            </div>

            <div className="flex items-center justify-between p-4 rounded-xl border border-border bg-card">
              <div>
                <p className="text-sm font-medium">Auto-cooldown</p>
                <p className="text-xs text-muted-foreground">Slow down on high bounce rate</p>
              </div>
              <Switch
                checked={settings.autoCooldown}
                onCheckedChange={(checked) => setSettings({ ...settings, autoCooldown: checked })}
              />
            </div>
          </div>

          <Button onClick={saveSettings} disabled={saving} size="sm">
            {saving ? 'Saving...' : 'Save Settings'}
          </Button>
        </section>

        {/* ========== NOTIFICATIONS ========== */}
        <section className="space-y-6">
          <div>
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Notifications</h2>
            <p className="text-sm text-muted-foreground mt-1">Meeting booking alerts</p>
          </div>

          <div className="space-y-4">
            <div>
              <Label className="text-xs text-muted-foreground">Notification method</Label>
              <Select
                value={settings.notificationMethod}
                onValueChange={(value: any) => setSettings({ ...settings, notificationMethod: value })}
              >
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="email">Email only</SelectItem>
                  <SelectItem value="sms">SMS only</SelectItem>
                  <SelectItem value="both">Email & SMS</SelectItem>
                  <SelectItem value="none">None</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {(settings.notificationMethod === 'sms' || settings.notificationMethod === 'both') && (
              <div>
                <Label className="text-xs text-muted-foreground">Phone number</Label>
                <Input
                  type="tel"
                  placeholder="+1234567890"
                  value={settings.phoneNumber}
                  onChange={(e) => setSettings({ ...settings, phoneNumber: e.target.value })}
                  className="mt-1.5"
                />
                <p className="text-[10px] text-muted-foreground mt-1">Include country code</p>
              </div>
            )}
          </div>

          <Button onClick={saveSettings} disabled={saving} size="sm">
            {saving ? 'Saving...' : 'Save Notifications'}
          </Button>
        </section>

        {/* ========== TESTING MODE ========== */}
        <section className="space-y-6">
          <div>
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Testing Mode</h2>
            <p className="text-sm text-muted-foreground mt-1">Safe testing without sending to real recipients</p>
          </div>

          <div className="space-y-4">
            {settings.testingMode && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-sm">
                <i className="fa-solid fa-exclamation-triangle text-amber-500" />
                <span>Testing mode is ON. All emails go to {settings.testingEmail || 'your test email'}.</span>
              </div>
            )}

            <div className="flex items-center justify-between p-4 rounded-xl border border-border bg-card">
              <div>
                <p className="text-sm font-medium">Enable testing mode</p>
                <p className="text-xs text-muted-foreground">Redirect all outbound emails</p>
              </div>
              <Switch
                checked={settings.testingMode}
                onCheckedChange={(checked) => setSettings({ ...settings, testingMode: checked })}
              />
            </div>

            <div>
              <Label className="text-xs text-muted-foreground">Testing email address</Label>
              <Input
                type="email"
                placeholder="test@example.com"
                value={settings.testingEmail}
                onChange={(e) => setSettings({ ...settings, testingEmail: e.target.value })}
                className="mt-1.5"
              />
            </div>
          </div>

          <Button onClick={saveSettings} disabled={saving} size="sm">
            {saving ? 'Saving...' : 'Save Testing Settings'}
          </Button>
        </section>

        {/* Spacer at bottom */}
        <div className="h-8" />
      </div>
    </div>
  );
}

export default SettingsPanel;
