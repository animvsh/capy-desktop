import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

interface OnboardingData {
  whatYouSell: string;
  whoIsItFor: string;
  problemSolved: string;
  idealCustomer: string;
  whoToAvoid: string;
  targetLocations: string;
  tone: number;
  successDefinition: string;
}

interface OnboardingWizardProps {
  onComplete: (data: OnboardingData) => void;
}

const steps = [
  {
    id: 1,
    question: "What do you sell?",
    hint: "e.g., 'AI-powered customer support software' or 'Consulting for SaaS startups'",
    field: "whatYouSell" as const,
    type: "textarea",
  },
  {
    id: 2,
    question: "Who is this for?",
    hint: "e.g., 'Founders of B2B SaaS companies' or 'Marketing teams at agencies'",
    field: "whoIsItFor" as const,
    type: "input",
  },
  {
    id: 3,
    question: "What problem does it solve for them?",
    hint: "Focus on the pain, not the features",
    field: "problemSolved" as const,
    type: "textarea",
  },
  {
    id: 4,
    question: "What does a great customer look like?",
    hint: "Company size, stage, specific characteristics",
    field: "idealCustomer" as const,
    type: "textarea",
  },
  {
    id: 5,
    question: "Who should Capy avoid emailing?",
    hint: "Competitors, specific industries, company sizes",
    field: "whoToAvoid" as const,
    type: "textarea",
  },
  {
    id: 6,
    question: "Where are your ideal customers located?",
    hint: "e.g., United States, California, New York, London, Europe (or leave empty for global)",
    field: "targetLocations" as const,
    type: "input",
  },
  {
    id: 7,
    question: "What tone should Capy use?",
    hint: "How should your emails feel?",
    field: "tone" as const,
    type: "slider",
  },
  {
    id: 8,
    question: "What counts as success for you?",
    hint: "Default: Book a discovery call",
    field: "successDefinition" as const,
    type: "input",
  },
];

const toneLabels = ["Reserved", "Professional", "Confident", "Bold"];

export function OnboardingWizard({ onComplete }: OnboardingWizardProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [data, setData] = useState<OnboardingData>({
    whatYouSell: "",
    whoIsItFor: "",
    problemSolved: "",
    idealCustomer: "",
    whoToAvoid: "",
    targetLocations: "",
    tone: 50,
    successDefinition: "Book a discovery call",
  });

  const step = steps[currentStep];
  const isLastStep = currentStep === steps.length - 1;
  const isFirstStep = currentStep === 0;

  const handleNext = () => {
    if (isLastStep) {
      onComplete(data);
    } else {
      setCurrentStep((prev) => prev + 1);
    }
  };

  const handleBack = () => {
    if (!isFirstStep) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  const updateField = (value: string | number) => {
    setData((prev) => ({ ...prev, [step.field]: value }));
  };

  const currentValue = data[step.field];
  // Location step can be skipped (empty is ok)
  const canProceed =
    step.type === "slider" ||
    step.field === "targetLocations" ||
    (typeof currentValue === "string" && currentValue.trim().length > 0);

  return (
    <div className="mx-auto max-w-2xl px-4 sm:px-0">
      {/* Progress */}
      <div className="mb-6 sm:mb-8">
        <div className="mb-2 sm:mb-3 flex justify-between text-xs sm:text-sm font-medium text-muted-foreground">
          <span>Step {currentStep + 1} of {steps.length}</span>
          <span>{Math.round(((currentStep + 1) / steps.length) * 100)}%</span>
        </div>
        <div className="h-2 sm:h-3 w-full rounded-full bg-muted">
          <div 
            className="h-2 sm:h-3 rounded-full bg-primary transition-all duration-300"
            style={{ width: `${((currentStep + 1) / steps.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Question */}
      <div className="rounded-2xl border-forest bg-card p-5 sm:p-8 animate-fade-in">
        <div className="space-y-1.5 sm:space-y-2 mb-4 sm:mb-6">
          <h2 className="text-xl sm:text-2xl font-bold text-foreground">{step.question}</h2>
          <p className="text-sm sm:text-base text-muted-foreground">{step.hint}</p>
        </div>

        {/* Input field based on type */}
        <div className="py-3 sm:py-4">
          {step.type === "input" && (
            <Input
              value={currentValue as string}
              onChange={(e) => updateField(e.target.value)}
              placeholder="Type your answer..."
              className="h-12 sm:h-14 text-base sm:text-lg rounded-xl border-2"
              autoFocus
            />
          )}

          {step.type === "textarea" && (
            <Textarea
              value={currentValue as string}
              onChange={(e) => updateField(e.target.value)}
              placeholder="Type your answer..."
              className="min-h-[120px] sm:min-h-[140px] text-base sm:text-lg rounded-xl border-2"
              autoFocus
            />
          )}

          {step.type === "slider" && (
            <div className="space-y-4 sm:space-y-6 py-3 sm:py-4">
              <Slider
                value={[currentValue as number]}
                onValueChange={([value]) => updateField(value)}
                max={100}
                step={1}
                className="w-full"
              />
              <div className="flex justify-between text-xs sm:text-sm">
                {toneLabels.map((label, i) => (
                  <span
                    key={label}
                    className={cn(
                      "text-muted-foreground transition-colors font-medium",
                      Math.floor((currentValue as number) / 33) === i && "text-primary font-bold"
                    )}
                  >
                    {label}
                  </span>
                ))}
              </div>
            </div>
          )}

        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between pt-3 sm:pt-4 gap-4">
          <Button
            variant="ghost"
            onClick={handleBack}
            disabled={isFirstStep}
            className="gap-1.5 sm:gap-2 font-semibold rounded-xl text-sm"
          >
            <i className="fa-solid fa-arrow-left h-4 w-4" />
            <span className="hidden xs:inline">Back</span>
          </Button>

          <Button
            onClick={handleNext}
            disabled={!canProceed}
            className="gap-1.5 sm:gap-2 font-bold rounded-xl px-4 sm:px-6 text-sm"
          >
            {isLastStep ? (
              <>
                <i className="fa-solid fa-wand-magic-sparkles h-4 w-4" />
                <span className="hidden xs:inline">Launch</span> Capy
              </>
            ) : (
              <>
                <span className="hidden xs:inline">Continue</span>
                <span className="xs:hidden">Next</span>
                <i className="fa-solid fa-arrow-right h-4 w-4" />
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
