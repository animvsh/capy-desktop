/**
 * TutorialProvider - In-app tutorial system with spotlight highlighting
 */

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

// Tutorial step definition
interface TutorialStep {
  id: string;
  title: string;
  description: string;
  target?: string; // CSS selector for spotlight
  position?: 'top' | 'bottom' | 'left' | 'right' | 'center';
  panel?: string; // Panel to navigate to
}

// All tutorial steps
const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to Capy! 🦫',
    description: 'Capy is your AI-powered outreach assistant. Let me show you around the platform in just a few steps.',
    position: 'center',
  },
  {
    id: 'chat',
    title: 'Chat with Capy',
    description: 'This is your AI assistant. Ask Capy to find leads, write emails, schedule meetings, or check your analytics. Just type naturally!',
    target: '[data-tutorial="chat-panel"]',
    position: 'right',
  },
  {
    id: 'leads',
    title: 'Discover Leads',
    description: 'Ask Capy to find leads for you. Try saying "Find 10 SaaS founders in Berlin" or "Search for marketing agencies in NYC".',
    target: '[data-tutorial="chat-input"]',
    position: 'top',
  },
  {
    id: 'conversations',
    title: 'Your Inbox',
    description: 'All your email conversations with leads appear here. You can read, reply, and manage your outreach in one place.',
    target: '[data-tutorial="email-list"]',
    position: 'left',
    panel: 'home',
  },
  {
    id: 'tabs',
    title: 'Navigation',
    description: 'Use these tabs to access different sections: LinkedIn outreach, Contacts database, Meetings calendar, and Settings.',
    target: '[data-tutorial="nav-tabs"]',
    position: 'bottom',
  },
  {
    id: 'settings',
    title: 'Configure Capy',
    description: 'Set up your email connection, customize outreach preferences, and configure how autonomous Capy should be.',
    target: '[data-tutorial="settings-tab"]',
    position: 'bottom',
    panel: 'settings',
  },
  {
    id: 'complete',
    title: "You're all set! 🎉",
    description: 'Start by asking Capy to find some leads, or explore the dashboard. If you need help, just ask Capy!',
    position: 'center',
  },
];

// Tutorial context
interface TutorialContextType {
  isActive: boolean;
  currentStep: number;
  totalSteps: number;
  step: TutorialStep | null;
  startTutorial: () => void;
  endTutorial: () => void;
  nextStep: () => void;
  prevStep: () => void;
  skipTutorial: () => void;
  hasCompletedTutorial: boolean;
}

const TutorialContext = createContext<TutorialContextType | null>(null);

export const useTutorial = () => {
  const context = useContext(TutorialContext);
  if (!context) {
    throw new Error('useTutorial must be used within TutorialProvider');
  }
  return context;
};

interface TutorialProviderProps {
  children: ReactNode;
  onPanelChange?: (panel: string) => void;
}

export function TutorialProvider({ children, onPanelChange }: TutorialProviderProps) {
  const [isActive, setIsActive] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [hasCompletedTutorial, setHasCompletedTutorial] = useState(() => {
    return localStorage.getItem('capy-tutorial-completed') === 'true';
  });

  const step = isActive ? TUTORIAL_STEPS[currentStep] : null;

  const startTutorial = useCallback(() => {
    setCurrentStep(0);
    setIsActive(true);
  }, []);

  const endTutorial = useCallback(() => {
    setIsActive(false);
    setCurrentStep(0);
    setHasCompletedTutorial(true);
    localStorage.setItem('capy-tutorial-completed', 'true');
  }, []);

  const skipTutorial = useCallback(() => {
    endTutorial();
  }, [endTutorial]);

  const nextStep = useCallback(() => {
    if (currentStep < TUTORIAL_STEPS.length - 1) {
      const nextStepData = TUTORIAL_STEPS[currentStep + 1];
      if (nextStepData.panel && onPanelChange) {
        onPanelChange(nextStepData.panel);
      }
      setCurrentStep(prev => prev + 1);
    } else {
      endTutorial();
    }
  }, [currentStep, endTutorial, onPanelChange]);

  const prevStep = useCallback(() => {
    if (currentStep > 0) {
      const prevStepData = TUTORIAL_STEPS[currentStep - 1];
      if (prevStepData.panel && onPanelChange) {
        onPanelChange(prevStepData.panel);
      }
      setCurrentStep(prev => prev - 1);
    }
  }, [currentStep, onPanelChange]);

  // Navigate to panel when step changes
  useEffect(() => {
    if (isActive && step?.panel && onPanelChange) {
      onPanelChange(step.panel);
    }
  }, [isActive, step, onPanelChange]);

  return (
    <TutorialContext.Provider
      value={{
        isActive,
        currentStep,
        totalSteps: TUTORIAL_STEPS.length,
        step,
        startTutorial,
        endTutorial,
        nextStep,
        prevStep,
        skipTutorial,
        hasCompletedTutorial,
      }}
    >
      {children}
      {isActive && <TutorialOverlay />}
    </TutorialContext.Provider>
  );
}

/**
 * Tutorial overlay with spotlight effect
 */
function TutorialOverlay() {
  const { step, currentStep, totalSteps, nextStep, prevStep, skipTutorial } = useTutorial();
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);

  // Find and track target element
  useEffect(() => {
    if (!step?.target) {
      setTargetRect(null);
      return;
    }

    const updateRect = () => {
      const element = document.querySelector(step.target!);
      if (element) {
        setTargetRect(element.getBoundingClientRect());
      } else {
        setTargetRect(null);
      }
    };

    updateRect();
    
    // Update on resize/scroll
    window.addEventListener('resize', updateRect);
    window.addEventListener('scroll', updateRect, true);
    
    // Poll for element (in case it's lazy loaded)
    const interval = setInterval(updateRect, 500);

    return () => {
      window.removeEventListener('resize', updateRect);
      window.removeEventListener('scroll', updateRect, true);
      clearInterval(interval);
    };
  }, [step?.target]);

  if (!step) return null;

  const isCenter = step.position === 'center' || !targetRect;

  // Calculate tooltip position
  const getTooltipStyle = (): React.CSSProperties => {
    if (isCenter) {
      return {
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
      };
    }

    const padding = 16;
    const tooltipWidth = 320;
    const tooltipHeight = 200; // Approximate

    switch (step.position) {
      case 'top':
        return {
          position: 'fixed',
          top: targetRect.top - tooltipHeight - padding,
          left: Math.max(padding, Math.min(targetRect.left + targetRect.width / 2 - tooltipWidth / 2, window.innerWidth - tooltipWidth - padding)),
        };
      case 'bottom':
        return {
          position: 'fixed',
          top: targetRect.bottom + padding,
          left: Math.max(padding, Math.min(targetRect.left + targetRect.width / 2 - tooltipWidth / 2, window.innerWidth - tooltipWidth - padding)),
        };
      case 'left':
        return {
          position: 'fixed',
          top: Math.max(padding, targetRect.top + targetRect.height / 2 - tooltipHeight / 2),
          left: Math.max(padding, targetRect.left - tooltipWidth - padding),
        };
      case 'right':
        return {
          position: 'fixed',
          top: Math.max(padding, targetRect.top + targetRect.height / 2 - tooltipHeight / 2),
          left: targetRect.right + padding,
        };
      default:
        return {
          position: 'fixed',
          top: targetRect.bottom + padding,
          left: targetRect.left,
        };
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999]">
      {/* Backdrop with spotlight cutout */}
      <svg className="absolute inset-0 w-full h-full" style={{ pointerEvents: 'none' }}>
        <defs>
          <mask id="spotlight-mask">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {targetRect && (
              <rect
                x={targetRect.left - 8}
                y={targetRect.top - 8}
                width={targetRect.width + 16}
                height={targetRect.height + 16}
                rx="12"
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill="rgba(0,0,0,0.75)"
          mask="url(#spotlight-mask)"
          style={{ pointerEvents: 'auto' }}
          onClick={skipTutorial}
        />
      </svg>

      {/* Spotlight ring animation */}
      {targetRect && (
        <div
          className="absolute border-2 border-primary rounded-xl animate-pulse pointer-events-none"
          style={{
            left: targetRect.left - 8,
            top: targetRect.top - 8,
            width: targetRect.width + 16,
            height: targetRect.height + 16,
          }}
        />
      )}

      {/* Tooltip */}
      <div
        className={cn(
          'bg-card border border-border rounded-xl shadow-2xl p-5 w-80 z-[10000]',
          'animate-in fade-in-0 zoom-in-95 duration-200'
        )}
        style={getTooltipStyle()}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <h3 className="font-semibold text-foreground text-base">{step.title}</h3>
          <button
            onClick={skipTutorial}
            className="text-muted-foreground hover:text-foreground text-xs -mt-1"
          >
            <i className="fa-solid fa-xmark" />
          </button>
        </div>

        {/* Description */}
        <p className="text-sm text-muted-foreground mb-5 leading-relaxed">
          {step.description}
        </p>

        {/* Progress dots */}
        <div className="flex items-center justify-center gap-1.5 mb-4">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div
              key={i}
              className={cn(
                'w-2 h-2 rounded-full transition-colors',
                i === currentStep ? 'bg-primary' : 'bg-muted-foreground/30'
              )}
            />
          ))}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={prevStep}
            disabled={currentStep === 0}
            className="text-xs"
          >
            <i className="fa-solid fa-arrow-left mr-1.5" />
            Back
          </Button>
          
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground">
              {currentStep + 1} / {totalSteps}
            </span>
            <Button
              size="sm"
              onClick={nextStep}
              className="text-xs"
            >
              {currentStep === totalSteps - 1 ? 'Finish' : 'Next'}
              {currentStep < totalSteps - 1 && (
                <i className="fa-solid fa-arrow-right ml-1.5" />
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default TutorialProvider;
