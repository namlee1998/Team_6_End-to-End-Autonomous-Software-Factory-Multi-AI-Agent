import { describe, expect, test } from 'vitest';

import { buildGroupedTree, formatSize, getFilename } from '@/lib/yamlExportHelpers';


describe('YamlExport helpers', () => {
  test('groups scenarios with their YAML outputs', () => {
    const tree = buildGroupedTree(
      [
        {
          id: 'TC_ADD_001',
          taskId: 'task-2',
          featureName: 'Transactions',
          flowName: 'Add',
          scenarioData: {
            id: 'TC_ADD_001',
            name: 'Add transaction',
            type: 'Functional',
            priority: 'High',
            flow_name: 'Add',
            feature_name: 'Transactions',
          },
          automationYaml: null,
          yamlFilename: null,
          createdAt: '',
          updatedAt: '',
        },
      ],
      [
        {
          id: 'yaml-1',
          taskId: 'task-3',
          featureName: 'Transactions',
          flowName: 'automation',
          scenarioData: null,
          automationYaml: 'name: demo',
          yamlFilename: 'TC_ADD_001.yaml',
          createdAt: '',
          updatedAt: '',
        },
      ],
    );

    expect(tree[0].featureName).toBe('Transactions');
    expect(tree[0].flows[0].scenarios[0].yaml?.yamlFilename).toBe('TC_ADD_001.yaml');
    expect(tree[0].totalYaml).toBe(1);
  });

  test('formats file metadata helpers', () => {
    expect(formatSize('abc')).toBe('3 B');
    expect(getFilename({ featureName: 'Transactions', yamlFilename: null } as never)).toBe(
      'Transactions.yaml',
    );
  });
});
