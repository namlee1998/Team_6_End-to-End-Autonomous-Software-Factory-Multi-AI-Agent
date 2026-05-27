import React from 'react';
import type { StepId, WorkflowStep } from '@/hooks/useWorkflowState';

interface WorkflowStepperProps {
  steps: WorkflowStep[];
  activeStep: StepId;
  onStepClick: (id: StepId) => void;
}

function NumberCircle({ step }: { step: WorkflowStep }) {
  if (step.status === 'done') {
    return (
      <span className="material-symbols-outlined text-[16px] text-primary w-5 h-5 flex items-center justify-center">
        check_circle
      </span>
    );
  }
  if (step.status === 'in-progress') {
    return (
      <div className="w-5 h-5 rounded-full bg-primary animate-pulse flex items-center justify-center shrink-0">
        <span className="text-[10px] font-bold text-on-primary">{step.index}</span>
      </div>
    );
  }
  if (step.status === 'available') {
    return (
      <div className="w-5 h-5 rounded-full border-2 border-primary/50 flex items-center justify-center shrink-0">
        <span className="text-[10px] font-bold text-primary">{step.index}</span>
      </div>
    );
  }
  // locked
  return (
    <div className="w-5 h-5 rounded-full border border-outline-variant/30 bg-surface-container flex items-center justify-center shrink-0">
      <span className="text-[10px] font-bold text-on-surface-variant/40">{step.index}</span>
    </div>
  );
}

export const WorkflowStepper: React.FC<WorkflowStepperProps> = ({
  steps,
  activeStep,
  onStepClick,
}) => {
  return (
    <div className="h-16 flex items-center px-4 border-t border-outline-variant/20 bg-surface-container-lowest shrink-0">
      <div className="flex items-center gap-0 flex-1 min-w-0">
        {steps.map((step, idx) => {
          const isActive = activeStep === step.id;
          const isLocked = step.status === 'locked';
          const prevDone = idx === 0 || steps[idx - 1].status === 'done';

          return (
            <React.Fragment key={step.id}>
              {/* Connector */}
              {idx > 0 && (
                <div
                  className={`w-6 h-px mx-1 shrink-0 transition-colors duration-300 ${
                    steps[idx - 1].status === 'done' ? 'bg-primary' : 'bg-outline-variant/30'
                  }`}
                />
              )}

              {/* Step button */}
              <button
                onClick={() => !isLocked && onStepClick(step.id)}
                disabled={isLocked}
                className={`
                  flex-1 flex items-center justify-center
                  ${isLocked ? 'cursor-not-allowed' : 'cursor-pointer'}
                `}
              >
                <div
                  className={`
                    flex items-center gap-2 px-3 py-1.5 rounded-xl transition-colors select-none
                    ${isActive ? 'bg-surface-container ring-1 ring-outline-variant/40' : ''}
                    ${!isLocked && !isActive ? 'hover:bg-surface-container' : ''}
                  `}
                >
                  <NumberCircle step={step} />
                  <div className="flex flex-col gap-0">
                    <span className="text-[9px] text-on-surface-variant uppercase tracking-widest leading-none">
                      {step.label}
                    </span>
                    <span
                      className={`
                        text-[12px] font-semibold font-headline leading-tight
                        ${isLocked ? 'text-on-surface-variant/40' : 'text-on-surface'}
                        ${isActive ? 'text-primary' : ''}
                      `}
                    >
                      {step.name}
                    </span>
                    {step.meta && (
                      <span
                        className={`text-[10px] leading-tight ${
                          step.status === 'done' ? 'text-primary' : 'text-on-surface-variant'
                        }`}
                      >
                        {step.meta}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};
