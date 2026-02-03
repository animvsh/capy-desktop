/**
 * SetupWizard - Guides users through Composio email setup
 *
 * BLOCKS access to Conversations until setup is complete.
 */

import { useState } from 'react';
import { useComposio } from '@/hooks/useComposio';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import capyLogo from '@/assets/capy-logo.png';

type Step = 'welcome' | 'explain' | 'connect' | 'connecting';

export function SetupWizard() {
  const { connect, isLoading } = useComposio();
  const [step, setStep] = useState<Step>('welcome');

  const handleConnect = async () => {
    setStep('connecting');
    await connect();
  };

  return (
    <div className="flex items-center justify-center h-full bg-background">
      <div className="max-w-lg w-full mx-4">
        {/* Welcome step */}
        {step === 'welcome' && (
          <div className="text-center space-y-6 animate-in fade-in duration-300">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-xl bg-emerald-500">
              <img src={capyLogo} alt="Capy" className="h-10 w-10" />
            </div>

            <div>
              <h2 className="text-2xl font-bold mb-2">Welcome to Conversations</h2>
              <p className="text-muted-foreground">
                Connect your email to view and manage all your conversations in one place.
              </p>
            </div>

            <Button
              size="lg"
              onClick={() => setStep('explain')}
              className="gap-2 rounded-full px-8"
            >
              Get Started
              <i className="fa-solid fa-arrow-right" />
            </Button>
          </div>
        )}

        {/* Explain step */}
        {step === 'explain' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
            <Button
              variant="ghost"
              onClick={() => setStep('welcome')}
              className="mb-4"
            >
              <i className="fa-solid fa-arrow-left mr-2" />
              Back
            </Button>

            <h2 className="text-2xl font-bold">What you'll get</h2>

            <div className="space-y-4">
              <FeatureCard
                icon="fa-envelope"
                iconColor="text-blue-500"
                title="Unified Inbox"
                description="See all your email conversations in one beautiful interface."
              />
              <FeatureCard
                icon="fa-robot"
                iconColor="text-emerald-500"
                title="AI-Powered Assistance"
                description="Capy can read emails, draft replies, and help you stay on top of conversations."
              />
              <FeatureCard
                icon="fa-shield"
                iconColor="text-purple-500"
                title="Secure Connection"
                description="Your data is encrypted and we never store your email password."
              />
            </div>

            <div className="pt-4">
              <Button
                size="lg"
                onClick={() => setStep('connect')}
                className="w-full gap-2 rounded-full"
              >
                Continue
                <i className="fa-solid fa-arrow-right" />
              </Button>
            </div>
          </div>
        )}

        {/* Connect step */}
        {step === 'connect' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
            <Button
              variant="ghost"
              onClick={() => setStep('explain')}
              className="mb-4"
            >
              <i className="fa-solid fa-arrow-left mr-2" />
              Back
            </Button>

            <h2 className="text-2xl font-bold">Connect your email</h2>
            <p className="text-muted-foreground">
              Choose your email provider to get started.
            </p>

            <div className="space-y-3">
              <button
                onClick={handleConnect}
                disabled={isLoading}
                className={cn(
                  'w-full flex items-center gap-4 p-4 rounded-xl border-2 border-border',
                  'bg-card hover:bg-muted/50 transition-colors',
                  'disabled:opacity-50 disabled:cursor-not-allowed'
                )}
              >
                <div className="w-12 h-12 rounded-xl bg-white flex items-center justify-center shadow-sm">
                  <i className="fa-brands fa-google text-2xl" style={{ color: '#4285F4' }} />
                </div>
                <div className="text-left flex-1">
                  <div className="font-semibold">Gmail</div>
                  <div className="text-sm text-muted-foreground">Connect your Google account</div>
                </div>
                <i className="fa-solid fa-arrow-right text-muted-foreground" />
              </button>

              <button
                disabled
                className={cn(
                  'w-full flex items-center gap-4 p-4 rounded-xl border-2 border-border',
                  'bg-card opacity-50 cursor-not-allowed'
                )}
              >
                <div className="w-12 h-12 rounded-xl bg-white flex items-center justify-center shadow-sm">
                  <i className="fa-brands fa-microsoft text-2xl" style={{ color: '#00A4EF' }} />
                </div>
                <div className="text-left flex-1">
                  <div className="font-semibold">Outlook</div>
                  <div className="text-sm text-muted-foreground">Coming soon</div>
                </div>
              </button>
            </div>

            <p className="text-xs text-muted-foreground text-center">
              By connecting, you agree to allow Capy to read and send emails on your behalf.
            </p>
          </div>
        )}

        {/* Connecting step */}
        {step === 'connecting' && (
          <div className="text-center space-y-6 animate-in fade-in duration-300">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-xl bg-emerald-500">
              <i className="fa-solid fa-spinner fa-spin text-2xl text-white" />
            </div>

            <div>
              <h2 className="text-2xl font-bold mb-2">Connecting...</h2>
              <p className="text-muted-foreground">
                You'll be redirected to authorize access. Please complete the process in the new window.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

interface FeatureCardProps {
  icon: string;
  iconColor: string;
  title: string;
  description: string;
}

function FeatureCard({ icon, iconColor, title, description }: FeatureCardProps) {
  return (
    <div className="flex items-start gap-4 p-4 rounded-xl bg-card border border-border">
      <div className={cn(
        'w-10 h-10 rounded-lg flex items-center justify-center',
        'bg-muted'
      )}>
        <i className={cn('fa-solid', icon, iconColor)} />
      </div>
      <div>
        <h3 className="font-semibold">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

export default SetupWizard;
