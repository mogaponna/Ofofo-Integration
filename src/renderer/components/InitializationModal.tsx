import { Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';

interface InitializationModalProps {
  isOpen: boolean;
  steps: string[];
  currentStep: number;
  error?: string;
}

// Expected initialization steps (shown immediately)
const EXPECTED_STEPS = [
  'Initializing Azure plugin...',
  'Verifying Azure authentication...',
  'Configuring Azure subscription...',
  'Starting Steampipe service...',
  'Finalizing configuration...',
  'Testing Azure connection...',
  'Azure plugin initialized successfully',
];

export default function InitializationModal({
  isOpen,
  steps,
  currentStep: _currentStep,
  error,
}: InitializationModalProps) {
  const [displaySteps, setDisplaySteps] = useState(EXPECTED_STEPS);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
  const [currentActiveStep, setCurrentActiveStep] = useState(0);

  // Update display when steps come in
  useEffect(() => {
    if (steps.length > 0) {
      // Merge expected steps with actual steps from backend
      const merged = [...EXPECTED_STEPS];
      const newCompleted = new Set<number>();
      let newActive = 0;

      steps.forEach((step) => {
        const stepLower = step.toLowerCase();
        
          // Find matching expected step
          let matchedIndex = -1;
          for (let i = 0; i < EXPECTED_STEPS.length; i++) {
            const expectedLower = EXPECTED_STEPS[i].toLowerCase();
            // Match by keywords
            if (stepLower.includes('authentication') && expectedLower.includes('authentication')) {
              matchedIndex = i;
              break;
            } else if (stepLower.includes('subscription') && expectedLower.includes('subscription')) {
              matchedIndex = i;
              break;
            } else if (stepLower.includes('service') && expectedLower.includes('service')) {
              matchedIndex = i;
              break;
            } else if (stepLower.includes('plugin') && expectedLower.includes('plugin')) {
              matchedIndex = i;
              break;
            } else if (stepLower.includes('configuration') && expectedLower.includes('configuration')) {
              matchedIndex = i;
              break;
            } else if ((stepLower.includes('testing') || stepLower.includes('connection')) && 
                       (expectedLower.includes('testing') || expectedLower.includes('connection'))) {
              matchedIndex = i;
              break;
            } else if (stepLower.includes('initialized') && expectedLower.includes('initialized')) {
              matchedIndex = i;
              break;
            }
          }

        if (matchedIndex >= 0) {
          merged[matchedIndex] = step;
          
          if (step.startsWith('✓')) {
            // Completed step
            newCompleted.add(matchedIndex);
            // Next step becomes active
            if (matchedIndex < EXPECTED_STEPS.length - 1) {
              newActive = matchedIndex + 1;
            }
          } else {
            // Current/active step
            newActive = matchedIndex;
          }
        }
      });

      setDisplaySteps(merged);
      setCompletedSteps(newCompleted);
      setCurrentActiveStep(newActive);
    }
  }, [steps]);

  // Reset when modal opens - show all steps immediately
  useEffect(() => {
    if (isOpen) {
      setDisplaySteps(EXPECTED_STEPS);
      setCompletedSteps(new Set());
      setCurrentActiveStep(0);
    }
  }, [isOpen]);

  // Update progress as steps come in from backend
  useEffect(() => {
    if (!isOpen || steps.length === 0) return;

    const newCompleted = new Set<number>();
    let newActive = 0;

    // Map backend steps to expected steps
    steps.forEach((step) => {
      const stepLower = step.toLowerCase().trim();
      
      // Find which expected step this matches
      EXPECTED_STEPS.forEach((expected, index) => {
        const expectedLower = expected.toLowerCase();
        
        // Match completed steps (with ✓)
        if (step.startsWith('✓')) {
          const stepText = step.replace('✓', '').trim().toLowerCase();
          if (expectedLower.includes(stepText.split(' ')[0]) || stepText.includes(expectedLower.split(' ')[0])) {
            newCompleted.add(index);
            if (index < EXPECTED_STEPS.length - 1) {
              newActive = index + 1;
            }
          }
        } 
        // Match active steps
        else if (stepLower.includes('initializing') && expectedLower.includes('initializing')) {
          newActive = 0;
        } else if (stepLower.includes('verifying') && expectedLower.includes('verifying')) {
          newActive = 1;
        } else if (stepLower.includes('configuring') && expectedLower.includes('configuring')) {
          newActive = 2;
        } else if (stepLower.includes('starting') && expectedLower.includes('starting')) {
          newActive = 3;
        } else if (stepLower.includes('finalizing') && expectedLower.includes('finalizing')) {
          newActive = 4;
        } else if (stepLower.includes('testing') && expectedLower.includes('testing')) {
          newActive = 5;
        } else if (stepLower.includes('connection') && expectedLower.includes('connection')) {
          newActive = 5;
        } else if (stepLower.includes('initialized') && expectedLower.includes('initialized')) {
          newActive = 6;
          newCompleted.add(6);
        }
      });
    });

    setCompletedSteps(newCompleted);
    setCurrentActiveStep(newActive);
  }, [steps, isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="relative bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl shadow-2xl border border-gray-700 w-full max-w-2xl">
        {/* Header */}
        <div className="p-6 border-b border-gray-700">
          <h2 className="text-2xl font-bold text-white flex items-center gap-3">
            {error ? (
              <>
                <XCircle className="w-8 h-8 text-red-400" />
                <span>Initialization Failed</span>
              </>
            ) : (
              <>
                <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
                <span>Initializing Azure Integration</span>
              </>
            )}
          </h2>
          <p className="text-sm text-gray-400 mt-2">
            {error
              ? 'Please check the errors below and try again'
              : 'Please wait while we initialize the Azure plugin...'}
          </p>
        </div>

        {/* Steps List */}
        <div className="p-6 max-h-96 overflow-y-auto">
          <div className="space-y-1.5">
            {displaySteps.map((step, index) => {
              const isCompleted = completedSteps.has(index) || step.startsWith('✓');
              const isCurrent = index === currentActiveStep && !error && !isCompleted;
              const isError = error && index === currentActiveStep && !isCompleted;

              return (
                <div
                  key={index}
                  className={`flex items-center gap-2.5 py-2 px-3 transition-colors ${
                    isError
                      ? 'text-red-300'
                      : isCurrent
                      ? 'text-blue-300'
                      : isCompleted
                      ? 'text-green-300'
                      : 'text-gray-400'
                  }`}
                >
                  {isError ? (
                    <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                  ) : isCompleted ? (
                    <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />
                  ) : isCurrent ? (
                    <Loader2 className="w-4 h-4 animate-spin text-blue-400 flex-shrink-0" />
                  ) : (
                    <div className="w-4 h-4 rounded-full border-2 border-gray-600 flex-shrink-0" />
                  )}
                  <span className="text-sm">
                    {step}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Error Message */}
          {error && (
            <div className="mt-4 p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
              <p className="text-sm text-red-300">{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-700 bg-gray-900/50">
          {error ? (
            <button
              onClick={() => window.location.reload()}
              className="w-full px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg transition-colors text-white font-medium"
            >
              Close
            </button>
          ) : (
            <div className="text-center text-sm text-gray-400">
              This may take a few minutes. Please don't close this window.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

