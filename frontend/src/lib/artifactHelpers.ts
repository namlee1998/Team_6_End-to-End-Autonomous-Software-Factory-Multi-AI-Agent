import type { AgentArtifactItem, TestcaseItem } from '@/services/api';

export interface ParsedFlowArtifact {
  flowName: string;
  source: string;
  steps: string[];
}

export function flowsFromArtifacts(artifacts?: AgentArtifactItem[]): ParsedFlowArtifact[] {
  return (artifacts ?? [])
    .filter((artifact) => artifact.artifactType === 'flow' && artifact.contentJson)
    .map((artifact) => {
      const flow = artifact.contentJson ?? {};
      return {
        flowName: String(flow.flowName ?? flow.name ?? artifact.title ?? 'Unknown'),
        source: String(flow.source ?? ''),
        steps: Array.isArray(flow.steps) ? flow.steps.map(String) : [],
      };
    });
}

export function scenarioTestcasesFromArtifacts(artifacts?: AgentArtifactItem[]): TestcaseItem[] {
  return (artifacts ?? [])
    .filter((artifact) => artifact.artifactType === 'scenario' && artifact.contentJson)
    .map((artifact) => {
      const scenario = artifact.contentJson ?? {};
      return {
        id: artifact.id,
        taskId: artifact.taskId,
        projectId: artifact.projectId,
        featureName: String(scenario.feature_name ?? 'Unknown'),
        flowName: String(scenario.flow_name ?? scenario.name ?? artifact.title ?? 'Unknown'),
        scenarioData: scenario,
        automationYaml: null,
        yamlFilename: null,
        createdAt: artifact.createdAt,
        updatedAt: artifact.updatedAt,
      };
    });
}

export function yamlTestcasesFromArtifacts(artifacts?: AgentArtifactItem[]): TestcaseItem[] {
  return (artifacts ?? [])
    .filter((artifact) => artifact.artifactType === 'yaml')
    .map((artifact) => {
      const meta = artifact.contentJson ?? {};
      return {
        id: artifact.id,
        taskId: artifact.taskId,
        projectId: artifact.projectId,
        featureName: artifact.artifactKey,
        flowName: 'automation',
        scenarioData: null,
        automationYaml: artifact.contentText ?? '',
        yamlFilename: String(meta.filename ?? artifact.title ?? `${artifact.artifactKey}.yaml`),
        createdAt: artifact.createdAt,
        updatedAt: artifact.updatedAt,
      };
    });
}
