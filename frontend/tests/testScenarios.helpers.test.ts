import { describe, expect, test } from 'vitest';

import {
  buildInputSignature,
  buildTree,
  classifyType,
  computeInputDiff,
  matchesTypeFilter,
  toFlowKey,
} from '@/lib/testScenarioHelpers';


describe('TestScenarios helpers', () => {
  test('classifies scenario types and matches filters', () => {
    expect(classifyType('Functional')).toBe('happy');
    expect(classifyType('Negative')).toBe('negative');
    expect(classifyType('Boundary')).toBe('edge');
    expect(matchesTypeFilter('Functional', 'happy')).toBe(true);
    expect(matchesTypeFilter('Negative', 'happy')).toBe(false);
  });

  test('builds deterministic signatures and computes input diffs', () => {
    const flowKeys = [
      toFlowKey({ featureName: 'Transactions', flowName: 'Add', stepCount: 3 }),
      toFlowKey({ featureName: 'Transactions', flowName: 'Summary', stepCount: 2 }),
    ];
    const signature = buildInputSignature(flowKeys);

    expect(
      computeInputDiff(
        {
          sourceTaskId: 'task-1',
          capturedAt: '2026-01-01',
          flowCount: 2,
          featureCount: 1,
          flowKeys,
          signature,
          flows: [],
        },
        signature,
        flowKeys,
      ),
    ).toEqual({ status: 'up_to_date', added: [], removed: [] });

    expect(
      computeInputDiff(
        {
          sourceTaskId: 'task-1',
          capturedAt: '2026-01-01',
          flowCount: 2,
          featureCount: 1,
          flowKeys,
          signature,
          flows: [],
        },
        buildInputSignature([flowKeys[0]]),
        [flowKeys[0]],
      ),
    ).toEqual({ status: 'changed', added: [flowKeys[1]], removed: [] });
  });

  test('groups testcase trees by feature and flow', () => {
    const tree = buildTree([
      {
        id: 'tc-1',
        taskId: 'task-1',
        featureName: 'Transactions',
        flowName: 'Add',
        scenarioData: { type: 'Functional', flow_name: 'Add', feature_name: 'Transactions' },
        automationYaml: null,
        yamlFilename: null,
        createdAt: '',
        updatedAt: '',
      },
      {
        id: 'tc-2',
        taskId: 'task-1',
        featureName: 'Transactions',
        flowName: 'Add',
        scenarioData: { type: 'Negative', flow_name: 'Add', feature_name: 'Transactions' },
        automationYaml: null,
        yamlFilename: null,
        createdAt: '',
        updatedAt: '',
      },
    ]);

    expect(tree).toEqual([
      {
        featureName: 'Transactions',
        flows: [
          {
            flowName: 'Add',
            count: 2,
            happyCount: 1,
            negativeCount: 1,
            edgeCount: 0,
          },
        ],
        totalCount: 2,
      },
    ]);
  });
});
